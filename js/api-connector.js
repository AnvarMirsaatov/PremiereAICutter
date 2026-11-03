/**
 * api-connector.js - FastAPI backend va tashqi AI provayderlar (OpenAI, Anthropic, Gemini) bilan aloqa
 */

class ApiConnector {
    constructor(baseURL = "http://127.0.0.1:8000") {
        this.baseURL = baseURL;
        this.isOnline = false;

        // Qo'llab-quvvatlanadigan AI modellar ro'yxati va standart sozlamalar
        this.aiProviders = {
            openai: {
                name: "OpenAI",
                defaultModel: "gpt-4o",
                models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
                endpoint: "https://api.openai.com/v1/chat/completions"
            },
            anthropic: {
                name: "Anthropic",
                defaultModel: "claude-3-5-sonnet-20241022",
                models: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
                endpoint: "https://api.anthropic.com/v1/messages"
            },
            gemini: {
                name: "Google Gemini",
                defaultModel: "gemini-2.5-flash",
                models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
                endpoint: "https://generativelanguage.googleapis.com/v1beta/models"
            }
        };

        this.initSettings();
    }

    /**
     * Saqlangan AI sozlamalarini localStorage'dan yuklash
     */
    initSettings() {
        const saved = localStorage.getItem("aicutter_ai_settings");
        if (saved) {
            try {
                this.settings = JSON.parse(saved);
                // Agar eski gemini-1.5 saqlangan bo'lsa, yangi gemini-2.5 ga yangilash
                if (this.settings.model && this.settings.model.includes("gemini-1.5")) {
                    this.settings.model = "gemini-2.5-flash";
                    this.saveSettings(this.settings);
                }
            } catch (e) {
                this.settings = this.getDefaultSettings();
            }
        } else {
            this.settings = this.getDefaultSettings();
        }
    }

    getDefaultSettings() {
        return {
            provider: "gemini", // Standart: gemini yoki openai
            model: "gemini-2.5-flash",
            apiKeys: {
                openai: "",
                anthropic: "",
                gemini: ""
            },
            systemPrompt: "Siz Adobe Premiere Pro uchun professional montajchi AI assistentisiz. Videoning matnli transkripsiyasi va vaqt kodlarini tahlil qiling. Jim joylar, pauzalar, g'uldirashlar, takrorlangan so'zlar va keraksiz qismlarni aniqlab, qirqilishi kerak bo'lgan oraliqlar (cuts) ro'yxatini qaytaring."
        };
    }

    getSettings() {
        return this.settings;
    }

    saveSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        localStorage.setItem("aicutter_ai_settings", JSON.stringify(this.settings));
        return this.settings;
    }

    getActiveApiKey() {
        const provider = this.settings.provider;
        return (this.settings.apiKeys && this.settings.apiKeys[provider]) || "";
    }

    // ==========================================
    // 1. FASTAPI BACKEND BILAN ALOQA
    // ==========================================

    /**
     * FastAPI backend server ishlayotganini tekshirish
     */
    async checkHealth() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            const response = await fetch(`${this.baseURL}/health`, {
                method: "GET",
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            this.isOnline = response.ok;
            return this.isOnline;
        } catch (error) {
            this.isOnline = false;
            return false;
        }
    }

    /**
     * Ovoz sukunatini audio fayl orqali tahlil qilish
     */
    async analyzeSilence(params) {
        try {
            const response = await fetch(`${this.baseURL}/api/analyze-silence`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(params)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Audio tahlilda xatolik yuz berdi");
            }

            return await response.json();
        } catch (error) {
            console.error("[ApiConnector] analyzeSilence error:", error);
            throw error;
        }
    }

    /**
     * To'liq konveyer: Video qabul qilish, audio ajratish, Whisper transkripsiyasi
     * va AI (GPT/Claude/Gemini) orqali Reels/Shorts uchun kesish va zoom-in vaqt kodlarini olish
     */
    async processVideoPipeline(params) {
        try {
            const response = await fetch(`${this.baseURL}/api/process-video`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(params)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Video qayta ishlashda xatolik yuz berdi");
            }

            return await response.json();
        } catch (error) {
            console.error("[ApiConnector] processVideoPipeline error:", error);
            throw error;
        }
    }

    // ==========================================
    // 2. AI MODELI BILAN ALOQA (OpenAI, Claude, Gemini)
    // ==========================================

    /**
     * Foydalanuvchi kiritgan API kalitini tekshirish (Ping testi)
     */
    async testAIConnection(provider, apiKey, model) {
        if (!apiKey || apiKey.trim() === "") {
            throw new Error("Iltimos, API kalitni kiriting!");
        }

        const testPrompt = "Test: Respond with only the word OK in JSON format: {\"status\": \"OK\"}";

        try {
            if (provider === "openai") {
                return await this._callOpenAI(apiKey, model || "gpt-4o", testPrompt, "Minimal test");
            } else if (provider === "anthropic") {
                return await this._callAnthropic(apiKey, model || "claude-3-5-sonnet-20241022", testPrompt, "Minimal test");
            } else if (provider === "gemini") {
                return await this._callGemini(apiKey, model || "gemini-2.5-flash", testPrompt, "Minimal test");
            } else {
                throw new Error("Noma'lum provayder: " + provider);
            }
        } catch (err) {
            console.error("[Test Connection Error]:", err);
            throw err;
        }
    }

    /**
     * Transkripsiya matnini tanlangan AI ga yuborib, kesish oraliqlarini JSON formatda olish
     * @param {string} transcriptText - Videoning transkripsiyasi (so'zlar va vaqtlar)
     * @param {string} userInstruction - Foydalanuvchining qo'shimcha ko'rsatmasi
     */
    async analyzeTranscriptWithAI(transcriptText, userInstruction = "") {
        const provider = this.settings.provider;
        const apiKey = this.getActiveApiKey();
        const model = this.settings.model || this.aiProviders[provider].defaultModel;

        if (!apiKey || apiKey.trim() === "") {
            throw new Error(`[${provider.toUpperCase()}] API kaliti kiritilmagan! Iltimos, sozlamalar (⚙️) bo'limidan kalitni kiriting.`);
        }

        const systemPrompt = `${this.settings.systemPrompt}
MUHIM TALAB:
Javobni FAQAT quyidagi JSON formatida qaytaring, hech qanday qo'shimcha tushuntirish va matnsiz:
{
  "cuts": [
    {
      "start": 12.5,
      "end": 15.2,
      "reason": "Uzoq pauza va takroriy so'z"
    }
  ],
  "summary": "Video tahlili qisqacha xulosasi",
  "suggested_broll_moments": [
    { "timestamp": 25.0, "topic": "Mavzuga doir b-roll tavsiyasi" }
  ]
}`;

        const promptContent = `Quyidagi video transkripsiyasini tahlil qiling va keraksiz qismlarni kesish uchun aniq start va end soniyalarini aniqlang.
Foydalanuvchi ko'rsatmasi: ${userInstruction || "Mavzuga aloqasiz suhbatlar va pauzalarni kesib tashlang."}

Transkripsiya:
${transcriptText}`;

        let rawResponse = "";

        if (provider === "openai") {
            rawResponse = await this._callOpenAI(apiKey, model, promptContent, systemPrompt);
        } else if (provider === "anthropic") {
            rawResponse = await this._callAnthropic(apiKey, model, promptContent, systemPrompt);
        } else if (provider === "gemini") {
            rawResponse = await this._callGemini(apiKey, model, promptContent, systemPrompt);
        }

        // Qaytgan natijani toza JSON holiga keltirish
        return this._cleanAndParseJSON(rawResponse);
    }

    // ==========================================
    // 3. XUSUSIY FETCH SO'ROVLARI (Barcha 3 AI uchun)
    // ==========================================

    /**
     * OpenAI (GPT-4o) so'rovi
     */
    async _callOpenAI(apiKey, model, userMessage, systemMessage) {
        const url = this.aiProviders.openai.endpoint;
        const payload = {
            model: model,
            messages: [
                { role: "system", content: systemMessage },
                { role: "user", content: userMessage }
            ],
            response_format: { type: "json_object" },
            temperature: 0.2
        };

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey.trim()}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `OpenAI xatosi (${response.status})`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    /**
     * Anthropic (Claude 3.5 Sonnet) so'rovi
     */
    async _callAnthropic(apiKey, model, userMessage, systemMessage) {
        const url = this.aiProviders.anthropic.endpoint;
        const payload = {
            model: model,
            max_tokens: 4096,
            system: systemMessage,
            messages: [
                { role: "user", content: userMessage }
            ],
            temperature: 0.2
        };

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "x-api-key": apiKey.trim(),
                "anthropic-version": "2023-06-01",
                "anthropic-dangerous-direct-browser-access": "true", // CEP/Brauzerdan to'g'ridan-to'g'ri chaqirish uchun
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Anthropic xatosi (${response.status})`);
        }

        const data = await response.json();
        return data.content[0].text;
    }

    /**
     * Google (Gemini 2.5 Flash / Pro) so'rovi (404 Fallback mexanizmi bilan)
     */
    async _callGemini(apiKey, model, userMessage, systemMessage) {
        let targetModel = model || "gemini-2.5-flash";
        if (targetModel.includes("gemini-1.5")) {
            targetModel = targetModel.replace("gemini-1.5-pro", "gemini-2.5-pro").replace("gemini-1.5-flash", "gemini-2.5-flash");
        }

        const modelsToTry = [targetModel];
        if (!modelsToTry.includes("gemini-2.5-flash")) modelsToTry.push("gemini-2.5-flash");
        if (!modelsToTry.includes("gemini-2.5-pro")) modelsToTry.push("gemini-2.5-pro");

        let lastError = null;

        for (const currentModel of modelsToTry) {
            const url = `${this.aiProviders.gemini.endpoint}/${currentModel}:generateContent?key=${apiKey.trim()}`;
            const payload = {
                contents: [
                    {
                        parts: [
                            { text: `${systemMessage}\n\nTopshiriq:\n${userMessage}` }
                        ]
                    }
                ],
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: 0.2
                }
            };

            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    const errMsg = err.error?.message || `Gemini xatosi (${response.status})`;
                    if (response.status === 404) {
                        console.warn(`[Gemini] ${currentModel} topilmadi (404), keyingi modelga o'tilmoqda...`);
                        lastError = new Error(errMsg);
                        continue;
                    }
                    throw new Error(errMsg);
                }

                const data = await response.json();
                const candidate = data.candidates && data.candidates[0];
                if (!candidate || !candidate.content || !candidate.content.parts) {
                    throw new Error("Gemini bo'sh javob qaytardi");
                }
                return candidate.content.parts[0].text;
            } catch (fetchErr) {
                lastError = fetchErr;
                if (fetchErr.message && fetchErr.message.includes("404")) {
                    continue;
                }
                throw fetchErr;
            }
        }

        throw lastError || new Error("Gemini API so'rovi amalga oshmadi");
    }

    /**
     * AI javobidan Markdown backtick'larni olib tashlash va JSON parse qilish
     */
    _cleanAndParseJSON(rawText) {
        if (!rawText) return { cuts: [] };

        let cleaned = rawText.trim();
        // ```json va ``` belgilarni tozalash
        if (cleaned.startsWith("```json")) {
            cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "").trim();
        } else if (cleaned.startsWith("```")) {
            cleaned = cleaned.replace(/^```/, "").replace(/```$/, "").trim();
        }

        try {
            return JSON.parse(cleaned);
        } catch (err) {
            // Agar to'g'ridan-to'g'ri o'qib bo'lmasa, regex orqali birinchi {...} ni topish
            const match = cleaned.match(/\{[\s\S]*\}/);
            if (match) {
                return JSON.parse(match[0]);
            }
            throw new Error("AI javobini JSON formatida o'qib bo'lmadi: " + rawText.substring(0, 100));
        }
    }
}

// Global obyekt
window.apiConnector = new ApiConnector();
