"""
audio_extractor.py - Videodan aniq segmentli audio ajratib olish xizmati (FFmpeg / imageio-ffmpeg)
Namuna aniqligi, ko'p trekli audio (multi-track) va xavfsiz ekstraksiya bilan.
"""
import os
import shutil
import subprocess
import tempfile
from typing import Optional, Tuple, List, Dict, Any

class AudioExtractor:
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

    def get_audio_duration(self, audio_or_video_path: str) -> float:
        """FFmpeg yordamida audio yoki video fayl davomiyligini aniq aniqlash"""
        if not self.ffmpeg_path or not os.path.exists(audio_or_video_path):
            return 0.0
        try:
            cmd = [self.ffmpeg_path, "-i", audio_or_video_path]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            err = res.stderr.decode("utf-8", errors="ignore")
            import re
            m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", err)
            if m:
                h = float(m.group(1))
                mn = float(m.group(2))
                s = float(m.group(3))
                return round(h * 3600 + mn * 60 + s, 3)
        except Exception:
            pass
        return 0.0

    def extract_segment_audio(
        self,
        video_path: str,
        source_in: Optional[float] = None,
        source_out: Optional[float] = None,
        target_format: str = "mp3",
        target_sr: int = 16000
    ) -> Tuple[str, float]:
        """
        Asl video faylning belgilangan qismini (-ss sourceIn -t duration)
        yoki butun videoni 16kHz mono audio (.mp3) qilib ajratadi.
        """
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video fayl topilmadi: {video_path}")

        temp_dir = tempfile.gettempdir()
        base_name = os.path.splitext(os.path.basename(video_path))[0]
        ext = target_format.lower()
        if not ext.startswith("."):
            ext = f".{ext}"

        # Davomiylikni hisoblash
        duration = 0.0
        has_segment = False
        s_in = float(source_in) if source_in is not None else 0.0
        s_out = float(source_out) if source_out is not None else 0.0

        if s_out > s_in:
            duration = round(s_out - s_in, 3)
            has_segment = True
            output_audio = os.path.join(temp_dir, f"{base_name}_in{int(s_in)}_out{int(s_out)}{ext}")
        else:
            output_audio = os.path.join(temp_dir, f"{base_name}_full_audio{ext}")

        # Eski kesh faylni o'chirish (toza yozish uchun)
        if os.path.exists(output_audio):
            try:
                os.remove(output_audio)
            except Exception:
                pass

        if not self.ffmpeg_path:
            raise RuntimeError("FFmpeg topilmadi. Iltimos, ffmpeg o'rnatilganligini tekshiring.")

        cmd = [self.ffmpeg_path, "-y"]

        # 100% aniqlik uchun -ss va -t ni -i dan keyin (sample-accurate decoding) qo'llash
        cmd.extend(["-i", video_path])

        if has_segment:
            cmd.extend(["-ss", f"{s_in:.3f}", "-t", f"{duration:.3f}"])

        cmd.extend([
            "-vn",  # Videoni tashlab ketish
            "-map", "0:a:0?",  # Birinchi audio trek (agar multi-track bo'lsa)
            "-ar", str(target_sr),  # 16000 Hz (AI uchun optimal)
            "-ac", "1",  # Mono kanal
        ])

        if ext == ".mp3":
            # 32kbps mono MP3 (aniq nutq va 5 daqiqa ~1.1MB o'ta yengil hajm)
            cmd.extend(["-codec:a", "libmp3lame", "-b:a", "32k"])
        else:
            cmd.extend(["-acodec", "pcm_s16le"])

        cmd.append(output_audio)

        print(f"[AudioExtractor] FFmpeg audio ajratilmoqda: {' '.join(cmd)}")
        try:
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            if not os.path.exists(output_audio) or os.path.getsize(output_audio) == 0:
                raise RuntimeError("Audio ajratishda fayl bo'sh bo'lib qoldi")

            if duration <= 0:
                duration = self.get_audio_duration(output_audio)
                if duration <= 0:
                    duration = self.get_audio_duration(video_path)

            file_size_mb = os.path.getsize(output_audio) / (1024 * 1024)
            print(f"[AudioExtractor] Audio tayyor: {output_audio} ({duration:.1f}s, {file_size_mb:.2f} MB)")
            return output_audio, duration

        except subprocess.CalledProcessError as e:
            err_msg = e.stderr.decode("utf-8", errors="ignore")
            print(f"[AudioExtractor] FFmpeg xatosi: {err_msg}")
            # Agar map 0:a:0 xato bersa, mapsiz qayta urinish
            try:
                cmd_fallback = [self.ffmpeg_path, "-y", "-i", video_path]
                if has_segment:
                    cmd_fallback.extend(["-ss", f"{s_in:.3f}", "-t", f"{duration:.3f}"])
                cmd_fallback.extend(["-vn", "-ar", str(target_sr), "-ac", "1", output_audio])
                subprocess.run(cmd_fallback, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
                if os.path.exists(output_audio) and os.path.getsize(output_audio) > 0:
                    dur = self.get_audio_duration(output_audio) or duration or 60.0
                    return output_audio, dur
            except Exception:
                pass
            raise RuntimeError(f"FFmpeg orqali audio ajratib bo'lmadi: {err_msg[:200]}")
