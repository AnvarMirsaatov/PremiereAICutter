# Adobe Premiere Pro uchun AI Video Cutter (CEP Plagin)

Ushbu loyiha Adobe Premiere Pro uchun **CEP (Common Extensibility Platform)** paneli va **Python FastAPI** backend mikroxizmatidan iborat professional plagin shablonidir.

---

## 📁 Loyiha Strukturasi

```text
├── .debug                     # Chrome orqali masofadan nosozliklarni aniqlash (Remote Debugging)
├── CSXS/
│   └── manifest.xml           # Premiere Pro ruxsatlari va panel konfiguratsiyasi
├── css/
│   └── style.css              # Zamonaviy Premiere Pro qora mavzusi (Dark theme)
├── index.html                 # Foydalanuvchi interfeysi (UI)
├── js/
│   ├── CSInterface.js         # Adobe CEP va ExtendScript o'rtasidagi aloqa kutubxonasi
│   ├── i18n.js                # Ko'p tilli qo'llab-quvvatlash (UZ, EN, RU)
│   ├── api-connector.js       # FastAPI backend bilan aloqa boshqaruvchisi
│   └── app.js                 # Asosiy UI va logika skripti
├── jsx/
│   └── hostscript.jsx         # Premiere Pro ExtendScript (Timeline, Sequence, Cuts)
└── backend/
    ├── main.py                # FastAPI server (API marshrutlari va CORS)
    ├── requirements.txt       # Python bog'liqliklari
    ├── services/
    │   ├── __init__.py
    │   └── silence_detector.py # Ovoz sukunatini aniqlash algoritmi
    └── README.md
```

---

## 🚀 O'rnatish va Ishga Tushirish

### 1. Adobe CEP Debug rejimini yoqish (Bir martalik sozlama)

Adobe imzolanmagan (ishlab chiqish bosqichidagi) plaginlarni yuklashi uchun `PlayerDebugMode` yoqilishi kerak:

- **macOS (Terminal orqali):**
  ```bash
  defaults write com.adobe.CSXS.9 PlayerDebugMode 1
  defaults write com.adobe.CSXS.10 PlayerDebugMode 1
  defaults write com.adobe.CSXS.11 PlayerDebugMode 1
  defaults write com.adobe.CSXS.12 PlayerDebugMode 1
  defaults write com.adobe.CSXS.13 PlayerDebugMode 1
  defaults write com.adobe.CSXS.14 PlayerDebugMode 1
  ```

- **Windows (Regedit orqali):**
  `HKEY_CURRENT_USER/Software/Adobe/CSXS.11` (va boshqa CSXS versiyalar) ichida `PlayerDebugMode` nomli `String` kaliti ochib, qiymatini `"1"` ga o'rnating.

---

### 2. Plaginni Adobe CEP papkasiga ulash (Symlink)

Loyihani to'g'ridan-to'g'ri Adobe CEP kengaytmalar papkasiga havola (symlink) qiling:

- **macOS:**
  ```bash
  mkdir -p ~/Library/Application\ Support/Adobe/CEP/extensions/
  ln -s "$(pwd)" ~/Library/Application\ Support/Adobe/CEP/extensions/com.premiere.aicutter
  ```

- **Windows (Administrator CMD):**
  ```cmd
  mklink /D "%APPDATA%\Adobe\CEP\extensions\com.premiere.aicutter" "%CD%"
  ```

---

### 3. Python Backendni ishga tushirish

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

---

### 4. Premiere Pro'da ochish

1. **Adobe Premiere Pro** dasturini oching (agar ochiq bo'lsa qayta ishga tushiring).
2. Yuqori menyudan: **Window (Oyna) ➔ Extensions (Kengaytmalar) ➔ AI Video Cutter** ni bosing.
3. Panel ochiladi, sekvensiya holati va backend ulanishi avtomatik ko'rinadi.

---

## 🔍 Brauzer orqali Debug qilish (Remote Debugging)

Panel ochilgandan so'ng, Google Chrome yoki Brave brauzerida quyidagi manzilga kiring:
```
http://localhost:8088
```
Bu yerda panelning Console, Elements, Network va barcha devtools imkoniyatlaridan to'liq foydalanishingiz mumkin.
