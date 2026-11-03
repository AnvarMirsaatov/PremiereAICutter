/**
 * app.js - Asosiy UI boshqaruvi, hodisalar va Premiere Pro integratsiyasi
 */

document.addEventListener("DOMContentLoaded", () => {
    // 1. Tizimlarni initsializatsiya qilish
    const csInterface = new CSInterface();
    window.i18n.init();

    // DOM Elementlari - Status va Header
    const backendStatusDot = document.getElementById("backendStatusDot");
    const backendStatusText = document.getElementById("backendStatusText");
    const languageSelect = document.getElementById("languageSelect");
    const badgeActiveAI = document.getElementById("badgeActiveAI");
    const labelActiveAI = document.getElementById("labelActiveAI");

    // Sekvensiya elementlari
    const seqNameEl = document.getElementById("seqName");
    const seqDetailsEl = document.getElementById("seqDetails");
    const refreshSeqBtn = document.getElementById("refreshSeqBtn");

    // Checkbox modullari va sub-panel elementlari
    const chkSilence = document.getElementById("chkSilence");
    const subSilence = document.getElementById("subSilence");
    const cardSilence = document.getElementById("cardSilence");

    const chkZoom = document.getElementById("chkZoom");
    const subZoom = document.getElementById("subZoom");
    const cardZoom = document.getElementById("cardZoom");

    const chkBRoll = document.getElementById("chkBRoll");
    const subBRoll = document.getElementById("subBRoll");
    const cardBRoll = document.getElementById("cardBRoll");

    const chkPolish = document.getElementById("chkPolish");
    const subPolish = document.getElementById("subPolish");
    const cardPolish = document.getElementById("cardPolish");

    // Silence parametrlari
    const thresholdInput = document.getElementById("thresholdInput");
    const thresholdVal = document.getElementById("thresholdVal");
    const minDurationInput = document.getElementById("minDurationInput");
    const paddingInput = document.getElementById("paddingInput");
    const aiUserPrompt = document.getElementById("aiUserPrompt");

    // Tugmalar va log
    const btnAnalyze = document.getElementById("btnAnalyze");
    const btnCut = document.getElementById("btnCut");
    const btnAddMarkers = document.getElementById("btnAddMarkers");
    const btnClearLogs = document.getElementById("btnClearLogs");
    const logBox = document.getElementById("logBox");

    // Settings Modal Elementlari
    const btnOpenSettings = document.getElementById("btnOpenSettings");
    const settingsModal = document.getElementById("settingsModal");
    const btnCloseSettings = document.getElementById("btnCloseSettings");
    const btnCancelSettings = document.getElementById("btnCancelSettings");
    const btnSaveSettings = document.getElementById("btnSaveSettings");
    const btnTestConnection = document.getElementById("btnTestConnection");

    const settingProvider = document.getElementById("settingProvider");
    const settingModel = document.getElementById("settingModel");
    const settingApiKey = document.getElementById("settingApiKey");
    const btnToggleApiKey = document.getElementById("btnToggleApiKey");
    const settingSystemPrompt = document.getElementById("settingSystemPrompt");
    const testStatusBox = document.getElementById("testStatusBox");

    let currentSequenceData = null;
    let detectedIntervals = [];

    // Log chiqarish formati
    function appendLog(message, type = "normal") {
        const time = new Date().toLocaleTimeString();
        const div = document.createElement("div");
        div.className = `log-entry ${type}`;
        div.innerHTML = `<span class="time">[${time}]</span> <span>${message}</span>`;
        logBox.appendChild(div);
        logBox.scrollTop = logBox.scrollHeight;
    }

    appendLog(window.i18n.t("logReady"), "info");

    // 2. Faol AI modeli yorlig'ini yangilash
    function updateActiveAIBadge() {
        const settings = window.apiConnector.getSettings();
        const providerName = window.apiConnector.aiProviders[settings.provider]?.name || settings.provider;
        const modelName = settings.model;
        if (labelActiveAI) {
            labelActiveAI.textContent = `${providerName} (${modelName})`;
        }
    }
    updateActiveAIBadge();

    // 3. Ko'p tillilik selektori
    if (languageSelect) {
        languageSelect.value = window.i18n.getCurrentLanguage();
        languageSelect.addEventListener("change", (e) => {
            window.i18n.setLanguage(e.target.value);
            updateBackendUIStatus(window.apiConnector.isOnline);
            if (currentSequenceData) {
                renderSequenceData(currentSequenceData);
            }
        });
    }

    // 4. Checkbox/Switch'larning ochilib-yopilishi
    function bindFeatureToggle(checkbox, subSettings, card) {
        if (!checkbox || !subSettings || !card) return;
        checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
                subSettings.classList.add("expanded");
                card.classList.add("active");
            } else {
                subSettings.classList.remove("expanded");
                card.classList.remove("active");
            }
        });
    }

    bindFeatureToggle(chkSilence, subSilence, cardSilence);
    bindFeatureToggle(chkZoom, subZoom, cardZoom);
    bindFeatureToggle(chkBRoll, subBRoll, cardBRoll);
    bindFeatureToggle(chkPolish, subPolish, cardPolish);

    // 5. Sukunat slayderi
    thresholdInput.addEventListener("input", (e) => {
        thresholdVal.textContent = `${e.target.value} dB`;
    });

    // 6. Backend aloqasini tekshirish
    async function checkBackend() {
        const isOnline = await window.apiConnector.checkHealth();
        updateBackendUIStatus(isOnline);
    }

    function updateBackendUIStatus(isOnline) {
        if (isOnline) {
            backendStatusDot.className = "pulse-dot online";
            backendStatusText.textContent = window.i18n.t("connected");
        } else {
            backendStatusDot.className = "pulse-dot offline";
            backendStatusText.textContent = window.i18n.t("disconnected");
        }
    }

    checkBackend();
    setInterval(checkBackend, 8000);

    // ExtendScript natijasini xavfsiz JSON parse qilish ('EvalScript error.' va xatolarni ushlash)
    function safeParseResult(result, contextName = "") {
        if (!result || typeof result !== "string") {
            return { error: `ExtendScript'dan bo'sh javob qaytdi (${contextName})` };
        }
        const trimmed = result.trim();
        if (trimmed === "EvalScript error." || trimmed.indexOf("EvalScript error") !== -1) {
            return { error: `ExtendScript bajarish xatosi (EvalScript error): ${trimmed} [${contextName}]` };
        }
        try {
            return JSON.parse(trimmed);
        } catch (parseErr) {
            return { error: `JSON Parse xatosi: ${parseErr.message} | Qaytgan ma'lumot: "${trimmed.substring(0, 120)}"` };
        }
    }

    // ExtendScript kodini keshdan emas, toza fayldan qayta yuklab bajarish (Cache-busting + Fallback)
    function evalHostScript(scriptCode, callback) {
        try {
            const extPath = csInterface.getSystemPath("extension");
            const cleanPath = extPath ? extPath.replace(/\\/g, "/") : "";
            const wrappedScript = `(function() { try { if (typeof File !== 'undefined' && '${cleanPath}') { $.evalFile(new File('${cleanPath}/jsx/hostscript.jsx')); } } catch(e) {} return ${scriptCode}; })()`;
            
            csInterface.evalScript(wrappedScript, (result) => {
                if (!result || result === "EvalScript error." || result.indexOf("EvalScript error") !== -1) {
                    console.warn("evalHostScript reload fallback ishga tushdi:", result);
                    // To'g'ridan-to'g'ri chaqirish fallback
                    csInterface.evalScript(scriptCode, (fallbackRes) => {
                        if (callback) callback(fallbackRes);
                    });
                    return;
                }
                if (callback) callback(result);
            });
        } catch (e) {
            csInterface.evalScript(scriptCode, callback);
        }
    }

    // 7. Faol Sekvensiya ma'lumotlarini yangilash (Klip metama'lumotlari bilan)
    function renderSequenceData(data) {
        seqNameEl.textContent = data.name || "Noma'lum Sekvensiya";
        const fpsVal = data.fps ? `${data.fps} fps` : (data.timebase ? `${(254016000000 / parseFloat(data.timebase)).toFixed(2)} fps` : "29.97 fps");
        const durText = data.end ? ` | Davomiyligi: ${data.end.toFixed(1)}s` : "";

        let clipDesc = "";
        if (data.selectedSegments && data.selectedSegments.length > 1) {
            clipDesc = ` | 🎯 Tanlangan: ${data.selectedSegments.length} ta klip (${data.workAreaStart}s - ${data.workAreaEnd}s)`;
        } else if (data.targetClip && data.targetClip.name) {
            clipDesc = ` | 🎯 Klip: "${data.targetClip.name}" (${data.targetClip.timelineStart}s - ${data.targetClip.timelineEnd}s)`;
        } else if (data.workAreaStart && data.workAreaStart > 0) {
            clipDesc = ` | Boshlanishi: ${data.workAreaStart}s`;
        }

        seqDetailsEl.textContent = `${window.i18n.t("videoTracks")}: ${data.videoTracks || 0} | ${window.i18n.t("audioTracks")}: ${data.audioTracks || 0} | ${fpsVal}${durText}${clipDesc}`;
    }

    function refreshSequence() {
        evalHostScript("getActiveSequenceInfo()", (result) => {
            const data = safeParseResult(result, "Sekvensiya ma'lumoti");
            if (data.error) {
                seqNameEl.textContent = window.i18n.t("noSequence");
                seqDetailsEl.textContent = window.i18n.t("noSequenceHint");
                currentSequenceData = null;
                appendLog(window.i18n.t("logError") + data.error, "error");
            } else if (data.success) {
                currentSequenceData = data;
                renderSequenceData(data);

                let targetInfo = "Timeline";
                if (data.selectedSegments && data.selectedSegments.length > 1) {
                    targetInfo = `Tanlangan ${data.selectedSegments.length} ta klip (${data.workAreaStart}s - ${data.workAreaEnd}s, Jami: ${(data.workAreaEnd - data.workAreaStart).toFixed(1)}s)`;
                } else if (data.targetClip) {
                    targetInfo = `Klip: "${data.targetClip.name}" (Timeline: ${data.targetClip.timelineStart}s - ${data.targetClip.timelineEnd}s, Manba: ${data.targetClip.sourceIn}s - ${data.targetClip.sourceOut}s)`;
                } else {
                    targetInfo = `Oraliq: ${data.workAreaStart}s - ${data.workAreaEnd}s (${data.targetSource})`;
                }
                appendLog(`${window.i18n.t("logSeqDetected")} "${data.name}" (${data.fps} fps) | ${targetInfo}`, "info");

                // 1-MUAMMO: Toza Audio trek (A1 / A2) ko'rsatkichi
                if (data.hasCleanAudio && data.audioMediaPath) {
                    const audioFileName = data.audioMediaPath.split(/[\/\\]/).pop() || data.audioMediaPath;
                    appendLog(`🎙️ Toza audio trek aniqlandi: [${data.cleanAudioTrack || "A1"}] "${audioFileName}" (In: ${data.audioSourceIn}s, Out: ${data.audioSourceOut}s)`, "success");
                }
            }
        });
    }

    refreshSeqBtn.addEventListener("click", refreshSequence);
    setTimeout(refreshSequence, 600);

    // 8. Konsolni tozalash
    if (btnClearLogs) {
        btnClearLogs.addEventListener("click", () => {
            logBox.innerHTML = "";
            appendLog(window.i18n.t("logReady"), "info");
        });
    }

    // ========================================================
    // 9. AI SOZLAMALAR MODALI BOSHQARUVI
    // ========================================================

    function populateModelsForProvider(provider, selectedModel) {
        settingModel.innerHTML = "";
        const config = window.apiConnector.aiProviders[provider];
        if (!config) return;

        config.models.forEach(modelName => {
            const opt = document.createElement("option");
            opt.value = modelName;
            opt.textContent = modelName;
            if (modelName === selectedModel) {
                opt.selected = true;
            }
            settingModel.appendChild(opt);
        });
    }

    function loadSettingsToModal() {
        const settings = window.apiConnector.getSettings();
        settingProvider.value = settings.provider || "gemini";
        populateModelsForProvider(settingProvider.value, settings.model);

        // API kalitni yuklash
        const currentKey = (settings.apiKeys && settings.apiKeys[settingProvider.value]) || "";
        settingApiKey.value = currentKey;
        settingSystemPrompt.value = settings.systemPrompt || "";

        testStatusBox.className = "hidden";
        testStatusBox.textContent = "";
    }

    // Provayder o'zgarganda tegishli modellar va kalitni almashtirish
    settingProvider.addEventListener("change", () => {
        const prov = settingProvider.value;
        const settings = window.apiConnector.getSettings();
        populateModelsForProvider(prov, window.apiConnector.aiProviders[prov]?.defaultModel);
        settingApiKey.value = (settings.apiKeys && settings.apiKeys[prov]) || "";
        testStatusBox.className = "hidden";
    });

    // API Key ko'rinishini almashtirish (Eye toggle)
    btnToggleApiKey.addEventListener("click", () => {
        if (settingApiKey.type === "password") {
            settingApiKey.type = "text";
            btnToggleApiKey.textContent = "🔒";
        } else {
            settingApiKey.type = "password";
            btnToggleApiKey.textContent = "👁️";
        }
    });

    // Modalni ochish
    function openModal() {
        loadSettingsToModal();
        settingsModal.classList.remove("hidden");
    }

    // Modalni yopish
    function closeModal() {
        settingsModal.classList.add("hidden");
    }

    btnOpenSettings.addEventListener("click", openModal);
    if (badgeActiveAI) badgeActiveAI.addEventListener("click", openModal);
    btnCloseSettings.addEventListener("click", closeModal);
    btnCancelSettings.addEventListener("click", closeModal);

    // API Kalit va aloqani tekshirish (Test Connection)
    btnTestConnection.addEventListener("click", async () => {
        const provider = settingProvider.value;
        const apiKey = settingApiKey.value.trim();
        const model = settingModel.value;

        if (!apiKey) {
            testStatusBox.className = "p-2 rounded text-[10px] leading-tight font-medium bg-red-950/80 border border-red-500/50 text-red-300 block";
            testStatusBox.textContent = "Iltimos, avval API kalitni kiriting!";
            return;
        }

        testStatusBox.className = "p-2 rounded text-[10px] leading-tight font-medium bg-sky-950/80 border border-sky-500/50 text-sky-300 block";
        testStatusBox.textContent = window.i18n.t("testing");
        btnTestConnection.disabled = true;

        try {
            await window.apiConnector.testAIConnection(provider, apiKey, model);
            testStatusBox.className = "p-2 rounded text-[10px] leading-tight font-medium bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 block";
            testStatusBox.textContent = window.i18n.t("testSuccess");
        } catch (error) {
            testStatusBox.className = "p-2 rounded text-[10px] leading-tight font-medium bg-red-950/80 border border-red-500/50 text-red-300 block";
            testStatusBox.textContent = window.i18n.t("testFailed") + error.message;
        } finally {
            btnTestConnection.disabled = false;
        }
    });

    // Sozlamalarni saqlash
    btnSaveSettings.addEventListener("click", () => {
        const provider = settingProvider.value;
        const model = settingModel.value;
        const apiKey = settingApiKey.value.trim();
        const systemPrompt = settingSystemPrompt.value.trim();

        const currentSettings = window.apiConnector.getSettings();
        const updatedApiKeys = { ...(currentSettings.apiKeys || {}) };
        updatedApiKeys[provider] = apiKey;

        window.apiConnector.saveSettings({
            provider,
            model,
            apiKeys: updatedApiKeys,
            systemPrompt
        });

        updateActiveAIBadge();
        appendLog(`${window.i18n.t("settingsSaved")} [${provider.toUpperCase()} - ${model}]`, "success");
        closeModal();
    });

    // ========================================================
    // 10. AI TAHLIL VA MONTAJ AMALLARI
    // ========================================================

    btnAnalyze.addEventListener("click", async () => {
        if (!chkSilence.checked && !chkZoom.checked && !chkBRoll.checked && !chkPolish.checked) {
            appendLog("Kamida bitta AI modulini tanlang!", "error");
            return;
        }

        const settings = window.apiConnector.getSettings();
        const activeApiKey = window.apiConnector.getActiveApiKey();
        const userPrompt = (aiUserPrompt && aiUserPrompt.value.trim()) || "";

        btnAnalyze.disabled = true;

        // 1. Backend holatini tekshirish
        const isOnline = await window.apiConnector.checkHealth();
        if (!isOnline) {
            appendLog("❌ FastAPI backend server oflayn (http://127.0.0.1:8000)!", "error");
            appendLog("Iltimos, terminalda serverni ishga tushiring: python3 -m uvicorn main:app --host 127.0.0.1 --port 8000", "error");
            btnAnalyze.disabled = false;
            return;
        }

        // 2. FastAPI Backend orqali AutoEdit AI konveyeri
        const activeModules = [];
        if (chkSilence.checked) activeModules.push("Silence");
        if (chkZoom.checked) activeModules.push("Auto-Zoom");
        if (chkBRoll.checked) activeModules.push("B-Roll");
        if (chkPolish.checked) activeModules.push("Polish");

        const segments = currentSequenceData?.selectedSegments || [];
        const isMulti = segments.length > 1;
        const workStart = currentSequenceData?.workAreaStart || 0;
        const workEnd = currentSequenceData?.workAreaEnd || currentSequenceData?.end || 60;
        const targetClip = currentSequenceData?.targetClip;

        // Audio tahlil uchun birinchi navbatda A1 trekdagi toza ovoz olinadi
        let mediaPath = currentSequenceData?.audioMediaPath || currentSequenceData?.mediaPath || targetClip?.mediaPath || "";
        let sourceIn = 0;
        let sourceOut = workEnd - workStart;

        if (currentSequenceData?.hasCleanAudio && currentSequenceData?.audioMediaPath) {
            mediaPath = currentSequenceData.audioMediaPath;
            sourceIn = currentSequenceData.audioSourceIn || 0;
            sourceOut = currentSequenceData.audioSourceOut || (workEnd - workStart);
        } else if (!isMulti && targetClip) {
            sourceIn = targetClip.sourceIn;
            sourceOut = targetClip.sourceOut;
        }

        if (!mediaPath) {
            appendLog("❌ Timeline'da tahlil qilish uchun audio yoki video fayl topilmadi!", "error");
            btnAnalyze.disabled = false;
            return;
        }

        appendLog(`⚡ AutoEdit AI (${settings.provider.toUpperCase()} - ${settings.model}) s'yomka tahlili boshlandi...`, "info");
        if (currentSequenceData?.hasCleanAudio) {
            const aName = mediaPath.split(/[\/\\]/).pop() || mediaPath;
            appendLog(`🎙️ Mikrofon ovozi: [${currentSequenceData.cleanAudioTrack || "A1"}] "${aName}" (Manba: ${sourceIn.toFixed(1)}s - ${sourceOut.toFixed(1)}s)`, "success");
        }

        if (isMulti) {
            appendLog(`📍 Belgilangan ${segments.length} ta klip to'liq tahlilga olindi (Timeline: ${workStart.toFixed(1)}s - ${workEnd.toFixed(1)}s, Davomiyligi: ${(workEnd - workStart).toFixed(1)}s)`, "info");
        } else if (targetClip) {
            appendLog(`📍 Nishondagi klip: "${targetClip.name}" (Timeline: ${workStart.toFixed(1)}s - ${workEnd.toFixed(1)}s)`, "info");
        } else {
            appendLog(`📍 Butun Timeline: (${workStart.toFixed(1)}s - ${workEnd.toFixed(1)}s, Davomiyligi: ${(workEnd - workStart).toFixed(1)}s)`, "info");
        }
        if (userPrompt) {
            appendLog(`🎯 Foydalanuvchi ko'rsatmasi: "${userPrompt}"`, "info");
        }

        try {
            const threshold = parseFloat(thresholdInput.value);
            const minDuration = parseFloat(minDurationInput.value);
            const padding = parseFloat(paddingInput.value);

            const result = await window.apiConnector.processVideoPipeline({
                mediaPath: mediaPath,
                sourceIn: sourceIn,
                sourceOut: sourceOut,
                timelineStart: workStart,
                timelineEnd: workEnd,
                userPrompt: userPrompt,
                aiProvider: settings.provider,
                apiKey: activeApiKey,
                model: settings.model,
                thresholdDb: threshold,
                minSilenceDuration: minDuration,
                padding: padding,
                targetFormat: "reels"
            });

            detectedIntervals = result.timeline_actions || [];

            // Telemetriya jurnali: Har bir amalning ma'nosi va sababi (KEEP / CUT / ZOOM)
            if (result.telemetry_logs && result.telemetry_logs.length > 0) {
                appendLog("📋 AI Rejissura jurnali (Aniq vaqtlar va sabablar):", "info");
                result.telemetry_logs.forEach(logItem => {
                    let logType = "normal";
                    if (logItem.startsWith("📋") || logItem.startsWith("⚡") || logItem.startsWith("📊") || logItem.startsWith("📂")) logType = "info";
                    else if (logItem.startsWith("✅") || logItem.startsWith("🔥") || logItem.startsWith("🎬")) logType = "success";
                    else if (logItem.startsWith("🔍")) logType = "info";
                    else if (logItem.startsWith("⚠️")) logType = "error";
                    appendLog(logItem, logType);
                });
            }

            if (result.total_keep_time) {
                const keepBlocks = result.merged_keep_intervals?.length || 0;
                appendLog(`🎬 Tayyor Reels davomiyligi: ${result.total_keep_time}s (${keepBlocks} ta toza Mavzu Bloki)`, "success");
            }

            appendLog(`✅ Jami: ${result.total_cuts || 0} ta pauza va adashgan dubl kesildi, ${result.total_zooms || 0} ta dinamik Zoom-In aniqlandi. Tejalgan vaqt: ${result.time_saved_seconds || 0}s`, "success");
            if (result.summary) {
                appendLog("💡 Xulosa: " + result.summary, "info");
            }

            btnAddMarkers.disabled = detectedIntervals.length === 0;
            btnCut.disabled = detectedIntervals.length === 0;
        } catch (error) {
            appendLog(window.i18n.t("logError") + error.message, "error");
        } finally {
            btnAnalyze.disabled = false;
        }
    });

    // 11. Timeline'ga markerlar qo'yish (ES3 mos escape va Cache-Busting bilan)
    btnAddMarkers.addEventListener("click", () => {
        if (detectedIntervals.length === 0) return;

        appendLog("Timeline'ga rangli markerlar joylashtirilmoqda...", "info");
        const encoded = escape(JSON.stringify(detectedIntervals));

        evalHostScript(`addCutMarkers('${encoded}')`, (result) => {
            const res = safeParseResult(result, "Markerlar qo'yish");
            if (res.success) {
                appendLog(`${res.count} ta rangli marker (Cut/Zoom/B-Roll) timeline'ga joylandi!`, "success");
            } else {
                appendLog(window.i18n.t("logError") + (res.error || "Noma'lum xatolik"), "error");
            }
        });
    });

    // 12. Montajni qo'llash / Qirqish, Ripple Delete va Zoom (ES3 mos escape va Cache-Busting bilan)
    btnCut.addEventListener("click", () => {
        if (detectedIntervals.length === 0) return;

        appendLog("Timeline montaj jarayoni boshlandi (Multi-track cut, Ripple Delete, Zoom-In)...", "info");
        btnCut.disabled = true;

        // UI dagi Zoom sozlamalarini (scale va smooth) yangilash
        const selectedScale = parseFloat(document.getElementById("zoomIntensity")?.value || 1.25);
        detectedIntervals.forEach(act => {
            if (act.action === "zoom") {
                act.scale = selectedScale || act.scale || 1.25;
                act.zoomSpeed = "smooth";
            }
        });

        const encoded = escape(JSON.stringify(detectedIntervals));

        evalHostScript(`applyTimelineActions('${encoded}')`, (result) => {
            btnCut.disabled = false;
            const res = safeParseResult(result, "Montajni qo'llash");
            if (res.success) {
                appendLog(`✅ PRODUCTION READY! O'chirilgan kliplar: ${res.actualClipsDeleted || 0} ta | Zoom-In: ${res.actualZoomsApplied || 0} ta`, "success");
            } else {
                appendLog(window.i18n.t("logError") + (res.error || res.message || "Noma'lum xatolik"), "error");
            }
        });
    });
});
