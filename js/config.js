/* ==========================================================================
   WM_CHECKLIST — КОНФИГУРАЦИЯ И СПРАВОЧНИКИ
   ========================================================================== */
(function (global) {
  'use strict';

  var WM = (global.WMChecklist = global.WMChecklist || {});

  WM.CONFIG = {
    STORAGE_KEY: 'wm_checklist_state_v1',
    SETTINGS_KEY: 'wm_checklist_settings_v1',
    THEME_KEY: 'wm_checklist_theme_v1',
    GIST_FILENAME: 'wm-checklist-data.json',
    GIST_DESCRIPTION: 'WM_CHECKLIST — личный чек-лист (автосинхронизация)',
    CURRENCY: '₼',
    AUTO_SYNC_DELAY_MS: 1500,

    PRIORITIES: [
      { id: 'critical', label: 'Критично', rank: 1 },
      { id: 'very_important', label: 'Очень важно', rank: 2 },
      { id: 'medium', label: 'Средне', rank: 3 },
      { id: 'desirable', label: 'Желательно', rank: 4 },
      { id: 'optional', label: 'Можно обойтись', rank: 5 }
    ],

    STORES: [
      'Местный рынок',
      'Birmarket',
      'Temu',
      'Ozon'
    ],

    CUSTOM_STORE_VALUE: '__custom__'
  };

  WM.utils = {
    uid: function (prefix) {
      return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    },

    toNumber: function (val) {
      var n = parseFloat(val);
      return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
    },

    formatMoney: function (amount) {
      var rounded = Math.round((Number(amount) || 0) * 100) / 100;
      var parts = rounded.toString().split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
      return parts.join(',') + ' ' + WM.CONFIG.CURRENCY;
    },

    getPriority: function (id) {
      var list = WM.CONFIG.PRIORITIES;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) return list[i];
      }
      return list[2]; // Средне по умолчанию
    },

    formatTime: function (isoString) {
      if (!isoString) return '';
      try {
        var d = new Date(isoString);
        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        return '';
      }
    }
  };
})(window);
