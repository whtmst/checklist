/* ==========================================================================
   WM_CHECKLIST — КОНТРОЛЛЕР ПРИЛОЖЕНИЯ, МОДАЛКИ, ПАНЕЛЬ И АВТО-ПУЛЛ
   ========================================================================== */
(function (global) {
  'use strict';

  var WM = (global.WMChecklist = global.WMChecklist || {});

  var filters = {
    search: '',
    status: 'all',
    priority: 'all',
    store: 'all'
  };

  var viewingItemId = null;
  var toastTimer = null;

  function showToast(message) {
    var node = document.getElementById('toast');
    node.textContent = message;
    node.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.classList.remove('show');
    }, 2800);
  }

  function setSyncStatus(level, label) {
    var ind = document.getElementById('syncIndicator');
    var text = document.getElementById('syncStatusText');
    ind.className = 'sync-indicator' + (level ? ' ' + level : '');
    if (label) text.textContent = label;
  }

  function openModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.classList.add('open');
    m.setAttribute('aria-hidden', 'false');
  }

  function closeModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.classList.remove('open');
    m.setAttribute('aria-hidden', 'true');
  }

  function openItemDrawer(itemId) {
    var tab = WM.storage.getActiveTab();
    var item = tab.items.find(function (x) { return x.id === itemId; });
    if (!item) return;
    viewingItemId = itemId;
    WM.render.renderItemDrawer(item, tab);
    var drawer = document.getElementById('itemDetailDrawer');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  }

  function closeItemDrawer() {
    viewingItemId = null;
    var drawer = document.getElementById('itemDetailDrawer');
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }

  function closeAllOverlays() {
    closeItemDrawer();
    document.querySelectorAll('.modal-backdrop.open').forEach(function (m) {
      m.classList.remove('open');
      m.setAttribute('aria-hidden', 'true');
    });
  }

  // --- Тема ---
  function applyTheme(theme) {
    var normalized = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', normalized);
    document.getElementById('themeToggleIcon').textContent = normalized === 'dark' ? '☀' : '☾';
    var metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', normalized === 'dark' ? '#141414' : '#EEEDEA');
    }
    try {
      localStorage.setItem(WM.CONFIG.THEME_KEY, normalized);
    } catch (e) {}
  }

  function initTheme() {
    var saved = 'dark';
    try {
      saved = localStorage.getItem(WM.CONFIG.THEME_KEY) || 'dark';
    } catch (e) {}
    applyTheme(saved);
  }

  // --- Перерисовка ---
  function refreshUI() {
    WM.render.renderAll(WM.storage.getState(), filters, {
      onSelectTab: function (tabId) {
        closeItemDrawer();
        WM.storage.setActiveTab(tabId);
        resetFilters(false);
        refreshUI();
      },
      onAddCategory: function () {
        openCategoryModal(null);
      },
      onEditCategory: function (catId) {
        openCategoryModal(catId);
      },
      onToggleCategoryCollapse: function (catId) {
        WM.storage.toggleCategoryCollapse(catId);
        refreshUI();
      },
      onAddItemInCategory: function (catId) {
        openItemModal(null, catId);
      },
      onViewItem: function (itemId) {
        openItemDrawer(itemId);
      },
      onEditItem: function (itemId) {
        openItemModal(itemId, null);
      },
      onToggleItem: function (itemId, checked) {
        WM.storage.toggleItemChecked(itemId, checked);
        refreshUI();
      },
      onEditBundle: function (bundleId) {
        openBundleModal(bundleId);
      },
      onToggleBundle: function (bundleId, checked) {
        WM.storage.toggleBundleChecked(bundleId, checked);
        refreshUI();
      },
      onResetFilters: function () {
        resetFilters(true);
      }
    });

    if (viewingItemId) {
      var tab = WM.storage.getActiveTab();
      var item = tab.items.find(function (x) { return x.id === viewingItemId; });
      if (item) {
        WM.render.renderItemDrawer(item, tab);
      } else {
        closeItemDrawer();
      }
    }
  }

  function resetFilters(shouldRender) {
    filters.search = '';
    filters.status = 'all';
    filters.priority = 'all';
    filters.store = 'all';
    document.getElementById('searchInput').value = '';
    document.getElementById('statusFilter').value = 'all';
    document.getElementById('priorityFilter').value = 'all';
    document.getElementById('storeFilter').value = 'all';
    if (shouldRender) refreshUI();
  }

  // --- Подсказки расчёта кредита (переплата + дата окончания) ---
  function buildScheduleHint(startDate, months, monthly) {
    var sched = WM.utils.calcCreditSchedule(startDate, months, monthly);
    if (!sched) return '';
    if (sched.isFinished) {
      return 'Окончание: ' + sched.endFormatted + ' (срок завершён).';
    }
    return 'До ' + sched.endFormatted + ' · осталось ' + sched.remainingMonths + ' из ' + sched.totalMonths + ' мес.';
  }

  function updateItemOverpayHint() {
    var price = WM.utils.toNumber(document.getElementById('itemPriceInput').value);
    var total = WM.utils.toNumber(document.getElementById('itemCreditTotal').value);
    var startDate = document.getElementById('itemCreditStartDate').value;
    var months = document.getElementById('itemCreditMonths').value;
    var monthly = document.getElementById('itemCreditMonthly').value;
    var note = document.getElementById('itemCreditOverpayNote');

    var lines = [];
    if (total > 0) {
      var diff = Math.round((total - price) * 100) / 100;
      if (diff > 0) {
        lines.push('Переплата банку: +' + WM.utils.formatMoney(diff) + '.');
      } else if (diff === 0) {
        lines.push('Рассрочка без переплаты.');
      } else {
        lines.push('Итоговая сумма ниже цены товара на ' + WM.utils.formatMoney(Math.abs(diff)) + '.');
      }
    }
    var schedLine = buildScheduleHint(startDate, months, monthly);
    if (schedLine) lines.push(schedLine);

    note.textContent = lines.length > 0
      ? lines.join(' ')
      : 'Введите реальный ежемесячный платёж, итоговую сумму и (по желанию) дату оформления.';
  }

  function updateBundleCalcHints() {
    var tab = WM.storage.getActiveTab();
    var checkboxes = document.querySelectorAll('#bundleItemsPicker input[type="checkbox"]:checked');
    var baseSum = 0;
    checkboxes.forEach(function (cb) {
      var it = tab.items.find(function (x) { return x.id === cb.value; });
      if (it) baseSum += it.price;
    });
    baseSum = WM.utils.toNumber(baseSum);
    document.getElementById('bundleBaseSumLabel').textContent = 'База: ' + WM.utils.formatMoney(baseSum);

    var total = WM.utils.toNumber(document.getElementById('bundleTotalInput').value);
    var startDate = document.getElementById('bundleStartDateInput').value;
    var months = document.getElementById('bundleMonthsInput').value;
    var monthly = document.getElementById('bundleMonthlyInput').value;
    var note = document.getElementById('bundleOverpayNote');

    var lines = [];
    if (total > 0) {
      var diff = Math.round((total - baseSum) * 100) / 100;
      if (diff > 0) {
        lines.push('Переплата: +' + WM.utils.formatMoney(diff) + ' к базе ' + WM.utils.formatMoney(baseSum) + '.');
      } else if (diff === 0) {
        lines.push('Рассрочка без переплаты.');
      } else {
        lines.push('Итоговая сумма ниже базы на ' + WM.utils.formatMoney(Math.abs(diff)) + '.');
      }
    }
    var schedLine = buildScheduleHint(startDate, months, monthly);
    if (schedLine) lines.push(schedLine);

    note.textContent = lines.length > 0
      ? lines.join(' ')
      : 'Укажите итоговую сумму, ежемесячный платёж и (по желанию) дату оформления.';
  }

  // --- Модалка: Позиция ---
  function populateItemModalSelects(selectedCatId) {
    var tab = WM.storage.getActiveTab();
    var catSelect = document.getElementById('itemCategorySelect');
    catSelect.innerHTML = '';
    tab.categories.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      catSelect.appendChild(opt);
    });
    if (selectedCatId) catSelect.value = selectedCatId;

    var prioSelect = document.getElementById('itemPrioritySelect');
    if (prioSelect.options.length === 0) {
      WM.CONFIG.PRIORITIES.forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.label;
        prioSelect.appendChild(opt);
      });
    }

    var storeSelect = document.getElementById('itemStoreSelect');
    if (storeSelect.options.length === 0) {
      WM.CONFIG.STORES.forEach(function (s) {
        var opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        storeSelect.appendChild(opt);
      });
      var customOpt = document.createElement('option');
      customOpt.value = WM.CONFIG.CUSTOM_STORE_VALUE;
      customOpt.textContent = 'Свой вариант...';
      storeSelect.appendChild(customOpt);
    }
  }

  function openItemModal(itemId, presetCategoryId) {
    var tab = WM.storage.getActiveTab();
    if (tab.categories.length === 0) {
      showToast('Сначала создай хотя бы одну категорию');
      openCategoryModal(null);
      return;
    }

    var item = itemId ? tab.items.find(function (x) { return x.id === itemId; }) : null;
    populateItemModalSelects(item ? item.categoryId : (presetCategoryId || tab.categories[0].id));

    document.getElementById('itemModalTitle').textContent = item ? 'Редактировать позицию' : 'Новая позиция';
    document.getElementById('itemIdInput').value = item ? item.id : '';
    document.getElementById('itemTitleInput').value = item ? item.title : '';
    document.getElementById('itemPriceInput').value = item ? item.price : '';
    document.getElementById('itemPrioritySelect').value = item ? item.priority : 'medium';
    document.getElementById('itemLinkInput').value = item ? item.link : '';
    document.getElementById('itemNoteInput').value = item ? item.note : '';
    document.getElementById('itemCheckedInput').checked = item ? !!item.checked : false;

    var storeSelect = document.getElementById('itemStoreSelect');
    var customGroup = document.getElementById('customStoreGroup');
    var customInput = document.getElementById('itemCustomStoreInput');
    if (item && WM.CONFIG.STORES.indexOf(item.store) === -1 && item.store) {
      storeSelect.value = WM.CONFIG.CUSTOM_STORE_VALUE;
      customInput.value = item.store;
      customGroup.classList.remove('hidden');
    } else {
      storeSelect.value = item ? item.store : WM.CONFIG.STORES[0];
      customInput.value = '';
      customGroup.classList.add('hidden');
    }

    var inBundle = item ? !!WM.storage.getBundleForItem(tab, item.id) : false;
    var creditCheck = document.getElementById('itemCreditCheck');
    var creditFields = document.getElementById('itemCreditFields');
    var lockedHint = document.getElementById('itemBundleLockedHint');

    creditCheck.disabled = inBundle;
    lockedHint.classList.toggle('hidden', !inBundle);

    var isCredit = !inBundle && item && item.credit && item.credit.enabled;
    creditCheck.checked = !!isCredit;
    creditFields.classList.toggle('hidden', !isCredit);
    document.getElementById('itemCreditStartDate').value = isCredit && item.credit.startDate ? item.credit.startDate : '';
    document.getElementById('itemCreditMonths').value = isCredit && item.credit.months ? item.credit.months : '';
    document.getElementById('itemCreditMonthly').value = isCredit ? item.credit.monthlyPayment : '';
    document.getElementById('itemCreditTotal').value = isCredit ? item.credit.totalAmount : '';
    updateItemOverpayHint();

    document.getElementById('deleteItemBtn').classList.toggle('hidden', !item);
    openModal('itemModal');
    setTimeout(function () {
      document.getElementById('itemTitleInput').focus();
    }, 50);
  }

  // --- Модалка: Общий кредит ---
  function openBundleModal(bundleId) {
    var tab = WM.storage.getActiveTab();
    if (tab.items.length === 0) {
      showToast('Сначала добавь товары, чтобы объединить их в кредит');
      return;
    }

    var bundle = bundleId ? tab.creditBundles.find(function (b) { return b.id === bundleId; }) : null;
    document.getElementById('bundleModalTitle').textContent = bundle ? 'Редактировать общий кредит' : 'Объединить товары в один кредит';
    document.getElementById('bundleIdInput').value = bundle ? bundle.id : '';
    document.getElementById('bundleNameInput').value = bundle ? bundle.name : '';
    document.getElementById('bundleStartDateInput').value = bundle && bundle.startDate ? bundle.startDate : '';
    document.getElementById('bundleMonthsInput').value = bundle && bundle.months ? bundle.months : '';
    document.getElementById('bundleMonthlyInput').value = bundle ? bundle.monthlyPayment : '';
    document.getElementById('bundleTotalInput').value = bundle ? bundle.totalAmount : '';
    document.getElementById('bundleCheckedInput').checked = bundle ? !!bundle.checked : true;
    document.getElementById('deleteBundleBtn').classList.toggle('hidden', !bundle);

    var picker = document.getElementById('bundleItemsPicker');
    picker.innerHTML = '';

    tab.items.forEach(function (it) {
      var cat = tab.categories.find(function (c) { return c.id === it.categoryId; });
      var isSelected = bundle ? bundle.itemIds.indexOf(it.id) !== -1 : false;

      var row = document.createElement('label');
      row.className = 'bundle-picker-row';

      var left = document.createElement('div');
      left.className = 'bundle-picker-left';

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = it.id;
      cb.checked = isSelected;
      cb.addEventListener('change', updateBundleCalcHints);

      var txt = document.createElement('div');
      var titleDiv = document.createElement('div');
      titleDiv.className = 'bundle-picker-title';
      titleDiv.textContent = it.title;
      var catDiv = document.createElement('div');
      catDiv.className = 'bundle-picker-cat';
      catDiv.textContent = cat ? cat.name : '';
      txt.appendChild(titleDiv);
      txt.appendChild(catDiv);

      left.appendChild(cb);
      left.appendChild(txt);

      var priceSpan = document.createElement('span');
      priceSpan.className = 'bundle-picker-price';
      priceSpan.textContent = WM.utils.formatMoney(it.price);

      row.appendChild(left);
      row.appendChild(priceSpan);
      picker.appendChild(row);
    });

    updateBundleCalcHints();
    openModal('bundleModal');
  }

  // --- Модалки: Категория, Вкладка, Синхронизация ---
  function openCategoryModal(catId) {
    var tab = WM.storage.getActiveTab();
    var cat = catId ? tab.categories.find(function (c) { return c.id === catId; }) : null;
    document.getElementById('categoryModalTitle').textContent = cat ? 'Редактировать категорию' : 'Новая категория';
    document.getElementById('categoryIdInput').value = cat ? cat.id : '';
    document.getElementById('categoryNameInput').value = cat ? cat.name : '';
    document.getElementById('deleteCategoryBtn').classList.toggle('hidden', !cat);
    openModal('categoryModal');
    setTimeout(function () {
      document.getElementById('categoryNameInput').focus();
    }, 50);
  }

  function openTabModal(tabId) {
    var state = WM.storage.getState();
    var tab = tabId ? state.tabs.find(function (t) { return t.id === tabId; }) : null;
    document.getElementById('tabModalTitle').textContent = tab ? 'Настройки вкладки' : 'Новая вкладка';
    document.getElementById('tabIdInput').value = tab ? tab.id : '';
    document.getElementById('tabNameInput').value = tab ? tab.name : '';
    document.getElementById('deleteTabBtn').classList.toggle('hidden', !tab || state.tabs.length <= 1);
    openModal('tabModal');
    setTimeout(function () {
      document.getElementById('tabNameInput').focus();
    }, 50);
  }

  function openSyncModal() {
    var s = WM.sync.getSettings();
    document.getElementById('ghTokenInput').value = s.token;
    document.getElementById('ghGistIdInput').value = s.gistId;
    document.getElementById('ghAutoSyncCheck').checked = !!s.autoSync;
    document.getElementById('syncModalStatus').textContent = s.lastSyncAt
      ? 'Последняя синхронизация: ' + WM.utils.formatTime(s.lastSyncAt)
      : 'Синхронизация с GitHub ещё не выполнялась.';
    openModal('syncModal');
  }

  function saveSyncFieldsFromModal() {
    WM.sync.saveSettings({
      token: document.getElementById('ghTokenInput').value,
      gistId: document.getElementById('ghGistIdInput').value,
      autoSync: document.getElementById('ghAutoSyncCheck').checked
    });
  }

  // --- Экономная авто-проверка обновлений с GitHub (ETag + 304) ---
  async function runAutoPull(force) {
    var updated = await WM.sync.checkForRemoteUpdates(force);
    if (updated) {
      refreshUI();
      var t = WM.utils.formatTime(WM.sync.getSettings().lastSyncAt);
      setSyncStatus('ok', 'GIST // ' + t);
      showToast('Обновлено с GitHub');
    }
  }

  function bindEvents() {
    document.querySelectorAll('[data-close-modal]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        closeModal(btn.getAttribute('data-close-modal'));
      });
    });

    document.querySelectorAll('.modal-backdrop').forEach(function (backdrop) {
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) closeModal(backdrop.id);
      });
    });

    document.getElementById('closeDrawerBtn').addEventListener('click', closeItemDrawer);
    document.getElementById('itemDetailDrawer').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) closeItemDrawer();
    });
    document.getElementById('drawerEditBtn').addEventListener('click', function () {
      if (!viewingItemId) return;
      openItemModal(viewingItemId, null);
    });
    document.getElementById('drawerCheckedToggle').addEventListener('change', function (e) {
      if (!viewingItemId) return;
      WM.storage.toggleItemChecked(viewingItemId, e.target.checked);
      refreshUI();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAllOverlays();
    });

    // Авто-подгрузка при возврате на вкладку (разблокировал телефон / переключил окно)
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) runAutoPull(false);
    });
    window.addEventListener('focus', function () {
      runAutoPull(false);
    });

    document.getElementById('themeToggleBtn').addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });

    document.getElementById('addTabBtn').addEventListener('click', function () { openTabModal(null); });
    document.getElementById('manageTabBtn').addEventListener('click', function () {
      openTabModal(WM.storage.getActiveTab().id);
    });
    document.getElementById('addItemBtn').addEventListener('click', function () { openItemModal(null, null); });
    document.getElementById('addCategoryBtn').addEventListener('click', function () { openCategoryModal(null); });
    document.getElementById('addBundleBtn').addEventListener('click', function () { openBundleModal(null); });
    document.getElementById('addBundleInlineBtn').addEventListener('click', function () { openBundleModal(null); });
    document.getElementById('openSyncModalBtn').addEventListener('click', openSyncModal);

    document.getElementById('quickSyncBtn').addEventListener('click', async function () {
      if (!WM.sync.hasToken()) {
        openSyncModal();
        return;
      }
      setSyncStatus('pending', 'SYNC // PULL...');
      try {
        await WM.sync.pullFromGist();
        refreshUI();
        setSyncStatus('ok', 'GIST // ' + WM.utils.formatTime(WM.sync.getSettings().lastSyncAt));
        showToast('Данные обновлены из GitHub Gist');
      } catch (err) {
        setSyncStatus('error', 'SYNC // ERROR');
        showToast(err.message);
      }
    });

    document.getElementById('searchInput').addEventListener('input', function (e) {
      filters.search = e.target.value;
      refreshUI();
    });
    document.getElementById('statusFilter').addEventListener('change', function (e) {
      filters.status = e.target.value;
      refreshUI();
    });
    document.getElementById('priorityFilter').addEventListener('change', function (e) {
      filters.priority = e.target.value;
      refreshUI();
    });
    document.getElementById('storeFilter').addEventListener('change', function (e) {
      filters.store = e.target.value;
      refreshUI();
    });

    document.getElementById('itemStoreSelect').addEventListener('change', function (e) {
      var isCustom = e.target.value === WM.CONFIG.CUSTOM_STORE_VALUE;
      document.getElementById('customStoreGroup').classList.toggle('hidden', !isCustom);
      if (isCustom) document.getElementById('itemCustomStoreInput').focus();
    });

    document.getElementById('itemCreditCheck').addEventListener('change', function (e) {
      document.getElementById('itemCreditFields').classList.toggle('hidden', !e.target.checked);
      if (e.target.checked && !document.getElementById('itemCreditTotal').value) {
        var priceVal = document.getElementById('itemPriceInput').value;
        if (priceVal) document.getElementById('itemCreditTotal').value = priceVal;
      }
      updateItemOverpayHint();
    });

    ['itemPriceInput', 'itemCreditTotal', 'itemCreditMonths', 'itemCreditMonthly', 'itemCreditStartDate'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', updateItemOverpayHint);
    });
    ['bundleTotalInput', 'bundleMonthsInput', 'bundleMonthlyInput', 'bundleStartDateInput'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', updateBundleCalcHints);
    });

    // Сохранение позиции
    document.getElementById('itemForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var title = document.getElementById('itemTitleInput').value.trim();
      if (!title) return;

      var storeVal = document.getElementById('itemStoreSelect').value;
      if (storeVal === WM.CONFIG.CUSTOM_STORE_VALUE) {
        storeVal = document.getElementById('itemCustomStoreInput').value.trim() || 'Свой вариант';
      }

      var isCredit = document.getElementById('itemCreditCheck').checked;
      WM.storage.saveItem({
        id: document.getElementById('itemIdInput').value || null,
        title: title,
        categoryId: document.getElementById('itemCategorySelect').value,
        price: document.getElementById('itemPriceInput').value,
        priority: document.getElementById('itemPrioritySelect').value,
        store: storeVal,
        link: document.getElementById('itemLinkInput').value,
        note: document.getElementById('itemNoteInput').value,
        checked: document.getElementById('itemCheckedInput').checked,
        credit: {
          enabled: isCredit,
          startDate: document.getElementById('itemCreditStartDate').value,
          months: document.getElementById('itemCreditMonths').value,
          monthlyPayment: document.getElementById('itemCreditMonthly').value,
          totalAmount: document.getElementById('itemCreditTotal').value
        }
      });

      closeModal('itemModal');
      refreshUI();
      showToast('Позиция сохранена');
    });

    document.getElementById('deleteItemBtn').addEventListener('click', function () {
      var id = document.getElementById('itemIdInput').value;
      if (!id) return;
      if (confirm('Удалить эту позицию?')) {
        WM.storage.deleteItem(id);
        closeModal('itemModal');
        if (viewingItemId === id) closeItemDrawer();
        refreshUI();
        showToast('Позиция удалена');
      }
    });

    // Сохранение общего кредита
    document.getElementById('bundleForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var checkedBoxes = document.querySelectorAll('#bundleItemsPicker input[type="checkbox"]:checked');
      var itemIds = [];
      checkedBoxes.forEach(function (cb) { itemIds.push(cb.value); });

      if (itemIds.length === 0) {
        showToast('Выбери хотя бы один товар для кредита');
        return;
      }

      WM.storage.saveCreditBundle({
        id: document.getElementById('bundleIdInput').value || null,
        name: document.getElementById('bundleNameInput').value,
        itemIds: itemIds,
        startDate: document.getElementById('bundleStartDateInput').value,
        months: document.getElementById('bundleMonthsInput').value,
        monthlyPayment: document.getElementById('bundleMonthlyInput').value,
        totalAmount: document.getElementById('bundleTotalInput').value,
        checked: document.getElementById('bundleCheckedInput').checked
      });

      closeModal('bundleModal');
      refreshUI();
      showToast('Общий кредит сохранён');
    });

    document.getElementById('deleteBundleBtn').addEventListener('click', function () {
      var id = document.getElementById('bundleIdInput').value;
      if (!id) return;
      if (confirm('Удалить этот общий кредит? Сами товары останутся в списке.')) {
        WM.storage.deleteCreditBundle(id);
        closeModal('bundleModal');
        refreshUI();
        showToast('Общий кредит удалён');
      }
    });

    // Категория
    document.getElementById('categoryForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var id = document.getElementById('categoryIdInput').value;
      var name = document.getElementById('categoryNameInput').value.trim();
      if (!name) return;
      if (id) {
        WM.storage.renameCategory(id, name);
        showToast('Категория переименована');
      } else {
        WM.storage.addCategory(name);
        showToast('Категория создана');
      }
      closeModal('categoryModal');
      refreshUI();
    });

    document.getElementById('deleteCategoryBtn').addEventListener('click', function () {
      var id = document.getElementById('categoryIdInput').value;
      if (!id) return;
      if (confirm('Удалить категорию вместе со всеми её позициями?')) {
        WM.storage.deleteCategory(id);
        closeModal('categoryModal');
        refreshUI();
        showToast('Категория удалена');
      }
    });

    // Вкладка
    document.getElementById('tabForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var id = document.getElementById('tabIdInput').value;
      var name = document.getElementById('tabNameInput').value.trim();
      if (!name) return;
      if (id) {
        WM.storage.renameTab(id, name);
        showToast('Вкладка переименована');
      } else {
        WM.storage.addTab(name);
        resetFilters(false);
        showToast('Новая вкладка создана');
      }
      closeModal('tabModal');
      refreshUI();
    });

    document.getElementById('deleteTabBtn').addEventListener('click', function () {
      var id = document.getElementById('tabIdInput').value;
      if (!id) return;
      if (confirm('Удалить эту вкладку со всеми категориями и товарами?')) {
        WM.storage.deleteTab(id);
        closeModal('tabModal');
        resetFilters(false);
        refreshUI();
        showToast('Вкладка удалена');
      }
    });

    // Настройки синхронизации
    document.getElementById('saveSyncSettingsBtn').addEventListener('click', function () {
      saveSyncFieldsFromModal();
      var hasTok = WM.sync.hasToken();
      setSyncStatus(hasTok ? 'ok' : '', hasTok ? 'GIST // READY' : 'LOCAL // OFFLINE');
      document.getElementById('syncModalStatus').textContent = 'Настройки сохранены в этом браузере.';
      showToast('Настройки синхронизации сохранены');
    });

    document.getElementById('findGistBtn').addEventListener('click', async function () {
      saveSyncFieldsFromModal();
      var log = document.getElementById('syncModalStatus');
      log.textContent = 'Ищу существующий Gist...';
      try {
        var found = await WM.sync.findExistingGist();
        if (found) {
          document.getElementById('ghGistIdInput').value = found;
          log.textContent = 'Найден Gist: ' + found + '. Теперь можно нажать «Загрузить с GitHub ↓».';
          showToast('Gist найден!');
        } else {
          log.textContent = 'Gist с файлом ' + WM.CONFIG.GIST_FILENAME + ' не найден. Нажми «Отправить в GitHub ↑», чтобы создать его.';
        }
      } catch (err) {
        log.textContent = err.message;
      }
    });

    document.getElementById('pushGistBtn').addEventListener('click', async function () {
      saveSyncFieldsFromModal();
      var log = document.getElementById('syncModalStatus');
      log.textContent = 'Отправляю данные в Secret Gist...';
      setSyncStatus('pending', 'SYNC // PUSH...');
      try {
        var data = await WM.sync.pushToGist();
        document.getElementById('ghGistIdInput').value = data.id;
        var t = WM.utils.formatTime(WM.sync.getSettings().lastSyncAt);
        log.textContent = 'Успешно сохранено в Gist (' + data.id + ') в ' + t;
        setSyncStatus('ok', 'GIST // ' + t);
        showToast('Сохранено в GitHub Gist');
      } catch (err) {
        log.textContent = err.message;
        setSyncStatus('error', 'SYNC // ERROR');
      }
    });

    document.getElementById('pullGistBtn').addEventListener('click', async function () {
      saveSyncFieldsFromModal();
      var log = document.getElementById('syncModalStatus');
      log.textContent = 'Загружаю данные из Secret Gist...';
      setSyncStatus('pending', 'SYNC // PULL...');
      try {
        await WM.sync.pullFromGist();
        document.getElementById('ghGistIdInput').value = WM.sync.getSettings().gistId;
        var t = WM.utils.formatTime(WM.sync.getSettings().lastSyncAt);
        log.textContent = 'Данные загружены из GitHub в ' + t;
        setSyncStatus('ok', 'GIST // ' + t);
        refreshUI();
        showToast('Список загружен с GitHub');
      } catch (err) {
        log.textContent = err.message;
        setSyncStatus('error', 'SYNC // ERROR');
      }
    });

    // Локальный JSON бэкап
    document.getElementById('exportFileBtn').addEventListener('click', function () {
      WM.sync.downloadJsonFile();
      showToast('Файл .json скачан');
    });

    document.getElementById('importFileInput').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          WM.sync.importJsonText(String(reader.result || ''));
          refreshUI();
          closeModal('syncModal');
          showToast('Резервная копия загружена');
        } catch (err) {
          showToast('Ошибка: ' + err.message);
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    document.getElementById('copyJsonBtn').addEventListener('click', async function () {
      var text = JSON.stringify(WM.storage.getState(), null, 2);
      try {
        await navigator.clipboard.writeText(text);
        showToast('JSON скопирован в буфер обмена');
      } catch (err) {
        showToast('Не удалось скопировать — используй «Скачать .json»');
      }
    });

    document.getElementById('clearAllDataBtn').addEventListener('click', function () {
      if (confirm('Очистить абсолютно все вкладки, категории и позиции? Это действие нельзя отменить.')) {
        WM.storage.resetAll();
        closeItemDrawer();
        resetFilters(false);
        refreshUI();
        closeModal('syncModal');
        showToast('Все данные очищены');
      }
    });
  }

  // --- Инициализация ---
  function init() {
    initTheme();
    WM.storage.load();
    WM.sync.loadSettings();

    WM.storage.onChange(function () {
      WM.sync.scheduleAutoPush(setSyncStatus);
    });

    bindEvents();
    refreshUI();

    if (WM.sync.hasToken()) {
      var s = WM.sync.getSettings();
      setSyncStatus('ok', s.lastSyncAt ? 'GIST // ' + WM.utils.formatTime(s.lastSyncAt) : 'GIST // READY');
      // При открытии страницы мягко проверяем, нет ли более свежих данных с другого устройства
      runAutoPull(true);
    } else {
      setSyncStatus('', 'LOCAL // OFFLINE');
    }

    // Фоновая проверка раз в 60 сек (только пока вкладка открыта на экране; 304 не тратит лимит)
    setInterval(function () {
      runAutoPull(false);
    }, WM.CONFIG.AUTO_PULL_INTERVAL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
