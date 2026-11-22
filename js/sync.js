/* ==========================================================================
   WM_CHECKLIST — СИНХРОНИЗАЦИЯ ЧЕРЕЗ SECRET GITHUB GIST (ETag + AUTO-MERGE)
   ========================================================================== */
(function (global) {
  'use strict';

  var WM = (global.WMChecklist = global.WMChecklist || {});
  var PENDING_KEY = 'wm_checklist_pending_sync_v1';

  var settings = {
    token: '',
    gistId: '',
    autoSync: true,
    lastSyncAt: ''
  };

  var autoSyncTimer = null;
  var lastEtag = '';
  var lastPullCheckMs = 0;
  var isSyncBusy = false;

  function hasPendingChanges() {
    try { return localStorage.getItem(PENDING_KEY) === '1'; } catch (e) { return false; }
  }

  function setPendingChanges(flag) {
    try {
      if (flag) localStorage.setItem(PENDING_KEY, '1');
      else localStorage.removeItem(PENDING_KEY);
    } catch (e) {}
  }

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
      if (typeof next.gistId === 'string') {
        var nextId = next.gistId.trim();
        if (nextId !== settings.gistId) lastEtag = '';
        settings.gistId = nextId;
      }
      if (typeof next.autoSync === 'boolean') settings.autoSync = next.autoSync;
      if (typeof next.lastSyncAt === 'string') settings.lastSyncAt = next.lastSyncAt;
    }
    try {
      localStorage.setItem(WM.CONFIG.SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {}
    return settings;
  }

  function buildHeaders(extra) {
    var headers = {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + settings.token,
      'Content-Type': 'application/json'
    };
    if (extra) {
      Object.keys(extra).forEach(function (k) { headers[k] = extra[k]; });
    }
    return headers;
  }

  function parseGitHubError(status, bodyText) {
    if (status === 401) return 'Токен недействителен или истёк (401). Проверь токен в настройках.';
    if (status === 403) return 'Нет прав на Gist или превышен лимит (403).';
    if (status === 404) return 'Gist с таким ID не найден (404). Попробуй «Найти мой Gist».';
    return 'Ошибка GitHub API (' + status + '): ' + (bodyText || 'неизвестно').slice(0, 120);
  }

  async function findExistingGist() {
    if (!settings.token) throw new Error('Сначала вставь GitHub Token.');
    var res = await fetch('https://api.github.com/gists?per_page=100', {
      method: 'GET',
      headers: buildHeaders()
    });
    if (!res.ok) throw new Error(parseGitHubError(res.status, await res.text()));
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

  /* Внутренняя загрузка удалённого JSON без перезаписи локального состояния */
  async function fetchRemoteState(useEtag) {
    var extra = (useEtag && lastEtag) ? { 'If-None-Match': lastEtag } : null;
    var res = await fetch('https://api.github.com/gists/' + encodeURIComponent(settings.gistId), {
      method: 'GET',
      headers: buildHeaders(extra)
    });
    if (res.status === 304) return { notModified: true, state: null };
    if (!res.ok) throw new Error(parseGitHubError(res.status, await res.text()));
    var etag = res.headers.get('ETag');
    if (etag) lastEtag = etag;
    var data = await res.json();
    var file = data.files && data.files[WM.CONFIG.GIST_FILENAME];
    if (!file) {
      throw new Error('В выбранном Gist нет файла ' + WM.CONFIG.GIST_FILENAME);
    }
    var rawText = file.content || '';
    if (file.truncated && file.raw_url) {
      var rawRes = await fetch(file.raw_url);
      if (!rawRes.ok) {
        throw new Error('Не удалось загрузить полный файл из Gist (' + rawRes.status + ').');
      }
      rawText = await rawRes.text();
    }
    if (!rawText) {
      throw new Error('В выбранном Gist пустой файл ' + WM.CONFIG.GIST_FILENAME);
    }
    return { notModified: false, state: JSON.parse(rawText) };
  }

  async function pushToGist(mergeBeforePush) {
    if (!settings.token) throw new Error('Не указан GitHub Token.');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setPendingChanges(true);
      throw new Error('Нет интернета — изменения сохранены локально.');
    }

    isSyncBusy = true;
    var merged = false;
    try {
      // Если были офлайн-изменения и Gist уже существует — сначала аккуратно сливаем с версией на GitHub!
      if (mergeBeforePush && settings.gistId) {
        try {
          var remoteRes = await fetchRemoteState(true);
          if (!remoteRes.notModified && remoteRes.state) {
            WM.storage.mergeRemoteState(remoteRes.state);
            merged = true;
          }
        } catch (mergeErr) {
          // Если Gist 404 или сеть моргнула — пробрасываем ошибку, не теряя флаг pending
          throw mergeErr;
        }
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
      if (!settings.gistId) body.public = false;

      var res = await fetch(url, {
        method: method,
        headers: buildHeaders(),
        body: JSON.stringify(body)
      });

      if (!res.ok) throw new Error(parseGitHubError(res.status, await res.text()));

      var etag = res.headers.get('ETag');
      if (etag) lastEtag = etag;

      var data = await res.json();
      setPendingChanges(false);
      saveSettings({
        gistId: data.id || settings.gistId,
        lastSyncAt: new Date().toISOString()
      });
      data._merged = merged;
      return data;
    } catch (err) {
      setPendingChanges(true);
      throw err;
    } finally {
      isSyncBusy = false;
    }
  }

  async function pullFromGist() {
    if (!settings.token) throw new Error('Не указан GitHub Token.');
    if (!settings.gistId) {
      var foundId = await findExistingGist();
      if (!foundId) throw new Error('Gist с чек-листом ещё не создан. Сначала нажми «Отправить в GitHub».');
    }

    isSyncBusy = true;
    try {
      var remoteRes = await fetchRemoteState(false);
      if (hasPendingChanges()) {
        // Не теряем офлайн-правки: сливаем с Gist и сразу отправляем объединённую версию
        WM.storage.mergeRemoteState(remoteRes.state);
        isSyncBusy = false;
        await pushToGist(false);
        return WM.storage.getState();
      }
      WM.storage.replaceState(remoteRes.state, true);
      saveSettings({ lastSyncAt: new Date().toISOString() });
      return remoteRes.state;
    } finally {
      isSyncBusy = false;
    }
  }

  /* Экономная фоновая проверка через ETag (304 Not Modified = 0 расхода лимита GitHub) */
  async function checkForRemoteUpdates(force) {
    if (!settings.token || !settings.gistId || !settings.autoSync) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    if (isSyncBusy || autoSyncTimer) return false;
    if (document.hidden && !force) return false;

    // Если накопились офлайн-правки — сразу выполняем умное слияние и отправку!
    if (hasPendingChanges()) {
      try {
        await pushToGist(true);
        return true;
      } catch (e) {
        return false;
      }
    }

    var now = Date.now();
    if (!force && now - lastPullCheckMs < WM.CONFIG.AUTO_PULL_MIN_GAP_MS) {
      return false;
    }
    lastPullCheckMs = now;

    try {
      var remoteRes = await fetchRemoteState(true);
      if (remoteRes.notModified || !remoteRes.state) return false;

      var localState = WM.storage.getState();
      var remoteTime = Date.parse(remoteRes.state.updatedAt || '') || 0;
      var localTime = Date.parse(localState.updatedAt || '') || 0;

      if (remoteTime > localTime) {
        WM.storage.replaceState(remoteRes.state, true);
        saveSettings({ lastSyncAt: new Date().toISOString() });
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  function scheduleAutoPush(onStatusChange) {
    setPendingChanges(true);
    if (!settings.token || !settings.autoSync) return;
    if (autoSyncTimer) clearTimeout(autoSyncTimer);

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (onStatusChange) onStatusChange('pending', 'OFFLINE // SAVED');
      return;
    }

    if (onStatusChange) onStatusChange('pending', 'SYNC // SAVING...');

    autoSyncTimer = setTimeout(async function () {
      autoSyncTimer = null;
      try {
        await pushToGist(true);
        if (onStatusChange) {
          onStatusChange('ok', 'GIST // ' + WM.utils.formatTime(settings.lastSyncAt));
        }
      } catch (err) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          if (onStatusChange) onStatusChange('pending', 'OFFLINE // SAVED');
        } else {
          if (onStatusChange) onStatusChange('error', 'SYNC // ERROR');
        }
      }
    }, WM.CONFIG.AUTO_SYNC_DELAY_MS);
  }

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
    try { localStorage.setItem('wm_checklist_last_backup_v1', String(Date.now())); } catch (e) {}
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
    hasPendingChanges: hasPendingChanges,
    findExistingGist: findExistingGist,
    pushToGist: pushToGist,
    pullFromGist: pullFromGist,
    checkForRemoteUpdates: checkForRemoteUpdates,
    scheduleAutoPush: scheduleAutoPush,
    downloadJsonFile: downloadJsonFile,
    importJsonText: importJsonText
  };
})(window);
