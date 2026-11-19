/* ==========================================================================
   WM_CHECKLIST — СИНХРОНИЗАЦИЯ ЧЕРЕЗ SECRET GITHUB GIST И РЕЗЕРВНЫЙ JSON
   ========================================================================== */
(function (global) {
  'use strict';

  var WM = (global.WMChecklist = global.WMChecklist || {});

  var settings = {
    token: '',
    gistId: '',
    autoSync: true,
    lastSyncAt: ''
  };

  var autoSyncTimer = null;

  function loadSettings() {
    try {
      var raw = localStorage.getItem(WM.CONFIG.SETTINGS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        settings.token = String(parsed.token || '').trim();
        settings.gistId = String(parsed.gistId || '').trim();
        settings.autoSync = parsed.autoSync !== false;
        settings.lastSyncAt = String(parsed.lastSyncAt || '');
      }
    } catch (e) {}
    return settings;
  }

  function saveSettings(next) {
    if (next) {
      if (typeof next.token === 'string') settings.token = next.token.trim();
      if (typeof next.gistId === 'string') settings.gistId = next.gistId.trim();
      if (typeof next.autoSync === 'boolean') settings.autoSync = next.autoSync;
      if (typeof next.lastSyncAt === 'string') settings.lastSyncAt = next.lastSyncAt;
    }
    try {
      localStorage.setItem(WM.CONFIG.SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {}
    return settings;
  }

  function buildHeaders() {
    return {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + settings.token,
      'Content-Type': 'application/json'
    };
  }

  function parseGitHubError(status, bodyText) {
    if (status === 401) return 'Токен недействителен или истёк (401). Проверь токен в настройках.';
    if (status === 403) return 'Нет прав на Gist (403). У токена должна быть галочка «gist».';
    if (status === 404) return 'Gist с таким ID не найден (404). Попробуй «Найти мой Gist».';
    return 'Ошибка GitHub API (' + status + '): ' + (bodyText || 'неизвестно').slice(0, 120);
  }

  async function findExistingGist() {
    if (!settings.token) {
      throw new Error('Сначала вставь GitHub Token.');
    }
    var res = await fetch('https://api.github.com/gists?per_page=100', {
      method: 'GET',
      headers: buildHeaders()
    });
    if (!res.ok) {
      throw new Error(parseGitHubError(res.status, await res.text()));
    }
    var list = await res.json();
    for (var i = 0; i < list.length; i++) {
      var g = list[i];
      if (g.files && g.files[WM.CONFIG.GIST_FILENAME]) {
        saveSettings({ gistId: g.id });
        return g.id;
      }
    }
    return null;
  }

  async function pushToGist() {
    if (!settings.token) {
      throw new Error('Не указан GitHub Token.');
    }

    var content = JSON.stringify(WM.storage.getState(), null, 2);
    var filesPayload = {};
    filesPayload[WM.CONFIG.GIST_FILENAME] = { content: content };

    var url = settings.gistId
      ? 'https://api.github.com/gists/' + encodeURIComponent(settings.gistId)
      : 'https://api.github.com/gists';

    var method = settings.gistId ? 'PATCH' : 'POST';
    var body = {
      description: WM.CONFIG.GIST_DESCRIPTION,
      files: filesPayload
    };
    if (!settings.gistId) {
      body.public = false; // Secret Gist — скрыт от посторонних
    }

    var res = await fetch(url, {
      method: method,
      headers: buildHeaders(),
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      throw new Error(parseGitHubError(res.status, await res.text()));
    }

    var data = await res.json();
    saveSettings({
      gistId: data.id || settings.gistId,
      lastSyncAt: new Date().toISOString()
    });
    return data;
  }

  async function pullFromGist() {
    if (!settings.token) {
      throw new Error('Не указан GitHub Token.');
    }
    if (!settings.gistId) {
      var foundId = await findExistingGist();
      if (!foundId) {
        throw new Error('Gist с чек-листом ещё не создан. Сначала нажми «Отправить в GitHub».');
      }
    }

    var res = await fetch('https://api.github.com/gists/' + encodeURIComponent(settings.gistId), {
      method: 'GET',
      headers: buildHeaders()
    });

    if (!res.ok) {
      throw new Error(parseGitHubError(res.status, await res.text()));
    }

    var data = await res.json();
    var file = data.files && data.files[WM.CONFIG.GIST_FILENAME];
    if (!file || !file.content) {
      throw new Error('В выбранном Gist нет файла ' + WM.CONFIG.GIST_FILENAME);
    }

    var parsed = JSON.parse(file.content);
    WM.storage.replaceState(parsed, true);
    saveSettings({ lastSyncAt: new Date().toISOString() });
    return parsed;
  }

  function scheduleAutoPush(onStatusChange) {
    if (!settings.token || !settings.autoSync) return;
    if (autoSyncTimer) clearTimeout(autoSyncTimer);
    if (onStatusChange) onStatusChange('pending', 'SYNC // SAVING...');

    autoSyncTimer = setTimeout(async function () {
      try {
        await pushToGist();
        if (onStatusChange) {
          onStatusChange('ok', 'GIST // ' + WM.utils.formatTime(settings.lastSyncAt));
        }
      } catch (err) {
        if (onStatusChange) onStatusChange('error', 'SYNC // ERROR');
      }
    }, WM.CONFIG.AUTO_SYNC_DELAY_MS);
  }

  // --- Локальный JSON экспорт / импорт ---
  function downloadJsonFile() {
    var json = JSON.stringify(WM.storage.getState(), null, 2);
    var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var datePart = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = 'wm-checklist-' + datePart + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importJsonText(text) {
    var parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tabs)) {
      throw new Error('Файл не похож на резервную копию WM_CHECKLIST.');
    }
    WM.storage.replaceState(parsed, false);
    return parsed;
  }

  WM.sync = {
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    getSettings: function () { return settings; },
    hasToken: function () { return !!settings.token; },
    findExistingGist: findExistingGist,
    pushToGist: pushToGist,
    pullFromGist: pullFromGist,
    scheduleAutoPush: scheduleAutoPush,
    downloadJsonFile: downloadJsonFile,
    importJsonText: importJsonText
  };
})(window);
