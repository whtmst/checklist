/* ==========================================================================
   WM_CHECKLIST — КОНТРОЛЛЕР ПРИЛОЖЕНИЯ, МОДАЛКИ, ПАНЕЛЬ КРЕДИТОВ И АВТО-ПУЛЛ
   ========================================================================== */
(function (global) {
  'use strict';

  var WM = (global.WMChecklist = global.WMChecklist || {});

  var filters = {
    sort: 'priority',
    status: 'all',
    priority: 'all',
    store: 'all'
  };
  var spotlightMatches = [];
  var spotlightIdx = 0;

  var creditsTypeFilter = 'all';
  var viewingItemId = null;
  var toastTimer = null;
  var newItemDraft = null;
  var formSnapshots = {};
  var drawerGalleryUrls = [];
  var drawerGalleryIdx = 0;
  var bundlePickerSelected = {};
  var bundlePickerCollapsed = {};
  var currentEditingBundleId = null;

  function getPhotoInputs() {
    return [
      document.getElementById('itemImageInput1'),
      document.getElementById('itemImageInput2'),
      document.getElementById('itemImageInput3')
    ];
  }

  function updatePhotoInputsVisibility() {
    var inputs = getPhotoInputs();
    if (!inputs[0]) return;
    var v1 = inputs[0].value.trim();
    var v2 = inputs[1].value.trim();
    var v3 = inputs[2].value.trim();
    inputs[1].classList.toggle('hidden', !v1 && !v2 && !v3);
    inputs[2].classList.toggle('hidden', !v2 && !v3);
  }

  function setPhotoInputValues(urls) {
    var arr = Array.isArray(urls) ? urls : [];
    var inputs = getPhotoInputs();
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i]) inputs[i].value = arr[i] || '';
    }
    updatePhotoInputsVisibility();
  }

  function readPhotoInputValues() {
    var res = [];
    getPhotoInputs().forEach(function (inp) {
      if (inp && inp.value.trim()) res.push(inp.value.trim());
    });
    return res;
  }

  function updateGalleryView() {
    var wrap = document.getElementById('drawerGallery');
    var img = document.getElementById('drawerGalleryImg');
    var prevBtn = document.getElementById('galleryPrevBtn');
    var nextBtn = document.getElementById('galleryNextBtn');
    var dotsWrap = document.getElementById('galleryDots');

    if (!wrap || drawerGalleryUrls.length === 0) {
      if (wrap) wrap.classList.add('hidden');
      return;
    }

    if (drawerGalleryIdx >= drawerGalleryUrls.length) drawerGalleryIdx = 0;
    if (drawerGalleryIdx < 0) drawerGalleryIdx = drawerGalleryUrls.length - 1;

    wrap.classList.remove('hidden');
    img.src = drawerGalleryUrls[drawerGalleryIdx];

    var multi = drawerGalleryUrls.length > 1;
    prevBtn.classList.toggle('hidden', !multi);
    nextBtn.classList.toggle('hidden', !multi);
    dotsWrap.classList.toggle('hidden', !multi);
    dotsWrap.innerHTML = '';

    if (multi) {
      drawerGalleryUrls.forEach(function (_, idx) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'gallery-dot' + (idx === drawerGalleryIdx ? ' active' : '');
        dot.setAttribute('aria-label', 'Фото ' + (idx + 1));
        dot.addEventListener('click', function () {
          drawerGalleryIdx = idx;
          updateGalleryView();
        });
        dotsWrap.appendChild(dot);
      });
    }
  }

  function setupDrawerGallery(urls) {
    drawerGalleryUrls = (urls || []).filter(function (u) { return !!String(u || '').trim(); });
    drawerGalleryIdx = 0;
    updateGalleryView();
  }

  function openPhotoLightbox() {
    if (drawerGalleryUrls.length === 0) return;
    var lb = document.getElementById('photoLightbox');
    lb.classList.add('open');
    lb.setAttribute('aria-hidden', 'false');
    updateLightboxView();
  }

  function closePhotoLightbox() {
    var lb = document.getElementById('photoLightbox');
    if (!lb) return;
    lb.classList.remove('open');
    lb.setAttribute('aria-hidden', 'true');
  }

  function updateLightboxView() {
    if (drawerGalleryUrls.length === 0) {
      closePhotoLightbox();
      return;
    }
    if (drawerGalleryIdx >= drawerGalleryUrls.length) drawerGalleryIdx = 0;
    if (drawerGalleryIdx < 0) drawerGalleryIdx = drawerGalleryUrls.length - 1;

    document.getElementById('lightboxImg').src = drawerGalleryUrls[drawerGalleryIdx];
    var multi = drawerGalleryUrls.length > 1;
    document.getElementById('lightboxPrevBtn').classList.toggle('hidden', !multi);
    document.getElementById('lightboxNextBtn').classList.toggle('hidden', !multi);
    var counter = document.getElementById('lightboxCounter');
    counter.classList.toggle('hidden', !multi);
    if (multi) {
      counter.textContent = (drawerGalleryIdx + 1) + ' / ' + drawerGalleryUrls.length;
    }
  }

  function autoResizeTextarea(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    var maxH = Math.max(220, Math.round(window.innerHeight * 0.48));
    var next = Math.max(96, Math.min(ta.scrollHeight + 2, maxH));
    ta.style.height = next + 'px';
    ta.style.overflowY = ta.scrollHeight > maxH ? 'auto' : 'hidden';
  }

  function getFormSnapshot(modalId) {
    var m = document.getElementById(modalId);
    if (!m) return '';
    var form = m.querySelector('form');
    if (!form) return '';
    var parts = [];
    form.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (el.type === 'hidden') return;
      if (el.type === 'checkbox' || el.type === 'radio') {
        parts.push((el.id || el.value) + ':' + (el.checked ? '1' : '0'));
      } else {
        parts.push((el.id || '') + ':' + el.value);
      }
    });
    return parts.join('|');
  }

  function captureFormSnapshot(modalId) {
    formSnapshots[modalId] = getFormSnapshot(modalId);
  }

  function isFormDirty(modalId) {
    if (!formSnapshots.hasOwnProperty(modalId)) return false;
    return getFormSnapshot(modalId) !== formSnapshots[modalId];
  }

  function saveNewItemDraft() {
    // Сохраняем черновик только при создании НОВОЙ позиции
    if (document.getElementById('itemIdInput').value) return;
    var title = document.getElementById('itemTitleInput').value;
    var price = document.getElementById('itemPriceInput').value;
    var link = document.getElementById('itemLinkInput').value;
    var note = document.getElementById('itemNoteInput').value;
    var customStore = document.getElementById('itemCustomStoreInput').value;
    var images = readPhotoInputValues();
    if (!title && !price && !link && !note && !customStore && images.length === 0) {
      newItemDraft = null;
      return;
    }
    newItemDraft = {
      title: title,
      categoryId: document.getElementById('itemCategorySelect').value,
      price: price,
      priority: document.getElementById('itemPrioritySelect').value,
      store: document.getElementById('itemStoreSelect').value,
      customStore: customStore,
      link: link,
      note: note,
      images: images,
      checked: document.getElementById('itemCheckedInput').checked
    };
  }

  function clearNewItemDraft() {
    newItemDraft = null;
  }

  function tryCloseModal(id, force) {
    var guarded = ['itemModal', 'bundleModal', 'categoryModal', 'tabModal'];
    if (!force && guarded.indexOf(id) !== -1 && isFormDirty(id)) {
      if (id === 'itemModal' && !document.getElementById('itemIdInput').value) {
        saveNewItemDraft();
      }
      if (!confirm('Есть несохранённые данные. Закрыть окно?')) {
        return false;
      }
    }
    closeModal(id);
    return true;
  }

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

  function isModalOpen(id) {
    var m = document.getElementById(id);
    return !!(m && m.classList.contains('open'));
  }

  function openItemDrawer(itemId) {
    var tab = WM.storage.getActiveTab();
    var item = tab.items.find(function (x) { return x.id === itemId; });
    if (!item) return;
    viewingItemId = itemId;
    WM.render.renderItemDrawer(item, tab, getCommonHandlers());
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

  function getCommonHandlers() {
    return {
      onSelectTab: function (tabId) {
        closeItemDrawer();
        WM.storage.setActiveTab(tabId);
        resetFilters(false);
        refreshUI();
      },
      onAddCategory: function () { openCategoryModal(null); },
      onEditCategory: function (catId) { openCategoryModal(catId); },
      onMoveCategory: function (catId, delta) {
        if (WM.storage.moveCategory(catId, delta)) refreshUI();
      },
      onReorderCategory: function (fromIdx, toIdx) {
        if (WM.storage.reorderCategory(fromIdx, toIdx)) refreshUI();
      },
      onEditTab: function (tabId) { openTabModal(tabId); },
      onMoveTab: function (tabId, delta) {
        if (WM.storage.moveTab(tabId, delta)) refreshUI();
      },
      onReorderTab: function (fromIdx, toIdx) {
        if (WM.storage.reorderTab(fromIdx, toIdx)) refreshUI();
      },
      onToggleCategoryCollapse: function (catId) {
        WM.storage.toggleCategoryCollapse(catId);
        refreshUI();
      },
      onAddItemInCategory: function (catId) { openItemModal(null, catId); },
      onViewItem: function (itemId) { openItemDrawer(itemId); },
      onEditItem: function (itemId) { openItemModal(itemId, null); },
      onToggleItem: function (itemId, checked) {
        WM.storage.toggleItemChecked(itemId, checked);
        refreshUI();
      },
      onEditBundle: function (bundleId) { openBundleModal(bundleId); },
      onToggleBundle: function (bundleId, checked) {
        WM.storage.toggleBundleChecked(bundleId, checked);
        refreshUI();
      },
      onResetFilters: function () { resetFilters(true); },
      onRenderDrawerGallery: setupDrawerGallery
    };
  }

  function refreshUI() {
    var handlers = getCommonHandlers();
    WM.render.renderAll(WM.storage.getState(), filters, handlers);

    if (viewingItemId) {
      var tab = WM.storage.getActiveTab();
      var item = tab.items.find(function (x) { return x.id === viewingItemId; });
      if (item) WM.render.renderItemDrawer(item, tab, handlers);
      else closeItemDrawer();
    }

    if (isModalOpen('creditsModal')) {
      WM.render.renderGlobalCreditsModal(creditsTypeFilter, handlers);
    }
    if (isModalOpen('tabsManagerModal')) {
      WM.render.renderTabsManager(WM.storage.getState(), handlers);
    }
    if (isModalOpen('categoriesManagerModal')) {
      WM.render.renderCategoriesManager(WM.storage.getActiveTab(), handlers);
    }
  }

  function resetFilters(shouldRender) {
    filters.sort = 'priority';
    filters.status = 'all';
    filters.priority = 'all';
    filters.store = 'all';
    document.getElementById('sortFilter').value = 'priority';
    document.getElementById('statusFilter').value = 'all';
    document.getElementById('priorityFilter').value = 'all';
    document.getElementById('storeFilter').value = 'all';
    if (shouldRender) refreshUI();
  }

  function refreshSpotlight() {
    var q = document.getElementById('globalSearchInput').value;
    spotlightMatches = WM.render.renderGlobalSearch(q, spotlightIdx, {
      onSelectSearchResult: function (tabId, itemId) {
        closeModal('globalSearchModal');
        if (WM.storage.getActiveTab().id !== tabId) {
          WM.storage.setActiveTab(tabId);
          resetFilters(false);
        }
        refreshUI();
        openItemDrawer(itemId);
      }
    });
    if (spotlightIdx >= spotlightMatches.length) spotlightIdx = 0;
  }

  function openGlobalSearch() {
    var inp = document.getElementById('globalSearchInput');
    inp.value = '';
    spotlightIdx = 0;
    openModal('globalSearchModal');
    refreshSpotlight();
    setTimeout(function () { inp.focus(); }, 40);
  }

  // --- Подсказки и переключение полей в окне «Оформить в кредит» ---
  function syncBundleCreditTypeUI() {
    var type = document.getElementById('bundleTypeSelect').value;
    var isGrace = type === 'grace';
    document.getElementById('bundleCustomTypeGroup').classList.toggle('hidden', type !== 'custom');
    document.getElementById('bundleInstallmentRows').classList.toggle('hidden', isGrace);
    document.getElementById('bundleGraceRows').classList.toggle('hidden', !isGrace);
    updateBundleCalcHints();
  }

  function buildScheduleHint(startDate, months, monthly) {
    var sched = WM.utils.calcCreditSchedule(startDate, months, monthly);
    if (!sched) return '';
    if (sched.isFinished) return 'Окончание: ' + sched.endFormatted + ' (срок завершён).';
    return 'До ' + sched.endFormatted + ' · осталось ' + sched.remainingMonths + ' из ' + sched.totalMonths + ' мес.';
  }

  function updateBundleCalcHints() {
    var baseSum = 0;
    Object.keys(bundlePickerSelected).forEach(function (id) {
      if (!bundlePickerSelected[id]) return;
      var found = WM.storage.findItemAcrossTabs(id);
      if (found) baseSum += found.item.price;
    });
    baseSum = WM.utils.toNumber(baseSum);
    document.getElementById('bundleBaseSumLabel').textContent = 'База: ' + WM.utils.formatMoney(baseSum);

    var type = document.getElementById('bundleTypeSelect').value;
    var note = document.getElementById('bundleOverpayNote');

    if (type === 'grace') {
      var due = document.getElementById('bundleDueDateInput').value;
      var grace = WM.utils.calcGraceStatus(due);
      note.textContent = grace
        ? 'Льготный долг по выбранным товарам: вернуть до ' + grace.dueFormatted + ' (' + grace.statusText + ').'
        : 'Укажите общую сумму к возврату и дату окончания льготного периода.';
      return;
    }

    var total = WM.utils.toNumber(document.getElementById('bundleTotalInput').value);
    var startDate = document.getElementById('bundleStartDateInput').value;
    var months = document.getElementById('bundleMonthsInput').value;
    var monthly = document.getElementById('bundleMonthlyInput').value;

    var lines = [];
    if (total > 0) {
      var diff = Math.round((total - baseSum) * 100) / 100;
      if (diff > 0) lines.push('Переплата: +' + WM.utils.formatMoney(diff) + ' к базе ' + WM.utils.formatMoney(baseSum) + '.');
      else if (diff === 0) lines.push('Рассрочка без переплаты.');
      else lines.push('Итоговая сумма ниже базы на ' + WM.utils.formatMoney(Math.abs(diff)) + '.');
    }
    var schedLine = buildScheduleHint(startDate, months, monthly);
    if (schedLine) lines.push(schedLine);

    note.textContent = lines.length > 0
      ? lines.join(' ')
      : 'Укажите итоговую сумму, ежемесячный платёж и (по желанию) дату оформления.';
  }

  // --- Перенос между вкладками ---
  function populateItemTransferCats(targetTabId, currentCatName) {
    var state = WM.storage.getState();
    var dstTab = state.tabs.find(function (t) { return t.id === targetTabId; });
    var catSelect = document.getElementById('itemTransferCatSelect');
    catSelect.innerHTML = '';

    var autoOpt = document.createElement('option');
    autoOpt.value = '__create_same__';
    autoOpt.textContent = 'Как сейчас («' + (currentCatName || 'Общее') + '»)';
    catSelect.appendChild(autoOpt);

    if (dstTab && dstTab.categories.length > 0) {
      dstTab.categories.forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        catSelect.appendChild(opt);
      });
    }
  }

  function setupItemTransferUI(item) {
    var box = document.getElementById('itemTransferBox');
    var state = WM.storage.getState();
    var activeTab = WM.storage.getActiveTab();
    var otherTabs = state.tabs.filter(function (t) { return t.id !== activeTab.id; });

    if (!item || otherTabs.length === 0) {
      box.classList.add('hidden');
      return;
    }

    var tabSelect = document.getElementById('itemTransferTabSelect');
    tabSelect.innerHTML = '';
    otherTabs.forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      tabSelect.appendChild(opt);
    });

    var curCat = activeTab.categories.find(function (c) { return c.id === item.categoryId; });
    populateItemTransferCats(otherTabs[0].id, curCat ? curCat.name : '');
    box.classList.remove('hidden');
  }

  function setupCategoryTransferUI(cat) {
    var box = document.getElementById('categoryTransferBox');
    var state = WM.storage.getState();
    var activeTab = WM.storage.getActiveTab();
    var otherTabs = state.tabs.filter(function (t) { return t.id !== activeTab.id; });

    if (!cat || otherTabs.length === 0) {
      box.classList.add('hidden');
      return;
    }

    var tabSelect = document.getElementById('categoryTransferTabSelect');
    tabSelect.innerHTML = '';
    otherTabs.forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      tabSelect.appendChild(opt);
    });

    box.classList.remove('hidden');
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
    var newCatOpt = document.createElement('option');
    newCatOpt.value = '__new_category__';
    newCatOpt.textContent = '+ Новая категория...';
    catSelect.appendChild(newCatOpt);
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
    var item = itemId ? tab.items.find(function (x) { return x.id === itemId; }) : null;
    var defaultCatId = tab.categories.length > 0 ? tab.categories[0].id : '__new_category__';
    populateItemModalSelects(item ? item.categoryId : (presetCategoryId || defaultCatId));

    document.getElementById('itemModalTitle').textContent = item ? 'Редактировать позицию' : 'Новая позиция';
    document.getElementById('itemIdInput').value = item ? item.id : '';
    document.getElementById('itemTitleInput').value = item ? item.title : '';
    document.getElementById('itemPriceInput').value = item ? item.price : '';
    document.getElementById('itemPrioritySelect').value = item ? item.priority : 'medium';
    document.getElementById('itemLinkInput').value = item ? item.link : '';
    setPhotoInputValues(item ? item.images : []);
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

    // Если открываем «Новая позиция» и есть незавершённый черновик — восстанавливаем его!
    if (!item && newItemDraft) {
      document.getElementById('itemTitleInput').value = newItemDraft.title || '';
      if (newItemDraft.categoryId && tab.categories.some(function (c) { return c.id === newItemDraft.categoryId; })) {
        document.getElementById('itemCategorySelect').value = newItemDraft.categoryId;
      }
      document.getElementById('itemPriceInput').value = newItemDraft.price || '';
      document.getElementById('itemPrioritySelect').value = newItemDraft.priority || 'medium';
      document.getElementById('itemStoreSelect').value = newItemDraft.store || WM.CONFIG.STORES[0];
      var isCustomDraft = newItemDraft.store === WM.CONFIG.CUSTOM_STORE_VALUE;
      document.getElementById('itemCustomStoreInput').value = isCustomDraft ? (newItemDraft.customStore || '') : '';
      document.getElementById('customStoreGroup').classList.toggle('hidden', !isCustomDraft);
      document.getElementById('itemLinkInput').value = newItemDraft.link || '';
      setPhotoInputValues(newItemDraft.images || []);
      document.getElementById('itemNoteInput').value = newItemDraft.note || '';
      document.getElementById('itemCheckedInput').checked = !!newItemDraft.checked;
    }

    var isNewCatSelected = document.getElementById('itemCategorySelect').value === '__new_category__';
    document.getElementById('newCategoryGroup').classList.toggle('hidden', !isNewCatSelected);
    document.getElementById('itemNewCategoryInput').value = '';

    setupItemTransferUI(item);
    document.getElementById('deleteItemBtn').classList.toggle('hidden', !item);
    document.getElementById('clearItemFormBtn').classList.toggle('hidden', !!item);
    openModal('itemModal');
    captureFormSnapshot('itemModal');
    setTimeout(function () {
      autoResizeTextarea(document.getElementById('itemNoteInput'));
      document.getElementById('itemTitleInput').focus();
    }, 50);
  }

  function renderBundlePickerList() {
    var state = WM.storage.getState();
    var picker = document.getElementById('bundleItemsPicker');
    picker.innerHTML = '';

    var q = (document.getElementById('bundlePickerSearch').value || '').trim().toLowerCase();
    var showUsed = !!document.getElementById('bundleShowUsedCheck').checked;

    var activeTabId = state.activeTabId;
    var orderedTabs = state.tabs.slice().sort(function (a, b) {
      if (a.id === activeTabId) return -1;
      if (b.id === activeTabId) return 1;
      return 0;
    });

    var renderedAny = false;

    orderedTabs.forEach(function (tab) {
      var matchingItems = tab.items.filter(function (it) {
        var existingBundle = WM.storage.getBundleForItem(it.id);
        var inOtherBundle = existingBundle && existingBundle.id !== currentEditingBundleId;
        if (inOtherBundle && !showUsed && !bundlePickerSelected[it.id]) {
          return false;
        }
        if (q) {
          var cat = tab.categories.find(function (c) { return c.id === it.categoryId; });
          var hay = (it.title + ' ' + (cat ? cat.name : '') + ' ' + tab.name).toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      });

      if (matchingItems.length === 0) return;
      renderedAny = true;

      var group = document.createElement('div');
      var isCollapsed = !q && !!bundlePickerCollapsed[tab.id];
      group.className = 'bundle-picker-group' + (isCollapsed ? ' is-collapsed' : '');

      var groupHead = document.createElement('div');
      groupHead.className = 'bundle-picker-group-head';
      var headLeft = document.createElement('div');
      headLeft.className = 'bundle-picker-group-left';
      var chev = document.createElement('span');
      chev.className = 'picker-chevron';
      chev.textContent = '▾';
      var nameSpan = document.createElement('span');
      nameSpan.textContent = 'Вкладка: ' + tab.name;
      headLeft.appendChild(chev);
      headLeft.appendChild(nameSpan);

      var countSpan = document.createElement('span');
      countSpan.textContent = String(matchingItems.length);
      groupHead.appendChild(headLeft);
      groupHead.appendChild(countSpan);

      groupHead.addEventListener('click', function () {
        bundlePickerCollapsed[tab.id] = !bundlePickerCollapsed[tab.id];
        group.classList.toggle('is-collapsed', !!bundlePickerCollapsed[tab.id]);
      });

      var groupBody = document.createElement('div');
      groupBody.className = 'bundle-picker-group-body';

      matchingItems.forEach(function (it) {
        var cat = tab.categories.find(function (c) { return c.id === it.categoryId; });
        var existingBundle = WM.storage.getBundleForItem(it.id);
        var inOtherBundle = existingBundle && existingBundle.id !== currentEditingBundleId;

        var row = document.createElement('label');
        row.className = 'bundle-picker-row';

        var left = document.createElement('div');
        left.className = 'bundle-picker-left';

        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = it.id;
        cb.checked = !!bundlePickerSelected[it.id];
        cb.addEventListener('change', function () {
          bundlePickerSelected[it.id] = cb.checked;
          updateBundleCalcHints();
        });

        var txt = document.createElement('div');
        var titleDiv = document.createElement('div');
        titleDiv.className = 'bundle-picker-title';
        titleDiv.textContent = it.title;
        if (inOtherBundle) {
          var usedTag = document.createElement('span');
          usedTag.className = 'bundle-picker-used-tag';
          usedTag.textContent = '(в «' + existingBundle.name + '»)';
          titleDiv.appendChild(usedTag);
        }
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
        groupBody.appendChild(row);
      });

      group.appendChild(groupHead);
      group.appendChild(groupBody);
      picker.appendChild(group);
    });

    if (!renderedAny) {
      var emptyMsg = document.createElement('div');
      emptyMsg.style.padding = '14px';
      emptyMsg.style.fontSize = '13px';
      emptyMsg.style.color = 'var(--text-muted)';
      emptyMsg.textContent = q
        ? 'По запросу ничего не найдено.'
        : 'Все товары уже оформлены в кредиты (включи «Уже в кредитах», чтобы увидеть их).';
      picker.appendChild(emptyMsg);
    }
  }

  // --- Модалка: Оформить в кредит / рассрочку ---
  function openBundleModal(bundleId) {
    var state = WM.storage.getState();
    var totalItemsAllTabs = state.tabs.reduce(function (acc, t) { return acc + t.items.length; }, 0);
    if (totalItemsAllTabs === 0) {
      showToast('Сначала добавь товары, чтобы оформить их в кредит');
      return;
    }

    var bundle = bundleId ? state.creditBundles.find(function (b) { return b.id === bundleId; }) : null;
    document.getElementById('bundleModalTitle').textContent = bundle ? 'Редактировать кредит / рассрочку' : 'Оформить в кредит / рассрочку';
    document.getElementById('bundleIdInput').value = bundle ? bundle.id : '';
    document.getElementById('bundleNameInput').value = bundle ? bundle.name : '';
    document.getElementById('bundleTypeSelect').value = bundle ? (bundle.type || 'installment') : 'installment';
    document.getElementById('bundleCustomTypeInput').value = bundle ? (bundle.customType || '') : '';
    document.getElementById('bundleStartDateInput').value = bundle && bundle.startDate ? bundle.startDate : '';
    document.getElementById('bundleMonthsInput').value = bundle && bundle.months ? bundle.months : '';
    document.getElementById('bundleMonthlyInput').value = bundle ? bundle.monthlyPayment : '';
    document.getElementById('bundleTotalInput').value = bundle ? bundle.totalAmount : '';
    document.getElementById('bundleDueDateInput').value = bundle && bundle.dueDate ? bundle.dueDate : '';
    document.getElementById('bundleGraceTotalInput').value = bundle ? bundle.totalAmount : '';
    document.getElementById('bundleCheckedInput').checked = bundle ? !!bundle.checked : true;
    document.getElementById('deleteBundleBtn').classList.toggle('hidden', !bundle);

    currentEditingBundleId = bundle ? bundle.id : null;
    bundlePickerSelected = {};
    bundlePickerCollapsed = {};
    if (bundle) {
      bundle.itemIds.forEach(function (id) { bundlePickerSelected[id] = true; });
    }
    var searchEl = document.getElementById('bundlePickerSearch');
    var showUsedEl = document.getElementById('bundleShowUsedCheck');
    if (searchEl) searchEl.value = '';
    if (showUsedEl) showUsedEl.checked = false;

    renderBundlePickerList();

    syncBundleCreditTypeUI();
    openModal('bundleModal');
    captureFormSnapshot('bundleModal');
  }

  function openCreditsModal() {
    WM.render.renderGlobalCreditsModal(creditsTypeFilter, getCommonHandlers());
    openModal('creditsModal');
  }

  function openCategoryModal(catId) {
    var tab = WM.storage.getActiveTab();
    var cat = catId ? tab.categories.find(function (c) { return c.id === catId; }) : null;
    document.getElementById('categoryModalTitle').textContent = cat ? 'Редактировать категорию' : 'Новая категория';
    document.getElementById('categoryIdInput').value = cat ? cat.id : '';
    document.getElementById('categoryNameInput').value = cat ? cat.name : '';
    document.getElementById('deleteCategoryBtn').classList.toggle('hidden', !cat);
    setupCategoryTransferUI(cat);
    openModal('categoryModal');
    captureFormSnapshot('categoryModal');
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
    captureFormSnapshot('tabModal');
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
        var modalId = btn.getAttribute('data-close-modal');
        if (modalId === 'itemModal' && btn.textContent.trim() === 'Отмена') {
          clearNewItemDraft();
          closeModal(modalId);
          return;
        }
        tryCloseModal(modalId, false);
      });
    });

    document.querySelectorAll('.modal-backdrop').forEach(function (backdrop) {
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) tryCloseModal(backdrop.id, false);
      });
    });

    // Авторасширение поля «Заметка / характеристики» + автосохранение черновика новой позиции
    var noteTa = document.getElementById('itemNoteInput');
    noteTa.addEventListener('input', function () {
      autoResizeTextarea(noteTa);
      saveNewItemDraft();
    });
    ['itemTitleInput', 'itemCategorySelect', 'itemPriceInput', 'itemPrioritySelect', 'itemStoreSelect', 'itemCustomStoreInput', 'itemLinkInput', 'itemCheckedInput'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', saveNewItemDraft);
        el.addEventListener('change', saveNewItemDraft);
      }
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

    // Динамические поля фото (1 -> 2 -> 3)
    getPhotoInputs().forEach(function (inp) {
      if (!inp) return;
      inp.addEventListener('input', function () {
        updatePhotoInputsVisibility();
        saveNewItemDraft();
      });
    });

    // Галерея в выдвижной панели + тихое скрытие битых ссылок + Lightbox
    var galleryImg = document.getElementById('drawerGalleryImg');
    if (galleryImg) {
      galleryImg.addEventListener('error', function () {
        if (drawerGalleryUrls.length > 0) {
          drawerGalleryUrls.splice(drawerGalleryIdx, 1);
          updateGalleryView();
        }
      });
      galleryImg.addEventListener('click', openPhotoLightbox);
    }
    document.getElementById('galleryPrevBtn').addEventListener('click', function () {
      drawerGalleryIdx--;
      updateGalleryView();
    });
    document.getElementById('galleryNextBtn').addEventListener('click', function () {
      drawerGalleryIdx++;
      updateGalleryView();
    });
    document.getElementById('lightboxCloseBtn').addEventListener('click', closePhotoLightbox);
    document.getElementById('photoLightbox').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) closePhotoLightbox();
    });
    document.getElementById('lightboxPrevBtn').addEventListener('click', function () {
      drawerGalleryIdx--;
      updateLightboxView();
      updateGalleryView();
    });
    document.getElementById('lightboxNextBtn').addEventListener('click', function () {
      drawerGalleryIdx++;
      updateLightboxView();
      updateGalleryView();
    });

    // Поиск и фильтр «Уже в кредитах» в окне «Оформить в кредит»
    document.getElementById('bundlePickerSearch').addEventListener('input', renderBundlePickerList);
    document.getElementById('bundleShowUsedCheck').addEventListener('change', renderBundlePickerList);

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isModalOpen('globalSearchModal')) closeModal('globalSearchModal');
        else openGlobalSearch();
        return;
      }
      if (e.key === 'Escape') {
        var lb = document.getElementById('photoLightbox');
        if (lb && lb.classList.contains('open')) {
          closePhotoLightbox();
          return;
        }
        var openModals = document.querySelectorAll('.modal-backdrop.open');
        if (openModals.length > 0) {
          var topModal = openModals[openModals.length - 1];
          tryCloseModal(topModal.id, false);
        } else {
          closeItemDrawer();
        }
      }
    });

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

    document.getElementById('openCreditsModalBtn').addEventListener('click', openCreditsModal);
    document.getElementById('addBundleFromCreditsBtn').addEventListener('click', function () {
      openBundleModal(null);
    });

    document.getElementById('cardLimitInput').addEventListener('input', function (e) {
      WM.storage.setCardLimit(e.target.value);
      WM.render.renderGlobalCreditsModal(creditsTypeFilter, getCommonHandlers());
    });

    document.getElementById('monthlyIncomeInput').addEventListener('input', function (e) {
      WM.storage.setMonthlyIncome(e.target.value);
      WM.render.renderGlobalCreditsModal(creditsTypeFilter, getCommonHandlers());
    });

    document.querySelectorAll('#creditsTypeFilter [data-ctype]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('#creditsTypeFilter [data-ctype]').forEach(function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        creditsTypeFilter = btn.getAttribute('data-ctype');
        WM.render.renderGlobalCreditsModal(creditsTypeFilter, getCommonHandlers());
      });
    });

    document.getElementById('manageTabsBtn').addEventListener('click', function () {
      WM.render.renderTabsManager(WM.storage.getState(), getCommonHandlers());
      openModal('tabsManagerModal');
    });
    document.getElementById('addTabFromManagerBtn').addEventListener('click', function () {
      openTabModal(null);
    });
    document.getElementById('toggleAllCategoriesBtn').addEventListener('click', function (e) {
      var btn = e.currentTarget;
      var allCollapsed = btn.dataset.allCollapsed === '1';
      WM.storage.setAllCategoriesCollapsed(!allCollapsed);
      refreshUI();
    });

    document.getElementById('manageCategoriesBtn').addEventListener('click', function () {
      WM.render.renderCategoriesManager(WM.storage.getActiveTab(), getCommonHandlers());
      openModal('categoriesManagerModal');
    });
    document.getElementById('addCategoryFromManagerBtn').addEventListener('click', function () {
      openCategoryModal(null);
    });
    document.getElementById('addItemBtn').addEventListener('click', function () { openItemModal(null, null); });
    document.getElementById('addCategoryBtn').addEventListener('click', function () { openCategoryModal(null); });
    document.getElementById('addBundleBtn').addEventListener('click', function () { openBundleModal(null); });
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

    document.getElementById('sortFilter').addEventListener('change', function (e) {
      filters.sort = e.target.value;
      refreshUI();
    });

    document.getElementById('openSearchModalBtn').addEventListener('click', openGlobalSearch);
    document.getElementById('globalSearchInput').addEventListener('input', function () {
      spotlightIdx = 0;
      refreshSpotlight();
    });
    document.getElementById('globalSearchInput').addEventListener('keydown', function (e) {
      if (!spotlightMatches.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        spotlightIdx = (spotlightIdx + 1) % spotlightMatches.length;
        refreshSpotlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        spotlightIdx = (spotlightIdx - 1 + spotlightMatches.length) % spotlightMatches.length;
        refreshSpotlight();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        var hit = spotlightMatches[spotlightIdx];
        if (hit) {
          closeModal('globalSearchModal');
          if (WM.storage.getActiveTab().id !== hit.tab.id) {
            WM.storage.setActiveTab(hit.tab.id);
            resetFilters(false);
          }
          refreshUI();
          openItemDrawer(hit.item.id);
        }
      }
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

    document.getElementById('itemCategorySelect').addEventListener('change', function (e) {
      var isNew = e.target.value === '__new_category__';
      document.getElementById('newCategoryGroup').classList.toggle('hidden', !isNew);
      if (isNew) document.getElementById('itemNewCategoryInput').focus();
    });

    document.getElementById('clearItemFormBtn').addEventListener('click', function () {
      var tab = WM.storage.getActiveTab();
      clearNewItemDraft();
      document.getElementById('itemTitleInput').value = '';
      document.getElementById('itemPriceInput').value = '';
      document.getElementById('itemPrioritySelect').value = 'medium';
      document.getElementById('itemStoreSelect').value = WM.CONFIG.STORES[0];
      document.getElementById('itemCustomStoreInput').value = '';
      document.getElementById('customStoreGroup').classList.add('hidden');
      document.getElementById('itemLinkInput').value = '';
      setPhotoInputValues([]);
      var noteTa = document.getElementById('itemNoteInput');
      noteTa.value = '';
      autoResizeTextarea(noteTa);
      document.getElementById('itemCheckedInput').checked = false;
      var defCat = tab.categories.length > 0 ? tab.categories[0].id : '__new_category__';
      document.getElementById('itemCategorySelect').value = defCat;
      document.getElementById('itemNewCategoryInput').value = '';
      document.getElementById('newCategoryGroup').classList.toggle('hidden', defCat !== '__new_category__');
      captureFormSnapshot('itemModal');
      document.getElementById('itemTitleInput').focus();
      showToast('Поля очищены');
    });

    document.getElementById('itemStoreSelect').addEventListener('change', function (e) {
      var isCustom = e.target.value === WM.CONFIG.CUSTOM_STORE_VALUE;
      document.getElementById('customStoreGroup').classList.toggle('hidden', !isCustom);
      if (isCustom) document.getElementById('itemCustomStoreInput').focus();
    });

    document.getElementById('bundleTypeSelect').addEventListener('change', syncBundleCreditTypeUI);
    ['bundleTotalInput', 'bundleMonthsInput', 'bundleMonthlyInput', 'bundleStartDateInput', 'bundleDueDateInput', 'bundleGraceTotalInput'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', updateBundleCalcHints);
    });

    document.getElementById('itemTransferTabSelect').addEventListener('change', function (e) {
      var activeTab = WM.storage.getActiveTab();
      var curCatId = document.getElementById('itemCategorySelect').value;
      var curCat = activeTab.categories.find(function (c) { return c.id === curCatId; });
      populateItemTransferCats(e.target.value, curCat ? curCat.name : '');
    });

    function handleItemTransfer(mode) {
      var itemId = document.getElementById('itemIdInput').value;
      var targetTabId = document.getElementById('itemTransferTabSelect').value;
      var targetCatId = document.getElementById('itemTransferCatSelect').value;
      if (!itemId || !targetTabId) return;
      var ok = WM.storage.transferItem(itemId, targetTabId, targetCatId, mode);
      if (ok) {
        var dstTab = WM.storage.getState().tabs.find(function (t) { return t.id === targetTabId; });
        closeModal('itemModal');
        if (mode === 'move' && viewingItemId === itemId) closeItemDrawer();
        refreshUI();
        showToast((mode === 'move' ? 'Перенесено во вкладку «' : 'Скопировано во вкладку «') + (dstTab ? dstTab.name : '') + '»');
      }
    }

    document.getElementById('moveItemTabBtn').addEventListener('click', function () { handleItemTransfer('move'); });
    document.getElementById('copyItemTabBtn').addEventListener('click', function () { handleItemTransfer('copy'); });

    function handleCategoryTransfer(mode) {
      var catId = document.getElementById('categoryIdInput').value;
      var targetTabId = document.getElementById('categoryTransferTabSelect').value;
      if (!catId || !targetTabId) return;
      var ok = WM.storage.transferCategory(catId, targetTabId, mode);
      if (ok) {
        var dstTab = WM.storage.getState().tabs.find(function (t) { return t.id === targetTabId; });
        closeModal('categoryModal');
        if (mode === 'move') closeItemDrawer();
        refreshUI();
        showToast((mode === 'move' ? 'Категория перенесена во вкладку «' : 'Категория скопирована во вкладку «') + (dstTab ? dstTab.name : '') + '»');
      }
    }

    document.getElementById('moveCategoryTabBtn').addEventListener('click', function () { handleCategoryTransfer('move'); });
    document.getElementById('copyCategoryTabBtn').addEventListener('click', function () { handleCategoryTransfer('copy'); });

    // Сохранение позиции
    document.getElementById('itemForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var title = document.getElementById('itemTitleInput').value.trim();
      if (!title) return;

      var storeVal = document.getElementById('itemStoreSelect').value;
      if (storeVal === WM.CONFIG.CUSTOM_STORE_VALUE) {
        storeVal = document.getElementById('itemCustomStoreInput').value.trim() || 'Свой вариант';
      }

      var selectedCatId = document.getElementById('itemCategorySelect').value;
      if (selectedCatId === '__new_category__') {
        var newCatName = document.getElementById('itemNewCategoryInput').value.trim();
        if (!newCatName) {
          showToast('Введи название новой категории');
          document.getElementById('itemNewCategoryInput').focus();
          return;
        }
        var createdCat = WM.storage.addCategory(newCatName);
        selectedCatId = createdCat.id;
      }

      WM.storage.saveItem({
        id: document.getElementById('itemIdInput').value || null,
        title: title,
        categoryId: selectedCatId,
        price: document.getElementById('itemPriceInput').value,
        priority: document.getElementById('itemPrioritySelect').value,
        store: storeVal,
        link: document.getElementById('itemLinkInput').value,
        images: readPhotoInputValues(),
        note: document.getElementById('itemNoteInput').value,
        checked: document.getElementById('itemCheckedInput').checked
      });

      clearNewItemDraft();
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

    // Сохранение кредита / рассрочки
    document.getElementById('bundleForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var itemIds = Object.keys(bundlePickerSelected).filter(function (id) {
        return !!bundlePickerSelected[id];
      });

      if (itemIds.length === 0) {
        showToast('Выбери хотя бы один товар');
        return;
      }

      var bType = document.getElementById('bundleTypeSelect').value;
      var isGrace = bType === 'grace';
      var totalVal = isGrace
        ? document.getElementById('bundleGraceTotalInput').value
        : document.getElementById('bundleTotalInput').value;

      if (!totalVal && totalVal !== '0') {
        showToast('Укажи итоговую сумму');
        return;
      }

      WM.storage.saveCreditBundle({
        id: document.getElementById('bundleIdInput').value || null,
        name: document.getElementById('bundleNameInput').value,
        type: bType,
        customType: document.getElementById('bundleCustomTypeInput').value,
        itemIds: itemIds,
        startDate: isGrace ? '' : document.getElementById('bundleStartDateInput').value,
        months: isGrace ? 0 : document.getElementById('bundleMonthsInput').value,
        monthlyPayment: isGrace ? 0 : document.getElementById('bundleMonthlyInput').value,
        totalAmount: totalVal,
        dueDate: isGrace ? document.getElementById('bundleDueDateInput').value : '',
        checked: document.getElementById('bundleCheckedInput').checked
      });

      closeModal('bundleModal');
      refreshUI();
      showToast('Кредит сохранён');
    });

    document.getElementById('deleteBundleBtn').addEventListener('click', function () {
      var id = document.getElementById('bundleIdInput').value;
      if (!id) return;
      if (confirm('Удалить этот кредит? Сами товары останутся в списке.')) {
        WM.storage.deleteCreditBundle(id);
        closeModal('bundleModal');
        refreshUI();
        showToast('Кредит удалён');
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
      runAutoPull(true);
    } else {
      setSyncStatus('', 'LOCAL // OFFLINE');
    }

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
