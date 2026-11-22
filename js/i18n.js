/* ==========================================================================
   WM_CHECKLIST — ЗАГРУЗЧИК ЛОКАЛИЗАЦИЙ (locales/ru.json, en.json, az.json)
   ========================================================================== */
(function (global) {
  'use strict';

  var WM = (global.WMChecklist = global.WMChecklist || {});
  var LANG_KEY = 'wm_checklist_lang_v1';
  var SUPPORTED = ['ru', 'en', 'az'];
  var cache = {};
  var currentLang = detectInitialLang();

  function detectInitialLang() {
    try {
      var saved = localStorage.getItem(LANG_KEY);
      if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
    } catch (e) {}
    try {
      var nav = String((navigator.language || navigator.userLanguage || '')).toLowerCase();
      if (nav.indexOf('az') === 0) return 'az';
      if (nav.indexOf('en') === 0) return 'en';
      if (nav.indexOf('ru') === 0) return 'ru';
    } catch (e) {}
    return 'en';
  }

  async function loadLocale(lang) {
    if (SUPPORTED.indexOf(lang) === -1) lang = 'en';
    if (cache[lang]) return cache[lang];
    try {
      var res = await fetch('./locales/' + lang + '.json');
      if (res.ok) {
        cache[lang] = await res.json();
        return cache[lang];
      }
    } catch (e) {}
    return cache[lang] || {};
  }

  async function init(preferredLang) {
    var target = (preferredLang && SUPPORTED.indexOf(preferredLang) !== -1)
      ? preferredLang
      : currentLang;
    // Загружаем базовый словарь (en) как страховку и целевой язык
    await loadLocale('en');
    if (target !== 'en') {
      await loadLocale(target);
    }
    currentLang = target;
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = currentLang;
    }
    applyStaticTranslations();
    return currentLang;
  }

  async function setLang(lang, persistStorage) {
    if (SUPPORTED.indexOf(lang) === -1) lang = 'en';
    await loadLocale(lang);
    currentLang = lang;
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = lang;
    }
    if (persistStorage !== false) {
      try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
    }
    applyStaticTranslations();
    return currentLang;
  }

  function t(key, params) {
    var table = cache[currentLang] || cache.en || {};
    var fallback = cache.en || {};
    var str = (table[key] !== undefined) ? table[key] : (fallback[key] !== undefined ? fallback[key] : key);
    if (params && typeof params === 'object') {
      Object.keys(params).forEach(function (k) {
        str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), String(params[k]));
      });
    }
    return str;
  }

  function applyStaticTranslations() {
    if (typeof document === 'undefined') return;
    document.title = t('app_title');
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (key) el.setAttribute('placeholder', t(key));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-title');
      if (key) el.setAttribute('title', t(key));
    });
  }

  WM.i18n = {
    SUPPORTED: SUPPORTED,
    init: init,
    setLang: setLang,
    loadLocale: loadLocale,
    getLang: function () { return currentLang; },
    t: t,
    applyStaticTranslations: applyStaticTranslations,
    _injectCacheForTest: function (lang, dict) { cache[lang] = dict; }
  };
})(window);
