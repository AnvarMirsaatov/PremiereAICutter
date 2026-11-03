"""
main.py - Adobe Premiere Pro uchun AutoEdit AI Video Cutter FastAPI Backendi
Full Scripted Reels & Bad-Take Remover Architecture:
1. FFmpeg silencedetect (-32dB:d=0.35) orqali butun video (0s dan 295s+ gacha) 100% matematik aniq gap va pauza segmentlariga ajratiladi.
2. Gemini 2.5 Flash Multimodal Audio orqali Take-Grouping va Last-Best-Take tahlili:
   - Mavzu bloklarini aniqlash (Intro -> 1-qism -> 2-qism -> 3-qism -> Xulosa -> CTA).
   - Har bir blokdagi barcha adashgan dubllarni (Bad Takes) 100% kesish.
   - Har bir blokdan FAQAT ENG OXIRGI, ENG TO'LIQ VA ENG RAVON YAKUNIY DUBLNI (KEEP) saqlab qolish.
3. Padding (+0.10s / +0.12s) va Inversion orqali barcha adashgan dubllar va pauzalarni bitta toza yaxlit kesim (Ripple Delete) ga aylantirish.
4. Muhim punchline va mavzu urg'ulariga dinamik Bezier Zoom-In (1.20x) qo'yish.
5. Soxta 15 soniyalik cheklovlar va mock rejimlar butunlay olib tashlangan.
"""
import os
import shutil
import tempfile
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

from services.audio_extractor import AudioExtractor
from services.silence_detector import SilenceDetector
from services.transcriber import Transcriber
from services.ai_director import AIDirector

app = FastAPI(
    title="Premiere Pro AutoEdit AI Video Cutter API",
    description="Full Scripted Reels & Bad-Take Remover: FFmpeg Speech Segmentation + Gemini 2.5 Flash Multimodal Audio",
    version="3.0.0"
)

# CORS sozlamalari
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Xizmatlarni initsializatsiya qilish
audio_extractor = AudioExtractor()
silence_detector = SilenceDetector()
transcriber = Transcriber()
ai_director = AIDirector()

# Pydantic modellari
class ProcessVideoRequest(BaseModel):
    mediaPath: Optional[str] = Field(default=None, description="Premiere Pro-dan yuborilgan video yoki audio fayl manzili")
    videoPath: Optional[str] = Field(default=None, description="Muvofiqlik uchun eski parametr")
    sourceIn: Optional[float] = Field(default=0.0, description="Klipning asl videodagi kirish vaqti (soniyada)")
    sourceOut: Optional[float] = Field(default=None, description="Klipning asl videodagi chiqish vaqti (soniyada)")
    timelineStart: Optional[float] = Field(default=0.0, description="Klipning Timeline'dagi boshlanish vaqti (soniyada)")
    timelineEnd: Optional[float] = Field(default=None, description="Klipning Timeline'dagi tugash vaqti (soniyada)")
    userPrompt: Optional[str] = Field(default="", description="Foydalanuvchining AI ga bergan maxsus rejissyorlik ko'rsatmasi")
    aiProvider: Optional[str] = Field(default="gemini", description="AI provayderi: gemini, openai yoki anthropic")
    apiKey: Optional[str] = Field(default=None, description="Foydalanuvchining AI API kaliti")
    model: Optional[str] = Field(default="gemini-2.5-flash", description="Tanlangan model")
    thresholdDb: float = Field(default=-32.0, description="Sukunat chegarasi (dB)")
    minSilenceDuration: float = Field(default=0.30, description="Minimal sukunat soniyasi")
    padding: float = Field(default=0.15, description="Gap atrofiga saqlanadigan tabiiy bufer")
    targetFormat: Optional[str] = Field(default="reels", description="reels, shorts yoki full_cut")
    forceMock: Optional[bool] = Field(default=False, description="Eski parametr (e'tiborsiz qoldiriladi)")

class SilenceAnalysisRequest(BaseModel):
    audioPath: Optional[str] = None
    thresholdDb: float = -32.0
    minSilenceDuration: float = 0.30
    padding: float = 0.15

@app.get("/")
def root():
    return {
        "service": "Premiere Pro AutoEdit AI Video Cutter Backend",
        "status": "online",
        "version": "3.0.0",
        "engine": "AutoEdit AI (Take-Grouping & Last-Best-Take)",
        "speech_segmenter": "FFmpeg silencedetect (-32dB:0.35s)",
        "ai_multimodal": "Google Gemini 2.5 Flash Multimodal Audio",
        "endpoints": {
            "health": "/health",
            "process_video": "/api/process-video",
            "analyze_silence": "/api/analyze-silence",
            "docs": "/docs"
        }
    }

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "Premiere AI Engine (AutoEdit AI)",
        "speech_segmenter": "FFmpeg silencedetect",
        "ffmpeg_available": audio_extractor.ffmpeg_path is not None,
        "ffmpeg_path": audio_extractor.ffmpeg_path
    }

