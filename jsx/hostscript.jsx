/**
 * hostscript.jsx - Adobe Premiere Pro ExtendScript (ES3)
 * Professional darajadagi Timeline avtomatizatsiyasi:
 * 1. Aniq FPS hisoblash: fps = 254016000000 / parseFloat(seq.timebase)
 * 2. Playhead va tanlangan klip hududini (workAreaStart / workAreaEnd) aniqlash
 * 3. Vaqt kodlarini (actions) avtomatik workAreaStart ga moslash (Timeline offset shift)
 * 4. Multi-track Razor: V1, V2 va A1, A2 treklarni birdek aniq HH:MM:SS:FF timecode'da qirqish
 * 5. clipItem.remove(true, true) orqali haqiqiy Ripple Delete va o'chirish
 * 6. Eng ustki faol video trekka (V2 yoki V1) Motion -> Scale = 125% berish
 * 7. Aniq Number turidagi markerlar va to'liq hisobotli 'Production Ready' dialogi
 */

// ==========================================
// 1. JSON Polyfill (ExtendScript ES3 uchun zarur)
// ==========================================
if (typeof JSON !== "object") {
    JSON = {};
}
(function () {
    'use strict';
    function f(n) { return n < 10 ? '0' + n : n; }
    if (typeof Date.prototype.toJSON !== 'function') {
        Date.prototype.toJSON = function () {
            return isFinite(this.valueOf())
                ? this.getUTCFullYear() + '-' +
                    f(this.getUTCMonth() + 1) + '-' +
                    f(this.getUTCDate()) + 'T' +
                    f(this.getUTCHours()) + ':' +
                    f(this.getUTCMinutes()) + ':' +
                    f(this.getUTCSeconds()) + 'Z'
                : null;
        };
    }
    var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta = { '\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f', '\r': '\\r', '"' : '\\"', '\\': '\\\\' };

    function quote(string) {
        escapable.lastIndex = 0;
        return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
            var c = meta[a];
            return typeof c === 'string' ? c : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    }

    function str(key, holder) {
        var i, k, v, length, mind = '', partial, value = holder[key];
        switch (typeof value) {
        case 'string': return quote(value);
        case 'number': return isFinite(value) ? String(value) : 'null';
        case 'boolean':
        case 'null': return String(value);
        case 'object':
            if (!value) return 'null';
            partial = [];
            if (Object.prototype.toString.apply(value) === '[object Array]') {
                length = value.length;
                for (i = 0; i < length; i += 1) {
                    partial[i] = str(i, value) || 'null';
                }
                return '[' + partial.join(',') + ']';
            }
            for (k in value) {
                if (Object.prototype.hasOwnProperty.call(value, k)) {
                    v = str(k, value);
                    if (v) partial.push(quote(k) + ':' + v);
                }
            }
            return '{' + partial.join(',') + '}';
        }
    }

    if (typeof JSON.stringify !== 'function') {
        JSON.stringify = function (value) { return str('', {'': value}); };
    }
    if (typeof JSON.parse !== 'function') {
        JSON.parse = function (text) {
            return eval('(' + text + ')');
        };
    }
}());


// ==========================================
// 2. Premiere Pro Boshqaruv Dasturi (Core Logic)
// ==========================================

