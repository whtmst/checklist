/* ==========================================================================
   WM_CHECKLIST — КОНФИГУРАЦИЯ, СПРАВОЧНИКИ И УТИЛИТЫ РАСЧЁТА
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
    GITLAB_SNIPPET_TITLE: 'WM_CHECKLIST Data',
    DROPBOX_APP_KEY: '',
    DROPBOX_DATA_PATH: '/wm-checklist-data.json',
    DROPBOX_PHOTOS_DIR: '/photos',
    PHOTO_MAX_SIDE: 1280,
    PHOTO_MAX_INPUT_BYTES: 20 * 1024 * 1024,
    PHOTO_WEBP_QUALITY: 0.82,
    CURRENCY: '₼',
    ALL_TAB_ID: '__all__',
    CURRENCY_PRESETS: [
      { symbol: '₼', labelKey: 'cur_AZN' },
      { symbol: '$', labelKey: 'cur_USD' },
      { symbol: '€', labelKey: 'cur_EUR' },
      { symbol: '₽', labelKey: 'cur_RUB' },
      { symbol: '₺', labelKey: 'cur_TRY' },
      { symbol: '₸', labelKey: 'cur_KZT' },
      { symbol: '₴', labelKey: 'cur_UAH' },
      { symbol: '₾', labelKey: 'cur_GEL' }
    ],
    AUTO_SYNC_DELAY_MS: 1500,
    AUTO_PULL_INTERVAL_MS: 60000,
    AUTO_PULL_MIN_GAP_MS: 10000,

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

    CUSTOM_STORE_VALUE: '__custom__',

    CREDIT_TYPES: [
      { id: 'installment', label: 'Рассрочка', badge: 'Рассрочка' },
      { id: 'ninja', label: 'Ninja', badge: 'Ninja' },
      { id: 'grace', label: 'Льготный период', badge: 'Льготный' },
      { id: 'custom', label: 'Свой вариант', badge: 'Кредит' }
    ],

    REPO_URL: 'https://github.com/whtmst/checklist',
    DISCUSSIONS_URL: 'https://github.com/whtmst/checklist/discussions',
    ISSUES_URL: 'https://github.com/whtmst/checklist/issues',

    /* Реальные ссылки поддержки из .github/FUNDING.yml и DONATE.md */
    DONATE_LINKS: [
      { id: 'patreon', label: 'Patreon', url: 'https://patreon.com/whtmst' },
      { id: 'dalink', label: 'DaLink', url: 'https://dalink.to/whtmst' },
      { id: 'donationalerts', label: 'DonationAlerts', url: 'https://www.donationalerts.com/r/whtmst' },
      { id: 'card', labelKey: 'donate_card_label', label: 'Перевод на карту (Leobank AZN)', url: 'https://github.com/whtmst/checklist/blob/main/DONATE.md' }
    ]
  };

  WM.utils = {
    /* Защита от XSS: разрешаем только безопасные http:// и https:// ссылки */
    sanitizeUrl: function (rawUrl) {
      var s = String(rawUrl || '').trim();
      if (!s) return '';
      if (/^https?:\/\//i.test(s)) return s;
      return '';
    },

    /* Разрешаем безопасные внешние URL и внутренние ссылки на фото в Dropbox (dbx://photos/...) */
    sanitizeImageUrl: function (rawUrl) {
      var s = String(rawUrl || '').trim();
      if (!s) return '';
      if (/^https?:\/\//i.test(s)) return s;
      if (s.indexOf('..') === -1 && /^dbx:\/\/photos\/[a-zA-Z0-9._\/-]+$/.test(s)) return s;
      return '';
    },

    uid: function (prefix) {
      return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    },

    toNumber: function (val) {
      var n = parseFloat(val);
      return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
    },

    getCurrency: function () {
      if (WM.storage && typeof WM.storage.getCurrency === 'function') {
        return WM.storage.getCurrency() || WM.CONFIG.CURRENCY;
      }
      return WM.CONFIG.CURRENCY;
    },

    formatMoney: function (amount) {
      var rounded = Math.round((Number(amount) || 0) * 100) / 100;
      var sign = rounded < 0 ? '-' : '';
      var abs = Math.abs(rounded);
      var parts = abs.toString().split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
      return sign + parts.join(',') + ' ' + WM.utils.getCurrency();
    },

    getPriority: function (id) {
      var list = WM.CONFIG.PRIORITIES;
      var found = list[2];
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) { found = list[i]; break; }
      }
      var label = (WM.i18n && WM.i18n.t) ? WM.i18n.t('prio_' + found.id) : found.label;
      return { id: found.id, label: label, rank: found.rank };
    },

    getCreditTypeLabel: function (type, customType, shortBadge) {
      if (type === 'custom' && customType && String(customType).trim()) {
        return String(customType).trim();
      }
      var tr = (WM.i18n && WM.i18n.t) ? WM.i18n.t : null;
      if (tr) {
        if (type === 'installment') return tr('credit_type_installment');
        if (type === 'ninja') return tr('credit_type_ninja');
        if (type === 'grace') return tr(shortBadge ? 'credit_type_grace_short' : 'credit_type_grace');
        if (type === 'custom') return tr(shortBadge ? 'credit_type_custom_badge' : 'credit_type_custom');
        return tr('credit_type_installment');
      }
      var list = WM.CONFIG.CREDIT_TYPES;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === type) return shortBadge ? list[i].badge : list[i].label;
      }
      return 'Рассрочка';
    },

    formatTime: function (isoString) {
      if (!isoString) return '';
      try {
        var d = new Date(isoString);
        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        return '';
      }
    },

    formatDateRu: function (dateStr) {
      if (!dateStr) return '';
      var parts = String(dateStr).split('-');
      if (parts.length !== 3) return dateStr;
      return parts[2] + '.' + parts[1] + '.' + parts[0];
    },

    /* График обычного кредита / рассрочки / Ninja */
    calcCreditSchedule: function (startDateStr, months, monthlyPayment, totalAmount) {
      var m = parseInt(months, 10) || 0;
      if (!startDateStr || m <= 0) return null;

      var parts = String(startDateStr).split('-');
      if (parts.length !== 3) return null;

      var y = parseInt(parts[0], 10);
      var mo = parseInt(parts[1], 10) - 1;
      var d = parseInt(parts[2], 10);
      if (isNaN(y) || isNaN(mo) || isNaN(d)) return null;

      var start = new Date(y, mo, d);
      var end = new Date(y, mo + m, d);
      if (end.getDate() !== d) {
        end = new Date(y, mo + m + 1, 0);
      }

      var now = new Date();
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      var elapsed = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
      if (today.getDate() < start.getDate()) {
        elapsed -= 1;
      }
      if (elapsed < 0) elapsed = 0;
      if (elapsed > m) elapsed = m;

      var remaining = m - elapsed;
      var paidPct = Math.round((elapsed / m) * 100);
      var pad = function (n) { return n < 10 ? '0' + n : String(n); };
      var endStr = end.getFullYear() + '-' + pad(end.getMonth() + 1) + '-' + pad(end.getDate());
      var totNum = WM.utils.toNumber(totalAmount);
      var remainingAmount = remaining === 0
        ? 0
        : (totNum > 0
            ? WM.utils.toNumber(Math.max(0, totNum - elapsed * WM.utils.toNumber(monthlyPayment)))
            : WM.utils.toNumber(remaining * WM.utils.toNumber(monthlyPayment)));

      return {
        startDate: startDateStr,
        endDate: endStr,
        startFormatted: WM.utils.formatDateRu(startDateStr),
        endFormatted: WM.utils.formatDateRu(endStr),
        totalMonths: m,
        elapsedMonths: elapsed,
        remainingMonths: remaining,
        remainingAmount: remainingAmount,
        paidPct: paidPct,
        isFinished: remaining === 0
      };
    },

    /* Статус льготного периода (сколько дней до даты возврата) */
    calcGraceStatus: function (dueDateStr) {
      if (!dueDateStr) return null;
      var parts = String(dueDateStr).split('-');
      if (parts.length !== 3) return null;

      var y = parseInt(parts[0], 10);
      var mo = parseInt(parts[1], 10) - 1;
      var d = parseInt(parts[2], 10);
      if (isNaN(y) || isNaN(mo) || isNaN(d)) return null;

      var due = new Date(y, mo, d);
      var now = new Date();
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);

      var statusText = '';
      var tr = (WM.i18n && WM.i18n.t) ? WM.i18n.t : null;
      if (diffDays > 0) statusText = tr ? tr('grace_days_left', { d: diffDays }) : ('осталось ' + diffDays + ' дн.');
      else if (diffDays === 0) statusText = tr ? tr('grace_today') : 'срок сегодня!';
      else statusText = tr ? tr('grace_overdue', { d: Math.abs(diffDays) }) : ('просрочено на ' + Math.abs(diffDays) + ' дн.');

      return {
        dueDate: dueDateStr,
        dueFormatted: WM.utils.formatDateRu(dueDateStr),
        daysLeft: diffDays,
        isOverdue: diffDays < 0,
        isUrgent: diffDays >= 0 && diffDays <= 7,
        statusText: statusText
      };
    }
  };
})(window);