def format_tc(sec: float) -> str:
    s = max(0, int(sec))
    m = s // 60
    h = m // 60
    return f"{h:02d}:{m%60:02d}:{s%60:02d}"

@app.post("/api/process-video")
async def process_video(payload: ProcessVideoRequest):
    """
    AutoEdit AI 'Full Scripted Reels & Bad-Take Remover' konveyeri:
    1. Audio ajratish (16kHz mono MP3).
    2. FFmpeg silencedetect (-32dB:0.35s) orqali butun video bo'ylab 100% matematik aniq gap bo'laklari.
    3. Gemini 2.5 Flash Multimodal Audio orqali Take-Grouping va Last-Best-Take tanlovi.
    4. Padding (+0.10s / +0.12s) va Inversion orqali toza Ripple Delete va Bezier Zoom-In (1.20x).
    5. Vaqt kodlarini Timeline offset shift bilan to'liq sinxronlash.
    """
    media_path = payload.mediaPath or payload.videoPath
    if not media_path or not os.path.exists(media_path):
        raise HTTPException(status_code=400, detail=f"Video yoki audio fayl topilmadi: {media_path}")

    source_in = payload.sourceIn or 0.0
    source_out = payload.sourceOut
    timeline_start = payload.timelineStart or 0.0

    print(f"\n[Backend] === AutoEdit AI Video Montaj Vazifasi ===")
    print(f"[Backend] Fayl: {media_path}")
    print(f"[Backend] Segment: in={source_in}s, out={source_out}s | TimelineStart={timeline_start}s")
    print(f"[Backend] AI Provayder: {payload.aiProvider} | Model: {payload.model}")

    # 1. FFmpeg yordamida Timeline'da ishlatilgan segmentni 16kHz mono MP3 sifatida ajratish
    try:
        audio_path, segment_duration = audio_extractor.extract_segment_audio(
            video_path=media_path,
            source_in=source_in,
            source_out=source_out,
            target_format="mp3"
        )
        print(f"[Backend] Audio tayyorlandi ({segment_duration:.1f}s): {audio_path}")
    except Exception as e:
        print(f"[Backend] Audio ajratishda xatolik: {e}, asl fayl ishlatiladi")
        audio_path = media_path
        segment_duration = transcriber.get_audio_duration(media_path) or 60.0

    # 2. FFmpeg silencedetect orqali 100% matematik aniq gap va pauza segmentlarini olish
    print(f"[Backend] 1-BOSQICH: FFmpeg gap segmentatsiyasi (threshold={payload.thresholdDb}dB, min_silence={payload.minSilenceDuration}s)...")
    trans_res = transcriber.extract_speech_segments_with_ffmpeg(
        audio_path=audio_path,
        threshold_db=payload.thresholdDb or -32.0,
        min_silence_duration=payload.minSilenceDuration or 0.30
    )

    speech_segments = trans_res.get("speech_segments", [])
    silence_cuts = trans_res.get("silence_cuts", [])
    print(f"[Backend] ✅ FFmpeg {len(speech_segments)} ta gap segmenti va {len(silence_cuts)} ta fizik pauza aniqladi.")

    # 3. Gemini 2.5 Flash Multimodal Audio orqali AutoEdit AI Take-Grouping & Last-Best-Take
    print(f"[Backend] 2-BOSQICH: AutoEdit AI multimodal tahlili boshlandi...")
    ai_result = await ai_director.analyze_multimodal_autoedit(
        audio_path=audio_path,
        speech_segments=speech_segments,
        silence_cuts=silence_cuts,
        total_duration=segment_duration,
        api_key=payload.apiKey,
        model=payload.model or "gemini-2.5-flash",
        user_instruction=payload.userPrompt or ""
    )

    raw_actions = ai_result.get("timeline_actions", [])
    kept_segments = ai_result.get("kept_segments", [])
    merged_keep = ai_result.get("merged_keep_intervals", [])
    summary_text = ai_result.get("summary", "AutoEdit AI montaji yakunlandi.")
    telemetry_logs = list(ai_result.get("telemetry_logs", []))

    # 4. Vaqt kodlarini Timeline bilan 100% sinxronlash (Timeline Offset Shift)
    timeline_actions = []
    for act in raw_actions:
        rel_start = float(act.get("start", 0))
        rel_end = float(act.get("end", 0))
        if rel_end <= rel_start:
            continue

        act_type = act.get("action", "cut")
        abs_start = round(timeline_start + rel_start, 3)
        abs_end = round(timeline_start + rel_end, 3)

        timeline_actions.append({
            "action": act_type,
            "start": abs_start,
            "end": abs_end,
            "scale": act.get("scale", 1.20),
            "reason": act.get("reason", ""),
            "category": act.get("category", ""),
            "text": act.get("text", "")
        })

    timeline_actions.sort(key=lambda x: x["start"])

    # Shift qilingan kept va merged intervallar
    shifted_kept_segments = []
    for ks in kept_segments:
        shifted_kept_segments.append({
            "id": ks.get("id"),
            "start": round(timeline_start + ks.get("start", 0), 3),
            "end": round(timeline_start + ks.get("end", 0), 3),
            "duration": ks.get("duration"),
            "text": ks.get("text", ""),
            "group": ks.get("group", "Mavzu Bloki"),
            "reason": ks.get("reason", ""),
            "is_zoom": ks.get("is_zoom", False)
        })

    shifted_merged_keep = []
    for mk in merged_keep:
        shifted_merged_keep.append({
            "id": mk.get("id"),
            "start": round(timeline_start + mk.get("start", 0), 3),
            "end": round(timeline_start + mk.get("end", 0), 3),
            "duration": round(mk.get("end", 0) - mk.get("start", 0), 3),
            "text": mk.get("text", ""),
            "group": mk.get("group", "Mavzu Bloki"),
            "is_zoom": mk.get("is_zoom", False)
        })

    # 5. Xronologik montaj jurnali
    cut_actions = [a for a in timeline_actions if a.get("action") == "cut"]
    zoom_actions = [a for a in timeline_actions if a.get("action") == "zoom"]
    total_cut_duration = sum(round(a["end"] - a["start"], 2) for a in cut_actions)
    total_keep_duration = sum(round(k["duration"], 2) for k in shifted_merged_keep)

    telemetry_logs.append(f"📊 Xulosa: {len(shifted_merged_keep)} ta saqlangan Mavzu Bloki ({total_keep_duration:.1f}s) | {len(cut_actions)} ta kesim ({total_cut_duration:.1f}s tejaldi) | {len(zoom_actions)} ta dinamik Zoom")

    print(f"\n[Backend] Yakunlandi: {len(cut_actions)} ta kesish, {len(zoom_actions)} ta zoom. Saqlangan vaqt: {total_keep_duration:.1f}s, Tejaldi: {total_cut_duration:.1f}s\n")

    return {
        "status": "success",
        "media_path": media_path,
        "segment_duration": segment_duration,
        "timeline_start": timeline_start,
        "ai_provider": payload.aiProvider,
        "model": payload.model,
        "timeline_actions": timeline_actions,
        "kept_segments": shifted_kept_segments,
        "merged_keep_intervals": shifted_merged_keep,
        "telemetry_logs": telemetry_logs,
        "total_cuts": len(cut_actions),
        "total_zooms": len(zoom_actions),
        "total_keep_time": round(total_keep_duration, 2),
        "time_saved_seconds": round(total_cut_duration, 2),
        "summary": summary_text
    }

@app.post("/api/upload-and-process")
async def upload_and_process(
    file: UploadFile = File(...),
    aiProvider: str = Form("gemini"),
    apiKey: Optional[str] = Form(None),
    model: Optional[str] = Form(None),
    thresholdDb: float = Form(-32.0),
    minSilenceDuration: float = Form(0.35),
    padding: float = Form(0.10)
):
    temp_dir = tempfile.gettempdir()
    saved_path = os.path.join(temp_dir, file.filename)

    with open(saved_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    req = ProcessVideoRequest(
        videoPath=saved_path,
        aiProvider=aiProvider,
        apiKey=apiKey,
        model=model,
        thresholdDb=thresholdDb,
        minSilenceDuration=minSilenceDuration,
        padding=padding
    )
    return await process_video(req)

@app.post("/api/analyze-silence")
def analyze_silence(payload: SilenceAnalysisRequest):
    results = silence_detector.detect_silence(
        audio_path=payload.audioPath,
        threshold_db=payload.thresholdDb,
        min_silence_duration=payload.minSilenceDuration,
        padding=payload.padding
    )
    return results

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
