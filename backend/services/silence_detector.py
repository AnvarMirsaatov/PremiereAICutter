"""
silence_detector.py - FFmpeg silencedetect orqali fizik sukunat va gap oraliqlarini 100% aniq aniqlash.
"""
import os
import re
import shutil
import subprocess
from typing import List, Dict, Any, Optional

class SilenceDetector:
    def __init__(self):
        self.ffmpeg_path = self._locate_ffmpeg()

    def _locate_ffmpeg(self) -> Optional[str]:
        """Tizimdagi yoki imageio-ffmpeg tarkibidagi ffmpeg binarini topadi"""
        try:
            import imageio_ffmpeg
            exe = imageio_ffmpeg.get_ffmpeg_exe()
            if os.path.exists(exe):
                return exe
        except Exception:
            pass

        for candidate in ["ffmpeg", "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"]:
            path = shutil.which(candidate) if not os.path.isabs(candidate) else candidate
            if path and os.path.exists(path):
                return path

        return None

    def get_audio_duration(self, audio_path: str) -> float:
        """Audio faylning aniq davomiyligini aniqlash"""
        if not self.ffmpeg_path or not os.path.exists(audio_path):
            return 0.0
        try:
            cmd = [self.ffmpeg_path, "-i", audio_path]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            err = res.stderr.decode("utf-8", errors="ignore")
            m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", err)
            if m:
                h = float(m.group(1))
                mn = float(m.group(2))
                s = float(m.group(3))
                return round(h * 3600 + mn * 60 + s, 3)
        except Exception:
            pass
        return 0.0

    def detect_silence(
        self,
        audio_path: str,
        threshold_db: float = -35.0,
        min_silence_duration: float = 0.4,
        padding: float = 0.08
    ) -> Dict[str, Any]:
        """
        1-QADAM: FFmpeg -af silencedetect filtri yordamida videoning 0-soniyasidan
        eng oxirgi soniyasigacha bo'lgan BARCHA haqiqiy jismoniy sukunatlarni (pauzalarni)
        va ular orasidagi haqiqiy gap (speech) segmentlarini 100% matematik aniqlikda topadi.
        """
        if not audio_path or not os.path.exists(audio_path):
            return self._generate_sample_intervals(min_silence_duration, padding)

        total_duration = self.get_audio_duration(audio_path)
        if total_duration <= 0.0:
            total_duration = 60.0

        if not self.ffmpeg_path:
            print("[SilenceDetector] FFmpeg topilmadi, namunaviy sukunatlar ishlatiladi")
            return self._generate_sample_intervals(min_silence_duration, padding)

        try:
            # FFmpeg silencedetect chaqiruv
            cmd = [
                self.ffmpeg_path,
                "-i", audio_path,
                "-af", f"silencedetect=noise={threshold_db}dB:d={min_silence_duration}",
                "-f", "null", "-"
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            stderr_text = res.stderr.decode("utf-8", errors="ignore")

            raw_silences = self._parse_silencedetect_output(stderr_text, total_duration)

            # Padding (nafas buferi) qo'llash va minimal davomiylikni tekshirish
            padded_silences = []
            for item in raw_silences:
                s_start = item["start"]
                s_end = item["end"]

                # O'rtadagi pauzalar uchun nafas buferi
                adj_start = max(0.0, s_start + padding)
                adj_end = max(adj_start, s_end - padding)
                dur = adj_end - adj_start

                if dur >= 0.25:
                    padded_silences.append({
                        "start": round(adj_start, 3),
                        "end": round(adj_end, 3),
                        "raw_start": round(s_start, 3),
                        "raw_end": round(s_end, 3),
                        "duration": round(dur, 3)
                    })

            # Sukunatlardan holi bo'lgan haqiqiy Gap (Speech) segmentlarini ajratib olish
            speech_segments = self._extract_speech_segments(padded_silences, total_duration)

            total_silence = sum(x["duration"] for x in padded_silences)
            total_speech = sum(x["duration"] for x in speech_segments)

            print(f"[SilenceDetector] FFmpeg tahlili yakunlandi: Jami {len(padded_silences)} ta pauza ({total_silence:.1f}s), {len(speech_segments)} ta gap segmenti ({total_speech:.1f}s) / Umumiy: {total_duration:.1f}s")

            return {
                "file": audio_path,
                "duration": round(total_duration, 2),
                "silence_intervals": padded_silences,
                "speech_segments": speech_segments,
                "total_silence_duration": round(total_silence, 2),
                "total_speech_duration": round(total_speech, 2),
                "silence_count": len(padded_silences),
                "speech_count": len(speech_segments),
                "is_mock": False
            }

        except Exception as e:
            print(f"[SilenceDetector] FFmpeg silencedetect xatosi: {e}")
            return self._generate_sample_intervals(min_silence_duration, padding)

    def _parse_silencedetect_output(self, stderr: str, total_duration: float) -> List[Dict[str, float]]:
        """FFmpeg stderr jurnalidan silence_start va silence_end larni tartib bilan ajratadi"""
        intervals = []
        current_start: Optional[float] = None

        for line in stderr.splitlines():
            if "silencedetect" not in line:
                continue

            m_start = re.search(r"silence_start:\s*(-?[\d\.]+)", line)
            if m_start:
                try:
                    val = float(m_start.group(1))
                    current_start = max(0.0, val)
                except Exception:
                    pass

            m_end = re.search(r"silence_end:\s*([\d\.]+)", line)
            if m_end:
                try:
                    val = float(m_end.group(1))
                    s_start = current_start if current_start is not None else 0.0
                    if val > s_start:
                        intervals.append({
                            "start": round(s_start, 3),
                            "end": round(val, 3),
                            "duration": round(val - s_start, 3)
                        })
                    current_start = None
                except Exception:
                    pass

        # Agar fayl sukunat ichida tugagan bo'lsa
        if current_start is not None and total_duration > current_start:
            intervals.append({
                "start": round(current_start, 3),
                "end": round(total_duration, 3),
                "duration": round(total_duration - current_start, 3)
            })

        return intervals

    def _extract_speech_segments(
        self,
        silence_intervals: List[Dict[str, Any]],
        total_duration: float,
        min_speech_len: float = 0.2
    ) -> List[Dict[str, Any]]:
        """Sukunat oraliqlari orasidagi barcha haqiqiy gap segmentlarini shakllantiradi"""
        silences = sorted(silence_intervals, key=lambda x: x["start"])
        speech_segs = []
        cursor = 0.0
        seg_id = 1

        for sil in silences:
            gap = sil["start"] - cursor
            if gap >= min_speech_len:
                speech_segs.append({
                    "id": seg_id,
                    "start": round(cursor, 3),
                    "end": round(sil["start"], 3),
                    "duration": round(gap, 3)
                })
                seg_id += 1
            cursor = max(cursor, sil["end"])

        if total_duration - cursor >= min_speech_len:
            speech_segs.append({
                "id": seg_id,
                "start": round(cursor, 3),
                "end": round(total_duration, 3),
                "duration": round(total_duration - cursor, 3)
            })

        return speech_segs

    def _generate_sample_intervals(self, min_silence: float, padding: float) -> Dict[str, Any]:
        """Sinov muhiti uchun namunaviy ma'lumotlar"""
        sample_intervals = [
            {"start": 2.1, "end": 4.5, "duration": 2.4},
            {"start": 8.0, "end": 10.3, "duration": 2.3},
            {"start": 15.6, "end": 17.2, "duration": 1.6},
            {"start": 24.0, "end": 27.5, "duration": 3.5},
            {"start": 33.2, "end": 35.0, "duration": 1.8}
        ]

        total_silence = sum(x["duration"] for x in sample_intervals)
        return {
            "file": "mock_timeline_audio.wav",
            "duration": 60.0,
            "silence_intervals": sample_intervals,
            "speech_segments": [
                {"id": 1, "start": 0.0, "end": 2.1, "duration": 2.1},
                {"id": 2, "start": 4.5, "end": 8.0, "duration": 3.5},
                {"id": 3, "start": 10.3, "end": 15.6, "duration": 5.3},
                {"id": 4, "start": 17.2, "end": 24.0, "duration": 6.8},
                {"id": 5, "start": 27.5, "end": 33.2, "duration": 5.7},
                {"id": 6, "start": 35.0, "end": 60.0, "duration": 25.0}
            ],
            "total_silence_duration": round(total_silence, 2),
            "total_speech_duration": round(60.0 - total_silence, 2),
            "silence_count": len(sample_intervals),
            "speech_count": 6,
            "is_mock": True
        }
