/* ==========================================================================
   WM_CHECKLIST — ХРАНИЛИЩЕ, ЕДИНЫЙ РЕЕСТР КРЕДИТОВ И АВТО-МИГРАЦИЯ
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
      version: 3,
      updatedAt: new Date().toISOString(),
      activeTabId: mainTab.id,
      cardLimit: 0,
      monthlyIncome: 0,
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
      name: String(b.name || 'Кредит').trim() || 'Кредит',
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
      // Миграция старых tab.creditBundles (v1)
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
              var itemId = String(it.id || WM.utils.uid('item'));
              var title = String(it.title || 'Без названия').trim() || 'Без названия';
              var price = WM.utils.toNumber(it.price);

              // Авто-миграция старых индивидуальных кредитов в единый реестр creditBundles (v2 -> v3)
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
                  checked: !!it.checked
                });
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
                link: String(it.link || '').trim(),
                note: String(it.note || '').trim(),
                bundleId: null,
                createdAt: it.createdAt || new Date().toISOString()
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

    var activeExists = tabs.some(function (t) { return t.id === raw.activeTabId; });
    return {
      version: 3,
      updatedAt: raw.updatedAt || new Date().toISOString(),
      activeTabId: activeExists ? raw.activeTabId : tabs[0].id,
      cardLimit: WM.utils.toNumber(raw.cardLimit),
      monthlyIncome: WM.utils.toNumber(raw.monthlyIncome),
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
      bundleId: forceNewId ? null : it.bundleId,
      createdAt: forceNewId ? new Date().toISOString() : it.createdAt
    };
  }

  /* Итоги конкретной вкладки (доля по межвкладочным кредитам считается пропорционально) */
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

    // 1. Обычные (наличные) товары вкладки
    tab.items.forEach(function (it) {
      if (bundledItemSet[it.id]) return;
      plannedTotal += it.price;
      plannedCash += it.price;
      if (it.checked) {
        spentTotal += it.price;
        spentCash += it.price;
      }
    });

    // 2. Все кредиты, в которых есть товары этой вкладки
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

  /* Глобальная сводка по всем кредитам и лимиту карты */
  function calculateGlobalCredits() {
    var records = [];
    var monthlyTotal = 0;
    var graceTotal = 0;
    var nearestGrace = null;
    var totalDebtRemaining = 0;
    var activeCount = 0;

    state.creditBundles.forEach(function (b) {
      var details = getBundleDetails(b);
      var overpay = Math.round((b.totalAmount - details.baseSum) * 100) / 100;
      var sched = b.type !== 'grace' ? WM.utils.calcCreditSchedule(b.startDate, b.months, b.monthlyPayment) : null;
      var grace = b.type === 'grace' ? WM.utils.calcGraceStatus(b.dueDate) : null;
      var remaining = sched ? sched.remainingAmount : b.totalAmount;

      records.push({
        id: b.id,
        tabNames: details.tabNames,
        isSingleItem: details.isSingleItem,
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

    var monthlySum = WM.utils.toNumber(monthlyTotal);
    var income = WM.utils.toNumber(state.monthlyIncome);
    var incomeAfterCredits = income > 0 ? Math.round((income - monthlySum) * 100) / 100 : 0;
    var incomeLoadPct = income > 0 ? Math.round((monthlySum / income) * 1000) / 10 : 0;

    return {
      records: records,
      activeCount: activeCount,
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
    getActiveTab: getActiveTab,
    findItemAcrossTabs: findItemAcrossTabs,
    getBundleForItem: getBundleForItem,
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

    setMonthlyIncome: function (amount) {
      state.monthlyIncome = WM.utils.toNumber(amount);
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

      if (existing) {
        existing.title = payload.title.trim();
        existing.categoryId = payload.categoryId;
        existing.price = WM.utils.toNumber(payload.price);
        existing.checked = !!payload.checked;
        existing.priority = payload.priority || 'medium';
        existing.store = payload.store || WM.CONFIG.STORES[0];
        existing.link = (payload.link || '').trim();
        existing.note = (payload.note || '').trim();
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
      // Если товар один в кредите — синхронизируем статус этого кредита автоматически
      var b = getBundleForItem(itemId);
      if (b && b.itemIds.length === 1) {
        b.checked = !!checked;
      }
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

    /* Единое сохранение кредита / рассрочки (на 1 или несколько товаров из любых вкладок) */
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

      // Если выбран 1 товар и название не введено — берём название самого товара
      var fallbackName = 'Кредит';
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