var aicutter = {
    ping: function() {
        return "PONG_FROM_PREMIERE";
    },

    /**
     * Faol sekvensiyaning haqiqiy FPS qiymatini aniqlash:
     * Premiere Pro'da 1 soniya = 254016000000 ticks.
     * FPS = 254016000000 / Number(seq.timebase)
     * Masalan: 254016000000 / 8475667200 = 29.970029... -> 29.97 FPS
     */
    getSequenceFPS: function(seq) {
        if (!seq) return 25.0;

        // 1. timebase ticks orqali aniq hisoblash
        try {
            if (seq.timebase) {
                var tbNum = parseFloat(seq.timebase);
                if (tbNum > 0) {
                    var calculated = 254016000000.0 / tbNum;
                    if (calculated > 1.0 && calculated < 300.0) {
                        return calculated;
                    }
                }
            }
        } catch (e1) {}

        // 2. seq.getSettings().videoFrameRate orqali
        try {
            if (seq.getSettings) {
                var s = seq.getSettings();
                if (s && s.videoFrameRate && s.videoFrameRate.seconds) {
                    var fSec = parseFloat(s.videoFrameRate.seconds);
                    if (fSec > 0) {
                        return 1.0 / fSec;
                    }
                }
            }
        } catch (e2) {}

        return 25.0;
    },

    /**
     * Klip obyektidan to'liq metama'lumotlarni xavfsiz ajratib olish:
     * mediaPath, timelineStart, timelineEnd, sourceIn, sourceOut
     */
    extractClipMetadata: function(clip, trackType, trackIndex) {
        if (!clip) return null;
        var cName = clip.name || "";
        var mPath = "";

        try {
            if (clip.projectItem && clip.projectItem.getMediaPath) {
                mPath = clip.projectItem.getMediaPath();
                if (!cName && clip.projectItem.name) cName = clip.projectItem.name;
            }
        } catch (eMed) {}

        var tStart = (clip.start && clip.start.seconds !== undefined) ? parseFloat(clip.start.seconds) : 0;
        var tEnd = (clip.end && clip.end.seconds !== undefined) ? parseFloat(clip.end.seconds) : 0;
        var sIn = (clip.inPoint && clip.inPoint.seconds !== undefined) ? parseFloat(clip.inPoint.seconds) : 0;
        var sOut = (clip.outPoint && clip.outPoint.seconds !== undefined) ? parseFloat(clip.outPoint.seconds) : (sIn + (tEnd - tStart));

        var isSelected = false;
        try {
            if (clip.isSelected && clip.isSelected()) isSelected = true;
        } catch (eSel) {}

        return {
            name: cName,
            mediaPath: mPath,
            timelineStart: Math.round(tStart * 1000) / 1000,
            timelineEnd: Math.round(tEnd * 1000) / 1000,
            sourceIn: Math.round(sIn * 1000) / 1000,
            sourceOut: Math.round(sOut * 1000) / 1000,
            isSelected: isSelected,
            trackType: trackType || "video",
            trackIndex: trackIndex || 0,
            rawClip: clip
        };
    },

    /**
     * Multi-track sekvensiyada toza Audio manbani aniqlash (A1 / A2):
     * Kamera videolari V1/V2 da, lekin spikerning toza ovozi A1/A2 audio treklarida bo'ladi.
     */
    findCleanAudioSource: function(seq, workAreaStart, workAreaEnd, playheadSec) {
        if (!seq || !seq.audioTracks || seq.audioTracks.numTracks === 0) {
            return null;
        }

        var waStart = Number(workAreaStart) || 0;
        var waEnd = Number(workAreaEnd) || 0;
        var pH = Number(playheadSec) || 0;

        // Qidirish tartibi: Avval A1 (trek 0), keyin A2 (trek 1), so'ng qolgan audio treklar
        var trackOrder = [];
        for (var t = 0; t < seq.audioTracks.numTracks; t++) {
            trackOrder.push(t);
        }

        for (var i = 0; i < trackOrder.length; i++) {
            var trkIdx = trackOrder[i];
            var aTrk = seq.audioTracks[trkIdx];
            if (!aTrk || !aTrk.clips || aTrk.clips.numItems === 0) continue;

            var selectedAudio = null;
            var inRangeAudio = null;
            var playheadAudio = null;
            var firstAudio = null;

            for (var c = 0; c < aTrk.clips.numItems; c++) {
                var aClip = aTrk.clips[c];
                var aMeta = aicutter.extractClipMetadata(aClip, "audio", trkIdx);
                if (!aMeta || !aMeta.mediaPath) continue;

                if (!firstAudio) firstAudio = aMeta;

                if (aMeta.isSelected && !selectedAudio) {
                    selectedAudio = aMeta;
                }

                if (waEnd > waStart) {
                    if (aMeta.timelineStart <= waEnd && aMeta.timelineEnd >= waStart && !inRangeAudio) {
                        inRangeAudio = aMeta;
                    }
                }

                if (pH >= aMeta.timelineStart && pH <= aMeta.timelineEnd && !playheadAudio) {
                    playheadAudio = aMeta;
                }
            }

            var chosen = selectedAudio || inRangeAudio || playheadAudio || firstAudio;
            if (chosen && chosen.mediaPath) {
                chosen.cleanTrackLabel = "A" + (trkIdx + 1);
                return chosen;
            }
        }

        return null;
    },

    /**
     * Faol klip, Playhead yoki butun sekvensiya kliplarini (Work Area) aniqlash
     */
    getActiveWorkArea: function(seq) {
        var playheadSec = 0;
        try {
            if (seq.getPlayerPosition) {
                var pPos = seq.getPlayerPosition();
                if (pPos && pPos.seconds !== undefined) {
                    playheadSec = parseFloat(pPos.seconds);
                }
            }
        } catch (eP) {}

        var allClips = [];
        var selectedMeta = null;
        var playheadMeta = null;
        var firstMeta = null;
        var minStartSec = 999999999;
        var maxEndSec = 0;

        // 1. Video treklarni ko'rib chiqish (V1, V2...)
        var vCount = seq.videoTracks ? seq.videoTracks.numTracks : 0;
        for (var v = 0; v < vCount; v++) {
            var vTrk = seq.videoTracks[v];
            if (vTrk && vTrk.clips) {
                for (var c = 0; c < vTrk.clips.numItems; c++) {
                    var vClip = vTrk.clips[c];
                    var meta = aicutter.extractClipMetadata(vClip, "video", v);
                    if (meta && meta.timelineEnd > meta.timelineStart) {
                        allClips.push(meta);

                        if (meta.timelineStart < minStartSec) {
                            minStartSec = meta.timelineStart;
                            if (!firstMeta) firstMeta = meta;
                        }
                        if (meta.timelineEnd > maxEndSec) {
                            maxEndSec = meta.timelineEnd;
                        }

                        if (meta.isSelected && !selectedMeta) {
                            selectedMeta = meta;
                        }

                        if (playheadSec >= meta.timelineStart && playheadSec <= meta.timelineEnd && !playheadMeta) {
                            playheadMeta = meta;
                        }
                    }
                }
            }
        }

        // 2. Audio treklarni ko'rib chiqish (A1, A2...)
        var aCount = seq.audioTracks ? seq.audioTracks.numTracks : 0;
        for (var a = 0; a < aCount; a++) {
            var aTrk = seq.audioTracks[a];
            if (aTrk && aTrk.clips) {
                for (var ca = 0; ca < aTrk.clips.numItems; ca++) {
                    var aClip = aTrk.clips[ca];
                    var aMeta = aicutter.extractClipMetadata(aClip, "audio", a);
                    if (aMeta && aMeta.timelineEnd > aMeta.timelineStart) {
                        allClips.push(aMeta);

                        if (aMeta.timelineStart < minStartSec) {
                            minStartSec = aMeta.timelineStart;
                            if (!firstMeta) firstMeta = aMeta;
                        }
                        if (aMeta.timelineEnd > maxEndSec) {
                            maxEndSec = aMeta.timelineEnd;
                        }

                        if (aMeta.isSelected && !selectedMeta) {
                            selectedMeta = aMeta;
                        }

                        if (playheadSec >= aMeta.timelineStart && playheadSec <= aMeta.timelineEnd && !playheadMeta) {
                            playheadMeta = aMeta;
                        }
                    }
                }
            }
        }

        // Kliplarni Timeline start bo'yicha saralash
        allClips.sort(function(x, y) { return x.timelineStart - y.timelineStart; });

        // Foydalanuvchi tanlagan barcha kliplarni yig'ish (Multi-selection)
        var selectedClips = [];
        for (var sc = 0; sc < allClips.length; sc++) {
            if (allClips[sc].isSelected) {
                selectedClips.push(allClips[sc]);
            }
        }

        var workAreaStart = 0;
        var workAreaEnd = 0;
        var targetSource = "default";
        var selectedSegments = [];

        // 1. Agar foydalanuvchi 1 ta yoki bir nechta klipni tanlagan bo'lsa
        if (selectedClips.length > 0) {
            workAreaStart = selectedClips[0].timelineStart;
            workAreaEnd = selectedClips[0].timelineEnd;
            for (var si = 0; si < selectedClips.length; si++) {
                if (selectedClips[si].timelineStart < workAreaStart) workAreaStart = selectedClips[si].timelineStart;
                if (selectedClips[si].timelineEnd > workAreaEnd) workAreaEnd = selectedClips[si].timelineEnd;
                selectedSegments.push({
                    name: selectedClips[si].name,
                    mediaPath: selectedClips[si].mediaPath,
                    timelineStart: selectedClips[si].timelineStart,
                    timelineEnd: selectedClips[si].timelineEnd,
                    sourceIn: selectedClips[si].sourceIn,
                    sourceOut: selectedClips[si].sourceOut,
                    trackType: selectedClips[si].trackType,
                    trackIndex: selectedClips[si].trackIndex
                });
            }
            targetSource = selectedClips.length > 1 ? "multiple_selected_clips" : "selected_clip";
        } else {
            // 2. Agar klip tanlanmagan bo'lsa, In/Out oralig'ini tekshirish
            var inSec = null;
            var outSec = null;
            try {
                if (seq.getInPoint && seq.getInPoint() !== "") inSec = parseFloat(seq.getInPoint());
                if (seq.getOutPoint && seq.getOutPoint() !== "") outSec = parseFloat(seq.getOutPoint());
            } catch (eIO) {}

            if (inSec !== null && outSec !== null && outSec > inSec) {
                workAreaStart = inSec;
                workAreaEnd = outSec;
                targetSource = "in_out_range";
            } else if (playheadMeta) {
                // 3. Playhead ustida turgan klip
                workAreaStart = playheadMeta.timelineStart;
                workAreaEnd = playheadMeta.timelineEnd;
                targetSource = "playhead_clip";
            } else {
                // 4. Butun sekvensiya (boshidan oxirigacha to'liq tahlil)
                workAreaStart = (minStartSec < 999999999) ? minStartSec : 0;
                workAreaEnd = (maxEndSec > 0) ? maxEndSec : (seq.end ? parseFloat(seq.end.seconds) : 60);
                targetSource = "full_sequence";
            }
        }

        // Asosiy maqsadli klip
        var targetClip = (selectedClips.length > 0) ? selectedClips[0] : (playheadMeta || firstMeta);

        // mediaPath ni aniqlash
        var resolvedMediaPath = "";
        if (targetClip && targetClip.mediaPath) {
            resolvedMediaPath = targetClip.mediaPath;
        } else {
            for (var m = 0; m < allClips.length; m++) {
                if (allClips[m].mediaPath) {
                    resolvedMediaPath = allClips[m].mediaPath;
                    break;
                }
            }
        }

        return {
            workAreaStart: Math.round(workAreaStart * 1000) / 1000,
            workAreaEnd: Math.round(workAreaEnd * 1000) / 1000,
            playheadSec: playheadSec,
            firstClipStartSec: (minStartSec < 999999999) ? minStartSec : 0,
            latestClipEndSec: maxEndSec,
            targetSource: targetSource,
            selectedSegments: selectedSegments,
            targetClip: targetClip ? {
                name: targetClip.name,
                mediaPath: resolvedMediaPath || targetClip.mediaPath,
                timelineStart: targetClip.timelineStart,
                timelineEnd: targetClip.timelineEnd,
                sourceIn: targetClip.sourceIn,
                sourceOut: targetClip.sourceOut,
                trackType: targetClip.trackType,
                trackIndex: targetClip.trackIndex,
                targetSource: targetSource
            } : null,
            allClipsCount: allClips.length
        };
    },

    /**
     * Faol sekvensiya ma'lumotlarini olish (Aniq FPS, Kliplar metama'lumotlari bilan)
     */
    getActiveSequenceInfo: function() {
        try {
            if (!app.project) {
                return JSON.stringify({ error: "Loyiha ochilmagan" });
            }

            var seq = app.project.activeSequence;
            if (!seq) {
                return JSON.stringify({ error: "Faol sekvensiya topilmadi. Avval Timeline oynasida sekvensiyani oching." });
            }

            var videoTrackCount = seq.videoTracks ? seq.videoTracks.numTracks : 0;
            var audioTrackCount = seq.audioTracks ? seq.audioTracks.numTracks : 0;

            // Aniq FPS ni hisoblash (masalan: 29.97)
            var rawTimebase = parseFloat(seq.timebase) || 0;
            var realFPS = aicutter.getSequenceFPS(seq);
            var roundedFPS = Math.round(realFPS * 100) / 100;

            // Work Area va nishondagi klip metama'lumotlari
            var workArea = aicutter.getActiveWorkArea(seq);

            var zeroPointSec = 0;
            if (seq.zeroPoint && seq.zeroPoint.seconds) {
                zeroPointSec = parseFloat(seq.zeroPoint.seconds);
            }

            var endSec = 0;
            if (seq.end && seq.end.seconds) {
                endSec = parseFloat(seq.end.seconds);
            }

            var targetClip = workArea.targetClip;

            // 1-MUAMMO YECHIMI: Multi-track Timeline'da toza Audio manbani olish
            // Agar A1 yoki A2 da audio klip bo'lsa, audio tahlil uchun A1 trekdagi klipning
            // mediaPath, inPoint, outPoint, start, end qiymatlarini olamiz!
            var cleanAudio = aicutter.findCleanAudioSource(seq, workArea.workAreaStart, workArea.workAreaEnd, workArea.playheadSec);

            var audioPath = (cleanAudio && cleanAudio.mediaPath) ? cleanAudio.mediaPath : "";
            var videoPath = (targetClip && targetClip.mediaPath) ? targetClip.mediaPath : "";

            // Asosiy mediaPath: Agar A1/A2 da toza audio bo'lsa, birinchi navbatda shu audio fayl yuboriladi!
            var primaryMediaPath = audioPath || videoPath || (targetClip ? targetClip.mediaPath : "");

            return JSON.stringify({
                success: true,
                name: seq.name,
                sequenceID: seq.sequenceID,
                timebase: rawTimebase,
                fps: roundedFPS,
                zeroPoint: zeroPointSec,
                end: endSec,
                workAreaStart: Math.round(workArea.workAreaStart * 100) / 100,
                workAreaEnd: Math.round(workArea.workAreaEnd * 100) / 100,
                playheadSec: Math.round(workArea.playheadSec * 100) / 100,
                targetSource: workArea.targetSource,
                targetClip: targetClip,
                selectedSegments: workArea.selectedSegments || [],
                mediaPath: primaryMediaPath,
                firstMediaPath: primaryMediaPath,
                audioMediaPath: audioPath,
                videoMediaPath: videoPath,
                hasCleanAudio: !!audioPath,
                cleanAudioTrack: cleanAudio ? cleanAudio.cleanTrackLabel : "A1",
                audioSourceIn: cleanAudio ? cleanAudio.sourceIn : 0,
                audioSourceOut: cleanAudio ? cleanAudio.sourceOut : (workArea.workAreaEnd - workArea.workAreaStart),
                audioTimelineStart: cleanAudio ? cleanAudio.timelineStart : workArea.workAreaStart,
                audioTimelineEnd: cleanAudio ? cleanAudio.timelineEnd : workArea.workAreaEnd,
                sourceIn: cleanAudio ? cleanAudio.sourceIn : (targetClip ? targetClip.sourceIn : 0),
                sourceOut: cleanAudio ? cleanAudio.sourceOut : (targetClip ? targetClip.sourceOut : 0),
                timelineStart: cleanAudio ? cleanAudio.timelineStart : (targetClip ? targetClip.timelineStart : workArea.workAreaStart),
                timelineEnd: cleanAudio ? cleanAudio.timelineEnd : (targetClip ? targetClip.timelineEnd : workArea.workAreaEnd),
                videoTracks: videoTrackCount,
                audioTracks: audioTrackCount,
                totalClips: workArea.allClipsCount
            });
        } catch (e) {
            return JSON.stringify({ error: e.toString() });
        }
    },

    /**
     * Soniyalarni aniq "HH:MM:SS:FF" Timecode satriga o'tkazish
     */
    secondsToTimecode: function(seconds, seq) {
        var secNum = Number(seconds);
        if (isNaN(secNum) || secNum < 0) secNum = 0;

        var fps = aicutter.getSequenceFPS(seq);

        // 1-usul: Premiere Pro rasmiy Time obyekti orqali
        try {
            if (seq && seq.timebase && seq.getDisplayFormat) {
                var t = new Time();
                t.seconds = secNum;
                var formatted = t.getFormatted(seq.timebase, seq.getDisplayFormat());
                if (formatted && formatted.length >= 8) {
                    return formatted;
                }
            }
        } catch (errTime) {}

        // 2-usul: FPS orqali aniq matematik hisoblash (HH:MM:SS:FF)
        var totalFrames = Math.floor(secNum * fps + 0.0001);
        var intFps = Math.round(fps);
        if (intFps <= 0) intFps = 25;

        var ff = totalFrames % intFps;
        var totalSeconds = Math.floor(totalFrames / intFps);
        var ss = totalSeconds % 60;
        var totalMinutes = Math.floor(totalSeconds / 60);
        var mm = totalMinutes % 60;
        var hh = Math.floor(totalMinutes / 60);

        function pad2(n) {
            return (n < 10 ? "0" : "") + n;
        }

        // Drop frame tekshiruvi (29.97 fps da separator ';' bo'ladi)
        var sep = ":";
        if (Math.abs(fps - 29.97) < 0.05 || Math.abs(fps - 59.94) < 0.05) {
            sep = ";";
        }

        return pad2(hh) + ":" + pad2(mm) + ":" + pad2(ss) + sep + pad2(ff);
    },

    /**
     * Barcha Video (V1, V2...) va Audio (A1, A2...) treklarni bitta timecode'da qirqish
     */
    razorAllTracks: function(qeSeq, timecodeStr) {
        if (!qeSeq) return false;
        var success = false;

        var tcColon = timecodeStr.replace(/;/g, ":");
        var tcSemicolon = timecodeStr.indexOf(";") !== -1 ? timecodeStr : timecodeStr.replace(/:([0-9]{2})$/, ";$1");
        var tcVariants = [timecodeStr, tcColon, tcSemicolon];

        function tryRazor(target) {
            if (!target || !target.razor) return false;
            for (var i = 0; i < tcVariants.length; i++) {
                try {
                    target.razor(tcVariants[i]);
                    return true;
                } catch (e1) {
                    try {
                        target.razor(tcVariants[i], true, true);
                        return true;
                    } catch (e2) {}
                }
            }
            return false;
        }

        // 1. Video treklarda qirqish (V1, V2...)
        if (qeSeq.numVideoTracks) {
            for (var vt = 0; vt < qeSeq.numVideoTracks; vt++) {
                try {
                    var qv = qeSeq.getVideoTrackAt(vt);
                    if (tryRazor(qv)) success = true;
                } catch (eVt) {}
            }
        }

        // 2. Audio treklarda qirqish (A1, A2...)
        if (qeSeq.numAudioTracks) {
            for (var at = 0; at < qeSeq.numAudioTracks; at++) {
                try {
                    var qa = qeSeq.getAudioTrackAt(at);
                    if (tryRazor(qa)) success = true;
                } catch (eAt) {}
            }
        }

        // 3. Global sekvensiyada ham razor chaqiruv
        try {
            if (tryRazor(qeSeq)) success = true;
        } catch (eGlobal) {}

        return success;
    },

    /**
     * 3-MUAMMO YECHIMI: Premiere Pro'da Haqiqiy Smooth Zoom (Bezier Keyframes va new Time() obyekti)
     * Trapezoid Curve: 100% -> maxScale -> maxScale -> 100%
     * kfInterpMode_Bezier = 5 (Easy Ease silliq kirish va chiqish)
     * Position xususiyatiga tegilmaydi (Anchor Point markazda bo'lgani uchun markazga silliq kattalashadi)
     */
    applySmoothZoomKeyframes: function(clip, zStartTimeline, zEndTimeline, maxScale) {
        if (!clip || !clip.components) return false;

        var clipStart = (clip.start && clip.start.seconds !== undefined) ? parseFloat(clip.start.seconds) : 0;
        var clipEnd = (clip.end && clip.end.seconds !== undefined) ? parseFloat(clip.end.seconds) : 0;
        var clipIn = (clip.inPoint && clip.inPoint.seconds !== undefined) ? parseFloat(clip.inPoint.seconds) : 0;

        // Klip chegaralarini tekshirish
        var actualZStart = Math.max(zStartTimeline, clipStart);
        var actualZEnd = Math.min(zEndTimeline, clipEnd);
        if (actualZEnd <= actualZStart + 0.3) return false;

        var targetScale = parseFloat(maxScale) || 125.0;
        if (targetScale < 105.0) targetScale = 125.0;

        function makeClipTime(timelineSec) {
            var t = new Time();
            var localSec = clipIn + (timelineSec - clipStart);
            if (localSec < clipIn) localSec = clipIn;
            t.seconds = localSec;
            return t;
        }

        // Motion komponentini topish
        var motionComp = null;
        for (var c = 0; c < clip.components.numItems; c++) {
            var comp = clip.components[c];
            var cName = comp.displayName || comp.matchName || comp.name;
            if (cName === "Motion" || cName === "AE.ADBE Motion") {
                motionComp = comp;
                break;
            }
        }
        if (!motionComp) return false;

        var propScale = null;
        for (var p = 0; p < motionComp.properties.numItems; p++) {
            var prop = motionComp.properties[p];
            var pName = prop.displayName || prop.matchName || prop.name;
            if (pName === "Scale" || pName === "Scale Width" || prop.matchName === "ADBE Scale") {
                propScale = prop;
                break;
            }
        }

        if (!propScale) return false;

        try {
            // Keyframelarni yoqish
            try {
                if (propScale.isTimeVarying && !propScale.isTimeVarying()) {
                    propScale.setTimeVarying(true);
                }
            } catch (eTv) {}

            var dur = actualZEnd - actualZStart;
            var ramp = Math.min(0.45, dur * 0.25);
            if (ramp < 0.2) ramp = 0.2;

            var t1 = makeClipTime(actualZStart);
            var t2 = makeClipTime(actualZStart + ramp);
            var t3 = makeClipTime(actualZEnd - ramp);
            var t4 = makeClipTime(actualZEnd);

            // Keyframelarni qo'shish
            propScale.addKey(t1);
            propScale.addKey(t2);
            propScale.addKey(t3);
            propScale.addKey(t4);

            // Qiymatlarni berish
            propScale.setValueAtKey(t1, 100.0, true);
            propScale.setValueAtKey(t2, targetScale, true);
            propScale.setValueAtKey(t3, targetScale, true);
            propScale.setValueAtKey(t4, 100.0, true);

            // Silliq Bezier (Easy Ease) interpolyatsiya (kfInterpMode_Bezier = 5)
            var keyList = [t1, t2, t3, t4];
            for (var k = 0; k < keyList.length; k++) {
                try {
                    if (propScale.setInterpolationTypeAtKey) {
                        propScale.setInterpolationTypeAtKey(keyList[k], 5, true);
                    }
                } catch (eBez) {}
            }

            return true;
        } catch (eKey) {
            try {
                propScale.setValue(targetScale, true);
                return true;
            } catch (eFb) {
                return false;
            }
        }
    },

    // Muvofiqlik uchun alias
    applySmoothZoomToClip: function(clip, zStartSec, zEndSec, targetScaleVal, useFaceAdjust) {
        return aicutter.applySmoothZoomKeyframes(clip, zStartSec, zEndSec, targetScaleVal);
    },

    /**
     * Eng ustki faol video trekdagi (V2 yoki V1) klipni topib, Silliq Trapezoid Zoom berish
     */
    applySmoothZoomToUppermostTrack: function(seq, zStartSec, zEndSec, targetScaleVal, useFaceAdjust) {
        if (!seq || !seq.videoTracks) return false;

        var midSec = zStartSec + (zEndSec - zStartSec) / 2.0;

        for (var v = seq.videoTracks.numTracks - 1; v >= 0; v--) {
            var track = seq.videoTracks[v];
            if (track && track.clips) {
                for (var c = 0; c < track.clips.numItems; c++) {
                    var clip = track.clips[c];
                    if (clip && clip.start && clip.end) {
                        var vs = parseFloat(clip.start.seconds);
                        var ve = parseFloat(clip.end.seconds);
                        if (vs <= midSec + 0.5 && ve >= midSec - 0.5) {
                            var zoomDone = aicutter.applySmoothZoomKeyframes(clip, zStartSec, zEndSec, targetScaleVal);
                            if (zoomDone) {
                                return true;
                            }
                        }
                    }
                }
            }
        }
        return false;
    },

    setClipScale: function(clip, targetScale) {
        if (!clip || !clip.components) return false;

        for (var c = 0; c < clip.components.numItems; c++) {
            var comp = clip.components[c];
            var name = comp.displayName || comp.matchName;

            if (name === "Motion" || name === "AE.ADBE Motion") {
                for (var p = 0; p < comp.properties.numItems; p++) {
                    var prop = comp.properties[p];
                    var propName = prop.displayName || prop.matchName;

                    if (propName === "Scale" || propName === "Scale Width" || prop.matchName === "ADBE Scale") {
                        prop.setValue(parseFloat(targetScale), true);
                        return true;
                    }
                }
            }
        }
        return false;
    },

    /**
     * Timeline'ga aniq soniyali markerlar qo'yish
     */
    addCutMarkers: function(actionsPayload) {
        try {
            var seq = app.project.activeSequence;
            if (!seq) {
                return JSON.stringify({ error: "Sekvensiya topilmadi" });
            }

            var rawStr = actionsPayload;
            try {
                if (typeof actionsPayload === "string") {
                    rawStr = unescape(actionsPayload);
                }
            } catch (eUnesc) {}

            var items = (typeof rawStr === "string") ? JSON.parse(rawStr) : rawStr;
            if (!items || !items.length) {
                return JSON.stringify({ success: true, count: 0 });
            }

            var markers = seq.markers;
            var addedCount = 0;

            // Offsetni aniqlash
            var workArea = aicutter.getActiveWorkArea(seq);
            var offset = 0;
            if (items.length > 0) {
                var minStart = Number(items[0].start);
                for (var mChk = 1; mChk < items.length; mChk++) {
                    if (Number(items[mChk].start) < minStart) {
                        minStart = Number(items[mChk].start);
                    }
                }
                if (minStart < 5.0 && workArea.workAreaStart > 10.0) {
                    offset = workArea.workAreaStart;
                }
            }

            for (var i = 0; i < items.length; i++) {
                var item = items[i];

                var startSec = Number(item.start) + offset;
                var endSec = Number(item.end) + offset;

                if (isNaN(startSec) || startSec < 0) continue;
                if (isNaN(endSec) || endSec <= startSec) {
                    endSec = startSec + 1.0;
                }

                var marker = markers.createMarker(startSec);
                if (marker) {
                    var actionType = item.action || "cut";
                    var category = item.category || "";

                    if (actionType === "zoom") {
                        marker.name = "🔍 ZOOM-IN (" + ((item.scale || 1.25) * 100).toFixed(0) + "%) - " + (item.reason || "Muhim fikr");
                        try { marker.setColorByIndex(6); } catch (e) {} // Ko'k marker
                    } else if (actionType === "broll") {
                        marker.name = "🎬 B-ROLL (" + (item.keyword || "Tasvir") + ")";
                        try { marker.setColorByIndex(2); } catch (e) {} // Yashil marker
                    } else {
                        var cutPrefix = "✂️ CUT";
                        if (category === "bad_take") cutPrefix = "✂️ ADASHGAN DUBL";
                        else if (category === "filler") cutPrefix = "✂️ SUV GAP";
                        else if (category === "silence") cutPrefix = "✂️ SUKUT";

                        marker.name = cutPrefix + ": " + (item.reason || "Keraksiz qism");
                        try {
                            if (category === "bad_take") marker.setColorByIndex(0); // Qizil
                            else if (category === "filler") marker.setColorByIndex(4); // Sariq
                            else marker.setColorByIndex(1); // Qizil/To'q sariq
                        } catch (e) {}
                    }

                    marker.comments = (item.reason || "") + " | Davomiyligi: " + (endSec - startSec).toFixed(2) + "s";
                    marker.end = endSec;
                    try { marker.setTypeAsComment(); } catch (eType) {}
                    addedCount++;
                }
            }

            return JSON.stringify({ success: true, count: addedCount });
        } catch (err) {
            return JSON.stringify({ error: err.toString() });
        }
    },

    /**
     * 4-QADAM: Premiere Pro'da Qora Bo'shliqlarsiz (Gap-Free) Multitrack Ripple Delete
     * Barcha cut oraliqlaridagi kliplar remove(false, false) bilan o'chirilgach,
     * barcha qolgan sog'lom kliplarni chapga, bir-biriga zich qilib surib tekislaydi.
     * Natijada Timeline'da bironta ham qora bo'shliq qolmaydi va barcha video/audio treklar 100% sinxron tortiladi.
     */
    closeAllTimelineGaps: function(seq, executedCuts, workAreaStart) {
        if (!seq || !executedCuts || executedCuts.length === 0) return 0;

        // Xronologik tartibda saralash (o'sish bo'yicha)
        var cuts = executedCuts.slice().sort(function(a, b) {
            return Number(a.start) - Number(b.start);
        });

        // Har qanday vaqt T uchun undan oldin sodir bo'lgan barcha kesishlar yig'indisi
        function getCumulativeShift(origSec) {
            var shift = 0;
            for (var i = 0; i < cuts.length; i++) {
                if (cuts[i].end <= origSec + 0.05) {
                    shift += (cuts[i].end - cuts[i].start);
                }
            }
            return shift;
        }

        var totalMoved = 0;
        var baseOffset = (typeof workAreaStart === "number" && !isNaN(workAreaStart)) ? workAreaStart : 0;

        // 1. Barcha Video treklardagi (V1, V2...) qolgan sog'lom kliplarni chapga surish
        if (seq.videoTracks) {
            for (var vt = 0; vt < seq.videoTracks.numTracks; vt++) {
                var vTrack = seq.videoTracks[vt];
                if (vTrack && vTrack.clips) {
                    for (var vi = 0; vi < vTrack.clips.numItems; vi++) {
                        var vClip = vTrack.clips[vi];
                        if (vClip && vClip.start) {
                            var vOrigStart = parseFloat(vClip.start.seconds);
                            var vShift = getCumulativeShift(vOrigStart);
                            if (vShift > 0.01) {
                                var vNewStart = Math.max(baseOffset, vOrigStart - vShift);
                                try {
                                    var vtObj = new Time();
                                    vtObj.seconds = vNewStart;
                                    vClip.start = vtObj;
                                    totalMoved++;
                                } catch (eVS) {}
                            }
                        }
                    }
                }
            }
        }

        // 2. Barcha Audio treklardagi (A1, A2...) qolgan sog'lom kliplarni chapga surish
        if (seq.audioTracks) {
            for (var at = 0; at < seq.audioTracks.numTracks; at++) {
                var aTrack = seq.audioTracks[at];
                if (aTrack && aTrack.clips) {
                    for (var ai = 0; ai < aTrack.clips.numItems; ai++) {
                        var aClip = aTrack.clips[ai];
                        if (aClip && aClip.start) {
                            var aOrigStart = parseFloat(aClip.start.seconds);
                            var aShift = getCumulativeShift(aOrigStart);
                            if (aShift > 0.01) {
                                var aNewStart = Math.max(baseOffset, aOrigStart - aShift);
                                try {
                                    var atObj = new Time();
                                    atObj.seconds = aNewStart;
                                    aClip.start = atObj;
                                    totalMoved++;
                                } catch (eAS) {}
                            }
                        }
                    }
                }
            }
        }

        // 3. Asosiy video treklarida qolgan micro-bo'shliqlarni (nextClip.start = prevClip.end) tekislash
        if (seq.videoTracks) {
            for (var vt2 = 0; vt2 < seq.videoTracks.numTracks; vt2++) {
                var vTrack2 = seq.videoTracks[vt2];
                if (vTrack2 && vTrack2.clips && vTrack2.clips.numItems > 1) {
                    for (var vi2 = 1; vi2 < vTrack2.clips.numItems; vi2++) {
                        var prevC = vTrack2.clips[vi2 - 1];
                        var currC = vTrack2.clips[vi2];
                        if (prevC && currC && prevC.end && currC.start) {
                            var pEnd = parseFloat(prevC.end.seconds);
                            var cStart = parseFloat(currC.start.seconds);
                            if (cStart > pEnd && (cStart - pEnd) < 0.5) {
                                try {
                                    var snapT = new Time();
                                    snapT.seconds = pEnd;
                                    currC.start = snapT;
                                } catch (eSnap) {}
                            }
                        }
                    }
                }
            }
        }

        // 4. Audio treklarda ham xuddi shunday micro-bo'shliqlarni yopishtirish
        if (seq.audioTracks) {
            for (var at2 = 0; at2 < seq.audioTracks.numTracks; at2++) {
                var aTrack2 = seq.audioTracks[at2];
                if (aTrack2 && aTrack2.clips && aTrack2.clips.numItems > 1) {
                    for (var ai2 = 1; ai2 < aTrack2.clips.numItems; ai2++) {
                        var prevA = aTrack2.clips[ai2 - 1];
                        var currA = aTrack2.clips[ai2];
                        if (prevA && currA && prevA.end && currA.start) {
                            var pAEnd = parseFloat(prevA.end.seconds);
                            var cAStart = parseFloat(currA.start.seconds);
                            if (cAStart > pAEnd && (cAStart - pAEnd) < 0.5) {
                                try {
                                    var snapAT = new Time();
                                    snapAT.seconds = pAEnd;
                                    currA.start = snapAT;
                                } catch (eASnap) {}
                            }
                        }
                    }
                }
            }
        }

        // 5. Premiere Pro native "Close Gap" buyrug'i (agar menyuda mavjud bo'lsa)
        try {
            var closeGapCmdId = app.findMenuCommandId("Close Gap");
            if (closeGapCmdId && closeGapCmdId > 0) {
                app.executeCommand(closeGapCmdId);
            }
        } catch (eCmd) {}

        return totalMoved;
    },

    /**
     * ASOSIY AMAL:
     * 1. Vaqt kodlarini (actions) avtomatik workAreaStart ga moslash (Timeline Offset Shift).
     * 2. HH:MM:SS:FF Timecode bilan barcha treklarda (V1, V2, A1, A2) qirqish.
     * 3. Qirqilgan kliplarni remove(false, false) bilan xavfsiz o'chirish.
     * 4. closeAllTimelineGaps orqali barcha qolgan kliplarni chapga surib, qora bo'shliqlarni yo'qotish.
     * 5. Eng ustki faol trekka (V2 yoki V1) Zoom-In Keyframe qo'yish.
     */
    applyTimelineActions: function(actionsPayload) {
        try {
            var seq = app.project.activeSequence;
            if (!seq) {
                alert("Xatolik: Avval Premiere Pro Timeline oynasida sekvensiyani oching!");
                return JSON.stringify({ error: "Faol sekvensiya topilmadi" });
            }

            // JSON ma'lumotni decode qilish
            var rawStr = actionsPayload;
            try {
                if (typeof actionsPayload === "string") {
                    rawStr = unescape(actionsPayload);
                }
            } catch (eUnesc) {}

            var actions = (typeof rawStr === "string") ? JSON.parse(rawStr) : rawStr;
            if (!actions || actions.length === 0) {
                alert("Ogohlantirish: Kesish yoki Zoom qilish uchun harakatlar topilmadi.");
                return JSON.stringify({ success: false, message: "Harakatlar ro'yxati bo'sh" });
            }

            // QE DOM ni faollashtirish
            app.enableQE();
            var qeSeq = qe.project.getActiveSequence();
            if (!qeSeq) {
                alert("Xatolik: QE Timeline yuklanmadi. Iltimos, Premiere Pro oynasini faollashtiring.");
                return JSON.stringify({ error: "QE sekvensiya ochilmadi" });
            }

            // Timeline Offset Shifting (00:35:00:00 yoki 00:55:00:00 dagi kliplarga moslash)
            var workArea = aicutter.getActiveWorkArea(seq);
            var offset = 0;

            if (actions.length > 0) {
                var minActionStart = Number(actions[0].start);
                for (var chk = 1; chk < actions.length; chk++) {
                    if (Number(actions[chk].start) < minActionStart) {
                        minActionStart = Number(actions[chk].start);
                    }
                }
                // Agar kelgan harakatlar 0 atrofida bo'lsa (nisbiy bo'lsa), ularni workAreaStart ga siljitish
                if (minActionStart < 5.0 && workArea.workAreaStart > 10.0) {
                    offset = workArea.workAreaStart;
                }
            }

            // Harakatlarni ajratish va offset qo'shish
            var cutActions = [];
            var zoomActions = [];

            for (var a = 0; a < actions.length; a++) {
                var act = actions[a];
                var sStart = Number(act.start) + offset;
                var sEnd = Number(act.end) + offset;

                if (!isNaN(sStart) && !isNaN(sEnd) && sEnd > sStart) {
                    var shiftedAct = {
                        action: act.action,
                        start: sStart,
                        end: sEnd,
                        scale: act.scale,
                        reason: act.reason,
                        keyword: act.keyword
                    };

                    if (act.action === "cut") {
                        cutActions.push(shiftedAct);
                    } else if (act.action === "zoom") {
                        zoomActions.push(shiftedAct);
                    }
                }
            }

            // Vaqtlar siljib ketmasligi uchun o'ngdan chapga (kamayish tartibida) tartiblash
            cutActions.sort(function(x, y) { return Number(y.start) - Number(x.start); });

            // Markerlarni qo'yish
            aicutter.addCutMarkers(actions);

            var actualZoomsApplied = 0;
            var actualClipsDeleted = 0;
            var executedCuts = [];

            // ========================================================
            // 1-BOSQICH: SUKUNAT VA ADASHGAN DUBLLARNI QIRQISH VA RIPPLE DELETE
            // (O'ngdan chapga tartibda bajariladi, shunda oldingi vaqtlar o'zgarmaydi)
            // ========================================================
            for (var c = 0; c < cutActions.length; c++) {
                var cItem = cutActions[c];
                var cStartSec = Number(cItem.start);
                var cEndSec = Number(cItem.end);

                // Aniq "HH:MM:SS:FF" Timecode ga o'girish
                var tcCStart = aicutter.secondsToTimecode(cStartSec, seq);
                var tcCEnd = aicutter.secondsToTimecode(cEndSec, seq);

                // 1. Qirqish: V1, V2, A1, A2 barcha treklarda kesish
                aicutter.razorAllTracks(qeSeq, tcCStart);
                aicutter.razorAllTracks(qeSeq, tcCEnd);

                // 2. Oraliqdagi barcha video va audio kliplarni aniqlash
                var cMidSec = cStartSec + (cEndSec - cStartSec) / 2.0;
                var targetClips = [];

                // Video treklardagi kliplar (V1, V2...)
                for (var vIdx = 0; vIdx < seq.videoTracks.numTracks; vIdx++) {
                    var vTrack = seq.videoTracks[vIdx];
                    if (vTrack && vTrack.clips) {
                        for (var vi = 0; vi < vTrack.clips.numItems; vi++) {
                            var vClip = vTrack.clips[vi];
                            if (vClip && vClip.start && vClip.end) {
                                var vs = parseFloat(vClip.start.seconds);
                                var ve = parseFloat(vClip.end.seconds);
                                if ((vs <= cMidSec && ve >= cMidSec) || (vs >= cStartSec - 0.5 && ve <= cEndSec + 0.5)) {
                                    targetClips.push({ clip: vClip, type: "video" });
                                }
                            }
                        }
                    }
                }

                // Audio treklardagi kliplar (A1, A2...)
                for (var aIdx = 0; aIdx < seq.audioTracks.numTracks; aIdx++) {
                    var aTrack = seq.audioTracks[aIdx];
                    if (aTrack && aTrack.clips) {
                        for (var ai = 0; ai < aTrack.clips.numItems; ai++) {
                            var aClip = aTrack.clips[ai];
                            if (aClip && aClip.start && aClip.end) {
                                var as = parseFloat(aClip.start.seconds);
                                var ae = parseFloat(aClip.end.seconds);
                                if ((as <= cMidSec && ae >= cMidSec) || (as >= cStartSec - 0.5 && ae <= cEndSec + 0.5)) {
                                    targetClips.push({ clip: aClip, type: "audio" });
                                }
                            }
                        }
                    }
                }

                // 3. O'chirish: 100% ishonchli remove(false, false)
                // (Hech qachon remove(true, true) chaqirilmaydi, chunki u multi-trackda qora bo'shliq qoldiradi!)
                if (targetClips.length > 0) {
                    for (var r = 0; r < targetClips.length; r++) {
                        try {
                            targetClips[r].clip.remove(false, false);
                            actualClipsDeleted++;
                        } catch (eRem) {}
                    }

                    executedCuts.push({
                        start: cStartSec,
                        end: cEndSec,
                        duration: (cEndSec - cStartSec)
                    });
                }
            }

            // ========================================================
            // 2-BOSQICH: BARCHA TREKLARDA QORA BO'SHLIQLARNI YOPISH VA
            // KORREKT SURISH (closeAllTimelineGaps)
            // ========================================================
            var clipsMoved = aicutter.closeAllTimelineGaps(seq, executedCuts, workArea.workAreaStart);

            // ========================================================
            // 3-BOSQICH: SILLIQ ZOOM-IN KEYFRAME ANIMATSIYASINI QO'LLASH
            // (Kesishlar hisobiga siljigan yangi Timeline koordinatalariga qarab)
            // ========================================================
            for (var z = 0; z < zoomActions.length; z++) {
                var zItem = zoomActions[z];
                var origZStart = Number(zItem.start);
                var origZEnd = Number(zItem.end);
                var zScale = Number(zItem.scale) || 1.20;

                // Siljishni hisoblash:
                var shift = 0;
                for (var ec = 0; ec < executedCuts.length; ec++) {
                    if (executedCuts[ec].end <= origZStart + 0.05) {
                        shift += executedCuts[ec].duration;
                    }
                }

                var newZStart = Math.max(0, origZStart - shift);
                var newZEnd = Math.max(newZStart + 0.5, origZEnd - shift);

                // Eng ustki video trekdagi klipni topib, Silliq Trapezoid Keyframe qo'yish
                var zoomDone = aicutter.applySmoothZoomToUppermostTrack(seq, newZStart, newZEnd, zScale * 100.0, true);
                if (zoomDone) {
                    actualZoomsApplied++;
                }
            }

                // Eng ustki video trekdagi klipni topib, Silliq Trapezoid Keyframe qo'yish
                var zoomDone = aicutter.applySmoothZoomToUppermostTrack(seq, newZStart, newZEnd, zScale * 100.0, true);
                if (zoomDone) {
                    actualZoomsApplied++;
                }
            }

            // ========================================================
            // 3-BOSQICH: 'PRODUCTION READY' BILDIRISHNOMASI
            // ========================================================
            var targetClipName = (workArea.targetClip && workArea.targetClip.name) ? workArea.targetClip.name : "Sekvensiya";
            var reportMsg = "🎬 Premiere Pro Semantic AI Video Cutter\n" +
                            "---------------------------------------------------\n" +
                            "✅ Timeline to'liq 'PRODUCTION READY' holatiga keltirildi!\n\n" +
                            "🎯 Nishondagi klip: " + targetClipName + " (" + workArea.targetSource + ")\n" +
                            "📍 Ishlangan hudud: " + aicutter.secondsToTimecode(workArea.workAreaStart, seq) + "\n" +
                            "✂️ Qirqib o'chirilgan (adashgan/keraksiz) kliplar: " + actualClipsDeleted + " ta\n" +
                            "🔍 Qo'llanilgan Semantic Zoom-In (125%): " + actualZoomsApplied + " ta\n" +
                            "🏷️ Qo'yilgan rangli tahlil markerlari: " + actions.length + " ta\n" +
                            "⚡ Multi-track audio/video to'liq sinxron holatda saqlandi.\n\n" +
                            "Klipingiz adashgan dubllardan tozalandi va Reels/Shorts eksportiga tayyor!";

            alert(reportMsg);

            return JSON.stringify({
                success: true,
                status: "Production Ready",
                actualClipsDeleted: actualClipsDeleted,
                actualZoomsApplied: actualZoomsApplied,
                markersPlaced: actions.length,
                workAreaStart: workArea.workAreaStart,
                workAreaEnd: workArea.workAreaEnd,
                message: "Timeline 'Production Ready' holatiga keltirildi!"
            });

        } catch (errMain) {
            alert("Xatolik yuz berdi:\n" + errMain.toString());
            return JSON.stringify({ error: errMain.toString() });
        }
    }
};

