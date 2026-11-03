/**
 * i18n.js - Ko'p tilli lokalizatsiya tizimi (O'zbek, Rus, Ingliz)
 * Adobe Premiere Pro AI Video Cutter CEP Paneli uchun
 */

const translations = {
    uz: {
        // Asosiy sarlavha va status
        appTitle: "AI Video Cutter",
        appSubtitle: "Premiere Pro uchun professional montaj",
        proBadge: "PRO",
        backendStatus: "Backend aloqasi",
        connected: "Ulangan",
        disconnected: "Uzilgan",
        checking: "Tekshirilmoqda...",

        // Sekvensiya ma'lumotlari
        activeSequence: "Faol Sekvensiya",
        noSequence: "Sekvensiya tanlanmagan",
        noSequenceHint: "Iltimos, Timeline oynasida sekvensiyani oching",
        refreshBtn: "Yangilash",
        videoTracks: "Video treklar",
        audioTracks: "Audio treklar",
        fps: "kadr/sek",

        // AI Funksiyalar bloki
        featuresTitle: "AI Ishlov Berish Modullari",
        featuresSubtitle: "Kerakli montaj amallarini belgilang",

        // 1. Silence Removal
        silenceTitle: "Silence Removal",
        silenceDesc: "Jim va pauza joylarni avtomatik aniqlab qirqish",
        silenceThreshold: "Sukunat chegarasi (dB)",
        minSilenceDuration: "Min. sukunat uzunligi (soniya)",
        voicePadding: "Gap atrofiga bufer qo'shish (soniya)",

        // 2. Auto Zoom-In / Zoom-Out
        zoomTitle: "Auto Zoom-In / Zoom-Out",
        zoomDesc: "Muhim jumlalarda dinamik kadr yaqinlashishi",
        zoomIntensity: "Kadr kattalashish darajasi",
        zoomIntensitySubtle: "Yengil (1.10x)",
        zoomIntensityMedium: "O'rtacha (1.20x)",
        zoomIntensityDynamic: "Dinamik (1.35x)",
        zoomSpeed: "O'tish tezligi",
        zoomSpeedInstant: "Keskin (Jump Cut)",
        zoomSpeedSmooth: "Silliq (Smooth Zoom)",

        // 3. B-Roll Swap
        brollTitle: "B-Roll Swap",
        brollDesc: "Mavzuga mos muqobil kadrlarni avtomatik joylashtirish",
        brollSource: "B-Roll manbasi",
        brollSourceBin: "Premiere Bin: 'B-Roll'",
        brollSourceFolder: "Lokal papka",
        brollTransition: "O'tish uslubi",
        transCut: "To'g'ridan-to'g'ri kesish (Hard Cut)",
        transDissolve: "Asta singish (Cross Dissolve)",

        // 4. Color & Audio Polish
        polishTitle: "Color & Audio Polish",
        polishDesc: "AI orqali rang va ovoz sifatini maksimal yaxshilash",
        polishDenoise: "Shovqinni tozalash va ovozni tiniqlashtirish",
        polishAutoColor: "Avtomatik rang korreksiyasi (Rec.709 Boost)",
        polishLoudness: "Ovoz balandligini standartlash (-14 LUFS)",

        // AI Sozlamalar modali
        settingsTitle: "AI Sozlamalari (API Keys)",
        settingsDesc: "O'zingiz istagan sun'iy intellekt modelini tanlang va API kalitingizni kiriting",
        providerLabel: "AI Provayderi",
        modelLabel: "Model",
        apiKeyLabel: "API Kaliti (API Key)",
        apiKeyPlaceholder: "Kalitni kiriting (sk-..., AIza...)",
        apiKeyNote: "API kalit faqat sizning kompyuteringizda (localStorage) xavfsiz saqlanadi.",
        systemPromptLabel: "AI Tizimli Ko'rsatmasi (System Prompt)",
        btnTest: "Ulanishni tekshirish",
        btnSave: "Saqlash",
        btnClose: "Yopish",
        testing: "Tekshirilmoqda...",
        testSuccess: "✅ Ulanish muvaffaqiyatli! Model javob berdi.",
        testFailed: "❌ Ulanishda xato: ",
        settingsSaved: "Sozlamalar saqlandi!",
        activeAiBadge: "Faol AI: ",

        // Tugmalar
        btnAnalyze: "AI Tahlilni Boshlash",
        btnAddMarkers: "Timeline'ga Markerlar",
        btnExecute: "Montajni Qo'llash",
        btnClearLogs: "Tozalash",

        // Konsol va jurnallar
        consoleTitle: "Jarayon Telemetriyasi",
        logReady: "Tizim tayyor. Premiere Pro integratsiyasi faol.",
        logSeqDetected: "Sekvensiya topildi: ",
        logNoSeq: "Diqqat: Faol sekvensiya topilmadi!",
        logAnalyzing: "Audio va video tahlili boshlandi...",
        logIntervalsFound: "ta sukunat oralig'i aniqlandi.",
        logMarkersAdded: "ta marker timeline'ga muvaffaqiyatli joylandi.",
        logCutting: "Premiere Pro timelinedagi qismlar qirqilmoqda...",
        logComplete: "Barcha AI amallari muvaffaqiyatli yakunlandi!",
        logError: "Xatolik yuz berdi: "
    },

    ru: {
        // Заголовок и статус
        appTitle: "AI Video Cutter",
        appSubtitle: "Профессиональный монтаж для Premiere Pro",
        proBadge: "PRO",
        backendStatus: "Связь с бэкендом",
        connected: "Подключен",
        disconnected: "Отключен",
        checking: "Проверка...",

        // Данные эпизода
        activeSequence: "Активный эпизод",
        noSequence: "Эпизод не выбран",
        noSequenceHint: "Пожалуйста, откройте эпизод на таймлайне",
        refreshBtn: "Обновить",
        videoTracks: "Видеотреки",
        audioTracks: "Аудиотреки",
        fps: "кадр/сек",

        // Блок ИИ функций
        featuresTitle: "Модули ИИ обработки",
        featuresSubtitle: "Выберите необходимые операции монтажа",

        // 1. Silence Removal
        silenceTitle: "Silence Removal",
        silenceDesc: "Автоматический поиск и удаление пауз и тишины",
        silenceThreshold: "Порог тишины (дБ)",
        minSilenceDuration: "Мин. длительность тишины (сек)",
        voicePadding: "Буфер вокруг речи (сек)",

        // 2. Auto Zoom-In / Zoom-Out
        zoomTitle: "Auto Zoom-In / Zoom-Out",
        zoomDesc: "Динамическое приближение кадра на ключевых словах",
        zoomIntensity: "Степень приближения",
        zoomIntensitySubtle: "Легкое (1.10x)",
        zoomIntensityMedium: "Умеренное (1.20x)",
        zoomIntensityDynamic: "Динамичное (1.35x)",
        zoomSpeed: "Скорость зума",
        zoomSpeedInstant: "Мгновенно (Jump Cut)",
        zoomSpeedSmooth: "Плавное (Smooth Zoom)",

        // 3. B-Roll Swap
        brollTitle: "B-Roll Swap",
        brollDesc: "Умная расстановка дополнительных кадров и перебивок",
        brollSource: "Источник B-Roll",
        brollSourceBin: "Бин Premiere: 'B-Roll'",
        brollSourceFolder: "Локальная папка",
        brollTransition: "Тип перехода",
        transCut: "Прямая склейка (Hard Cut)",
        transDissolve: "Наплыв (Cross Dissolve)",

        // 4. Color & Audio Polish
        polishTitle: "Color & Audio Polish",
        polishDesc: "ИИ улучшение звучания голоса и цветокоррекция",
        polishDenoise: "Удаление шума и улучшение четкости голоса",
        polishAutoColor: "Автоцветокоррекция (Rec.709 Boost)",
        polishLoudness: "Нормализация громкости (-14 LUFS)",

        // Настройки ИИ
        settingsTitle: "Настройки ИИ (API Keys)",
        settingsDesc: "Выберите модель ИИ и укажите ваш личный API ключ",
        providerLabel: "Провайдер ИИ",
        modelLabel: "Модель",
        apiKeyLabel: "Ключ API (API Key)",
        apiKeyPlaceholder: "Введите ключ (sk-..., AIza...)",
        apiKeyNote: "Ключ безопасно хранится локально на вашем компьютере (localStorage).",
        systemPromptLabel: "Системный промпт ИИ",
        btnTest: "Проверить связь",
        btnSave: "Сохранить",
        btnClose: "Закрыть",
        testing: "Проверка...",
        testSuccess: "✅ Связь успешна! Модель ответила.",
        testFailed: "❌ Ошибка подключения: ",
        settingsSaved: "Настройки сохранены!",
        activeAiBadge: "Активный ИИ: ",

        // Кнопки
        btnAnalyze: "Запустить ИИ анализ",
        btnAddMarkers: "Маркеры на таймлайн",
        btnExecute: "Применить монтаж",
        btnClearLogs: "Очистить",

        // Консоль и логи
        consoleTitle: "Телеметрия процессов",
        logReady: "Система готова. Интеграция Premiere Pro активна.",
        logSeqDetected: "Обнаружен эпизод: ",
        logNoSeq: "Внимание: активный эпизод не найден!",
        logAnalyzing: "Запущен анализ аудио и видео потоков...",
        logIntervalsFound: "фрагментов тишины успешно обнаружено.",
        logMarkersAdded: "маркеров успешно выставлено на таймлайне.",
        logCutting: "Применение нарезок в Premiere Pro...",
        logComplete: "Все операции ИИ успешно завершены!",
        logError: "Произошла ошибка: "
    },

    en: {
        // Title and status
        appTitle: "AI Video Cutter",
        appSubtitle: "Professional Automated Editing for Premiere Pro",
        proBadge: "PRO",
        backendStatus: "Backend Status",
        connected: "Connected",
        disconnected: "Disconnected",
        checking: "Checking...",

        // Sequence Data
        activeSequence: "Active Sequence",
        noSequence: "No sequence selected",
        noSequenceHint: "Please open a sequence in the Timeline panel",
        refreshBtn: "Refresh",
        videoTracks: "Video Tracks",
        audioTracks: "Audio Tracks",
        fps: "fps",

        // AI Features Block
        featuresTitle: "AI Processing Modules",
        featuresSubtitle: "Select desired automated editing operations",

        // 1. Silence Removal
        silenceTitle: "Silence Removal",
        silenceDesc: "Automatically detect and cut silences & dead air",
        silenceThreshold: "Silence Threshold (dB)",
        minSilenceDuration: "Min. Silence Duration (sec)",
        voicePadding: "Voice Safety Buffer (sec)",

        // 2. Auto Zoom-In / Zoom-Out
        zoomTitle: "Auto Zoom-In / Zoom-Out",
        zoomDesc: "Dynamic frame punch-ins & zooms on key phrases",
        zoomIntensity: "Zoom Scale Factor",
        zoomIntensitySubtle: "Subtle (1.10x)",
        zoomIntensityMedium: "Medium (1.20x)",
        zoomIntensityDynamic: "Dynamic (1.35x)",
        zoomSpeed: "Transition Speed",
        zoomSpeedInstant: "Instant (Jump Cut)",
        zoomSpeedSmooth: "Smooth (Keyframed Zoom)",

        // 3. B-Roll Swap
        brollTitle: "B-Roll Swap",
        brollDesc: "Smart insertion of contextual B-Roll clips & cutaways",
        brollSource: "B-Roll Asset Source",
        brollSourceBin: "Premiere Bin: 'B-Roll'",
        brollSourceFolder: "Local Folder",
        brollTransition: "Transition Type",
        transCut: "Direct Cut (Hard Cut)",
        transDissolve: "Dissolve (Cross Dissolve)",

        // 4. Color & Audio Polish
        polishTitle: "Color & Audio Polish",
        polishDesc: "AI Voice enhancement, denoise and auto color grading",
        polishDenoise: "Background noise removal & voice clarity",
        polishAutoColor: "Auto Color Grading (Rec.709 Boost)",
        polishLoudness: "Loudness Normalization (-14 LUFS)",

        // AI Settings Modal
        settingsTitle: "AI Settings (API Keys)",
        settingsDesc: "Select your preferred AI model and enter your API credentials",
        providerLabel: "AI Provider",
        modelLabel: "Model",
        apiKeyLabel: "API Key",
        apiKeyPlaceholder: "Enter API key (sk-..., AIza...)",
        apiKeyNote: "Your key is stored safely and locally on your machine (localStorage).",
        systemPromptLabel: "System Instruction Prompt",
        btnTest: "Test Connection",
        btnSave: "Save",
        btnClose: "Close",
        testing: "Testing...",
        testSuccess: "✅ Connection successful! Model responded.",
        testFailed: "❌ Connection error: ",
        settingsSaved: "Settings saved successfully!",
        activeAiBadge: "Active AI: ",

        // Buttons
        btnAnalyze: "Run AI Analysis",
        btnAddMarkers: "Place Markers",
        btnExecute: "Apply Cuts & Edits",
        btnClearLogs: "Clear",

        // Console and logs
        consoleTitle: "Process Telemetry",
        logReady: "System ready. Premiere Pro integration active.",
        logSeqDetected: "Sequence loaded: ",
        logNoSeq: "Warning: No active sequence found!",
        logAnalyzing: "Audio and timeline analysis started...",
        logIntervalsFound: "silence intervals detected.",
        logMarkersAdded: "markers successfully placed on timeline.",
        logCutting: "Applying cuts on Premiere Pro timeline...",
        logComplete: "All AI editing tasks completed successfully!",
        logError: "An error occurred: "
    }
};

