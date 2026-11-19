/* ==========================================================================
   WM_CHECKLIST — ХРАНИЛИЩЕ, ГЛОБАЛЬНЫЕ КРЕДИТЫ, ЛИМИТ КАРТЫ И ИТОГИ
   ========================================================================== */
(function (global) {
  'use strict';

  var WM = (global.WMChecklist = global.WMChecklist || {});

  function createEmptyTab(name) {
    return {
      id: WM.utils.uid('tab'),
      name: name || 'Основная',
      categories: [],
      items: []
    };
  }

  function createDefaultState() {
    var mainTab = createEmptyTab('Основная');
    return {
      version: 2,
      updatedAt: new Date().toISOString(),
      activeTabId: mainTab.id,
      cardLimit: 0,
      creditBundles: [],
      tabs: [mainTab]
    };
  }

  function sanitizeDate(val) {
    var s = String(val || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }

  function sanitizeCreditType(val) {
    var allowed = ['installment', 'ninja', 'grace', 'custom'];
    return allowed.indexOf(val) !== -1 ? val : 'installment';
  }

  function sanitizeBundle(b) {
    return {
      id: String(b.id || WM.utils.uid('bundle')),
      name: String(b.name || 'Общий кредит').trim() || 'Общий кредит',
      type: sanitizeCreditType(b.type),
      customType: String(b.customType || '').trim(),
      itemIds: Array.isArray(b.itemIds) ? b.itemIds.map(String) : [],
      months: Math.max(0, parseInt(b.months, 10) || 0),
      monthlyPayment: WM.utils.toNumber(b.monthlyPayment),
      totalAmount: WM.utils.toNumber(b.totalAmount),
      startDate: sanitizeDate(b.startDate),
      dueDate: sanitizeDate(b.dueDate),
      checked: !!b.checked
    };
  }

  function sanitizeState(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tabs) || raw.tabs.length === 0) {
      return createDefaultState();
    }

    var globalBundles = Array.isArray(raw.creditBundles)
      ? raw.creditBundles.map(sanitizeBundle)
      : [];

    var seenBundleIds = {};
    globalBundles.forEach(function (b) { seenBundleIds[b.id] = true; });

    var tabs = raw.tabs.map(function (t) {
      // Автоматическая миграция старых creditBundles из вкладок (v1 -> v2)
      if (Array.isArray(t.creditBundles)) {
        t.creditBundles.forEach(function (oldB) {
          var sb = sanitizeBundle(oldB);
          if (!seenBundleIds[sb.id]) {
            seenBundleIds[sb.id] = true;
            globalBundles.push(sb);
          }
        });
      }

      return {
        id: String(t.id || WM.utils.uid('tab')),
        name: String(t.name || 'Без названия').trim() || 'Без названия',
        categories: Array.isArray(t.categories)
          ? t.categories.map(function (c) {
              return {
                id: String(c.id || WM.utils.uid('cat')),
                name: String(c.name || 'Категория').trim() || 'Категория',
                collapsed: !!c.collapsed
              };
            })
          : [],
        items: Array.isArray(t.items)
          ? t.items.map(function (it) {
              var credit = it.credit && typeof it.credit === 'object' ? {
                enabled: !!it.credit.enabled,
                type: sanitizeCreditType(it.credit.type),
                customType: String(it.credit.customType || '').trim(),
                months: Math.max(0, parseInt(it.credit.months, 10) || 0),
                monthlyPayment: WM.utils.toNumber(it.credit.monthlyPayment),
                totalAmount: WM.utils.toNumber(it.credit.totalAmount),
                startDate: sanitizeDate(it.credit.startDate),
                dueDate: sanitizeDate(it.credit.dueDate)
              } : {
                enabled: false, type: 'installment', customType: '',
                months: 0, monthlyPayment: 0, totalAmount: 0, startDate: '', dueDate: ''
              };

              return {
                id: String(it.id || WM.utils.uid('item')),
                categoryId: String(it.categoryId || ''),
                title: String(it.title || 'Без названия').trim() || 'Без названия',
                price: WM.utils.toNumber(it.price),
                checked: !!it.checked,
                priority: String(it.priority || 'medium'),
                store: String(it.store || WM.CONFIG.STORES[0]),
                link: String(it.link || '').trim(),
                note: String(it.note || '').trim(),
                credit: credit,
                bundleId: it.bundleId ? String(it.bundleId) : null,
                createdAt: it.createdAt || new Date().toISOString()
              };
            })
          : []
      };
    });

    // Чистим несуществующие itemIds в бандлах
    var existingItems = {};
    tabs.forEach(function (t) {
      t.items.forEach(function (it) { existingItems[it.id] = it; });
    });

    globalBundles = globalBundles.map(function (b) {
      b.itemIds = b.itemIds.filter(function (id) { return !!existingItems[id]; });
      return b;
    }).filter(function (b) { return b.itemIds.length > 0; });

    // Синхронизируем it.bundleId с globalBundles
    Object.keys(existingItems).forEach(function (id) { existingItems[id].bundleId = null; });
    globalBundles.forEach(function (b) {
      b.itemIds.forEach(function (id) {
        if (existingItems[id]) existingItems[id].bundleId = b.id;
      });
    });

    var activeExists = tabs.some(function (t) { return t.id === raw.activeTabId; });
    return {
      version: 2,
      updatedAt: raw.updatedAt || new Date().toISOString(),
      activeTabId: activeExists ? raw.activeTabId : tabs[0].id,
      cardLimit: WM.utils.toNumber(raw.cardLimit),
      creditBundles: globalBundles,
      tabs: tabs
    };
  }

  var state = createDefaultState();
  var onChangeListeners = [];

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
      state.updatedAt = new Date().toISOString();
    }
    try {
      localStorage.setItem(WM.CONFIG.STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
    if (!skipNotify) {
      onChangeListeners.forEach(function (fn) { fn(state); });
    }
  }

  function getActiveTab() {
    for (var i = 0; i < state.tabs.length; i++) {
      if (state.tabs[i].id === state.activeTabId) return state.tabs[i];
    }
    state.activeTabId = state.tabs[0].id;
    return state.tabs[0];
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

  function getBundlesForTab(tab) {
    var tabItemSet = {};
    tab.items.forEach(function (it) { tabItemSet[it.id] = true; });
    return state.creditBundles.filter(function (b) {
      return b.itemIds.some(function (id) { return !!tabItemSet[id]; });
    });
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
      baseSum: WM.utils.toNumber(baseSum)
    };
  }

  function cloneItem(it, newCategoryId, forceNewId) {
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
      credit: {
        enabled: !!(it.credit && it.credit.enabled),
        type: sanitizeCreditType(it.credit && it.credit.type),
        customType: (it.credit && it.credit.customType) || '',
        months: (it.credit && it.credit.months) || 0,
        monthlyPayment: (it.credit && it.credit.monthlyPayment) || 0,
        totalAmount: (it.credit && it.credit.totalAmount) || 0,
        startDate: (it.credit && it.credit.startDate) || '',
        dueDate: (it.credit && it.credit.dueDate) || ''
      },
      bundleId: forceNewId ? null : it.bundleId,
      createdAt: forceNewId ? new Date().toISOString() : it.createdAt
    };
  }

  /* Итоги конкретной вкладки (для межвкладочных кредитов берётся честная пропорциональная доля этой вкладки!) */
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

    // 1. Обычные и индивидуально кредитные товары вкладки
    tab.items.forEach(function (it) {
      if (bundledItemSet[it.id]) return;

      var isCredit = !!(it.credit && it.credit.enabled);
      var isGrace = isCredit && it.credit.type === 'grace';
      var effectiveAmount = isCredit
        ? (it.credit.totalAmount > 0 ? it.credit.totalAmount : it.price)
        : it.price;

      plannedTotal += effectiveAmount;
      if (isCredit) plannedCredit += effectiveAmount;
      else plannedCash += effectiveAmount;

      if (it.checked) {
        spentTotal += effectiveAmount;
        if (isCredit) {
          spentCredit += effectiveAmount;
          activeCreditsCount++;
          if (!isGrace) {
            monthlyCreditTotal += WM.utils.toNumber(it.credit.monthlyPayment);
          }
        } else {
          spentCash += effectiveAmount;
        }
      }
    });

    // 2. Глобальные общие кредиты, содержащие товары из этой вкладки (пропорциональная доля)
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

      if (b.checked) {
        spentTotal += shareTotal;
        spentCredit += shareTotal;
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

  /* Глобальная сводка по ВСЕМ кредитам со всех вкладок (для панели «Кредиты» и лимита карты) */
  function calculateGlobalCredits() {
    var records = [];
    var monthlyTotal = 0;
    var graceTotal = 0;
    var nearestGrace = null;
    var totalDebtRemaining = 0;
    var activeCount = 0;

    // 1. Индивидуальные кредиты по всем вкладкам
    state.tabs.forEach(function (tab) {
      tab.items.forEach(function (it) {
        if (it.bundleId) return;
        if (!it.credit || !it.credit.enabled) return;

        var c = it.credit;
        var total = c.totalAmount > 0 ? c.totalAmount : it.price;
        var overpay = Math.round((total - it.price) * 100) / 100;
        var sched = c.type !== 'grace' ? WM.utils.calcCreditSchedule(c.startDate, c.months, c.monthlyPayment) : null;
        var grace = c.type === 'grace' ? WM.utils.calcGraceStatus(c.dueDate) : null;
        var remaining = sched ? sched.remainingAmount : total;

        records.push({
          kind: 'item',
          id: it.id,
          tabId: tab.id,
          tabNames: [tab.name],
          title: it.title,
          type: c.type,
          customType: c.customType,
          checked: !!it.checked,
          baseSum: it.price,
          totalAmount: total,
          overpay: overpay,
          months: c.months,
          monthlyPayment: c.type === 'grace' ? 0 : c.monthlyPayment,
          startDate: c.startDate,
          dueDate: c.dueDate,
          schedule: sched,
          graceStatus: grace,
          remainingAmount: remaining,
          itemsList: [{ tab: tab, item: it }]
        });

        if (it.checked) {
          activeCount++;
          totalDebtRemaining += remaining;
          if (c.type === 'grace') {
            graceTotal += total;
            if (grace && (!nearestGrace || grace.dueDate < nearestGrace.dueDate)) {
              nearestGrace = grace;
            }
          } else {
            monthlyTotal += c.monthlyPayment;
          }
        }
      });
    });

    // 2. Глобальные общие кредиты
    state.creditBundles.forEach(function (b) {
      var details = getBundleDetails(b);
      var overpay = Math.round((b.totalAmount - details.baseSum) * 100) / 100;
      var sched = b.type !== 'grace' ? WM.utils.calcCreditSchedule(b.startDate, b.months, b.monthlyPayment) : null;
      var grace = b.type === 'grace' ? WM.utils.calcGraceStatus(b.dueDate) : null;
      var remaining = sched ? sched.remainingAmount : b.totalAmount;

      records.push({
        kind: 'bundle',
        id: b.id,
        tabId: null,
        tabNames: details.tabNames,
        title: b.name,
        type: b.type,
        customType: b.customType,
        checked: !!b.checked,
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

      if (b.checked) {
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

    return {
      records: records,
      activeCount: activeCount,
      monthlyTotal: WM.utils.toNumber(monthlyTotal),
      graceTotal: WM.utils.toNumber(graceTotal),
      nearestGrace: nearestGrace,
      totalDebtRemaining: remainingDebt,
      cardLimit: limit,
      cardAvailable: cardAvailable,
      limitPct: limitPct
    };
  }

  WM.storage = {
    load: load,
    getState: function () { return state; },
    getActiveTab: getActiveTab,
    findItemAcrossTabs: findItemAcrossTabs,
    getBundleForItem: getBundleForItem,
    getBundlesForTab: getBundlesForTab,
    getBundleDetails: getBundleDetails,
    calculateTabTotals: calculateTabTotals,
    calculateGlobalCredits: calculateGlobalCredits,

    onChange: function (fn) {
      onChangeListeners.push(fn);
    },

    replaceState: function (newRaw, skipSyncNotify) {
      state = sanitizeState(newRaw);
      persist(skipSyncNotify, true);
      return state;
    },

    resetAll: function () {
      state = createDefaultState();
      persist(false, false);
      return state;
    },

    setCardLimit: function (amount) {
      state.cardLimit = WM.utils.toNumber(amount);
      persist(false, false);
    },

    setActiveTab: function (tabId) {
      if (state.tabs.some(function (t) { return t.id === tabId; })) {
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
      persist(false, false);
    },

    deleteTab: function (tabId) {
      if (state.tabs.length <= 1) return false;
      var tab = state.tabs.find(function (t) { return t.id === tabId; });
      var removedIds = {};
      if (tab) {
        tab.items.forEach(function (it) { removedIds[it.id] = true; });
      }
      state.tabs = state.tabs.filter(function (t) { return t.id !== tabId; });
      state.creditBundles.forEach(function (b) {
        b.itemIds = b.itemIds.filter(function (id) { return !removedIds[id]; });
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
      var cat = { id: WM.utils.uid('cat'), name: name.trim() || 'Новая категория', collapsed: false };
      tab.categories.push(cat);
      persist(false, false);
      return cat;
    },

    renameCategory: function (catId, name) {
      var tab = getActiveTab();
      var cat = tab.categories.find(function (c) { return c.id === catId; });
      if (!cat) return;
      cat.name = name.trim() || cat.name;
      persist(false, false);
    },

    toggleCategoryCollapse: function (catId) {
      var tab = getActiveTab();
      var cat = tab.categories.find(function (c) { return c.id === catId; });
      if (!cat) return;
      cat.collapsed = !cat.collapsed;
      persist(true, true);
    },

    deleteCategory: function (catId) {
      var tab = getActiveTab();
      var removedIds = {};
      tab.items.forEach(function (it) {
        if (it.categoryId === catId) removedIds[it.id] = true;
      });
      tab.categories = tab.categories.filter(function (c) { return c.id !== catId; });
      tab.items = tab.items.filter(function (it) { return it.categoryId !== catId; });
      state.creditBundles.forEach(function (b) {
        b.itemIds = b.itemIds.filter(function (id) { return !removedIds[id]; });
      });
      state.creditBundles = state.creditBundles.filter(function (b) { return b.itemIds.length > 0; });
      persist(false, false);
    },

    /* Перенос категории сохраняет привязку товаров к глобальному общему кредиту! */
    transferCategory: function (catId, targetTabId, mode) {
      var srcTab = getActiveTab();
      var dstTab = state.tabs.find(function (t) { return t.id === targetTabId; });
      if (!dstTab || dstTab.id === srcTab.id) return false;

      var cat = srcTab.categories.find(function (c) { return c.id === catId; });
      if (!cat) return false;

      var isCopy = mode === 'copy';
      var newCat = { id: WM.utils.uid('cat'), name: cat.name, collapsed: false };
      dstTab.categories.push(newCat);

      var catItems = srcTab.items.filter(function (it) { return it.categoryId === catId; });
      catItems.forEach(function (it) {
        dstTab.items.push(cloneItem(it, newCat.id, isCopy));
      });

      if (!isCopy) {
        srcTab.categories = srcTab.categories.filter(function (c) { return c.id !== catId; });
        srcTab.items = srcTab.items.filter(function (it) { return it.categoryId !== catId; });
      }

      persist(false, false);
      return true;
    },

    /* Перенос позиции сохраняет её привязку к глобальному общему кредиту! */
    transferItem: function (itemId, targetTabId, targetCatIdOrNew, mode) {
      var srcTab = getActiveTab();
      var dstTab = state.tabs.find(function (t) { return t.id === targetTabId; });
      if (!dstTab || dstTab.id === srcTab.id) return false;

      var item = srcTab.items.find(function (it) { return it.id === itemId; });
      if (!item) return false;

      var dstCatId = targetCatIdOrNew;
      if (!dstCatId || dstCatId === '__create_same__') {
        var srcCat = srcTab.categories.find(function (c) { return c.id === item.categoryId; });
        var catName = srcCat ? srcCat.name : 'Общее';
        var existingDstCat = dstTab.categories.find(function (c) {
          return c.name.toLowerCase() === catName.toLowerCase();
        });
        if (existingDstCat) {
          dstCatId = existingDstCat.id;
        } else {
          var created = { id: WM.utils.uid('cat'), name: catName, collapsed: false };
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
      var tab = getActiveTab();
      var existing = payload.id ? tab.items.find(function (it) { return it.id === payload.id; }) : null;

      var creditObj = {
        enabled: !!(payload.credit && payload.credit.enabled),
        type: sanitizeCreditType(payload.credit && payload.credit.type),
        customType: String((payload.credit && payload.credit.customType) || '').trim(),
        months: Math.max(0, parseInt(payload.credit && payload.credit.months, 10) || 0),
        monthlyPayment: WM.utils.toNumber(payload.credit && payload.credit.monthlyPayment),
        totalAmount: WM.utils.toNumber(payload.credit && payload.credit.totalAmount),
        startDate: sanitizeDate(payload.credit && payload.credit.startDate),
        dueDate: sanitizeDate(payload.credit && payload.credit.dueDate)
      };

      if (existing) {
        existing.title = payload.title.trim();
        existing.categoryId = payload.categoryId;
        existing.price = WM.utils.toNumber(payload.price);
        existing.checked = !!payload.checked;
        existing.priority = payload.priority || 'medium';
        existing.store = payload.store || WM.CONFIG.STORES[0];
        existing.link = (payload.link || '').trim();
        existing.note = (payload.note || '').trim();
        if (!existing.bundleId) {
          existing.credit = creditObj;
        }
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
        link: (payload.link || '').trim(),
        note: (payload.note || '').trim(),
        credit: creditObj,
        bundleId: null,
        createdAt: new Date().toISOString()
      };
      tab.items.push(item);
      persist(false, false);
      return item;
    },

    toggleItemChecked: function (itemId, checked) {
      var found = findItemAcrossTabs(itemId);
      if (!found) return;
      found.item.checked = !!checked;
      persist(false, false);
    },

    deleteItem: function (itemId) {
      var found = findItemAcrossTabs(itemId);
      if (!found) return;
      found.tab.items = found.tab.items.filter(function (it) { return it.id !== itemId; });
      state.creditBundles.forEach(function (b) {
        b.itemIds = b.itemIds.filter(function (id) { return id !== itemId; });
      });
      state.creditBundles = state.creditBundles.filter(function (b) { return b.itemIds.length > 0; });
      persist(false, false);
    },

    /* Глобальные общие кредиты (работают сразу по всем вкладкам!) */
    saveCreditBundle: function (payload) {
      var selectedIds = Array.isArray(payload.itemIds) ? payload.itemIds.slice() : [];
      if (selectedIds.length === 0) return null;

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
          checked: true
        };
        state.creditBundles.push(bundle);
      }

      bundle.name = (payload.name || '').trim() || 'Общий кредит';
      bundle.type = sanitizeCreditType(payload.type);
      bundle.customType = String(payload.customType || '').trim();
      bundle.itemIds = selectedIds;
      bundle.months = bundle.type === 'grace' ? 0 : Math.max(0, parseInt(payload.months, 10) || 0);
      bundle.monthlyPayment = bundle.type === 'grace' ? 0 : WM.utils.toNumber(payload.monthlyPayment);
      bundle.totalAmount = WM.utils.toNumber(payload.totalAmount);
      bundle.startDate = sanitizeDate(payload.startDate);
      bundle.dueDate = sanitizeDate(payload.dueDate);
      bundle.checked = !!payload.checked;

      selectedIds.forEach(function (id) {
        var found = findItemAcrossTabs(id);
        if (found) {
          var it = found.item;
          if (it.bundleId && it.bundleId !== bundle.id) {
            var other = state.creditBundles.find(function (b) { return b.id === it.bundleId; });
            if (other) {
              other.itemIds = other.itemIds.filter(function (x) { return x !== id; });
            }
          }
          it.bundleId = bundle.id;
          it.credit = {
            enabled: false, type: 'installment', customType: '',
            months: 0, monthlyPayment: 0, totalAmount: 0, startDate: '', dueDate: ''
          };
          if (bundle.checked) it.checked = true;
        }
      });

      state.creditBundles = state.creditBundles.filter(function (b) { return b.itemIds.length > 0; });
      persist(false, false);
      return bundle;
    },

    toggleBundleChecked: function (bundleId, checked) {
      var bundle = state.creditBundles.find(function (b) { return b.id === bundleId; });
      if (!bundle) return;
      bundle.checked = !!checked;
      bundle.itemIds.forEach(function (id) {
        var found = findItemAcrossTabs(id);
        if (found) found.item.checked = !!checked;
      });
      persist(false, false);
    },

    deleteCreditBundle: function (bundleId) {
      var bundle = state.creditBundles.find(function (b) { return b.id === bundleId; });
      if (!bundle) return;
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
