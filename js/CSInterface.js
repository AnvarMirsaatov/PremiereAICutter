/**
 * CSInterface - v11.0.0 (Moslashuvchan Adobe CEP kutubxonasi)
 * Adobe Premiere Pro va CEP paneli o'rtasidagi ko'prik.
 */
function CSInterface() {
    this.hostEnvironment = window.__adobe_cep__ ? JSON.parse(window.__adobe_cep__.getHostEnvironment()) : {
        appName: "PPRO",
        appVersion: "24.0.0",
        appLocale: "en_US"
    };
}

/**
 * ExtendScript (.jsx) funksiyasini chaqirish
 * @param {string} script - Chaqiriladigan JSX kodi (masalan, 'getActiveSequenceName()')
 * @param {function} callback - Natijani qabul qiluvchi funksiya
 */
CSInterface.prototype.evalScript = function(script, callback) {
    if (window.__adobe_cep__) {
        window.__adobe_cep__.evalScript(script, callback || function() {});
    } else {
        console.warn("[CSInterface Mock] Brauzerda test qilinmoqda. evalScript chaqirildi:", script);
        // Oddiy brauzerda test qilinganda mock javob qaytarish
        if (callback) {
            if (script.indexOf("getActiveSequenceInfo") !== -1) {
                callback(JSON.stringify({
                    success: true,
                    name: "Demo_Sequence_01",
                    duration: 124.5,
                    timebase: "25",
                    audioTracks: 2,
                    videoTracks: 2
                }));
            } else if (script.indexOf("applyTimelineActions") !== -1 || script.indexOf("applyCutsFromSilenceIntervals") !== -1 || script.indexOf("cutSilencesFromSequence") !== -1) {
                callback(JSON.stringify({
                    success: true,
                    status: "Production Ready",
                    cutsApplied: 8,
                    silencesDeleted: 8,
                    zoomsApplied: 4,
                    message: "Timeline 'Production Ready' holatiga keltirildi!"
                }));
            } else {
                callback(JSON.stringify({ success: true, message: "Mock response" }));
            }
        }
    }
};

/**
 * Host dastur ma'lumotlarini olish
 */
CSInterface.prototype.getHostEnvironment = function() {
    return this.hostEnvironment;
};

/**
 * Panelni yopish
 */
CSInterface.prototype.closeExtension = function() {
    if (window.__adobe_cep__) {
        window.__adobe_cep__.closeExtension();
    } else {
        console.log("[CSInterface Mock] closeExtension chaqirildi.");
    }
};

/**
 * URL manzilni standart tizim brauzerida ochish
 */
CSInterface.prototype.openURLInDefaultBrowser = function(url) {
    if (window.__adobe_cep__) {
        cep.util.openURLInDefaultBrowser(url);
    } else {
        window.open(url, "_blank");
    }
};

// Global obyektga eksport qilish
window.CSInterface = CSInterface;
