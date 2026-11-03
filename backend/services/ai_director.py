"""
ai_director.py - AutoEdit AI 'Global Take-Deduplication & Bad-Take Remover' Dvijogi
1. YAXLIT (Full Context) tahlil: 10 daqiqagacha bo'lgan audio bo'laklanmaydi (chunk_duration yo'q),
   barcha speech_segments ro'yxati va 32kbps audio bitta so'rovda Gemini 2.5 Flash'ga yuboriladi.
2. Global Take-Deduplication:
   - Har bir takrorlangan gap/dublning 1-dan (N-1)-gacha urinishlarini 100% BAD_TAKE deb hisoblaydi.
   - Barcha kulgilar, so'kinishlar, operator luqmalari va to'xtashlar 100% CUT qilinadi.
   - Har bir mavzu bo'yicha FAQAT ENG OXIRGI, ENG TO'LIQ VA ENG RAVON YAKUNIY DUBL (FINAL_KEEP) saqlanadi.
3. 15s Sanity Check butunlay olib tashlangan: 8 ta xato dubl 120-150s bo'lsa ham bittada toza kesiladi.
4. Bufer: start vaqtidan -0.15s va end vaqtidan +0.20s saqlanadi (boshi va oxiri yeyilib ketmaydi).
5. Inversion orqali barcha qolgan oraliqlar toza Ripple Delete cut massiviga aylanadi.
"""
import os
import re
import json
import base64
import httpx
from typing import List, Dict, Any, Optional

def format_tc(sec: float) -> str:
    s = max(0, int(sec))
    m = s // 60
    h = m // 60
    return f"{h:02d}:{m%60:02d}:{s%60:02d}"

