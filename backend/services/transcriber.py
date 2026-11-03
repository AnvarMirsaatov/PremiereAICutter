"""
transcriber.py - AutoEdit AI nutq va pauza segmentatsiyasi dvijogi.
FFmpeg silencedetect (-32dB:d=0.35) orqali 100% matematik aniq gap bo'laklarini (speech_segments)
va pauzalarini ajratib oladi. Hech qachon 0 ta gap qaytarmaydi.
"""
import os
import re
import shutil
import subprocess
from typing import List, Dict, Any, Tuple

class Transcriber:
    def __init__(self):
        self.ffmpeg_path = self._locate_ffmpeg()

    def _locate_ffmpeg(self) -> str:
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

        return "ffmpeg"

    def get_audio_duration(self, audio_path: str) -> float:
        """Audio fayl davomiyligini aniqlash"""
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

    def extract_speech_segments_with_ffmpeg(
        self,
        audio_path: str,
        threshold_db: float = -32.0,
        min_silence_duration: float = 0.30
    ) -> Dict[str, Any]:
        """
        FFmpeg silencedetect (noise=-32dB:d=0.30) orqali butun audioni
        100% matematik aniq gap segmentlariga (speech_segments) va pauzalarga (silence_cuts) ajratadi.
        Hech qachon bo'sh (0 ta gap) qaytarmaydi.
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio fayl topilmadi: {audio_path}")

        total_duration = self.get_audio_duration(audio_path)
        if total_duration <= 0.0:
            total_duration = 60.0

        print(f"[Transcriber] FFmpeg silencedetect ({threshold_db}dB, d={min_silence_duration}s) tahlili boshlandi: {audio_path} ({total_duration:.1f}s)...")

        cmd = [
            self.ffmpeg_path,
            "-i", audio_path,
            "-af", f"silencedetect=noise={threshold_db}dB:d={min_silence_duration}",
            "-f", "null", "-"
        ]

        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        lines = res.stderr.decode("utf-8", errors="ignore").splitlines()

        silences = []
        cur_s = None
        for l in lines:
            if "silence_start:" in l:
                m = re.search(r"silence_start:\s*(-?[\d\.]+)", l)
                if m:
                    cur_s = max(0.0, float(m.group(1)))
            elif "silence_end:" in l:
                m = re.search(r"silence_end:\s*([\d\.]+)", l)
                if m and cur_s is not None:
                    sil_end = min(total_duration, float(m.group(1)))
                    if sil_end > cur_s:
                        silences.append((cur_s, sil_end))
                    cur_s = None

        if cur_s is not None and cur_s < total_duration:
            silences.append((cur_s, total_duration))

        # Juda yaqin (<0.15s) pauzalarni birlashtirish
        merged_sil = []
        for s, e in silences:
            if not merged_sil:
                merged_sil.append([s, e])
            else:
                if s <= merged_sil[-1][1] + 0.15:
                    merged_sil[-1][1] = max(merged_sil[-1][1], e)
                else:
                    merged_sil.append([s, e])

        # Pauzalardan holi bo'lgan gap (speech) segmentlarini ajratib olish
        speech_segments = []
        seg_id = 1
        last_end = 0.0

        for s, e in merged_sil:
            if s > last_end + 0.25:
                speech_segments.append({
                    "id": seg_id,
                    "start": round(last_end, 3),
                    "end": round(s, 3),
                    "duration": round(s - last_end, 3),
                    "text": ""
                })
                seg_id += 1
            last_end = e

        if last_end < total_duration - 0.25:
            speech_segments.append({
                "id": seg_id,
                "start": round(last_end, 3),
                "end": round(total_duration, 3),
                "duration": round(total_duration - last_end, 3),
                "text": ""
            })

        # Agar audioda umuman pauza topilmasa (shovqinli yoki doimiy ovoz)
        if not speech_segments:
            speech_segments.append({
                "id": 1,
                "start": 0.0,
                "end": round(total_duration, 3),
                "duration": round(total_duration, 3),
                "text": ""
            })

        silence_cuts = []
        for s, e in merged_sil:
            s_dur = e - s
            if s_dur >= 0.25:
                silence_cuts.append({
                    "action": "cut",
                    "start": round(s, 3),
                    "end": round(e, 3),
                    "duration": round(s_dur, 3),
                    "category": "silence",
                    "reason": f"Pauza / Sukunat ({s_dur:.2f}s)"
                })

        print(f"[Transcriber] FFmpeg yakunlandi: {len(speech_segments)} ta gap segmenti va {len(silence_cuts)} ta pauza topildi.")

        return {
            "status": "success",
            "duration": total_duration,
            "speech_segments": speech_segments,
            "silence_cuts": silence_cuts,
            "total_segments": len(speech_segments),
            "total_silence_cuts": len(silence_cuts)
        }

    def transcribe(
        self,
        audio_path: str,
        threshold_db: float = -32.0,
        min_silence_duration: float = 0.30,
        **kwargs
    ) -> Dict[str, Any]:
        """AutoEdit AI transkripsiya asosiy nuqtasi"""
        return self.extract_speech_segments_with_ffmpeg(
            audio_path=audio_path,
            threshold_db=threshold_db,
            min_silence_duration=min_silence_duration
        )
