/* ==========================================================================
   WM_CHECKLIST — КЛИЕНТСКАЯ ОБРАБОТКА, ОБЕЗВРЕЖИВАНИЕ И ЗАГРУЗКА ФОТО (WebP)
   ========================================================================== */
(function (global) {
  'use strict';

  var WM = (global.WMChecklist = global.WMChecklist || {});
  var DBX_PREFIX = 'dbx://';
  var blobUrlCache = {};
  var inflightLoads = {};

  function isDropboxPhoto(ref) {
    var s = String(ref || '').trim();
    if (s.indexOf(DBX_PREFIX) !== 0) return false;
    if (s.indexOf('..') !== -1) return false;
    return /^dbx:\/\/photos\/[a-zA-Z0-9._\/-]+$/.test(s);
  }

  function refToDropboxPath(ref) {
    if (!isDropboxPhoto(ref)) return '';
    return '/' + String(ref).slice(DBX_PREFIX.length);
  }

  function sanitizePathSegment(seg) {
    var clean = String(seg || 'item').replace(/[^a-zA-Z0-9_-]/g, '_');
    return clean.slice(0, 64) || 'item';
  }

  function loadBitmapOrImage(file) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(file).then(function (bmp) {
        return {
          source: bmp,
          width: bmp.width,
          height: bmp.height,
          cleanup: function () {
            if (typeof bmp.close === 'function') bmp.close();
          }
        };
      });
    }
    return new Promise(function (resolve, reject) {
      var objUrl = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(objUrl);
        resolve({
          source: img,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          cleanup: function () {}
        });
      };
      img.onerror = function () {
        URL.revokeObjectURL(objUrl);
        reject(new Error(WM.i18n.t('err_photo_corrupt')));
      };
      img.src = objUrl;
    });
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise(function (resolve) {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob(function (blob) { resolve(blob); }, mime, quality);
      } else {
        resolve(null);
      }
    });
  }

  /* Полное перекодирование через Canvas:
     1) Проверяет размер (<= 20 МБ) и MIME (запрещает SVG/HTML/скрипты)
     2) Декодирует растр нативным декодером браузера (отсеивает битые/поддельные файлы)
     3) Перерисовывает пиксели на чистый Canvas <= 1280px (удаляет EXIF/GPS и полиглот-хвосты)
     4) Сжимает в WebP (качество 0.82, фолбэк JPEG если браузер не умеет WebP) */
  async function processAndSanitizeImage(file) {
    if (!file) throw new Error(WM.i18n.t('err_photo_corrupt'));

    var maxBytes = WM.CONFIG.PHOTO_MAX_INPUT_BYTES || (20 * 1024 * 1024);
    if (file.size > maxBytes) {
      throw new Error(WM.i18n.t('err_photo_too_large'));
    }

    var mime = String(file.type || '').toLowerCase();
    if (mime && (mime.indexOf('svg') !== -1 || mime.indexOf('html') !== -1 || mime.indexOf('image/') !== 0)) {
      throw new Error(WM.i18n.t('err_photo_bad_type'));
    }
    if (!mime) {
      var nameLower = String(file.name || '').toLowerCase();
      if (/\.(svg|html|htm|js|exe|php|sh|zip)$/i.test(nameLower)) {
        throw new Error(WM.i18n.t('err_photo_bad_type'));
      }
    }

    var decoded;
    try {
      decoded = await loadBitmapOrImage(file);
    } catch (e) {
      throw new Error(WM.i18n.t('err_photo_corrupt'));
    }

    try {
      var w = decoded.width;
      var h = decoded.height;
      if (!w || !h || w < 1 || h < 1) {
        throw new Error(WM.i18n.t('err_photo_corrupt'));
      }

      var maxSide = WM.CONFIG.PHOTO_MAX_SIDE || 1280;
      var scale = Math.min(1, maxSide / Math.max(w, h));
      var outW = Math.max(1, Math.round(w * scale));
      var outH = Math.max(1, Math.round(h * scale));

      var canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      var ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(WM.i18n.t('err_photo_corrupt'));
      ctx.drawImage(decoded.source, 0, 0, outW, outH);

      var quality = WM.CONFIG.PHOTO_WEBP_QUALITY || 0.82;
      var blob = await canvasToBlob(canvas, 'image/webp', quality);
      var ext = 'webp';
      if (!blob || blob.type !== 'image/webp') {
        blob = await canvasToBlob(canvas, 'image/jpeg', 0.85);
        ext = 'jpg';
      }
      if (!blob) throw new Error(WM.i18n.t('err_photo_corrupt'));

      return {
        blob: blob,
        ext: ext,
        width: outW,
        height: outH,
        sizeBytes: blob.size
      };
    } finally {
      if (decoded && typeof decoded.cleanup === 'function') decoded.cleanup();
    }
  }

  async function uploadItemPhoto(itemId, file) {
    if (!WM.sync || !WM.sync.canUploadPhotos()) {
      throw new Error(WM.i18n.t('err_photo_need_dropbox'));
    }
    var processed = await processAndSanitizeImage(file);
    var safeFolder = sanitizePathSegment(itemId || WM.utils.uid('tmp'));
    var fileName = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6) + '.' + processed.ext;
    var dbxPath = (WM.CONFIG.DROPBOX_PHOTOS_DIR || '/photos') + '/' + safeFolder + '/' + fileName;

    await WM.sync.uploadDropboxBinary(dbxPath, processed.blob);

    var ref = DBX_PREFIX + dbxPath.replace(/^\/+/, '');
    try {
      blobUrlCache[ref] = URL.createObjectURL(processed.blob);
    } catch (e) {}

    return {
      ref: ref,
      sizeBytes: processed.sizeBytes,
      width: processed.width,
      height: processed.height
    };
  }

  async function resolvePhotoUrl(ref) {
    var s = String(ref || '').trim();
    if (!s) return '';
    if (!isDropboxPhoto(s)) {
      return WM.utils.sanitizeUrl(s);
    }
    if (blobUrlCache[s]) return blobUrlCache[s];
    if (inflightLoads[s]) return inflightLoads[s];

    if (!WM.sync || !WM.sync.canUploadPhotos()) {
      return '';
    }

    var dbxPath = refToDropboxPath(s);
    inflightLoads[s] = WM.sync.downloadDropboxBinary(dbxPath)
      .then(function (blob) {
        var objUrl = URL.createObjectURL(blob);
        blobUrlCache[s] = objUrl;
        delete inflightLoads[s];
        return objUrl;
      })
      .catch(function () {
        delete inflightLoads[s];
        return '';
      });

    return inflightLoads[s];
  }

  function getPhotoFolderPath(ref) {
    var p = refToDropboxPath(ref);
    if (!p) return '';
    var idx = p.lastIndexOf('/');
    if (idx <= 0) return '';
    var folder = p.slice(0, idx);
    var rootDir = WM.CONFIG.DROPBOX_PHOTOS_DIR || '/photos';
    return folder === rootDir ? '' : folder;
  }

  function revokeCachedBlob(ref) {
    if (blobUrlCache[ref]) {
      try { URL.revokeObjectURL(blobUrlCache[ref]); } catch (e) {}
      delete blobUrlCache[ref];
    }
  }

  function deletePhoto(ref) {
    if (!isDropboxPhoto(ref)) return Promise.resolve();
    revokeCachedBlob(ref);
    if (!WM.sync || !WM.sync.canUploadPhotos()) return Promise.resolve();
    var dbxPath = refToDropboxPath(ref);
    return WM.sync.deleteDropboxPath(dbxPath).catch(function () {});
  }

  /* Умное удаление: если в папке /photos/<id> больше не остаётся фото — удаляем всю папку целиком */
  function deletePhotosAndEmptyFolders(removedRefs, remainingRefs) {
    var removed = (Array.isArray(removedRefs) ? removedRefs : []).filter(isDropboxPhoto);
    if (removed.length === 0) return Promise.resolve();

    removed.forEach(revokeCachedBlob);
    if (!WM.sync || !WM.sync.canUploadPhotos()) return Promise.resolve();

    var stillUsedFolders = {};
    (Array.isArray(remainingRefs) ? remainingRefs : []).filter(isDropboxPhoto).forEach(function (ref) {
      var folder = getPhotoFolderPath(ref);
      if (folder) stillUsedFolders[folder] = true;
    });

    var foldersToDelete = {};
    var filesToDelete = [];

    removed.forEach(function (ref) {
      var folder = getPhotoFolderPath(ref);
      if (folder && !stillUsedFolders[folder]) {
        foldersToDelete[folder] = true;
      } else {
        filesToDelete.push(refToDropboxPath(ref));
      }
    });

    var tasks = [];
    Object.keys(foldersToDelete).forEach(function (folderPath) {
      tasks.push(WM.sync.deleteDropboxPath(folderPath).catch(function () {}));
    });
    filesToDelete.forEach(function (filePath) {
      tasks.push(WM.sync.deleteDropboxPath(filePath).catch(function () {}));
    });
    return Promise.all(tasks);
  }

  var UNSAVED_KEY = 'wm_dbx_unsaved_photos_v1';

  function loadUnsavedRefs() {
    try {
      var raw = localStorage.getItem(UNSAVED_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(isDropboxPhoto) : [];
    } catch (e) {
      return [];
    }
  }

  function saveUnsavedRefs(arr) {
    try {
      if (!arr || arr.length === 0) localStorage.removeItem(UNSAVED_KEY);
      else localStorage.setItem(UNSAVED_KEY, JSON.stringify(arr));
    } catch (e) {}
  }

  function trackUnsavedPhoto(ref) {
    if (!isDropboxPhoto(ref)) return;
    var arr = loadUnsavedRefs();
    if (arr.indexOf(ref) === -1) {
      arr.push(ref);
      saveUnsavedRefs(arr);
    }
  }

  function untrackUnsavedPhotos(refs) {
    var list = Array.isArray(refs) ? refs : [refs];
    if (list.length === 0) return;
    var arr = loadUnsavedRefs().filter(function (r) {
      return list.indexOf(r) === -1;
    });
    saveUnsavedRefs(arr);
  }

  /* При перезагрузке страницы автоматически удаляем «осиротевшие» фото от несохранённых черновиков */
  function cleanupOrphanDraftPhotos(state) {
    var unsaved = loadUnsavedRefs();
    if (unsaved.length === 0) return Promise.resolve();
    if (!WM.sync || !WM.sync.canUploadPhotos()) return Promise.resolve();

    var usedSet = {};
    if (state && Array.isArray(state.tabs)) {
      state.tabs.forEach(function (t) {
        (t.items || []).forEach(function (it) {
          (it.images || []).forEach(function (u) {
            if (isDropboxPhoto(u)) usedSet[u] = true;
          });
        });
      });
    }

    var orphans = unsaved.filter(function (r) { return !usedSet[r]; });
    var usedList = Object.keys(usedSet);
    saveUnsavedRefs([]);
    if (orphans.length === 0) return Promise.resolve();
    return deletePhotosAndEmptyFolders(orphans, usedList);
  }

  function deleteItemPhotos(item) {
    if (!item || !Array.isArray(item.images)) return Promise.resolve();
    return deletePhotosAndEmptyFolders(item.images, []);
  }

  function deleteItemsPhotos(items) {
    var allRefs = [];
    (Array.isArray(items) ? items : []).forEach(function (it) {
      if (it && Array.isArray(it.images)) {
        it.images.forEach(function (u) {
          if (isDropboxPhoto(u)) allRefs.push(u);
        });
      }
    });
    if (allRefs.length === 0) return Promise.resolve();
    return deletePhotosAndEmptyFolders(allRefs, []);
  }

  WM.photos = {
    isDropboxPhoto: isDropboxPhoto,
    processAndSanitizeImage: processAndSanitizeImage,
    uploadItemPhoto: uploadItemPhoto,
    resolvePhotoUrl: resolvePhotoUrl,
    deletePhoto: deletePhoto,
    deletePhotosAndEmptyFolders: deletePhotosAndEmptyFolders,
    deleteItemPhotos: deleteItemPhotos,
    deleteItemsPhotos: deleteItemsPhotos,
    trackUnsavedPhoto: trackUnsavedPhoto,
    untrackUnsavedPhotos: untrackUnsavedPhotos,
    cleanupOrphanDraftPhotos: cleanupOrphanDraftPhotos
  };
})(window);
