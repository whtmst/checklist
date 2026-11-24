/* ==========================================================================
   WM_CHECKLIST — ХРАНИЛИЩЕ, ЕДИНЫЙ РЕЕСТР КРЕДИТОВ И ОФЛАЙН-АВТОСЛИЯНИЕ (v4)
   ========================================================================== */
(function (global) {
  'use strict';

  var WM = (global.WMChecklist = global.WMChecklist || {});
  var TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 дней

  function nowIso() {
    return new Date().toISOString();
  }

  function parseTs(iso) {
    var t = Date.parse(iso || '');
    return isFinite(t) ? t : 0;
  }

  function normalizeName(name) {
    return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function createDefaultStores() {
    return [
      { id: 'st_local', name: 'Local market', hidden: false, builtin: true },
      { id: 'st_birmarket', name: 'Birmarket', hidden: false, builtin: true },
      { id: 'st_temu', name: 'Temu', hidden: false, builtin: true },
      { id: 'st_ozon', name: 'Ozon', hidden: false, builtin: true }
    ];
  }

  function createDefaultPrefs() {
    return {
      currency: WM.CONFIG.CURRENCY || '₼',
      lang: (WM.i18n && WM.i18n.getLang) ? WM.i18n.getLang() : 'en',
      backupReminderDays: 14,
      stores: createDefaultStores(),
      hiddenCreditTypes: [],
      customCreditTypes: []
    };
  }

  function sanitizePrefs(rawPrefs, tabs, bundles) {
    var def = createDefaultPrefs();
    var p = (rawPrefs && typeof rawPrefs === 'object') ? rawPrefs : {};
    var currency = String(p.currency || '').trim().slice(0, 5) || def.currency;

    var stores = [];
    var seenStoreIds = {};
    var seenStoreNames = {};

    if (Array.isArray(p.stores) && p.stores.length > 0) {
      p.stores.forEach(function (s) {
        if (!s || typeof s !== 'object') return;
        var name = String(s.name || '').trim();
        var key = normalizeName(name);
        if (!name || !key || seenStoreNames[key]) return;
        var id = String(s.id || WM.utils.uid('st'));
        if (seenStoreIds[id]) id = WM.utils.uid('st');
        seenStoreIds[id] = true;
        seenStoreNames[key] = true;
        stores.push({
          id: id,
          name: name,
          hidden: !!s.hidden,
          builtin: !!s.builtin
        });
      });
    } else {
      stores = createDefaultStores();
      stores.forEach(function (s) {
        seenStoreIds[s.id] = true;
        seenStoreNames[normalizeName(s.name)] = true;
      });
    }

    // Автоматически подхватываем пользовательские магазины из уже существующих карточек
    if (Array.isArray(tabs)) {
      tabs.forEach(function (t) {
        if (!Array.isArray(t.items)) return;
        t.items.forEach(function (it) {
          var sName = String(it.store || '').trim();
          var key = normalizeName(sName);
          if (sName && key && !seenStoreNames[key]) {
            seenStoreNames[key] = true;
            stores.push({
              id: WM.utils.uid('st'),
              name: sName,
              hidden: false,
              builtin: false
            });
          }
        });
      });
    }

    var allowedBuiltinCredit = ['installment', 'ninja', 'grace'];
    var hiddenCreditTypes = Array.isArray(p.hiddenCreditTypes)
      ? p.hiddenCreditTypes.filter(function (id, idx, arr) {
          return allowedBuiltinCredit.indexOf(id) !== -1 && arr.indexOf(id) === idx;
        })
      : [];

    var customCreditTypes = [];
    var seenCtNames = {};
    if (Array.isArray(p.customCreditTypes)) {
      p.customCreditTypes.forEach(function (ct) {
        if (!ct || typeof ct !== 'object') return;
        var name = String(ct.name || '').trim();
        var key = normalizeName(name);
        if (!name || !key || seenCtNames[key]) return;
        seenCtNames[key] = true;
        customCreditTypes.push({
          id: String(ct.id || WM.utils.uid('ct')),
          name: name,
          hidden: !!ct.hidden
        });
      });
    }

    // Автоматически подхватываем пользовательские названия из уже оформленных кредитов
    if (Array.isArray(bundles)) {
      bundles.forEach(function (b) {
        if (b && b.type === 'custom' && b.customType) {
          var name = String(b.customType).trim();
          var key = normalizeName(name);
          if (name && key && !seenCtNames[key]) {
            seenCtNames[key] = true;
            customCreditTypes.push({
              id: WM.utils.uid('ct'),
              name: name,
              hidden: false
            });
          }
        }
      });
    }

    var allowedLangs = ['ru', 'en', 'az'];
    var lang = allowedLangs.indexOf(p.lang) !== -1 ? p.lang : def.lang;
    var allowedDays = [0, 7, 14, 30];
    var remDays = allowedDays.indexOf(Number(p.backupReminderDays)) !== -1 ? Number(p.backupReminderDays) : 14;

    return {
      currency: currency,
      lang: lang,
      backupReminderDays: remDays,
      stores: stores,
      hiddenCreditTypes: hiddenCreditTypes,
      customCreditTypes: customCreditTypes
    };
  }

  function createEmptyTab(name) {
    var ts = nowIso();
    return {
      id: WM.utils.uid('tab'),
      name: name || 'Main',
      updatedAt: ts,
      categories: [],
      items: []
    };
  }

  function createDefaultState() {
    var ts = nowIso();
    var mainTab = createEmptyTab('Main');
    return {
      version: 4,
      updatedAt: ts,
      metaUpdatedAt: ts,
      activeTabId: mainTab.id,
      cardLimit: 0,
      monthlyIncome: 0,
      prefs: createDefaultPrefs(),
      deleted: {},
      creditBundles: [],
      tabs: [mainTab]
    };
  }

  function sanitizeDate(val) {
    var s = String(val || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }

  function sanitizeImages(arr) {
    if (!Array.isArray(arr)) return [];
    var out = [];
    for (var i = 0; i < arr.length && out.length < 3; i++) {
      var u = WM.utils.sanitizeImageUrl(arr[i]);
      if (u) out.push(u);
    }
    return out;
  }

  function sanitizeCreditType(val) {
    var allowed = ['installment', 'ninja', 'grace', 'custom'];
    return allowed.indexOf(val) !== -1 ? val : 'installment';
  }

  function sanitizeDeleted(rawDel) {
    var res = {};
    if (!rawDel || typeof rawDel !== 'object') return res;
    var cutoff = Date.now() - TOMBSTONE_TTL_MS;
    Object.keys(rawDel).forEach(function (id) {
      var ts = parseTs(rawDel[id]);
      if (ts > cutoff) {
        res[String(id)] = String(rawDel[id]);
      }
    });
    return res;
  }

  function sanitizeBundle(b, fallbackTs) {
    return {
      id: String(b.id || WM.utils.uid('bundle')),
      name: String(b.name || 'Credit').trim() || 'Credit',
      type: sanitizeCreditType(b.type),
      customType: String(b.customType || '').trim(),
      itemIds: Array.isArray(b.itemIds) ? b.itemIds.map(String) : [],
      months: Math.max(0, parseInt(b.months, 10) || 0),
      monthlyPayment: WM.utils.toNumber(b.monthlyPayment),
      totalAmount: WM.utils.toNumber(b.totalAmount),
      startDate: sanitizeDate(b.startDate),
      dueDate: sanitizeDate(b.dueDate),
      checked: !!b.checked,
      paidOff: !!b.paidOff,
      paidOffAt: String(b.paidOffAt || ''),
      updatedAt: b.updatedAt || fallbackTs || nowIso()
    };
  }

  function sanitizeState(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tabs) || raw.tabs.length === 0) {
      return createDefaultState();
    }

    var fallbackTs = raw.updatedAt || nowIso();
    var globalBundles = Array.isArray(raw.creditBundles)
      ? raw.creditBundles.map(function (b) { return sanitizeBundle(b, fallbackTs); })
      : [];

    var seenBundleIds = {};
    globalBundles.forEach(function (b) { seenBundleIds[b.id] = true; });

    var tabs = raw.tabs.map(function (t) {
      if (Array.isArray(t.creditBundles)) {
        t.creditBundles.forEach(function (oldB) {
          var sb = sanitizeBundle(oldB, fallbackTs);
          if (!seenBundleIds[sb.id]) {
            seenBundleIds[sb.id] = true;
            globalBundles.push(sb);
          }
        });
      }

      return {
        id: String(t.id || WM.utils.uid('tab')),
        name: String(t.name || 'Untitled').trim() || 'Untitled',
        updatedAt: t.updatedAt || fallbackTs,
        categories: Array.isArray(t.categories)
          ? t.categories.map(function (c) {
              return {
                id: String(c.id || WM.utils.uid('cat')),
                name: String(c.name || 'Category').trim() || 'Category',
                collapsed: !!c.collapsed,
                updatedAt: c.updatedAt || fallbackTs
              };
            })
          : [],
        items: Array.isArray(t.items)
          ? t.items.map(function (it) {
              var itemId = String(it.id || WM.utils.uid('item'));
              var title = String(it.title || 'Untitled').trim() || 'Untitled';
              var price = WM.utils.toNumber(it.price);

              var alreadyBundled = globalBundles.some(function (b) {
                return b.itemIds.indexOf(itemId) !== -1;
              });

              if (!alreadyBundled && it.credit && it.credit.enabled) {
                var migrated = sanitizeBundle({
                  id: WM.utils.uid('bundle'),
                  name: title,
                  type: it.credit.type || 'installment',
                  customType: it.credit.customType || '',
                  itemIds: [itemId],
                  months: it.credit.months || 0,
                  monthlyPayment: it.credit.monthlyPayment || 0,
                  totalAmount: WM.utils.toNumber(it.credit.totalAmount) || price,
                  startDate: it.credit.startDate || '',
                  dueDate: it.credit.dueDate || '',
                  checked: !!it.checked,
                  updatedAt: it.updatedAt || fallbackTs
                }, fallbackTs);
                globalBundles.push(migrated);
              }

              return {
                id: itemId,
                categoryId: String(it.categoryId || ''),
                title: title,
                price: price,
                checked: !!it.checked,
                priority: String(it.priority || 'medium'),
                store: String(it.store || WM.CONFIG.STORES[0]),
                link: WM.utils.sanitizeUrl(it.link),
                note: String(it.note || '').trim(),
                images: sanitizeImages(it.images),
                bundleId: null,
                createdAt: it.createdAt || fallbackTs,
                updatedAt: it.updatedAt || it.createdAt || fallbackTs
              };
            })
          : []
      };
    });

    var existingItems = {};
    tabs.forEach(function (t) {
      t.items.forEach(function (it) { existingItems[it.id] = it; });
    });

    globalBundles = globalBundles.map(function (b) {
      b.itemIds = b.itemIds.filter(function (id) { return !!existingItems[id]; });
      return b;
    }).filter(function (b) { return b.itemIds.length > 0; });

    globalBundles.forEach(function (b) {
      b.itemIds.forEach(function (id) {
        if (existingItems[id]) existingItems[id].bundleId = b.id;
      });
    });

    var isAllTab = raw.activeTabId === WM.CONFIG.ALL_TAB_ID;
    var activeExists = isAllTab || tabs.some(function (t) { return t.id === raw.activeTabId; });
    return {
      version: 4,
      updatedAt: fallbackTs,
      metaUpdatedAt: raw.metaUpdatedAt || fallbackTs,
      activeTabId: activeExists ? raw.activeTabId : tabs[0].id,
      cardLimit: WM.utils.toNumber(raw.cardLimit),
      monthlyIncome: WM.utils.toNumber(raw.monthlyIncome),
      prefs: sanitizePrefs(raw.prefs, tabs, globalBundles),
      deleted: sanitizeDeleted(raw.deleted),
      creditBundles: globalBundles,
      tabs: tabs
    };
  }

  /* Автоматическое поэлементное слияние офлайн-правок (local) и данных с другого устройства (remote) */
  function mergeEntityArrays(localArr, remoteArr, mergedDeleted, primaryFirst) {
    var localMap = {};
    var remoteMap = {};
    localArr.forEach(function (x) { localMap[x.id] = x; });
    remoteArr.forEach(function (x) { remoteMap[x.id] = x; });

    var orderIds = [];
    var seen = {};
    var first = primaryFirst ? localArr : remoteArr;
    var second = primaryFirst ? remoteArr : localArr;
    first.forEach(function (x) { if (!seen[x.id]) { seen[x.id] = true; orderIds.push(x.id); } });
    second.forEach(function (x) { if (!seen[x.id]) { seen[x.id] = true; orderIds.push(x.id); } });

    var result = [];
    orderIds.forEach(function (id) {
      var loc = localMap[id];
      var rem = remoteMap[id];
      var delTs = parseTs(mergedDeleted[id]);
      var locTs = loc ? parseTs(loc.updatedAt) : 0;
      var remTs = rem ? parseTs(rem.updatedAt) : 0;
      var winner = null;
      var winTs = 0;

      if (loc && rem) {
        if (locTs >= remTs) { winner = loc; winTs = locTs; }
        else { winner = rem; winTs = remTs; }
      } else if (loc) {
        winner = loc; winTs = locTs;
      } else if (rem) {
        winner = rem; winTs = remTs;
      }

      if (winner && delTs > winTs) {
        return; // Удалено позже последнего редактирования
      }
      if (winner) result.push(winner);
    });

    return result;
  }

  function mergeStates(localRaw, remoteRaw) {
    var loc = sanitizeState(localRaw);
    var rem = sanitizeState(remoteRaw);
    var localNewer = parseTs(loc.updatedAt) >= parseTs(rem.updatedAt);

    // 1. Объединяем tombstones (удалённые ID)
    var mergedDeleted = {};
    Object.keys(loc.deleted).forEach(function (id) { mergedDeleted[id] = loc.deleted[id]; });
    Object.keys(rem.deleted).forEach(function (id) {
      if (!mergedDeleted[id] || parseTs(rem.deleted[id]) > parseTs(mergedDeleted[id])) {
        mergedDeleted[id] = rem.deleted[id];
      }
    });

    // 2. Собираем глобальную карту позиций (если карточку перенесли в другую вкладку — побеждает самая свежая версия!)
    var locItemsById = {};
    var remItemsById = {};
    loc.tabs.forEach(function (t) {
      t.items.forEach(function (it) { locItemsById[it.id] = { tabId: t.id, item: it }; });
    });
    rem.tabs.forEach(function (t) {
      t.items.forEach(function (it) { remItemsById[it.id] = { tabId: t.id, item: it }; });
    });

    var winningItemPlacement = {};
    var allItemIds = {};
    Object.keys(locItemsById).forEach(function (id) { allItemIds[id] = true; });
    Object.keys(remItemsById).forEach(function (id) { allItemIds[id] = true; });

    Object.keys(allItemIds).forEach(function (id) {
      var l = locItemsById[id];
      var r = remItemsById[id];
      var delTs = parseTs(mergedDeleted[id]);
      var lTs = l ? parseTs(l.item.updatedAt) : 0;
      var rTs = r ? parseTs(r.item.updatedAt) : 0;
      var win = null;
      var wTs = 0;

      if (l && r) {
        if (lTs >= rTs) { win = l; wTs = lTs; }
        else { win = r; wTs = rTs; }
      } else if (l) {
        win = l; wTs = lTs;
      } else if (r) {
        win = r; wTs = rTs;
      }

      if (win && delTs <= wTs) {
        winningItemPlacement[id] = win;
      }
    });

    // 3. Объединяем вкладки и категории внутри них
    var locTabMap = {};
    var remTabMap = {};
    loc.tabs.forEach(function (t) { locTabMap[t.id] = t; });
    rem.tabs.forEach(function (t) { remTabMap[t.id] = t; });

    var mergedTabShells = mergeEntityArrays(loc.tabs, rem.tabs, mergedDeleted, localNewer);
    var mergedTabs = mergedTabShells.map(function (shell) {
      var lt = locTabMap[shell.id];
      var rt = remTabMap[shell.id];
      var mergedCats = mergeEntityArrays(
        lt ? lt.categories : [],
        rt ? rt.categories : [],
        mergedDeleted,
        localNewer
      ).map(function (c) {
        // Локальное состояние свёрнутости сохраняем с текущего устройства
        var localCat = lt && lt.categories.find(function (x) { return x.id === c.id; });
        return {
          id: c.id,
          name: c.name,
          collapsed: localCat ? !!localCat.collapsed : !!c.collapsed,
          updatedAt: c.updatedAt
        };
      });

      var tabItems = [];
      Object.keys(winningItemPlacement).forEach(function (itemId) {
        var placed = winningItemPlacement[itemId];
        if (placed.tabId === shell.id) {
          tabItems.push(placed.item);
        }
      });

      return {
        id: shell.id,
        name: shell.name,
        updatedAt: shell.updatedAt,
        categories: mergedCats,
        items: tabItems
      };
    });

    // 3b. Склейка одноимённых вкладок (если параллельно создали вкладку с одинаковым именем)
    var mergeNow = nowIso();
    var resolvedActiveTabId = loc.activeTabId;
    var dedupedTabs = [];
    var tabByNormName = {};
    mergedTabs.forEach(function (tab) {
      var key = normalizeName(tab.name);
      if (key && tabByNormName[key]) {
        var targetTab = tabByNormName[key];
        if (parseTs(tab.updatedAt) > parseTs(targetTab.updatedAt)) {
          targetTab.updatedAt = tab.updatedAt;
        }
        tab.categories.forEach(function (c) { targetTab.categories.push(c); });
        tab.items.forEach(function (it) { targetTab.items.push(it); });
        if (resolvedActiveTabId === tab.id) {
          resolvedActiveTabId = targetTab.id;
        }
        mergedDeleted[tab.id] = mergeNow;
      } else {
        if (key) tabByNormName[key] = tab;
        dedupedTabs.push(tab);
      }
    });
    mergedTabs = dedupedTabs;

    // 3c. Склейка одноимённых категорий строго ВНУТРИ каждой вкладки
    mergedTabs.forEach(function (tab) {
      var uniqueCats = [];
      var catByNormName = {};
      var catIdRemap = {};

      tab.categories.forEach(function (cat) {
        var key = normalizeName(cat.name);
        if (key && catByNormName[key]) {
          var keepCat = catByNormName[key];
          if (parseTs(cat.updatedAt) > parseTs(keepCat.updatedAt)) {
            keepCat.updatedAt = cat.updatedAt;
          }
          catIdRemap[cat.id] = keepCat.id;
          mergedDeleted[cat.id] = mergeNow;
        } else {
          if (key) catByNormName[key] = cat;
          uniqueCats.push(cat);
        }
      });

      if (Object.keys(catIdRemap).length > 0) {
        tab.categories = uniqueCats;
        tab.items.forEach(function (it) {
          if (catIdRemap[it.categoryId]) {
            it.categoryId = catIdRemap[it.categoryId];
            it.updatedAt = mergeNow;
          }
        });
      }
    });

    if (mergedTabs.length === 0) {
      mergedTabs = [createEmptyTab('Main')];
    }

    // 4. Объединяем глобальные кредиты
    var mergedBundles = mergeEntityArrays(loc.creditBundles, rem.creditBundles, mergedDeleted, localNewer);

    // 5. Мета-поля (лимит карты, доход и общие настройки)
    var locMetaNewer = parseTs(loc.metaUpdatedAt) >= parseTs(rem.metaUpdatedAt);
    var cardLimit = locMetaNewer ? (loc.cardLimit || rem.cardLimit) : (rem.cardLimit || loc.cardLimit);
    var monthlyIncome = locMetaNewer ? (loc.monthlyIncome || rem.monthlyIncome) : (rem.monthlyIncome || loc.monthlyIncome);
    var winningPrefs = locMetaNewer ? loc.prefs : rem.prefs;

    return sanitizeState({
      version: 4,
      updatedAt: nowIso(),
      metaUpdatedAt: locMetaNewer ? loc.metaUpdatedAt : rem.metaUpdatedAt,
      activeTabId: resolvedActiveTabId,
      cardLimit: cardLimit,
      monthlyIncome: monthlyIncome,
      prefs: winningPrefs,
      deleted: mergedDeleted,
      creditBundles: mergedBundles,
      tabs: mergedTabs
    });
  }

  var state = createDefaultState();
  var onChangeListeners = [];

  function markDeleted(id) {
    if (!id) return;
    if (!state.deleted || typeof state.deleted !== 'object') state.deleted = {};
    state.deleted[String(id)] = nowIso();
  }

  function load() {
    try {
      var text = localStorage.getItem(WM.CONFIG.STORAGE_KEY);
      if (text) {
        state = sanitizeState(JSON.parse(text));
        return state;
      }
    } catch (e) {}
    state = createDefaultState();
    return state;
  }

  function persist(skipNotify, keepUpdatedAt) {
    if (!keepUpdatedAt) {
      state.updatedAt = nowIso();
    }
    try {
      localStorage.setItem(WM.CONFIG.STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
    if (!skipNotify) {
      onChangeListeners.forEach(function (fn) { fn(state); });
    }
  }

  function isAllTabActive() {
    return state.activeTabId === WM.CONFIG.ALL_TAB_ID;
  }

  function getActiveTab() {
    for (var i = 0; i < state.tabs.length; i++) {
      if (state.tabs[i].id === state.activeTabId) return state.tabs[i];
    }
    if (!isAllTabActive()) {
      state.activeTabId = state.tabs[0].id;
    }
    return state.tabs[0];
  }

  function getTotalItemsCount() {
    var total = 0;
    state.tabs.forEach(function (t) { total += t.items.length; });
    return total;
  }

  function calculateAllTabsTotals() {
    var spentTotal = 0;
    var spentCash = 0;
    var spentCredit = 0;
    var monthlyCreditTotal = 0;
    var activeCreditsCount = 0;
    var plannedTotal = 0;
    var plannedCash = 0;
    var plannedCredit = 0;
    var totalItemsCount = 0;
    var checkedItemsCount = 0;

    var bundledItemSet = {};
    state.creditBundles.forEach(function (b) {
      b.itemIds.forEach(function (id) { bundledItemSet[id] = b.id; });
    });

    state.tabs.forEach(function (tab) {
      tab.items.forEach(function (it) {
        totalItemsCount++;
        if (it.checked) checkedItemsCount++;
        if (bundledItemSet[it.id]) return;
        plannedTotal += it.price;
        plannedCash += it.price;
        if (it.checked) {
          spentTotal += it.price;
          spentCash += it.price;
        }
      });
    });

    state.creditBundles.forEach(function (b) {
      plannedTotal += b.totalAmount;
      plannedCredit += b.totalAmount;
      if (b.checked || b.paidOff) {
        spentTotal += b.totalAmount;
        spentCredit += b.totalAmount;
      }
      if (b.checked && !b.paidOff) {
        activeCreditsCount++;
        if (b.type !== 'grace') {
          monthlyCreditTotal += b.monthlyPayment;
        }
      }
    });

    return {
      spentTotal: WM.utils.toNumber(spentTotal),
      spentCash: WM.utils.toNumber(spentCash),
      spentCredit: WM.utils.toNumber(spentCredit),
      monthlyCreditTotal: WM.utils.toNumber(monthlyCreditTotal),
      activeCreditsCount: activeCreditsCount,
      plannedTotal: WM.utils.toNumber(plannedTotal),
      plannedCash: WM.utils.toNumber(plannedCash),
      plannedCredit: WM.utils.toNumber(plannedCredit),
      checkedItemsCount: checkedItemsCount,
      totalItemsCount: totalItemsCount
    };
  }

  function findItemAcrossTabs(itemId) {
    for (var i = 0; i < state.tabs.length; i++) {
      var tab = state.tabs[i];
      for (var j = 0; j < tab.items.length; j++) {
        if (tab.items[j].id === itemId) {
          return { tab: tab, item: tab.items[j] };
        }
      }
    }
    return null;
  }

  function getBundleForItem(itemId) {
    for (var i = 0; i < state.creditBundles.length; i++) {
      if (state.creditBundles[i].itemIds.indexOf(itemId) !== -1) {
        return state.creditBundles[i];
      }
    }
    return null;
  }

  function getBundleDetails(bundle) {
    var items = [];
    var tabNames = [];
    var tabSeen = {};
    var baseSum = 0;

    bundle.itemIds.forEach(function (id) {
      var found = findItemAcrossTabs(id);
      if (found) {
        items.push(found);
        baseSum += found.item.price;
        if (!tabSeen[found.tab.id]) {
          tabSeen[found.tab.id] = true;
          tabNames.push(found.tab.name);
        }
      }
    });

    return {
      items: items,
      tabNames: tabNames,
      isCrossTab: tabNames.length > 1,
      isSingleItem: items.length === 1,
      baseSum: WM.utils.toNumber(baseSum)
    };
  }

  function cloneItem(it, newCategoryId, forceNewId) {
    var ts = nowIso();
    return {
      id: forceNewId ? WM.utils.uid('item') : it.id,
      categoryId: newCategoryId,
      title: it.title,
      price: it.price,
      checked: it.checked,
      priority: it.priority,
      store: it.store,
      link: it.link,
      note: it.note,
      images: sanitizeImages(it.images),
      bundleId: forceNewId ? null : it.bundleId,
      createdAt: forceNewId ? ts : it.createdAt,
      updatedAt: ts
    };
  }

  function calculateTabTotals(tab) {
    var spentTotal = 0;
    var spentCash = 0;
    var spentCredit = 0;
    var monthlyCreditTotal = 0;
    var activeCreditsCount = 0;
    var plannedTotal = 0;
    var plannedCash = 0;
    var plannedCredit = 0;
    var totalItemsCount = tab.items.length;
    var checkedItemsCount = 0;

    var tabItemSet = {};
    tab.items.forEach(function (it) {
      tabItemSet[it.id] = it;
      if (it.checked) checkedItemsCount++;
    });

    var bundledItemSet = {};
    state.creditBundles.forEach(function (b) {
      b.itemIds.forEach(function (id) { bundledItemSet[id] = b.id; });
    });

    tab.items.forEach(function (it) {
      if (bundledItemSet[it.id]) return;
      plannedTotal += it.price;
      plannedCash += it.price;
      if (it.checked) {
        spentTotal += it.price;
        spentCash += it.price;
      }
    });

    state.creditBundles.forEach(function (b) {
      var tabIdsInBundle = b.itemIds.filter(function (id) { return !!tabItemSet[id]; });
      if (tabIdsInBundle.length === 0) return;

      var details = getBundleDetails(b);
      var tabBaseSum = 0;
      tabIdsInBundle.forEach(function (id) {
        tabBaseSum += tabItemSet[id].price;
      });

      var share = details.baseSum > 0
        ? (tabBaseSum / details.baseSum)
        : (tabIdsInBundle.length / b.itemIds.length);

      var shareTotal = WM.utils.toNumber(b.totalAmount * share);
      var shareMonthly = WM.utils.toNumber(b.monthlyPayment * share);

      plannedTotal += shareTotal;
      plannedCredit += shareTotal;

      if (b.checked || b.paidOff) {
        spentTotal += shareTotal;
        spentCredit += shareTotal;
      }
      if (b.checked && !b.paidOff) {
        activeCreditsCount++;
        if (b.type !== 'grace') {
          monthlyCreditTotal += shareMonthly;
        }
      }
    });

    return {
      spentTotal: WM.utils.toNumber(spentTotal),
      spentCash: WM.utils.toNumber(spentCash),
      spentCredit: WM.utils.toNumber(spentCredit),
      monthlyCreditTotal: WM.utils.toNumber(monthlyCreditTotal),
      activeCreditsCount: activeCreditsCount,
      plannedTotal: WM.utils.toNumber(plannedTotal),
      plannedCash: WM.utils.toNumber(plannedCash),
      plannedCredit: WM.utils.toNumber(plannedCredit),
      checkedItemsCount: checkedItemsCount,
      totalItemsCount: totalItemsCount
    };
  }

  function calculateGlobalCredits() {
    var records = [];
    var monthlyTotal = 0;
    var graceTotal = 0;
    var nearestGrace = null;
    var totalDebtRemaining = 0;
    var activeCount = 0;
    var paidOffCount = 0;

    state.creditBundles.forEach(function (b) {
      var details = getBundleDetails(b);
      var overpay = Math.round((b.totalAmount - details.baseSum) * 100) / 100;
      var sched = b.type !== 'grace' ? WM.utils.calcCreditSchedule(b.startDate, b.months, b.monthlyPayment, b.totalAmount) : null;
      var grace = b.type === 'grace' ? WM.utils.calcGraceStatus(b.dueDate) : null;
      var isPaidOff = !!b.paidOff;
      var remaining = isPaidOff ? 0 : (sched ? sched.remainingAmount : b.totalAmount);

      if (isPaidOff) paidOffCount++;

      records.push({
        id: b.id,
        tabNames: details.tabNames,
        isSingleItem: details.isSingleItem,
        title: b.name,
        type: b.type,
        customType: b.customType,
        checked: !!b.checked,
        paidOff: isPaidOff,
        paidOffAt: b.paidOffAt || '',
        baseSum: details.baseSum,
        totalAmount: b.totalAmount,
        overpay: overpay,
        months: b.months,
        monthlyPayment: b.type === 'grace' ? 0 : b.monthlyPayment,
        startDate: b.startDate,
        dueDate: b.dueDate,
        schedule: sched,
        graceStatus: grace,
        remainingAmount: remaining,
        itemsList: details.items
      });

      if (b.checked && !isPaidOff) {
        activeCount++;
        totalDebtRemaining += remaining;
        if (b.type === 'grace') {
          graceTotal += b.totalAmount;
          if (grace && (!nearestGrace || grace.dueDate < nearestGrace.dueDate)) {
            nearestGrace = grace;
          }
        } else {
          monthlyTotal += b.monthlyPayment;
        }
      }
    });

    var limit = WM.utils.toNumber(state.cardLimit);
    var remainingDebt = WM.utils.toNumber(totalDebtRemaining);
    var cardAvailable = limit > 0 ? Math.round((limit - remainingDebt) * 100) / 100 : 0;
    var limitPct = limit > 0 ? Math.min(100, Math.max(0, Math.round((remainingDebt / limit) * 100))) : 0;

    var monthlySum = WM.utils.toNumber(monthlyTotal);
    var income = WM.utils.toNumber(state.monthlyIncome);
    var incomeAfterCredits = income > 0 ? Math.round((income - monthlySum) * 100) / 100 : 0;
    var incomeLoadPct = income > 0 ? Math.round((monthlySum / income) * 1000) / 10 : 0;

    return {
      records: records,
      activeCount: activeCount,
      paidOffCount: paidOffCount,
      monthlyTotal: monthlySum,
      graceTotal: WM.utils.toNumber(graceTotal),
      nearestGrace: nearestGrace,
      totalDebtRemaining: remainingDebt,
      cardLimit: limit,
      cardAvailable: cardAvailable,
      limitPct: limitPct,
      monthlyIncome: income,
      incomeAfterCredits: incomeAfterCredits,
      incomeLoadPct: incomeLoadPct
    };
  }

  WM.storage = {
    load: load,
    getState: function () { return state; },
    isAllTabActive: isAllTabActive,
    getActiveTab: getActiveTab,
    getTotalItemsCount: getTotalItemsCount,
    findItemAcrossTabs: findItemAcrossTabs,
    getBundleForItem: getBundleForItem,
    getBundleDetails: getBundleDetails,
    calculateTabTotals: calculateTabTotals,
    calculateAllTabsTotals: calculateAllTabsTotals,
    calculateGlobalCredits: calculateGlobalCredits,

    getPrefs: function () {
      if (!state.prefs) state.prefs = createDefaultPrefs();
      return state.prefs;
    },

    getCurrency: function () {
      var p = state.prefs || createDefaultPrefs();
      return p.currency || WM.CONFIG.CURRENCY || '₼';
    },

    setCurrency: function (symbol) {
      var clean = String(symbol || '').trim().slice(0, 5);
      if (!clean) return false;
      if (!state.prefs) state.prefs = createDefaultPrefs();
      state.prefs.currency = clean;
      state.metaUpdatedAt = nowIso();
      persist(false, false);
      return true;
    },

    getLang: function () {
      var p = state.prefs || createDefaultPrefs();
      return p.lang || 'en';
    },

    setLang: function (lang) {
      if (['ru', 'en', 'az'].indexOf(lang) === -1) return false;
      if (!state.prefs) state.prefs = createDefaultPrefs();
      state.prefs.lang = lang;
      state.metaUpdatedAt = nowIso();
      persist(false, false);
      return true;
    },

    getBackupReminderDays: function () {
      var p = state.prefs || createDefaultPrefs();
      return Number(p.backupReminderDays) || 0;
    },

    setBackupReminderDays: function (days) {
      var n = Number(days);
      if ([0, 7, 14, 30].indexOf(n) === -1) n = 0;
      if (!state.prefs) state.prefs = createDefaultPrefs();
      state.prefs.backupReminderDays = n;
      state.metaUpdatedAt = nowIso();
      persist(false, false);
      return true;
    },

    getStores: function (includeHidden) {
      var p = state.prefs || createDefaultPrefs();
      var list = Array.isArray(p.stores) ? p.stores : createDefaultStores();
      return includeHidden ? list.slice() : list.filter(function (s) { return !s.hidden; });
    },

    ensureStoreInPrefs: function (storeName) {
      var clean = String(storeName || '').trim();
      var key = normalizeName(clean);
      if (!clean || !key) return null;
      if (!state.prefs) state.prefs = createDefaultPrefs();
      var found = state.prefs.stores.find(function (s) { return normalizeName(s.name) === key; });
      if (found) {
        if (found.hidden) {
          found.hidden = false;
          state.metaUpdatedAt = nowIso();
        }
        return found;
      }
      var created = { id: WM.utils.uid('st'), name: clean, hidden: false, builtin: false };
      state.prefs.stores.push(created);
      state.metaUpdatedAt = nowIso();
      return created;
    },

    addCustomStore: function (name) {
      var clean = String(name || '').trim();
      var key = normalizeName(clean);
      if (!clean || !key) return null;
      if (!state.prefs) state.prefs = createDefaultPrefs();
      if (state.prefs.stores.some(function (s) { return normalizeName(s.name) === key; })) {
        return null;
      }
      var created = { id: WM.utils.uid('st'), name: clean, hidden: false, builtin: false };
      state.prefs.stores.push(created);
      state.metaUpdatedAt = nowIso();
      persist(false, false);
      return created;
    },

    renameStore: function (storeId, newName) {
      var clean = String(newName || '').trim();
      var key = normalizeName(clean);
      if (!clean || !key || !state.prefs) return false;
      var target = state.prefs.stores.find(function (s) { return s.id === storeId; });
      if (!target) return false;
      var dup = state.prefs.stores.some(function (s) {
        return s.id !== storeId && normalizeName(s.name) === key;
      });
      if (dup) return false;
      var oldKey = normalizeName(target.name);
      target.name = clean;
      // Обновляем название магазина на всех существующих карточках
      var ts = nowIso();
      state.tabs.forEach(function (t) {
        t.items.forEach(function (it) {
          if (normalizeName(it.store) === oldKey) {
            it.store = clean;
            it.updatedAt = ts;
          }
        });
      });
      state.metaUpdatedAt = ts;
      persist(false, false);
      return true;
    },

    toggleStoreHidden: function (storeId) {
      if (!state.prefs) return false;
      var target = state.prefs.stores.find(function (s) { return s.id === storeId; });
      if (!target) return false;
      target.hidden = !target.hidden;
      state.metaUpdatedAt = nowIso();
      persist(false, false);
      return true;
    },

    deleteStore: function (storeId) {
      if (!state.prefs) return false;
      var target = state.prefs.stores.find(function (s) { return s.id === storeId; });
      if (!target || target.builtin) return false;
      state.prefs.stores = state.prefs.stores.filter(function (s) { return s.id !== storeId; });
      state.metaUpdatedAt = nowIso();
      persist(false, false);
      return true;
    },

    getCreditTypePrefs: function () {
      var p = state.prefs || createDefaultPrefs();
      var hiddenMap = {};
      (p.hiddenCreditTypes || []).forEach(function (id) { hiddenMap[id] = true; });
      var tr = (WM.i18n && WM.i18n.t) ? WM.i18n.t : function (k) { return k; };
      var builtins = [
        { id: 'installment', label: tr('credit_type_installment_full'), shortLabel: tr('credit_type_installment'), hidden: !!hiddenMap['installment'] },
        { id: 'ninja', label: tr('credit_type_ninja_full'), shortLabel: tr('credit_type_ninja'), hidden: !!hiddenMap['ninja'] },
        { id: 'grace', label: tr('credit_type_grace'), shortLabel: tr('credit_type_grace_short'), hidden: !!hiddenMap['grace'] }
      ];
      return {
        builtins: builtins,
        customs: Array.isArray(p.customCreditTypes) ? p.customCreditTypes.slice() : []
      };
    },

    toggleBuiltinCreditHidden: function (typeId) {
      var allowed = ['installment', 'ninja', 'grace'];
      if (allowed.indexOf(typeId) === -1) return false;
      if (!state.prefs) state.prefs = createDefaultPrefs();
      var idx = state.prefs.hiddenCreditTypes.indexOf(typeId);
      if (idx === -1) state.prefs.hiddenCreditTypes.push(typeId);
      else state.prefs.hiddenCreditTypes.splice(idx, 1);
      state.metaUpdatedAt = nowIso();
      persist(false, false);
      return true;
    },

    ensureCustomCreditType: function (name) {
      var clean = String(name || '').trim();
      var key = normalizeName(clean);
      if (!clean || !key) return null;
      if (!state.prefs) state.prefs = createDefaultPrefs();
      var found = state.prefs.customCreditTypes.find(function (c) { return normalizeName(c.name) === key; });
      if (found) return found;
      var created = { id: WM.utils.uid('ct'), name: clean, hidden: false };
      state.prefs.customCreditTypes.push(created);
      state.metaUpdatedAt = nowIso();
      return created;
    },

    addCustomCreditType: function (name) {
      var clean = String(name || '').trim();
      var key = normalizeName(clean);
      if (!clean || !key) return null;
      if (!state.prefs) state.prefs = createDefaultPrefs();
      if (state.prefs.customCreditTypes.some(function (c) { return normalizeName(c.name) === key; })) {
        return null;
      }
      var created = { id: WM.utils.uid('ct'), name: clean, hidden: false };
      state.prefs.customCreditTypes.push(created);
      state.metaUpdatedAt = nowIso();
      persist(false, false);
      return created;
    },

    renameCustomCreditType: function (ctId, newName) {
      var clean = String(newName || '').trim();
      var key = normalizeName(clean);
      if (!clean || !key || !state.prefs) return false;
      var target = state.prefs.customCreditTypes.find(function (c) { return c.id === ctId; });
      if (!target) return false;
      var dup = state.prefs.customCreditTypes.some(function (c) {
        return c.id !== ctId && normalizeName(c.name) === key;
      });
      if (dup) return false;
      var oldKey = normalizeName(target.name);
      target.name = clean;
      var ts = nowIso();
      state.creditBundles.forEach(function (b) {
        if (b.type === 'custom' && normalizeName(b.customType) === oldKey) {
          b.customType = clean;
          b.updatedAt = ts;
        }
      });
      state.metaUpdatedAt = ts;
      persist(false, false);
      return true;
    },

    toggleCustomCreditHidden: function (ctId) {
      if (!state.prefs) return false;
      var target = state.prefs.customCreditTypes.find(function (c) { return c.id === ctId; });
      if (!target) return false;
      target.hidden = !target.hidden;
      state.metaUpdatedAt = nowIso();
      persist(false, false);
      return true;
    },

    deleteCustomCreditType: function (ctId) {
      if (!state.prefs) return false;
      state.prefs.customCreditTypes = state.prefs.customCreditTypes.filter(function (c) { return c.id !== ctId; });
      state.metaUpdatedAt = nowIso();
      persist(false, false);
      return true;
    },
    mergeStates: mergeStates,

    hasTabName: function (name, excludeTabId) {
      var key = normalizeName(name);
      if (!key) return false;
      return state.tabs.some(function (t) {
        return t.id !== excludeTabId && normalizeName(t.name) === key;
      });
    },

    hasCategoryName: function (name, excludeCatId, tabId) {
      var key = normalizeName(name);
      if (!key) return false;
      var tab = tabId
        ? state.tabs.find(function (t) { return t.id === tabId; })
        : getActiveTab();
      if (!tab) return false;
      return tab.categories.some(function (c) {
        return c.id !== excludeCatId && normalizeName(c.name) === key;
      });
    },

    onChange: function (fn) {
      onChangeListeners.push(fn);
    },

    replaceState: function (newRaw, skipSyncNotify) {
      state = sanitizeState(newRaw);
      persist(skipSyncNotify, true);
      return state;
    },

    mergeRemoteState: function (remoteRaw) {
      state = mergeStates(state, remoteRaw);
      persist(true, true);
      return state;
    },

    resetAll: function () {
      state = createDefaultState();
      persist(false, false);
      return state;
    },

    setCardLimit: function (amount) {
      state.cardLimit = WM.utils.toNumber(amount);
      state.metaUpdatedAt = nowIso();
      persist(false, false);
    },

    setMonthlyIncome: function (amount) {
      state.monthlyIncome = WM.utils.toNumber(amount);
      state.metaUpdatedAt = nowIso();
      persist(false, false);
    },

    setActiveTab: function (tabId) {
      if (tabId === WM.CONFIG.ALL_TAB_ID || state.tabs.some(function (t) { return t.id === tabId; })) {
        state.activeTabId = tabId;
        persist(true, true);
      }
    },

    addTab: function (name) {
      var tab = createEmptyTab(name);
      state.tabs.push(tab);
      state.activeTabId = tab.id;
      persist(false, false);
      return tab;
    },

    renameTab: function (tabId, name) {
      var tab = state.tabs.find(function (t) { return t.id === tabId; });
      if (!tab) return;
      tab.name = name.trim() || tab.name;
      tab.updatedAt = nowIso();
      persist(false, false);
    },

    moveTab: function (tabId, delta) {
      var idx = state.tabs.findIndex(function (t) { return t.id === tabId; });
      if (idx === -1) return false;
      var target = idx + delta;
      if (target < 0 || target >= state.tabs.length) return false;
      var item = state.tabs.splice(idx, 1)[0];
      state.tabs.splice(target, 0, item);
      persist(false, false);
      return true;
    },

    reorderTab: function (fromIdx, toIdx) {
      if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= state.tabs.length || toIdx >= state.tabs.length) return false;
      var item = state.tabs.splice(fromIdx, 1)[0];
      state.tabs.splice(toIdx, 0, item);
      persist(false, false);
      return true;
    },

    deleteTab: function (tabId) {
      if (state.tabs.length <= 1) return false;
      var tab = state.tabs.find(function (t) { return t.id === tabId; });
      var removedIds = {};
      if (tab) {
        markDeleted(tab.id);
        tab.categories.forEach(function (c) { markDeleted(c.id); });
        tab.items.forEach(function (it) {
          removedIds[it.id] = true;
          markDeleted(it.id);
        });
      }
      state.tabs = state.tabs.filter(function (t) { return t.id !== tabId; });
      state.creditBundles.forEach(function (b) {
        var before = b.itemIds.length;
        b.itemIds = b.itemIds.filter(function (id) { return !removedIds[id]; });
        if (b.itemIds.length !== before) b.updatedAt = nowIso();
        if (b.itemIds.length === 0) markDeleted(b.id);
      });
      state.creditBundles = state.creditBundles.filter(function (b) { return b.itemIds.length > 0; });
      if (state.activeTabId === tabId) {
        state.activeTabId = state.tabs[0].id;
      }
      persist(false, false);
      return true;
    },

    addCategory: function (name) {
      var tab = getActiveTab();
      var cat = { id: WM.utils.uid('cat'), name: name.trim() || 'New category', collapsed: false, updatedAt: nowIso() };
      tab.categories.push(cat);
      persist(false, false);
      return cat;
    },

    renameCategory: function (catId, name) {
      var tab = getActiveTab();
      var cat = tab.categories.find(function (c) { return c.id === catId; });
      if (!cat) return;
      cat.name = name.trim() || cat.name;
      cat.updatedAt = nowIso();
      persist(false, false);
    },

    toggleCategoryCollapse: function (catId) {
      var tab = getActiveTab();
      var cat = tab.categories.find(function (c) { return c.id === catId; });
      if (!cat) return;
      cat.collapsed = !cat.collapsed;
      persist(true, true);
    },

    setAllCategoriesCollapsed: function (collapsed) {
      var tab = getActiveTab();
      if (!tab || tab.categories.length === 0) return;
      tab.categories.forEach(function (c) { c.collapsed = !!collapsed; });
      persist(true, true);
    },

    moveCategory: function (catId, delta) {
      var tab = getActiveTab();
      var idx = tab.categories.findIndex(function (c) { return c.id === catId; });
      if (idx === -1) return false;
      var target = idx + delta;
      if (target < 0 || target >= tab.categories.length) return false;
      var item = tab.categories.splice(idx, 1)[0];
      tab.categories.splice(target, 0, item);
      persist(false, false);
      return true;
    },

    reorderCategory: function (fromIdx, toIdx) {
      var tab = getActiveTab();
      if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= tab.categories.length || toIdx >= tab.categories.length) return false;
      var item = tab.categories.splice(fromIdx, 1)[0];
      tab.categories.splice(toIdx, 0, item);
      persist(false, false);
      return true;
    },

    deleteCategory: function (catId) {
      var tab = getActiveTab();
      var removedIds = {};
      markDeleted(catId);
      tab.items.forEach(function (it) {
        if (it.categoryId === catId) {
          removedIds[it.id] = true;
          markDeleted(it.id);
        }
      });
      tab.categories = tab.categories.filter(function (c) { return c.id !== catId; });
      tab.items = tab.items.filter(function (it) { return it.categoryId !== catId; });
      state.creditBundles.forEach(function (b) {
        var before = b.itemIds.length;
        b.itemIds = b.itemIds.filter(function (id) { return !removedIds[id]; });
        if (b.itemIds.length !== before) b.updatedAt = nowIso();
        if (b.itemIds.length === 0) markDeleted(b.id);
      });
      state.creditBundles = state.creditBundles.filter(function (b) { return b.itemIds.length > 0; });
      persist(false, false);
    },

    transferCategory: function (catId, targetTabId, mode) {
      var srcTab = getActiveTab();
      var dstTab = state.tabs.find(function (t) { return t.id === targetTabId; });
      if (!dstTab || dstTab.id === srcTab.id) return false;

      var cat = srcTab.categories.find(function (c) { return c.id === catId; });
      if (!cat) return false;

      var isCopy = mode === 'copy';
      var existingDstCat = dstTab.categories.find(function (c) {
        return normalizeName(c.name) === normalizeName(cat.name);
      });
      var targetCat = existingDstCat;
      if (!targetCat) {
        targetCat = { id: WM.utils.uid('cat'), name: cat.name, collapsed: false, updatedAt: nowIso() };
        dstTab.categories.push(targetCat);
      }

      var catItems = srcTab.items.filter(function (it) { return it.categoryId === catId; });
      catItems.forEach(function (it) {
        dstTab.items.push(cloneItem(it, targetCat.id, isCopy));
      });

      if (!isCopy) {
        markDeleted(catId);
        srcTab.categories = srcTab.categories.filter(function (c) { return c.id !== catId; });
        srcTab.items = srcTab.items.filter(function (it) { return it.categoryId !== catId; });
      }

      persist(false, false);
      return true;
    },

    transferItem: function (itemId, targetTabId, targetCatIdOrNew, mode) {
      var foundSrc = findItemAcrossTabs(itemId);
      var srcTab = foundSrc ? foundSrc.tab : getActiveTab();
      var dstTab = state.tabs.find(function (t) { return t.id === targetTabId; });
      if (!dstTab || !foundSrc || dstTab.id === srcTab.id) return false;

      var item = foundSrc.item;

      var dstCatId = targetCatIdOrNew;
      if (!dstCatId || dstCatId === '__create_same__') {
        var srcCat = srcTab.categories.find(function (c) { return c.id === item.categoryId; });
        var catName = srcCat ? srcCat.name : 'General';
        var existingDstCat = dstTab.categories.find(function (c) {
          return c.name.toLowerCase() === catName.toLowerCase();
        });
        if (existingDstCat) {
          dstCatId = existingDstCat.id;
        } else {
          var created = { id: WM.utils.uid('cat'), name: catName, collapsed: false, updatedAt: nowIso() };
          dstTab.categories.push(created);
          dstCatId = created.id;
        }
      }

      var isCopy = mode === 'copy';
      dstTab.items.push(cloneItem(item, dstCatId, isCopy));

      if (!isCopy) {
        srcTab.items = srcTab.items.filter(function (it) { return it.id !== itemId; });
      }

      persist(false, false);
      return true;
    },

    saveItem: function (payload) {
      var foundExisting = payload.id ? findItemAcrossTabs(payload.id) : null;
      var tab = foundExisting ? foundExisting.tab : getActiveTab();
      var existing = foundExisting ? foundExisting.item : null;
      var ts = nowIso();

      if (existing) {
        existing.title = payload.title.trim();
        existing.categoryId = payload.categoryId;
        existing.price = WM.utils.toNumber(payload.price);
        existing.checked = !!payload.checked;
        existing.priority = payload.priority || 'medium';
        existing.store = payload.store || WM.CONFIG.STORES[0];
        existing.link = WM.utils.sanitizeUrl(payload.link);
        existing.note = (payload.note || '').trim();
        existing.images = sanitizeImages(payload.images);
        existing.updatedAt = ts;
        persist(false, false);
        return existing;
      }

      var item = {
        id: WM.utils.uid('item'),
        categoryId: payload.categoryId,
        title: payload.title.trim(),
        price: WM.utils.toNumber(payload.price),
        checked: !!payload.checked,
        priority: payload.priority || 'medium',
        store: payload.store || WM.CONFIG.STORES[0],
        link: WM.utils.sanitizeUrl(payload.link),
        note: (payload.note || '').trim(),
        images: sanitizeImages(payload.images),
        bundleId: null,
        createdAt: ts,
        updatedAt: ts
      };
      tab.items.push(item);
      persist(false, false);
      return item;
    },

    toggleItemChecked: function (itemId, checked) {
      var found = findItemAcrossTabs(itemId);
      if (!found) return;
      var ts = nowIso();
      found.item.checked = !!checked;
      found.item.updatedAt = ts;
      var b = getBundleForItem(itemId);
      if (b && b.itemIds.length === 1) {
        b.checked = !!checked;
        b.updatedAt = ts;
      }
      persist(false, false);
    },

    deleteItem: function (itemId) {
      var found = findItemAcrossTabs(itemId);
      if (!found) return;
      markDeleted(itemId);
      found.tab.items = found.tab.items.filter(function (it) { return it.id !== itemId; });
      state.creditBundles.forEach(function (b) {
        var before = b.itemIds.length;
        b.itemIds = b.itemIds.filter(function (id) { return id !== itemId; });
        if (b.itemIds.length !== before) b.updatedAt = nowIso();
        if (b.itemIds.length === 0) markDeleted(b.id);
      });
      state.creditBundles = state.creditBundles.filter(function (b) { return b.itemIds.length > 0; });
      persist(false, false);
    },

    saveCreditBundle: function (payload) {
      var selectedIds = Array.isArray(payload.itemIds) ? payload.itemIds.slice() : [];
      if (selectedIds.length === 0) return null;
      var ts = nowIso();

      var bundle = payload.id
        ? state.creditBundles.find(function (b) { return b.id === payload.id; })
        : null;

      if (bundle) {
        bundle.itemIds.forEach(function (oldId) {
          if (selectedIds.indexOf(oldId) === -1) {
            var foundOld = findItemAcrossTabs(oldId);
            if (foundOld && foundOld.item.bundleId === bundle.id) {
              foundOld.item.bundleId = null;
            }
          }
        });
      }

      if (!bundle) {
        bundle = {
          id: WM.utils.uid('bundle'),
          name: '',
          type: 'installment',
          customType: '',
          itemIds: [],
          months: 0,
          monthlyPayment: 0,
          totalAmount: 0,
          startDate: '',
          dueDate: '',
          checked: true,
          paidOff: false,
          paidOffAt: '',
          updatedAt: ts
        };
        state.creditBundles.push(bundle);
      }

      var fallbackName = 'Credit';
      if (selectedIds.length === 1) {
        var singleFound = findItemAcrossTabs(selectedIds[0]);
        if (singleFound) fallbackName = singleFound.item.title;
      }

      bundle.name = (payload.name || '').trim() || fallbackName;
      bundle.type = sanitizeCreditType(payload.type);
      bundle.customType = String(payload.customType || '').trim();
      bundle.itemIds = selectedIds;
      bundle.months = bundle.type === 'grace' ? 0 : Math.max(0, parseInt(payload.months, 10) || 0);
      bundle.monthlyPayment = bundle.type === 'grace' ? 0 : WM.utils.toNumber(payload.monthlyPayment);
      bundle.totalAmount = WM.utils.toNumber(payload.totalAmount);
      bundle.startDate = sanitizeDate(payload.startDate);
      bundle.dueDate = sanitizeDate(payload.dueDate);
      bundle.checked = !!payload.checked;
      bundle.updatedAt = ts;

      selectedIds.forEach(function (id) {
        var found = findItemAcrossTabs(id);
        if (found) {
          var it = found.item;
          if (it.bundleId && it.bundleId !== bundle.id) {
            var other = state.creditBundles.find(function (b) { return b.id === it.bundleId; });
            if (other) {
              other.itemIds = other.itemIds.filter(function (x) { return x !== id; });
              other.updatedAt = ts;
              if (other.itemIds.length === 0) markDeleted(other.id);
            }
          }
          it.bundleId = bundle.id;
          if (bundle.checked) {
            it.checked = true;
            it.updatedAt = ts;
          }
        }
      });

      state.creditBundles = state.creditBundles.filter(function (b) { return b.itemIds.length > 0; });
      persist(false, false);
      return bundle;
    },

    toggleBundleChecked: function (bundleId, checked) {
      var bundle = state.creditBundles.find(function (b) { return b.id === bundleId; });
      if (!bundle) return;
      var ts = nowIso();
      bundle.checked = !!checked;
      bundle.updatedAt = ts;
      bundle.itemIds.forEach(function (id) {
        var found = findItemAcrossTabs(id);
        if (found) {
          found.item.checked = !!checked;
          found.item.updatedAt = ts;
        }
      });
      persist(false, false);
    },

    toggleBundlePaidOff: function (bundleId, paidOff) {
      var bundle = state.creditBundles.find(function (b) { return b.id === bundleId; });
      if (!bundle) return false;
      var ts = nowIso();
      bundle.paidOff = !!paidOff;
      bundle.paidOffAt = paidOff ? ts : '';
      if (bundle.paidOff) {
        bundle.checked = true;
        bundle.itemIds.forEach(function (id) {
          var found = findItemAcrossTabs(id);
          if (found) {
            found.item.checked = true;
            found.item.updatedAt = ts;
          }
        });
      }
      bundle.updatedAt = ts;
      persist(false, false);
      return true;
    },

    deleteCreditBundle: function (bundleId) {
      var bundle = state.creditBundles.find(function (b) { return b.id === bundleId; });
      if (!bundle) return;
      markDeleted(bundleId);
      bundle.itemIds.forEach(function (id) {
        var found = findItemAcrossTabs(id);
        if (found && found.item.bundleId === bundleId) {
          found.item.bundleId = null;
        }
      });
      state.creditBundles = state.creditBundles.filter(function (b) { return b.id !== bundleId; });
      persist(false, false);
    }
  };
})(window);
