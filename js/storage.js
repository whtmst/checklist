/* ==========================================================================
   WM_CHECKLIST — ХРАНИЛИЩЕ, CRUD, ПЕРЕНОС МЕЖДУ ВКЛАДКАМИ И ИТОГИ
   ========================================================================== */
(function (global) {
  'use strict';

  var WM = (global.WMChecklist = global.WMChecklist || {});

  function createEmptyTab(name) {
    return {
      id: WM.utils.uid('tab'),
      name: name || 'Основная',
      categories: [],
      items: [],
      creditBundles: []
    };
  }

  function createDefaultState() {
    var mainTab = createEmptyTab('Основная');
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      activeTabId: mainTab.id,
      tabs: [mainTab]
    };
  }

  function sanitizeDate(val) {
    var s = String(val || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }

  function sanitizeState(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tabs) || raw.tabs.length === 0) {
      return createDefaultState();
    }

    var tabs = raw.tabs.map(function (t) {
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
                months: Math.max(0, parseInt(it.credit.months, 10) || 0),
                monthlyPayment: WM.utils.toNumber(it.credit.monthlyPayment),
                totalAmount: WM.utils.toNumber(it.credit.totalAmount),
                startDate: sanitizeDate(it.credit.startDate)
              } : { enabled: false, months: 0, monthlyPayment: 0, totalAmount: 0, startDate: '' };

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
          : [],
        creditBundles: Array.isArray(t.creditBundles)
          ? t.creditBundles.map(function (b) {
              return {
                id: String(b.id || WM.utils.uid('bundle')),
                name: String(b.name || 'Общий кредит').trim() || 'Общий кредит',
                itemIds: Array.isArray(b.itemIds) ? b.itemIds.map(String) : [],
                months: Math.max(0, parseInt(b.months, 10) || 0),
                monthlyPayment: WM.utils.toNumber(b.monthlyPayment),
                totalAmount: WM.utils.toNumber(b.totalAmount),
                startDate: sanitizeDate(b.startDate),
                checked: !!b.checked
              };
            })
          : []
      };
    });

    var activeExists = tabs.some(function (t) { return t.id === raw.activeTabId; });
    return {
      version: 1,
      updatedAt: raw.updatedAt || new Date().toISOString(),
      activeTabId: activeExists ? raw.activeTabId : tabs[0].id,
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

  function getBundleForItem(tab, itemId) {
    if (!tab || !Array.isArray(tab.creditBundles)) return null;
    for (var i = 0; i < tab.creditBundles.length; i++) {
      if (tab.creditBundles[i].itemIds.indexOf(itemId) !== -1) {
        return tab.creditBundles[i];
      }
    }
    return null;
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
        months: (it.credit && it.credit.months) || 0,
        monthlyPayment: (it.credit && it.credit.monthlyPayment) || 0,
        totalAmount: (it.credit && it.credit.totalAmount) || 0,
        startDate: (it.credit && it.credit.startDate) || ''
      },
      bundleId: null,
      createdAt: forceNewId ? new Date().toISOString() : it.createdAt
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

    var bundledItemSet = {};
    tab.creditBundles.forEach(function (b) {
      b.itemIds.forEach(function (id) { bundledItemSet[id] = b.id; });
    });

    tab.items.forEach(function (it) {
      if (it.checked) checkedItemsCount++;
      if (bundledItemSet[it.id]) return;

      var isCredit = !!(it.credit && it.credit.enabled);
      var effectiveAmount = isCredit
        ? (it.credit.totalAmount > 0 ? it.credit.totalAmount : it.price)
        : it.price;

      plannedTotal += effectiveAmount;
      if (isCredit) {
        plannedCredit += effectiveAmount;
      } else {
        plannedCash += effectiveAmount;
      }

      if (it.checked) {
        spentTotal += effectiveAmount;
        if (isCredit) {
          spentCredit += effectiveAmount;
          monthlyCreditTotal += WM.utils.toNumber(it.credit.monthlyPayment);
          activeCreditsCount++;
        } else {
          spentCash += effectiveAmount;
        }
      }
    });

    tab.creditBundles.forEach(function (b) {
      var bundleTotal = WM.utils.toNumber(b.totalAmount);
      plannedTotal += bundleTotal;
      plannedCredit += bundleTotal;

      if (b.checked) {
        spentTotal += bundleTotal;
        spentCredit += bundleTotal;
        monthlyCreditTotal += WM.utils.toNumber(b.monthlyPayment);
        activeCreditsCount++;
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

  WM.storage = {
    load: load,
    getState: function () { return state; },
    getActiveTab: getActiveTab,
    getBundleForItem: getBundleForItem,
    calculateTabTotals: calculateTabTotals,

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
      state.tabs = state.tabs.filter(function (t) { return t.id !== tabId; });
      if (state.activeTabId === tabId) {
        state.activeTabId = state.tabs[0].id;
      }
      persist(false, false);
      return true;
    },

    addCategory: function (name) {
      var tab = getActiveTab();
      var cat = {
        id: WM.utils.uid('cat'),
        name: name.trim() || 'Новая категория',
        collapsed: false
      };
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
      tab.creditBundles.forEach(function (b) {
        b.itemIds = b.itemIds.filter(function (id) { return !removedIds[id]; });
      });
      tab.creditBundles = tab.creditBundles.filter(function (b) { return b.itemIds.length > 0; });
      persist(false, false);
    },

    /* Перенос ('move') или копирование ('copy') категории со всеми её товарами в другую вкладку */
    transferCategory: function (catId, targetTabId, mode) {
      var srcTab = getActiveTab();
      var dstTab = state.tabs.find(function (t) { return t.id === targetTabId; });
      if (!dstTab || dstTab.id === srcTab.id) return false;

      var cat = srcTab.categories.find(function (c) { return c.id === catId; });
      if (!cat) return false;

      var isCopy = mode === 'copy';
      var newCat = {
        id: WM.utils.uid('cat'),
        name: cat.name,
        collapsed: false
      };
      dstTab.categories.push(newCat);

      var catItems = srcTab.items.filter(function (it) { return it.categoryId === catId; });
      var movedIds = {};
      catItems.forEach(function (it) {
        movedIds[it.id] = true;
        dstTab.items.push(cloneItem(it, newCat.id, isCopy));
      });

      if (!isCopy) {
        srcTab.categories = srcTab.categories.filter(function (c) { return c.id !== catId; });
        srcTab.items = srcTab.items.filter(function (it) { return it.categoryId !== catId; });
        srcTab.creditBundles.forEach(function (b) {
          b.itemIds = b.itemIds.filter(function (id) { return !movedIds[id]; });
        });
        srcTab.creditBundles = srcTab.creditBundles.filter(function (b) { return b.itemIds.length > 0; });
      }

      persist(false, false);
      return true;
    },

    /* Перенос ('move') или копирование ('copy') одной позиции в другую вкладку */
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
        srcTab.creditBundles.forEach(function (b) {
          b.itemIds = b.itemIds.filter(function (id) { return id !== itemId; });
        });
        srcTab.creditBundles = srcTab.creditBundles.filter(function (b) { return b.itemIds.length > 0; });
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
        if (!existing.bundleId) {
          existing.credit = {
            enabled: !!(payload.credit && payload.credit.enabled),
            months: Math.max(0, parseInt(payload.credit && payload.credit.months, 10) || 0),
            monthlyPayment: WM.utils.toNumber(payload.credit && payload.credit.monthlyPayment),
            totalAmount: WM.utils.toNumber(payload.credit && payload.credit.totalAmount),
            startDate: sanitizeDate(payload.credit && payload.credit.startDate)
          };
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
        credit: {
          enabled: !!(payload.credit && payload.credit.enabled),
          months: Math.max(0, parseInt(payload.credit && payload.credit.months, 10) || 0),
          monthlyPayment: WM.utils.toNumber(payload.credit && payload.credit.monthlyPayment),
          totalAmount: WM.utils.toNumber(payload.credit && payload.credit.totalAmount),
          startDate: sanitizeDate(payload.credit && payload.credit.startDate)
        },
        bundleId: null,
        createdAt: new Date().toISOString()
      };
      tab.items.push(item);
      persist(false, false);
      return item;
    },

    toggleItemChecked: function (itemId, checked) {
      var tab = getActiveTab();
      var item = tab.items.find(function (it) { return it.id === itemId; });
      if (!item) return;
      item.checked = !!checked;
      persist(false, false);
    },

    deleteItem: function (itemId) {
      var tab = getActiveTab();
      tab.items = tab.items.filter(function (it) { return it.id !== itemId; });
      tab.creditBundles.forEach(function (b) {
        b.itemIds = b.itemIds.filter(function (id) { return id !== itemId; });
      });
      tab.creditBundles = tab.creditBundles.filter(function (b) { return b.itemIds.length > 0; });
      persist(false, false);
    },

    saveCreditBundle: function (payload) {
      var tab = getActiveTab();
      var selectedIds = Array.isArray(payload.itemIds) ? payload.itemIds.slice() : [];
      if (selectedIds.length === 0) return null;

      var bundle = payload.id
        ? tab.creditBundles.find(function (b) { return b.id === payload.id; })
        : null;

      if (bundle) {
        bundle.itemIds.forEach(function (oldId) {
          if (selectedIds.indexOf(oldId) === -1) {
            var oldItem = tab.items.find(function (it) { return it.id === oldId; });
            if (oldItem && oldItem.bundleId === bundle.id) {
              oldItem.bundleId = null;
            }
          }
        });
      }

      if (!bundle) {
        bundle = {
          id: WM.utils.uid('bundle'),
          name: '',
          itemIds: [],
          months: 0,
          monthlyPayment: 0,
          totalAmount: 0,
          startDate: '',
          checked: true
        };
        tab.creditBundles.push(bundle);
      }

      bundle.name = (payload.name || '').trim() || 'Общий кредит';
      bundle.itemIds = selectedIds;
      bundle.months = Math.max(0, parseInt(payload.months, 10) || 0);
      bundle.monthlyPayment = WM.utils.toNumber(payload.monthlyPayment);
      bundle.totalAmount = WM.utils.toNumber(payload.totalAmount);
      bundle.startDate = sanitizeDate(payload.startDate);
      bundle.checked = !!payload.checked;

      selectedIds.forEach(function (id) {
        var it = tab.items.find(function (x) { return x.id === id; });
        if (it) {
          if (it.bundleId && it.bundleId !== bundle.id) {
            var other = tab.creditBundles.find(function (b) { return b.id === it.bundleId; });
            if (other) {
              other.itemIds = other.itemIds.filter(function (x) { return x !== id; });
            }
          }
          it.bundleId = bundle.id;
          it.credit = { enabled: false, months: 0, monthlyPayment: 0, totalAmount: 0, startDate: '' };
          if (bundle.checked) {
            it.checked = true;
          }
        }
      });

      tab.creditBundles = tab.creditBundles.filter(function (b) { return b.itemIds.length > 0; });
      persist(false, false);
      return bundle;
    },

    toggleBundleChecked: function (bundleId, checked) {
      var tab = getActiveTab();
      var bundle = tab.creditBundles.find(function (b) { return b.id === bundleId; });
      if (!bundle) return;
      bundle.checked = !!checked;
      bundle.itemIds.forEach(function (id) {
        var it = tab.items.find(function (x) { return x.id === id; });
        if (it) it.checked = !!checked;
      });
      persist(false, false);
    },

    deleteCreditBundle: function (bundleId) {
      var tab = getActiveTab();
      var bundle = tab.creditBundles.find(function (b) { return b.id === bundleId; });
      if (!bundle) return;
      bundle.itemIds.forEach(function (id) {
        var it = tab.items.find(function (x) { return x.id === id; });
        if (it && it.bundleId === bundleId) {
          it.bundleId = null;
        }
      });
      tab.creditBundles = tab.creditBundles.filter(function (b) { return b.id !== bundleId; });
      persist(false, false);
    }
  };
})(window);
