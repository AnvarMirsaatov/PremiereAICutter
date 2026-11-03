# Premiere Pro AI Cutter - Lokal Backend (FastAPI + Whisper + AI Director)

Ushbu backend Adobe Premiere Pro CEP paneli uchun video/audio qabul qilish, Whisper orqali transkripsiya qilish hamda OpenAI (GPT-4o), Anthropic (Claude 3.5 Sonnet) va Google (Gemini 1.5 Pro) yordamida Reels/Shorts uchun eng qiziqarli qismlar, sukunat kesishlari va zoom-in vaqt kodlarini ishlab chiqish xizmatini bajaradi.

---

## ⚡ Asosiy Vazifalar va Imkoniyatlar

1. **Video/Audio qabul qilish**:
   - Premiere Pro sekvensiyasidan yoki paneldan kelgan media faylni qabul qiladi.
   - FFmpeg yordamida videodan 16kHz mono audio ajratib oladi.

2. **Sukunatni aniqlash**:
   - Audio to'lqinlari (RMS) va Whisper segmentlari orasidagi bo'shliqlarni tahlil qilib, jim turgan (silent) nuqtalarni topadi.

3. **Whisper Transkripsiyasi**:
   - Ovozni matnga aylantiradi va har bir so'z/jumlaning boshlanish va tugash vaqtlarini oladi.

4. **AI Director (Reels / Shorts Tahlili)**:
   - GPT-4o, Claude 3.5 Sonnet yoki Gemini 1.5 Pro ga transkripsiyani uzatadi.
   - AI eng qiziqarli (viral) qismlarni, gap urg'usi tushgan joylardagi kamera yaqinlashuvlarini (`action: zoom`), zerikarli/jim oraliqlarni (`action: cut`) va B-Roll kerak bo'lgan o'rinlarni (`action: broll`) aniqlaydi.

5. **Premiere Pro formatidagi JSON javob**:
   - Natijada Premiere Pro timeline'da darhol bajarilishi mumkin bo'lgan start, end va action parametrlari qaytadi.

---

## 🚀 Ishga Tushirish

1. Virtual muhitni yarating va faollashtiring:
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # macOS / Linux
# Windows: venv\Scripts\activate
```

2. Paketlarni o'rnating:
```bash
pip install -r requirements.txt
```

3. FastAPI serverini ishga tushiring:
```bash
uvicorn main:app --reload --port 8000
```

- **Swagger Hujjatlari:** `http://localhost:8000/docs`
- **Health Check:** `http://localhost:8000/health`
- **Asosiy Konveyer:** `POST http://localhost:8000/api/process-video`