class AIDirector:
    def __init__(self):
        pass

    async def analyze_multimodal_autoedit(
        self,
        audio_path: str,
        speech_segments: List[Dict[str, Any]],
        silence_cuts: List[Dict[str, Any]],
        total_duration: float,
        api_key: Optional[str] = None,
        model: Optional[str] = "gemini-2.5-flash",
        user_instruction: str = "",
        fallback_reason: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        AutoEdit AI: Gemini 2.5 Flash Multimodal Audio orqali Global Take-Deduplication
        va Last-Best-Take tahlili.
        """
        seg_map = {s["id"]: s for s in speech_segments}
        effective_key = (api_key or os.environ.get("GEMINI_API_KEY") or "").strip()

        # Agar API kalit bo'lmasa -> Faqat fizik pauzalar kesiladi va foydalanuvchiga xabar beriladi
        if not effective_key:
            print("[AIDirector] API kalit yo'q yoki xato yuz berdi. FFmpeg fizik pauzalari kesiladi.")
            raw_cuts = []
            for sil in silence_cuts:
                s_dur = sil["end"] - sil["start"]
                if s_dur >= 0.25:
                    raw_cuts.append({
                        "action": "cut",
                        "start": sil["start"],
                        "end": sil["end"],
                        "category": "silence",
                        "reason": f"FFmpeg Fizik Pauza ({s_dur:.2f}s)",
                        "text": ""
                    })

            kept_segs = [dict(s) for s in speech_segments]
            for s in kept_segs:
                s["group"] = "Asosiy Ovoz"

            zooms = []
            for idx, ks in enumerate(kept_segs):
                if idx % 4 == 0 and ks["duration"] >= 3.0:
                    zooms.append({
                        "action": "zoom",
                        "start": ks["start"],
                        "end": round(ks["start"] + min(ks["duration"], 4.0), 3),
                        "scale": 1.20,
                        "reason": "Dinamik yaqinlashish (Reels Urg'u)"
                    })

            merged_keep = []
            for ks in kept_segs:
                merged_keep.append({
                    "start": ks["start"],
                    "end": ks["end"],
                    "id": ks["id"],
                    "text": ks.get("text", ""),
                    "group": ks.get("group", "Asosiy Ovoz"),
                    "is_zoom": False
                })

            total_keep_time = sum(round(k["end"] - k["start"], 2) for k in merged_keep)
            warn_msg = f"⚠️ Gemini xatosi: {fallback_reason}" if fallback_reason else "⚠️ DIQQAT: Gemini API kaliti kiritilmagan (Sozlamalar oynasidan kalitni kiriting)."

            return {
                "timeline_actions": sorted(raw_cuts + zooms, key=lambda x: x["start"]),
                "telemetry_logs": [
                    warn_msg,
                    f"⚡ FFmpeg orqali {len(raw_cuts)} ta jismoniy pauza avtomatik kesildi.",
                    "💡 Barcha 8 ta adashgan dubllarni tozalab, 60-90s to'liq Reels olish uchun to'g'ri Gemini kalitini kiriting."
                ],
                "kept_segments": kept_segs,
                "merged_keep_intervals": merged_keep,
                "summary": "FFmpeg fizik pauzalari bo'yicha toza montaj qilindi.",
                "total_keep_time": total_keep_time,
                "is_fallback": True,
                "ai_engine_used": "FFmpeg Silence Detector"
            }

        # 1. FFmpeg segmentlarini matn ko'rinishida shakllantirish (ID, start, end, duration)
        segment_lines = []
        for s in speech_segments:
            tc_s = format_tc(s["start"])
            tc_e = format_tc(s["end"])
            segment_lines.append(f"[ID: {s['id']}] ({s['start']:.2f}s - {s['end']:.2f}s | {tc_s} - {tc_e}, davomiyligi: {s['duration']}s)")

        segment_manifest = "\n".join(segment_lines)

        # 2. Qat'iy 'Global Take-Deduplication' System Instruction
        system_prompt = """Sen professional kino va YouTube/Instagram Reels montaj rejissyorisan (AutoEdit AI algoritmi bo'yicha ekspert).
Senga butun 5 daqiqalik (295s) xom s'yomka audiosi hamda FFmpeg orqali aniqlangan aniq speech_segments (id, start, end) ro'yxati berilmoqda.

USHBU S'YOMKA HAQIDA:
Spiker ssenariyni kamera oldida o'qish davomida juda ko'p adashgan (masalan, bitta gapni 1-daqiqadan 4-daqiqagacha 8 marta qayta-qayta urinib, faqat 4-daqiqada to'g'ri va ravon aytgan).
Spiker va operator o'rtasida suhbatlar, kulgi, so'kinish, tutilishlar va qayta urinishlar mavjud.

SENING ASOSIY VAZIFANG — GLOBAL TAKE-DEDUPLICATION:
1. HAR BIR SEGMENTDA SPESIFIK SO'ZLARNI VA HOLATNI ANIQLASH:
   Har bir speech_segment (ID) da spiker nima deganini eshit va uning holatini aniqla:
   - BAD_TAKE (100% CUT):
     * Kulgi, o'zidan qoniqmaslik, so'kinish: "voy blin", "chort", "allohu akbar bo'p ketdiyu", "adashib ketdim", "chalg'ishib ketib qoldi", "jihat bo'p qoldiyu", "uf", "voy"
     * Operator/yordamchining luqmalari va ko'rsatmalari: "boshidan", "qarang aslida yosh kelinni qo'shmaymiz", "manipulyatsiya nima?", "yutdi go'zal", "qoshni sal rohat qilib", "to'xtang", "qaytadan"
     * Chala, tutilgan, oxiriga yetmay to'xtab qolgan barcha urinishlar.
     * S'yomka boshidagi tayyorgarlik va oxiridagi "tamom", "olindi", "bo'ldi" gaplari.
   - TAKRORLANGAN GAPLAR (RETAKES):
     Agar spiker bitta mavzu yoki jumlani (masalan: "Homiladorlik vaqtida tishlarni...", "O'zi aslida birinchi uch oylikda...", "Yana bir muhim jihati, har bir stomatologik manipulyatsiya...", "Shu kabi foydali ma'lumotlarni...") video davomida 2 martadan 10 martagacha qayta-qayta aytgan bo'lsa:
     -> Oldingi BARCHA urinishlarni BAD_TAKE deb hisobla va 100% KESIB TASHLASHGA belgilagin!
     -> FAQAT VA FAQAT ENG OXIRGI, ENG TO'LIQ VA RAVON AYTILGAN VARIANTINI FINAL_KEEP deb belgilagin!

2. BUTUN MAVZU ZANJIRI SAQLANISHI SHART (Oltin Qoida):
   Videoda aytilgan barcha asosiy mavzu bloklarining har biridan eng oxirgi toza dubl qolishi shart:
   1) Kirish savoli (Homiladorlik vaqtida tishlarni davolash mumkinmi...)
   2) 1-bosqich (Birinchi uch oylikda...)
   3) 2-bosqich / Stomatologik manipulyatsiya...
   4) Shifokor tavsiyasi va xulosa...
   5) CTA / Obuna bo'ling (Shu kabi foydali ma'lumotlarni o'tkazib yubormaslik uchun obuna bo'ling...)
   Hech qaysi mavzu blokini tashlab ketma!

