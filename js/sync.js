/* ==========================================================================
   WM_CHECKLIST — МУЛЬТИОБЛАЧНАЯ СИНХРОНИЗАЦИЯ
   Провайдеры: Local | GitHub Secret Gist | GitLab Private Snippets | Dropbox PKCE
   ========================================================================== */
(function (global) {
  'use strict';

  var WM = (global.WMChecklist = global.WMChecklist || {});
  var PENDING_KEY = 'wm_checklist_pending_sync_v1';
  var DBX_PKCE_VERIFIER_KEY = 'wm_dbx_pkce_verifier_v1';
  var DBX_PKCE_STATE_KEY = 'wm_dbx_pkce_state_v1';
  var DBX_PKCE_APPKEY_KEY = 'wm_dbx_pkce_appkey_v1';

  var PROVIDERS = ['local', 'github', 'gitlab', 'dropbox'];

  var settings = {
    provider: 'local',
    autoSync: true,
    lastSyncAt: '',
    /* GitHub Secret Gist */
    token: '',
    gistId: '',
    /* GitLab Private Snippets */
    gitlabToken: '',
    gitlabSnippetId: '',
    /* Dropbox App Folder (OAuth 2.0 PKCE + refresh_token) */
    dropboxAppKey: '',
    dropboxAccessToken: '',
    dropboxRefreshToken: '',
    dropboxTokenExpiresAt: 0,
    dropboxAccountName: '',
    dropboxRev: ''
  };

  var autoSyncTimer = null;
  var lastEtag = '';
  var lastGitlabUpdatedAt = '';
  var lastPullAttemptAt = 0;
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
        settings.autoSync = parsed.autoSync !== false;
        settings.lastSyncAt = String(parsed.lastSyncAt || '');
        settings.token = String(parsed.token || '').trim();
        settings.gistId = String(parsed.gistId || '').trim();
        settings.gitlabToken = String(parsed.gitlabToken || '').trim();
        settings.gitlabSnippetId = String(parsed.gitlabSnippetId || '').trim();
        settings.dropboxAppKey = String(parsed.dropboxAppKey || '').trim();
        settings.dropboxAccessToken = String(parsed.dropboxAccessToken || '').trim();
        settings.dropboxRefreshToken = String(parsed.dropboxRefreshToken || '').trim();
        settings.dropboxTokenExpiresAt = Number(parsed.dropboxTokenExpiresAt) || 0;
        settings.dropboxAccountName = String(parsed.dropboxAccountName || '').trim();
        settings.dropboxRev = String(parsed.dropboxRev || '').trim();

        /* Бесшовная миграция пользователей v23 -> v24: если уже был токен GitHub, оставляем github */
        if (PROVIDERS.indexOf(parsed.provider) !== -1) {
          settings.provider = parsed.provider;
        } else if (settings.token) {
          settings.provider = 'github';
        } else {
          settings.provider = 'local';
        }
      }
    } catch (e) {}
    return settings;
  }

  function saveSettings(partial) {
    if (partial) {
      if (partial.provider !== undefined && PROVIDERS.indexOf(partial.provider) !== -1) {
        if (partial.provider !== settings.provider) {
          lastEtag = '';
          lastGitlabUpdatedAt = '';
        }
        settings.provider = partial.provider;
      }
      if (partial.autoSync !== undefined) settings.autoSync = !!partial.autoSync;
      if (partial.lastSyncAt !== undefined) settings.lastSyncAt = String(partial.lastSyncAt || '');
      if (partial.token !== undefined) settings.token = String(partial.token || '').trim();
      if (partial.gistId !== undefined) settings.gistId = String(partial.gistId || '').trim();
      if (partial.gitlabToken !== undefined) settings.gitlabToken = String(partial.gitlabToken || '').trim();
      if (partial.gitlabSnippetId !== undefined) settings.gitlabSnippetId = String(partial.gitlabSnippetId || '').trim();
      if (partial.dropboxAppKey !== undefined) settings.dropboxAppKey = String(partial.dropboxAppKey || '').trim();
      if (partial.dropboxAccessToken !== undefined) settings.dropboxAccessToken = String(partial.dropboxAccessToken || '').trim();
      if (partial.dropboxRefreshToken !== undefined) settings.dropboxRefreshToken = String(partial.dropboxRefreshToken || '').trim();
      if (partial.dropboxTokenExpiresAt !== undefined) settings.dropboxTokenExpiresAt = Number(partial.dropboxTokenExpiresAt) || 0;
      if (partial.dropboxAccountName !== undefined) settings.dropboxAccountName = String(partial.dropboxAccountName || '').trim();
      if (partial.dropboxRev !== undefined) settings.dropboxRev = String(partial.dropboxRev || '').trim();
    }
    try {
      localStorage.setItem(WM.CONFIG.SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {}
    return settings;
  }

  function getProvider() {
    return settings.provider || 'local';
  }

  function getEffectiveDropboxAppKey() {
    return settings.dropboxAppKey || WM.CONFIG.DROPBOX_APP_KEY || '';
  }

  function isConnected() {
    var p = getProvider();
    if (p === 'github') return !!settings.token;
    if (p === 'gitlab') return !!settings.gitlabToken;
    if (p === 'dropbox') return !!(settings.dropboxRefreshToken || settings.dropboxAccessToken);
    return false;
  }

  function canUploadPhotos() {
    return getProvider() === 'dropbox' && !!(settings.dropboxRefreshToken || settings.dropboxAccessToken);
  }

  function getProviderBadge() {
    var p = getProvider();
    if (p === 'github') return 'GIST';
    if (p === 'gitlab') return 'GITLAB';
    if (p === 'dropbox') return 'DROPBOX';
    return 'LOCAL';
  }

  /* ===================== GITHUB SECRET GIST ===================== */
  function buildGitHubHeaders(extra) {
    var h = {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + settings.token,
      'Content-Type': 'application/json'
    };
    if (extra) {
      Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    }
    return h;
  }

  function parseGitHubError(status, bodyText) {
    var msg = 'GitHub API (' + status + ')';
    try {
      var parsed = JSON.parse(bodyText);
      if (parsed && parsed.message) msg += ': ' + parsed.message;
    } catch (e) {}
    if (status === 401) return WM.i18n.t('err_gh_401');
    if (status === 404) return WM.i18n.t('err_gh_404');
    return msg;
  }

  async function findExistingGist() {
    if (!settings.token) throw new Error(WM.i18n.t('err_no_token'));
    var res = await fetch('https://api.github.com/gists?per_page=50', {
      method: 'GET',
      headers: buildGitHubHeaders()
    });
    if (!res.ok) throw new Error(parseGitHubError(res.status, await res.text()));
    var gists = await res.json();
    for (var i = 0; i < gists.length; i++) {
      if (gists[i].files && gists[i].files[WM.CONFIG.GIST_FILENAME]) {
        saveSettings({ gistId: gists[i].id });
        return gists[i].id;
      }
    }
    return '';
  }

  async function fetchGitHubRemoteState(useEtag) {
    var headers = buildGitHubHeaders(useEtag && lastEtag ? { 'If-None-Match': lastEtag } : null);
    var res = await fetch('https://api.github.com/gists/' + encodeURIComponent(settings.gistId), {
      method: 'GET',
      headers: headers
    });

    if (res.status === 304) return { notModified: true, state: null };
    if (!res.ok) throw new Error(parseGitHubError(res.status, await res.text()));

    var etag = res.headers.get('ETag');
    if (etag) lastEtag = etag;

    var data = await res.json();
    var fileObj = data.files && data.files[WM.CONFIG.GIST_FILENAME];
    if (!fileObj) {
      throw new Error(WM.i18n.t('err_empty_gist', { file: WM.CONFIG.GIST_FILENAME }));
    }

    var rawText = fileObj.content || '';
    if (fileObj.truncated && fileObj.raw_url) {
      var rawRes = await fetch(fileObj.raw_url, { method: 'GET' });
      if (!rawRes.ok) throw new Error(WM.i18n.t('err_raw_fetch', { status: rawRes.status }));
      rawText = await rawRes.text();
    }
    if (!rawText) {
      throw new Error(WM.i18n.t('err_empty_gist', { file: WM.CONFIG.GIST_FILENAME }));
    }
    return { notModified: false, state: JSON.parse(rawText) };
  }

  async function pushToGitHub() {
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
      headers: buildGitHubHeaders(),
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(parseGitHubError(res.status, await res.text()));

    var etag = res.headers.get('ETag');
    if (etag) lastEtag = etag;

    var data = await res.json();
    saveSettings({
      gistId: data.id || settings.gistId,
      lastSyncAt: new Date().toISOString()
    });
    return data;
  }

  /* ===================== GITLAB PRIVATE SNIPPETS (50 MB) ===================== */
  function buildGitLabHeaders() {
    return {
      'PRIVATE-TOKEN': settings.gitlabToken,
      'Content-Type': 'application/json'
    };
  }

  function parseGitLabError(status, bodyText) {
    var msg = 'GitLab API (' + status + ')';
    try {
      var parsed = JSON.parse(bodyText);
      if (parsed && (parsed.message || parsed.error)) {
        msg += ': ' + (parsed.message || parsed.error);
      }
    } catch (e) {}
    if (status === 401 || status === 403) return WM.i18n.t('err_gl_401');
    if (status === 404) return WM.i18n.t('err_gl_404');
    return msg;
  }

  async function findExistingGitLabSnippet() {
    if (!settings.gitlabToken) throw new Error(WM.i18n.t('err_gl_no_token'));
    var res = await fetch('https://gitlab.com/api/v4/snippets?per_page=100', {
      method: 'GET',
      headers: { 'PRIVATE-TOKEN': settings.gitlabToken }
    });
    if (!res.ok) throw new Error(parseGitLabError(res.status, await res.text()));
    var list = await res.json();
    for (var i = 0; i < list.length; i++) {
      var sn = list[i];
      var hasFile = Array.isArray(sn.files) && sn.files.some(function (f) {
        return f.path === WM.CONFIG.GIST_FILENAME;
      });
      if (hasFile || sn.file_name === WM.CONFIG.GIST_FILENAME || sn.title === WM.CONFIG.GITLAB_SNIPPET_TITLE) {
        saveSettings({ gitlabSnippetId: String(sn.id) });
        return String(sn.id);
      }
    }
    return '';
  }

  async function fetchGitLabRemoteState(checkTimestampOnly) {
    var id = settings.gitlabSnippetId;
    if (!id) throw new Error(WM.i18n.t('err_gl_no_snippet'));

    var metaRes = await fetch('https://gitlab.com/api/v4/snippets/' + encodeURIComponent(id), {
      method: 'GET',
      headers: { 'PRIVATE-TOKEN': settings.gitlabToken }
    });
    if (!metaRes.ok) throw new Error(parseGitLabError(metaRes.status, await metaRes.text()));
    var meta = await metaRes.json();

    if (checkTimestampOnly && lastGitlabUpdatedAt && meta.updated_at === lastGitlabUpdatedAt) {
      return { notModified: true, state: null };
    }

    var rawUrl = 'https://gitlab.com/api/v4/snippets/' + encodeURIComponent(id) +
      '/files/main/' + encodeURIComponent(WM.CONFIG.GIST_FILENAME) + '/raw';
    var rawRes = await fetch(rawUrl, {
      method: 'GET',
      headers: { 'PRIVATE-TOKEN': settings.gitlabToken }
    });
    if (!rawRes.ok) {
      var fallbackRes = await fetch('https://gitlab.com/api/v4/snippets/' + encodeURIComponent(id) + '/raw', {
        method: 'GET',
        headers: { 'PRIVATE-TOKEN': settings.gitlabToken }
      });
      if (!fallbackRes.ok) throw new Error(parseGitLabError(fallbackRes.status, await fallbackRes.text()));
      rawRes = fallbackRes;
    }

    var rawText = await rawRes.text();
    if (!rawText) throw new Error(WM.i18n.t('err_empty_gist', { file: WM.CONFIG.GIST_FILENAME }));
    if (meta.updated_at) lastGitlabUpdatedAt = meta.updated_at;
    return { notModified: false, state: JSON.parse(rawText) };
  }

  async function pushToGitLab() {
    var content = JSON.stringify(WM.storage.getState(), null, 2);
    var isUpdate = !!settings.gitlabSnippetId;
    var url = isUpdate
      ? 'https://gitlab.com/api/v4/snippets/' + encodeURIComponent(settings.gitlabSnippetId)
      : 'https://gitlab.com/api/v4/snippets';
    var method = isUpdate ? 'PUT' : 'POST';

    var payload = isUpdate
      ? {
          title: WM.CONFIG.GITLAB_SNIPPET_TITLE,
          visibility: 'private',
          files: [{ action: 'update', file_path: WM.CONFIG.GIST_FILENAME, content: content }]
        }
      : {
          title: WM.CONFIG.GITLAB_SNIPPET_TITLE,
          visibility: 'private',
          files: [{ file_path: WM.CONFIG.GIST_FILENAME, content: content }]
        };

    var res = await fetch(url, {
      method: method,
      headers: buildGitLabHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(parseGitLabError(res.status, await res.text()));
    var data = await res.json();
    if (data.updated_at) lastGitlabUpdatedAt = data.updated_at;
    saveSettings({
      gitlabSnippetId: String(data.id || settings.gitlabSnippetId),
      lastSyncAt: new Date().toISOString()
    });
    return data;
  }

  /* ===================== DROPBOX APP FOLDER (OAuth 2.0 PKCE + REFRESH) ===================== */
  function base64UrlEncode(bytes) {
    var str = '';
    for (var i = 0; i < bytes.length; i++) {
      str += String.fromCharCode(bytes[i]);
    }
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function randomBase64Url(byteLen) {
    var arr = new Uint8Array(byteLen);
    crypto.getRandomValues(arr);
    return base64UrlEncode(arr);
  }

  async function sha256Base64Url(text) {
    var data = new TextEncoder().encode(text);
    var hash = await crypto.subtle.digest('SHA-256', data);
    return base64UrlEncode(new Uint8Array(hash));
  }

  function getOAuthRedirectUri() {
    var u = new URL(global.location.href);
    return u.origin + u.pathname;
  }

  async function startDropboxOAuth(customAppKey) {
    var appKey = String(customAppKey || '').trim() || getEffectiveDropboxAppKey();
    if (!appKey) {
      throw new Error(WM.i18n.t('err_dbx_no_appkey'));
    }
    if (customAppKey !== undefined) {
      saveSettings({ dropboxAppKey: String(customAppKey || '').trim() });
    }

    var verifier = randomBase64Url(64);
    var state = randomBase64Url(24);
    var challenge = await sha256Base64Url(verifier);

    try {
      sessionStorage.setItem(DBX_PKCE_VERIFIER_KEY, verifier);
      sessionStorage.setItem(DBX_PKCE_STATE_KEY, state);
      sessionStorage.setItem(DBX_PKCE_APPKEY_KEY, appKey);
    } catch (e) {}

    var authUrl = 'https://www.dropbox.com/oauth2/authorize' +
      '?client_id=' + encodeURIComponent(appKey) +
      '&response_type=code' +
      '&code_challenge=' + encodeURIComponent(challenge) +
      '&code_challenge_method=S256' +
      '&token_access_type=offline' +
      '&redirect_uri=' + encodeURIComponent(getOAuthRedirectUri()) +
      '&state=' + encodeURIComponent(state);

    global.location.href = authUrl;
  }

  async function handleOAuthCallbackIfPresent() {
    var params;
    try {
      params = new URLSearchParams(global.location.search);
    } catch (e) {
      return { handled: false };
    }
    var code = params.get('code');
    var state = params.get('state');
    var oauthErr = params.get('error');
    if (!code && !oauthErr) return { handled: false };

    /* Убираем ?code=... из адресной строки сразу */
    try {
      global.history.replaceState({}, document.title, getOAuthRedirectUri());
    } catch (e) {}

    if (oauthErr) {
      return { handled: true, error: WM.i18n.t('err_dbx_oauth_denied') };
    }

    var savedState = '';
    var verifier = '';
    var appKey = '';
    try {
      savedState = sessionStorage.getItem(DBX_PKCE_STATE_KEY) || '';
      verifier = sessionStorage.getItem(DBX_PKCE_VERIFIER_KEY) || '';
      appKey = sessionStorage.getItem(DBX_PKCE_APPKEY_KEY) || getEffectiveDropboxAppKey();
      sessionStorage.removeItem(DBX_PKCE_STATE_KEY);
      sessionStorage.removeItem(DBX_PKCE_VERIFIER_KEY);
      sessionStorage.removeItem(DBX_PKCE_APPKEY_KEY);
    } catch (e) {}

    if (!savedState || savedState !== state || !verifier || !appKey) {
      return { handled: true, error: WM.i18n.t('err_dbx_oauth_state') };
    }

    var body = new URLSearchParams({
      code: code,
      grant_type: 'authorization_code',
      client_id: appKey,
      code_verifier: verifier,
      redirect_uri: getOAuthRedirectUri()
    });

    var res = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!res.ok) {
      return { handled: true, error: WM.i18n.t('err_dbx_token_exchange') };
    }

    var tok = await res.json();
    var expiresAt = Date.now() + ((Number(tok.expires_in) || 14400) * 1000);
    saveSettings({
      provider: 'dropbox',
      dropboxAppKey: appKey,
      dropboxAccessToken: tok.access_token || '',
      dropboxRefreshToken: tok.refresh_token || settings.dropboxRefreshToken,
      dropboxTokenExpiresAt: expiresAt
    });

    /* Получаем имя/email аккаунта для отображения в настройках */
    try {
      var accRes = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + settings.dropboxAccessToken }
      });
      if (accRes.ok) {
        var acc = await accRes.json();
        var displayName = (acc.name && acc.name.display_name) || acc.email || 'Dropbox';
        saveSettings({ dropboxAccountName: displayName });
      }
    } catch (e) {}

    return { handled: true, connected: true };
  }

  async function ensureDropboxAccessToken() {
    if (!settings.dropboxRefreshToken && !settings.dropboxAccessToken) {
      throw new Error(WM.i18n.t('err_dbx_not_connected'));
    }
    var now = Date.now();
    if (settings.dropboxAccessToken && settings.dropboxTokenExpiresAt > now + 60000) {
      return settings.dropboxAccessToken;
    }
    if (!settings.dropboxRefreshToken) {
      return settings.dropboxAccessToken;
    }
    var appKey = getEffectiveDropboxAppKey();
    if (!appKey) throw new Error(WM.i18n.t('err_dbx_no_appkey'));

    var body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: settings.dropboxRefreshToken,
      client_id: appKey
    });

    var res = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!res.ok) {
      throw new Error(WM.i18n.t('err_dbx_refresh_fail'));
    }

    var tok = await res.json();
    saveSettings({
      dropboxAccessToken: tok.access_token || '',
      dropboxTokenExpiresAt: Date.now() + ((Number(tok.expires_in) || 14400) * 1000)
    });
    return settings.dropboxAccessToken;
  }

  async function disconnectDropbox() {
    if (settings.dropboxAccessToken) {
      try {
        await fetch('https://api.dropboxapi.com/2/auth/token/revoke', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + settings.dropboxAccessToken }
        });
      } catch (e) {}
    }
    saveSettings({
      dropboxAccessToken: '',
      dropboxRefreshToken: '',
      dropboxTokenExpiresAt: 0,
      dropboxAccountName: '',
      dropboxRev: ''
    });
  }

  function encodeDropboxHeaderJson(obj) {
    return JSON.stringify(obj).replace(/[\u007f-\uffff]/g, function (c) {
      return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
    });
  }

  async function fetchDropboxRemoteState(checkRevOnly) {
    var accessToken = await ensureDropboxAccessToken();
    var path = WM.CONFIG.DROPBOX_DATA_PATH || '/wm-checklist-data.json';

    if (checkRevOnly && settings.dropboxRev) {
      var metaRes = await fetch('https://api.dropboxapi.com/2/files/get_metadata', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: path })
      });
      if (metaRes.status === 409) {
        return { notModified: true, state: null, notFound: true };
      }
      if (metaRes.ok) {
        var meta = await metaRes.json();
        if (meta.rev && meta.rev === settings.dropboxRev) {
          return { notModified: true, state: null };
        }
      }
    }

    var res = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Dropbox-API-Arg': encodeDropboxHeaderJson({ path: path })
      }
    });

    if (res.status === 409) {
      return { notModified: false, state: null, notFound: true };
    }
    if (!res.ok) {
      throw new Error(WM.i18n.t('err_dbx_api', { status: res.status }));
    }

    var apiResultHeader = res.headers.get('Dropbox-API-Result');
    if (apiResultHeader) {
      try {
        var parsedMeta = JSON.parse(apiResultHeader);
        if (parsedMeta && parsedMeta.rev) saveSettings({ dropboxRev: parsedMeta.rev });
      } catch (e) {}
    }

    var rawText = await res.text();
    if (!rawText) return { notModified: false, state: null, notFound: true };
    return { notModified: false, state: JSON.parse(rawText) };
  }

  async function pushToDropbox() {
    var accessToken = await ensureDropboxAccessToken();
    var path = WM.CONFIG.DROPBOX_DATA_PATH || '/wm-checklist-data.json';
    var content = JSON.stringify(WM.storage.getState(), null, 2);

    var res = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': encodeDropboxHeaderJson({
          path: path,
          mode: 'overwrite',
          mute: true
        })
      },
      body: content
    });

    if (!res.ok) {
      throw new Error(WM.i18n.t('err_dbx_api', { status: res.status }));
    }

    var meta = await res.json();
    saveSettings({
      dropboxRev: meta.rev || settings.dropboxRev,
      lastSyncAt: new Date().toISOString()
    });
    return meta;
  }

  async function uploadDropboxBinary(path, blob) {
    var accessToken = await ensureDropboxAccessToken();
    var res = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': encodeDropboxHeaderJson({
          path: path,
          mode: 'overwrite',
          mute: true
        })
      },
      body: blob
    });
    if (!res.ok) {
      throw new Error(WM.i18n.t('err_dbx_api', { status: res.status }));
    }
    return await res.json();
  }

  async function downloadDropboxBinary(path) {
    var accessToken = await ensureDropboxAccessToken();
    var res = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Dropbox-API-Arg': encodeDropboxHeaderJson({ path: path })
      }
    });
    if (!res.ok) {
      throw new Error(WM.i18n.t('err_dbx_api', { status: res.status }));
    }
    return await res.blob();
  }

  async function deleteDropboxPath(path) {
    var accessToken = await ensureDropboxAccessToken();
    await fetch('https://api.dropboxapi.com/2/files/delete_v2', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: path })
    });
  }

  /* ===================== ЕДИНЫЙ ФАСАД PUSH / PULL / AUTO-SYNC ===================== */
  async function fetchActiveRemoteState(lightweightCheck) {
    var p = getProvider();
    if (p === 'github') return await fetchGitHubRemoteState(lightweightCheck);
    if (p === 'gitlab') return await fetchGitLabRemoteState(lightweightCheck);
    if (p === 'dropbox') return await fetchDropboxRemoteState(lightweightCheck);
    return { notModified: true, state: null };
  }

  async function pushToCloud(mergeBeforePush) {
    var p = getProvider();
    if (p === 'local') throw new Error(WM.i18n.t('err_provider_local'));
    if (!isConnected()) {
      if (p === 'github') throw new Error(WM.i18n.t('err_no_token'));
      if (p === 'gitlab') throw new Error(WM.i18n.t('err_gl_no_token'));
      throw new Error(WM.i18n.t('err_dbx_not_connected'));
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setPendingChanges(true);
      throw new Error(WM.i18n.t('err_offline_saved'));
    }

    isSyncBusy = true;
    var merged = false;
    try {
      var hasRemoteTarget = (p === 'github' && !!settings.gistId) ||
        (p === 'gitlab' && !!settings.gitlabSnippetId) ||
        (p === 'dropbox');

      if (mergeBeforePush && hasRemoteTarget) {
        var remoteRes = await fetchActiveRemoteState(true);
        if (!remoteRes.notModified && remoteRes.state) {
          WM.storage.mergeRemoteState(remoteRes.state);
          merged = true;
        }
      }

      var data;
      if (p === 'github') data = await pushToGitHub();
      else if (p === 'gitlab') data = await pushToGitLab();
      else if (p === 'dropbox') data = await pushToDropbox();

      setPendingChanges(false);
      if (data && typeof data === 'object') data._merged = merged;
      return data;
    } catch (err) {
      setPendingChanges(true);
      throw err;
    } finally {
      isSyncBusy = false;
    }
  }

  async function pullFromCloud(mergeInsteadOfReplace) {
    var p = getProvider();
    if (p === 'local') throw new Error(WM.i18n.t('err_provider_local'));
    if (!isConnected()) {
      if (p === 'github') throw new Error(WM.i18n.t('err_no_token'));
      if (p === 'gitlab') throw new Error(WM.i18n.t('err_gl_no_token'));
      throw new Error(WM.i18n.t('err_dbx_not_connected'));
    }

    if (p === 'github' && !settings.gistId) {
      var foundGist = await findExistingGist();
      if (!foundGist) throw new Error(WM.i18n.t('err_no_gist_created'));
    }
    if (p === 'gitlab' && !settings.gitlabSnippetId) {
      var foundSnippet = await findExistingGitLabSnippet();
      if (!foundSnippet) throw new Error(WM.i18n.t('err_gl_no_snippet'));
    }

    isSyncBusy = true;
    try {
      var remoteRes = await fetchActiveRemoteState(false);
      if (remoteRes.notFound || !remoteRes.state) {
        throw new Error(WM.i18n.t('err_cloud_empty'));
      }
      if (hasPendingChanges() || mergeInsteadOfReplace) {
        WM.storage.mergeRemoteState(remoteRes.state);
        isSyncBusy = false;
        await pushToCloud(false);
        return WM.storage.getState();
      }
      WM.storage.replaceState(remoteRes.state, true);
      saveSettings({ lastSyncAt: new Date().toISOString() });
      return remoteRes.state;
    } finally {
      isSyncBusy = false;
    }
  }

  async function checkForRemoteUpdates(force) {
    var p = getProvider();
    if (p === 'local' || !isConnected() || !settings.autoSync) return false;
    if (p === 'github' && !settings.gistId) return false;
    if (p === 'gitlab' && !settings.gitlabSnippetId) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    if (isSyncBusy || autoSyncTimer) return false;
    if (document.hidden && !force) return false;

    if (hasPendingChanges()) {
      try {
        await pushToCloud(true);
        return true;
      } catch (e) {
        return false;
      }
    }

    var now = Date.now();
    if (!force && now - lastPullAttemptAt < WM.CONFIG.AUTO_PULL_MIN_GAP_MS) {
      return false;
    }
    lastPullAttemptAt = now;

    isSyncBusy = true;
    try {
      var res = await fetchActiveRemoteState(true);
      if (res.notModified || !res.state) return false;

      var localUpdatedAt = WM.storage.getState().updatedAt || '';
      var remoteUpdatedAt = res.state.updatedAt || '';
      if (remoteUpdatedAt && remoteUpdatedAt === localUpdatedAt) {
        return false;
      }

      WM.storage.replaceState(res.state, true);
      saveSettings({ lastSyncAt: new Date().toISOString() });
      return true;
    } catch (e) {
      return false;
    } finally {
      isSyncBusy = false;
    }
  }

  function scheduleAutoPush(onStatusChange) {
    var p = getProvider();
    if (p === 'local' || !isConnected() || !settings.autoSync) return;
    setPendingChanges(true);

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (onStatusChange) onStatusChange('pending', 'OFFLINE // SAVED');
      return;
    }

    if (onStatusChange) onStatusChange('pending', 'SYNC // WAIT...');
    clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(async function () {
      autoSyncTimer = null;
      try {
        await pushToCloud(true);
        if (onStatusChange) {
          onStatusChange('ok', getProviderBadge() + ' // ' + WM.utils.formatTime(settings.lastSyncAt));
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
      throw new Error(WM.i18n.t('err_bad_json'));
    }
    WM.storage.replaceState(parsed, false);
    return parsed;
  }

  WM.sync = {
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    getSettings: function () { return settings; },
    getProvider: getProvider,
    getProviderBadge: getProviderBadge,
    getEffectiveDropboxAppKey: getEffectiveDropboxAppKey,
    isConnected: isConnected,
    hasToken: isConnected,
    canUploadPhotos: canUploadPhotos,
    hasPendingChanges: hasPendingChanges,
    findExistingGist: findExistingGist,
    findExistingGitLabSnippet: findExistingGitLabSnippet,
    startDropboxOAuth: startDropboxOAuth,
    handleOAuthCallbackIfPresent: handleOAuthCallbackIfPresent,
    disconnectDropbox: disconnectDropbox,
    uploadDropboxBinary: uploadDropboxBinary,
    downloadDropboxBinary: downloadDropboxBinary,
    deleteDropboxPath: deleteDropboxPath,
    pushToCloud: pushToCloud,
    pullFromCloud: pullFromCloud,
    pushToGist: pushToCloud,
    pullFromGist: pullFromCloud,
    checkForRemoteUpdates: checkForRemoteUpdates,
    scheduleAutoPush: scheduleAutoPush,
    downloadJsonFile: downloadJsonFile,
    importJsonText: importJsonText
  };
})(window);