let currentLanguage = localStorage.getItem("aicutter_lang") || "uz";

function t(key) {
    if (translations[currentLanguage] && translations[currentLanguage][key] !== undefined) {
        return translations[currentLanguage][key];
    }
    if (translations["en"] && translations["en"][key] !== undefined) {
        return translations["en"][key];
    }
    return key;
}

function setLanguage(lang) {
    if (!translations[lang]) return;
    currentLanguage = lang;
    localStorage.setItem("aicutter_lang", lang);
    updateDOMTranslations();
    window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang } }));
}

function updateDOMTranslations() {
    const elements = document.querySelectorAll("[data-i18n]");
    elements.forEach(el => {
        const key = el.getAttribute("data-i18n");
        const translation = t(key);
        if (el.tagName === "INPUT" && el.hasAttribute("placeholder")) {
            el.placeholder = translation;
        } else {
            el.textContent = translation;
        }
    });

    const titleElements = document.querySelectorAll("[data-i18n-title]");
    titleElements.forEach(el => {
        const key = el.getAttribute("data-i18n-title");
        el.setAttribute("title", t(key));
    });

    const langSelect = document.getElementById("languageSelect");
    if (langSelect && langSelect.value !== currentLanguage) {
        langSelect.value = currentLanguage;
    }
}

window.i18n = {
    t,
    setLanguage,
    getCurrentLanguage: () => currentLanguage,
    init: () => {
        updateDOMTranslations();
    }
};