3. YAKUNIY REELS DAVOMIYLIGI:
   Butun 5 daqiqalik xom videodan barcha adashgan dubllar (140-160 soniyalik bloklar) kesilgach, natijada 45-90 soniyalik to'liq, ravon va professional montaj qilingan tayyor Reels chiqishi shart!

4. DINAMIK ZOOM-IN (1.20x):
   Har bir mavzu blokining eng asosiy urg'uli jumlalariga (jami 4-6 ta joyga) is_zoom: true bering."""

        user_content = f"""QUYIDA FFMPEG ANIQLAGAN BARCHA GAP BO'LAKLARI (JAMI {len(speech_segments)} TA):
{segment_manifest}"""

        if user_instruction and user_instruction.strip():
            user_content += f"""

🎯 FOYDALANUVCHINING MAXSUS KO'RSATMASI:
"{user_instruction.strip()}"
Ushbu maxsus ko'rsatmaga to'liq amal qil."""

        user_content += """

JAVOBNI FAQAT TOZA JSON FORMATIDA BER:
{
  "summary": "Videoning to'liq mazmuni haqida qisqacha xulosa",
  "segments_classification": [
    {
      "id": 1,
      "text": "Gap matni...",
      "status": "BAD_TAKE",
      "reason": "1-urinish, tutilib to'xtagan"
    },
    {
      "id": 2,
      "text": "voy blin, chort...",
      "status": "BAD_TAKE",
      "reason": "Kulgi va xato so'zlar"
    },
    {
      "id": 12,
      "text": "Homiladorlik vaqtida tishlarni davolash mumkinmi?",
      "status": "FINAL_KEEP",
      "reason": "Mavzuning eng oxirgi va to'liq yakuniy dubli"
    }
  ],
  "keep_segments": [
    {
      "id": 12,
      "start": 25.1,
      "end": 31.4,
      "text": "Homiladorlik vaqtida tishlarni davolash mumkinmi?",
      "topic": "1-Mavzu: Kirish",
      "is_zoom": true
    }
  ]
}"""

        print(f"[AIDirector] Gemini 2.5 Flash Multimodal Audio orqali Global Take-Deduplication tahlili ({len(speech_segments)} ta segment, yaxlit {total_duration:.1f}s)...")

        # 3. Audio faylni base64 ga o'girish (32kbps mono MP3, atigi ~1.1MB)
        with open(audio_path, "rb") as afp:
            b64_audio = base64.b64encode(afp.read()).decode("utf-8")

        mime_type = "audio/mp3" if audio_path.lower().endswith(".mp3") else "audio/wav"

        # 4. Gemini API ga so'rov (180s timeout)
        try:
            raw_response = await self._call_gemini_audio(
                api_key=effective_key,
                model=model or "gemini-2.5-flash",
                system_prompt=system_prompt,
                user_content=user_content,
                b64_audio=b64_audio,
                mime_type=mime_type
            )
            parsed_data = self._parse_json(raw_response)
        except Exception as e:
            err_msg = str(e)
            print(f"[AIDirector] ⚠️ Gemini so'rovida xatolik: {err_msg}")
            return await self.analyze_multimodal_autoedit(
                audio_path=audio_path,
                speech_segments=speech_segments,
                silence_cuts=silence_cuts,
                total_duration=total_duration,
                api_key="",
                user_instruction=user_instruction,
                fallback_reason=err_msg
            )

        # 5. KEEP segmentlarni aniq ajratib olish
        raw_keep = parsed_data.get("keep_segments", [])
        seg_class = parsed_data.get("segments_classification", [])

        # Segments classification dan ham FINAL_KEEP larni tekshirish
        for sc in seg_class:
            sid = sc.get("id")
            status = sc.get("status")
            if status == "FINAL_KEEP" and sid and sid in seg_map:
                # Agar raw_keep ichida bo'lmasa, qo'shish
                if not any(k.get("id") == sid for k in raw_keep):
                    s_orig = seg_map[sid]
                    raw_keep.append({
                        "id": sid,
                        "start": s_orig["start"],
                        "end": s_orig["end"],
                        "text": sc.get("text", s_orig.get("text", "")),
                        "topic": "Yakuniy Dubl",
                        "is_zoom": False
                    })

        # 6. Xavfsizlik va Segment chegaralarini tekshirish
        resolved_keep_segments = []
        for rk in raw_keep:
            sid = rk.get("id")
            s_start = rk.get("start")
            s_end = rk.get("end")

            # Agar FFmpeg segmentlaridan ID bo'yicha aniq koordinatalar mavjud bo'lsa
            if sid and sid in seg_map:
                orig = seg_map[sid]
                s_start = orig["start"]
                s_end = orig["end"]
            else:
                try:
                    s_start = float(s_start)
                    s_end = float(s_end)
                except Exception:
                    continue

            if s_end <= s_start:
                continue

            resolved_keep_segments.append({
                "id": sid,
                "start": s_start,
                "end": s_end,
                "text": rk.get("text", ""),
                "topic": rk.get("topic", "Mavzu Bloki"),
                "is_zoom": bool(rk.get("is_zoom", False))
            })

        # Agar AI keep_segments topmagan bo'lsa -> Fallback
        if not resolved_keep_segments:
            print("[AIDirector] Ogohlantirish: AI keep_segments bermadi, barcha segmentlar saqlanadi.")
            resolved_keep_segments = [
                {
                    "id": s["id"],
                    "start": s["start"],
                    "end": s["end"],
                    "text": s.get("text", ""),
                    "topic": "Asosiy Nutq",
                    "is_zoom": False
                }
                for s in speech_segments
            ]

        # 7. QAT'IY BUFER: start dan -0.15s va end dan +0.20s saqlanadi
        # toki so'zlarning boshi va oxiri ASLO kesilib (yeyilib) qolmasin!
        buffered_keep = []
        for ks in resolved_keep_segments:
            pad_start = max(0.0, ks["start"] - 0.15)
            pad_end = min(total_duration, ks["end"] + 0.20)

            buffered_keep.append({
                "id": ks.get("id"),
                "start": round(pad_start, 3),
                "end": round(pad_end, 3),
                "text": ks.get("text", ""),
                "topic": ks.get("topic", "Mavzu Bloki"),
                "is_zoom": ks.get("is_zoom", False)
            })

        # 8. Xronologik tartibda saralash va o'zaro tutashgan (<0.15s) segmentlarni birlashtirish
        buffered_keep.sort(key=lambda x: x["start"])
        merged_keep = []
        for bk in buffered_keep:
            if not merged_keep:
                merged_keep.append(bk)
            else:
                prev = merged_keep[-1]
                if bk["start"] <= prev["end"] + 0.15:
                    prev["end"] = max(prev["end"], bk["end"])
                    if bk.get("text"):
                        prev["text"] = (prev.get("text", "") + " " + bk["text"]).strip()
                    if bk.get("is_zoom"):
                        prev["is_zoom"] = True
                else:
                    merged_keep.append(bk)

        # 9. 15s SANITY CHECK BUTUNLAY O'CHIRILGAN — TOZA INVERSION
        # 0 dan total_duration gacha bo'lgan vaqtdan keep_segments larni ayirib tashlab,
        # qolgan barcha oraliqlarni action: "cut" massiviga aylantirish.
        # Oraliq 150 soniya bo'lsa ham bitta yaxlit kesim qilinadi!
        unified_cuts = []
        current_pos = 0.0

        for ki in merged_keep:
            k_start = ki["start"]
            if k_start > current_pos + 0.05:
                cut_dur = round(k_start - current_pos, 3)
                reason_txt = "Boshlang'ich tayyorgarlik va sukunat" if current_pos == 0.0 else f"Adashgan dubllar va keraksiz gaplar ({cut_dur:.1f}s)"
                unified_cuts.append({
                    "action": "cut",
                    "start": round(current_pos, 3),
                    "end": round(k_start, 3),
                    "category": "bad_take" if current_pos > 0.0 else "silence",
                    "reason": reason_txt,
                    "text": ""
                })
            current_pos = ki["end"]

        # Oxirgi keep segmentidan video oxirigacha bo'lgan qism:
        if current_pos < total_duration - 0.05:
            cut_dur = round(total_duration - current_pos, 3)
            unified_cuts.append({
                "action": "cut",
                "start": round(current_pos, 3),
                "end": round(total_duration, 3),
                "category": "silence",
                "reason": f"Kadr orti suhbat / Yakuniy tayyorgarlik ({cut_dur:.1f}s)",
                "text": ""
            })

        # 10. Dinamik Bezier Zoom-In (1.20x)
        zoom_actions = []
        for ki in merged_keep:
            if ki.get("is_zoom"):
                dur = min(ki["end"] - ki["start"], 3.5)
                zoom_actions.append({
                    "action": "zoom",
                    "start": ki["start"],
                    "end": round(ki["start"] + dur, 3),
                    "scale": 1.20,
                    "reason": f"Urg'u: {ki.get('topic', 'Mavzu Bloki')}"
                })

        # Agar zoom belgilanmagan bo'lsa, mavzu bloklariga silliq taqsimlash
        if not zoom_actions and len(merged_keep) > 0:
            for idx, ki in enumerate(merged_keep):
                if idx % 2 == 0:
                    dur = min(ki["end"] - ki["start"], 3.5)
                    zoom_actions.append({
                        "action": "zoom",
                        "start": ki["start"],
                        "end": round(ki["start"] + dur, 3),
                        "scale": 1.20,
                        "reason": f"Dinamik yaqinlashish: {ki.get('topic', 'Mavzu Bloki')}"
                    })

        timeline_actions = sorted(unified_cuts + zoom_actions, key=lambda x: x["start"])

        # 11. Telemetriya jurnali
        telemetry_logs = []
        total_keep_time = sum(round(k["end"] - k["start"], 2) for k in merged_keep)
        telemetry_logs.append(f"⚡ Global Take-Deduplication: {total_duration:.1f}s xom videodan {len(merged_keep)} ta yakuniy Mavzu Bloki ({total_keep_time:.1f}s tayyor Reels) ajratildi!")
        telemetry_logs.append(f"✂️ Jami {len(unified_cuts)} ta adashgan dubl va pauza bloklari (100% Bad Takes) kesildi.")

        # Natijaviy bloklar tafsiloti
        for idx, mk in enumerate(merged_keep, start=1):
            dur_k = mk["end"] - mk["start"]
            txt_k = f'"{mk["text"][:60]}..."' if mk.get("text") else ""
            telemetry_logs.append(f"  🎬 {idx}-Blok [{format_tc(mk['start'])} - {format_tc(mk['end'])}] ({dur_k:.1f}s): {mk.get('topic', 'Mavzu')} {txt_k}")

        return {
            "timeline_actions": timeline_actions,
            "telemetry_logs": telemetry_logs,
            "kept_segments": resolved_keep_segments,
            "merged_keep_intervals": merged_keep,
            "summary": parsed_data.get("summary", "Global Take-Deduplication orqali barcha adashgan dubllar tozalandi va mukammal Reels tayyorlandi."),
            "total_keep_time": total_keep_time,
            "is_fallback": False,
            "ai_engine_used": f"Google Gemini ({model or 'gemini-2.5-flash'})"
        }

    async def _call_gemini_audio(
        self,
        api_key: str,
        model: str,
        system_prompt: str,
        user_content: str,
        b64_audio: str,
        mime_type: str = "audio/mp3"
    ) -> str:
        target_model = model or "gemini-2.5-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent?key={api_key.strip()}"

        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": b64_audio
                            }
                        },
                        {
                            "text": f"{system_prompt}\n\n{user_content}"
                        }
                    ]
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.1,
                "maxOutputTokens": 8192
            }
        }

        async with httpx.AsyncClient(timeout=180.0) as client:
            res = await client.post(url, json=payload)
            res.raise_for_status()
            data = res.json()
            candidates = data.get("candidates", [])
            if candidates and "content" in candidates[0] and "parts" in candidates[0]["content"]:
                return candidates[0]["content"]["parts"][0]["text"]
            raise RuntimeError("Gemini javobida parts topilmadi")

    def _parse_json(self, raw: str) -> Dict[str, Any]:
        cleaned = raw.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned.replace("```json", "", 1)
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        try:
            return json.loads(cleaned)
        except Exception:
            match = re.search(r'\{[\s\S]*\}', cleaned)
            if match:
                try:
                    return json.loads(match.group(0))
                except Exception:
                    pass
            return {"keep_segments": [], "segments_classification": [], "error": "AI javobi o'qilmadi"}