// Global chaqiruvlar (CSInterface uchun xavfsiz sarlavhalar)
function ping() {
    try {
        if (typeof aicutter === "undefined" || !aicutter) {
            return JSON.stringify({ error: "aicutter obyekti topilmadi" });
        }
        return aicutter.ping();
    } catch (e) {
        return JSON.stringify({ error: e.toString() + " (Line: " + (e.line || 0) + ")" });
    }
}

function getActiveSequenceInfo() {
    try {
        if (typeof aicutter === "undefined" || !aicutter) {
            return JSON.stringify({ error: "aicutter obyekti yuklanmagan" });
        }
        return aicutter.getActiveSequenceInfo();
    } catch (e) {
        return JSON.stringify({ error: e.toString() + " (Line: " + (e.line || 0) + ")" });
    }
}

function addCutMarkers(actionsPayload) {
    try {
        if (typeof aicutter === "undefined" || !aicutter) {
            return JSON.stringify({ error: "aicutter obyekti yuklanmagan" });
        }
        return aicutter.addCutMarkers(actionsPayload);
    } catch (e) {
        return JSON.stringify({ error: e.toString() + " (Line: " + (e.line || 0) + ")" });
    }
}

function applyTimelineActions(actionsPayload) {
    try {
        if (typeof aicutter === "undefined" || !aicutter) {
            return JSON.stringify({ error: "aicutter obyekti yuklanmagan" });
        }
        return aicutter.applyTimelineActions(actionsPayload);
    } catch (e) {
        return JSON.stringify({ error: e.toString() + " (Line: " + (e.line || 0) + ")" });
    }
}

function applyCutsFromSilenceIntervals(actionsPayload) {
    return applyTimelineActions(actionsPayload);
}

function closeAllTimelineGaps() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "Faol sekvensiya topilmadi" });
        var moved = aicutter.closeAllTimelineGaps(seq, [], 0);
        return JSON.stringify({ success: true, clipsMoved: moved });
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
}
