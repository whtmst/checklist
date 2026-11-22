/* ==========================================================================
   WM_CHECKLIST — ОТРИСОВКА ИНТЕРФЕЙСА, КАРТОЧЕК И ПАНЕЛИ «ВСЕ КРЕДИТЫ»
   ========================================================================== */
(function (global) {
  'use strict';

  var WM = (global.WMChecklist = global.WMChecklist || {});

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function createPencilIcon() {
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('class', 'ico');
    svg.setAttribute('aria-hidden', 'true');

    var p1 = document.createElementNS(svgNS, 'path');
    p1.setAttribute('d', 'M12 20h9');
    var p2 = document.createElementNS(svgNS, 'path');
    p2.setAttribute('d', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z');

    svg.appendChild(p1);
    svg.appendChild(p2);
    return svg;
  }

  function createEyeIcon(isHidden) {
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('class', 'ico');
    svg.setAttribute('aria-hidden', 'true');

    if (isHidden) {
      var p1 = document.createElementNS(svgNS, 'path');
      p1.setAttribute('d', 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94');
      var p2 = document.createElementNS(svgNS, 'path');
      p2.setAttribute('d', 'M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19');
      var p3 = document.createElementNS(svgNS, 'line');
      p3.setAttribute('x1', '1'); p3.setAttribute('y1', '1'); p3.setAttribute('x2', '23'); p3.setAttribute('y2', '23');
      svg.appendChild(p1); svg.appendChild(p2); svg.appendChild(p3);
    } else {
      var p = document.createElementNS(svgNS, 'path');
      p.setAttribute('d', 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z');
      var c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '3');
      svg.appendChild(p); svg.appendChild(c);
    }
    return svg;
  }

  function createTrashIcon() {
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('class', 'ico');
    svg.setAttribute('aria-hidden', 'true');
    var p1 = document.createElementNS(svgNS, 'polyline');
    p1.setAttribute('points', '3 6 5 6 21 6');
    var p2 = document.createElementNS(svgNS, 'path');
    p2.setAttribute('d', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6');
    var p3 = document.createElementNS(svgNS, 'path');
    p3.setAttribute('d', 'M10 11v6');
    var p4 = document.createElementNS(svgNS, 'path');
    p4.setAttribute('d', 'M14 11v6');
    svg.appendChild(p1); svg.appendChild(p2); svg.appendChild(p3); svg.appendChild(p4);
    return svg;
  }

  function syncCurrencyLabels() {
    var cur = WM.utils.getCurrency();
    document.querySelectorAll('.js-currency-symbol').forEach(function (n) {
      n.textContent = cur;
    });
  }

  function createStoreBadge(storeName, link) {
    var safeLink = WM.utils.sanitizeUrl(link);
    if (safeLink) {
      var a = document.createElement('a');
      a.className = 'badge badge-store-link';
      a.href = safeLink;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = (storeName || WM.i18n.t('store_link_fallback')) + ' ↗';
      a.title = WM.i18n.t('tip_open_store');
      a.addEventListener('click', function (e) {
        e.stopPropagation();
      });
      return a;
    }
    return el('span', 'badge badge-store', storeName);
  }

  function createCreditBadge(type, customType, prefixName) {
    var label = WM.utils.getCreditTypeLabel(type, customType, true);
    var fullText = prefixName ? (label + ': ' + prefixName) : label;
    var cls = 'badge ';
    if (type === 'grace') cls += 'badge-grace';
    else if (type === 'ninja') cls += 'badge-ninja';
    else if (prefixName) cls += 'badge-bundle';
    else cls += 'badge-credit';
    return el('span', cls, fullText);
  }

  function createMetricSpan(label, value) {
    var span = el('span');
    span.appendChild(document.createTextNode(label));
    span.appendChild(el('strong', '', value));
    return span;
  }

  function appendScheduleOrGraceBlock(container, opts) {
    if (opts.type === 'grace') {
      var grace = WM.utils.calcGraceStatus(opts.dueDate);
      if (!grace) return;
      var gWrap = el('div', 'credit-progress-wrap');
      var cls = grace.isOverdue ? 'bundle-danger' : (grace.isUrgent ? 'bundle-overpay' : 'bundle-ok');
      gWrap.appendChild(el('span', cls, WM.i18n.t('drawer_due_until', { date: grace.dueFormatted, status: grace.statusText })));
      container.appendChild(gWrap);
      return;
    }

    var sched = WM.utils.calcCreditSchedule(opts.startDate, opts.months, opts.monthlyPayment, opts.totalAmount);
    if (!sched) return;

    var wrap = el('div', 'credit-progress-wrap');
    wrap.appendChild(createMetricSpan(WM.i18n.t('drawer_issued'), WM.i18n.t('drawer_issued_range', { start: sched.startFormatted, end: sched.endFormatted })));

    if (sched.isFinished) {
      wrap.appendChild(el('span', 'bundle-ok', WM.i18n.t('drawer_status_paid', { m: sched.totalMonths })));
    } else {
      var remText = WM.i18n.t('drawer_remaining_of', { rem: sched.remainingMonths, tot: sched.totalMonths });
      if (sched.remainingAmount > 0) {
        remText += ' (~' + WM.utils.formatMoney(sched.remainingAmount) + ')';
      }
      wrap.appendChild(createMetricSpan(WM.i18n.t('drawer_remaining_payments'), remText));
    }

    var track = el('div', 'credit-progress-track');
    var fill = el('div', 'credit-progress-fill' + (sched.isFinished ? ' done' : ''));
    fill.style.width = sched.paidPct + '%';
    track.appendChild(fill);
    wrap.appendChild(track);

    container.appendChild(wrap);
  }

  function renderTabs(state, handlers) {
    var allBtn = document.getElementById('allTabBtn');
    var allCount = document.getElementById('allTabCount');
    var isAll = state.activeTabId === WM.CONFIG.ALL_TAB_ID;
    if (allBtn) allBtn.classList.toggle('active', isAll);
    if (allCount) allCount.textContent = String(WM.storage.getTotalItemsCount());

    var container = document.getElementById('tabsList');
    container.innerHTML = '';

    state.tabs.forEach(function (tab) {
      var btn = el('button', 'tab-chip' + (!isAll && tab.id === state.activeTabId ? ' active' : ''));
      btn.type = 'button';
      btn.appendChild(el('span', '', tab.name));
      btn.appendChild(el('span', 'tab-chip-count', String(tab.items.length)));
      btn.addEventListener('click', function () {
        handlers.onSelectTab(tab.id);
      });
      container.appendChild(btn);
    });
  }

  function renderSummary(tab, isAllMode, state) {
    var totals = isAllMode ? WM.storage.calculateAllTabsTotals() : WM.storage.calculateTabTotals(tab);
    var globalSummary = WM.storage.calculateGlobalCredits();
    var fmt = WM.utils.formatMoney;

    var pill = document.getElementById('topbarCreditsPill');
    if (globalSummary.monthlyTotal > 0) {
      pill.textContent = fmt(globalSummary.monthlyTotal) + WM.i18n.t('pill_per_month');
      pill.classList.remove('hidden');
    } else if (globalSummary.graceTotal > 0) {
      pill.textContent = fmt(globalSummary.graceTotal);
      pill.classList.remove('hidden');
    } else {
      pill.classList.add('hidden');
    }

    document.getElementById('statSpent').textContent = fmt(totals.spentTotal);
    var spentParts = [WM.i18n.t('sum_checked_of', { a: totals.checkedItemsCount, b: totals.totalItemsCount })];
    if (totals.spentCash > 0 || totals.spentCredit > 0) {
      spentParts.push(WM.i18n.t('sum_cash_credit', { cash: fmt(totals.spentCash), credit: fmt(totals.spentCredit) }));
    }
    document.getElementById('statSpentMeta').textContent = spentParts.join(' · ');

    document.getElementById('statMonthly').textContent = fmt(totals.monthlyCreditTotal);
    document.getElementById('statMonthlyMeta').textContent = WM.i18n.t(
      isAllMode ? 'sum_active_credits_all' : 'sum_active_credits_tab',
      { n: totals.activeCreditsCount }
    );

    document.getElementById('statPlanned').textContent = fmt(totals.plannedTotal);
    document.getElementById('statPlannedMeta').textContent =
      WM.i18n.t('sum_cash_credit', { cash: fmt(totals.plannedCash), credit: fmt(totals.plannedCredit) });

    document.getElementById('footerStats').textContent = isAllMode
      ? WM.i18n.t('footer_all_tabs', { t: state.tabs.length, i: totals.totalItemsCount })
      : WM.i18n.t('footer_tab_stats', { name: tab.name.toUpperCase(), c: tab.categories.length, i: tab.items.length });

    var provEl = document.getElementById('footerProviderLabel');
    if (provEl && WM.sync && WM.sync.getProvider) {
      var prov = WM.sync.getProvider();
      var suffix = prov === 'github' ? 'LOCAL + GITHUB GIST'
        : (prov === 'gitlab' ? 'LOCAL + GITLAB SNIPPET'
        : (prov === 'dropbox' ? 'LOCAL + DROPBOX' : 'LOCAL ONLY'));
      provEl.textContent = 'WM_CHECKLIST // ' + suffix;
    }
  }

  function renderFilterOptions(tab, filters, isAllMode, state) {
    var prioSelect = document.getElementById('priorityFilter');
    prioSelect.innerHTML = '';
    var allPrioOpt = document.createElement('option');
    allPrioOpt.value = 'all';
    allPrioOpt.textContent = WM.i18n.t('filter_prio_all');
    prioSelect.appendChild(allPrioOpt);
    WM.CONFIG.PRIORITIES.forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = WM.i18n.t('prio_' + p.id);
      prioSelect.appendChild(opt);
    });
    prioSelect.value = filters.priority;

    var storeSelect = document.getElementById('storeFilter');
    var seen = {};
    var stores = [];
    WM.storage.getStores(false).forEach(function (s) {
      seen[s.name] = true;
      stores.push(s.name);
    });
    var sourceTabs = isAllMode ? state.tabs : [tab];
    sourceTabs.forEach(function (t) {
      t.items.forEach(function (it) {
        if (it.store && !seen[it.store]) {
          seen[it.store] = true;
          stores.push(it.store);
        }
      });
    });

    storeSelect.innerHTML = '';
    var allStoreOpt = document.createElement('option');
    allStoreOpt.value = 'all';
    allStoreOpt.textContent = WM.i18n.t('filter_store_all');
    storeSelect.appendChild(allStoreOpt);
    stores.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      storeSelect.appendChild(opt);
    });
    storeSelect.value = seen[filters.store] ? filters.store : 'all';
  }

  function itemMatchesFilters(item, filters) {
    if (filters.status === 'checked' && !item.checked) return false;
    if (filters.status === 'unchecked' && item.checked) return false;
    if (filters.status === 'credit' && !WM.storage.getBundleForItem(item.id)) return false;

    if (filters.priority !== 'all' && item.priority !== filters.priority) return false;
    if (filters.store !== 'all' && item.store !== filters.store) return false;

    return true;
  }

  function renderChecklist(tab, filters, handlers) {
    var root = document.getElementById('checklistRoot');
    root.innerHTML = '';

    if (tab.categories.length === 0) {
      var empty = el('div', 'empty-state');
      empty.appendChild(el('h2', '', WM.i18n.t('tab_empty_title', { name: tab.name })));
      empty.appendChild(el('p', '', WM.i18n.t('tab_empty_desc')));
      var actions = el('div', 'empty-actions');
      var addCat = el('button', 'btn btn-accent', WM.i18n.t('tab_empty_btn'));
      addCat.type = 'button';
      addCat.addEventListener('click', handlers.onAddCategory);
      actions.appendChild(addCat);
      empty.appendChild(actions);
      root.appendChild(empty);
      return;
    }

    var fmt = WM.utils.formatMoney;
    var hasActiveFilter = !!(
      filters.status !== 'all' ||
      filters.priority !== 'all' ||
      filters.store !== 'all'
    );

    var renderedAnyCategory = false;

    tab.categories.forEach(function (cat) {
      var catItemsAll = tab.items.filter(function (it) { return it.categoryId === cat.id; });
      var catItems = catItemsAll.filter(function (it) { return itemMatchesFilters(it, filters); });

      if (hasActiveFilter && catItems.length === 0) return;
      renderedAnyCategory = true;

      var sortMode = filters.sort || 'priority';
      catItems.sort(function (a, b) {
        if (sortMode === 'price_desc') {
          if (b.price !== a.price) return b.price - a.price;
          return a.title.localeCompare(b.title, 'ru');
        }
        if (sortMode === 'price_asc') {
          if (a.price !== b.price) return a.price - b.price;
          return a.title.localeCompare(b.title, 'ru');
        }
        if (sortMode === 'newest') {
          var ta = Date.parse(a.createdAt || '') || 0;
          var tb = Date.parse(b.createdAt || '') || 0;
          if (tb !== ta) return tb - ta;
          return a.title.localeCompare(b.title, 'ru');
        }
        if (sortMode === 'alpha') {
          return a.title.localeCompare(b.title, 'ru');
        }
        // По умолчанию: по приоритету (некупленные сверху)
        if (a.checked !== b.checked) return a.checked ? 1 : -1;
        return WM.utils.getPriority(a.priority).rank - WM.utils.getPriority(b.priority).rank;
      });

      var block = el('section', 'category-block' + (cat.collapsed ? ' is-collapsed' : ''));

      var header = el('div', 'category-header');
      header.addEventListener('click', function () {
        handlers.onToggleCategoryCollapse(cat.id);
      });
      var left = el('div', 'category-header-left');
      left.appendChild(el('span', 'cat-chevron', '▾'));
      left.appendChild(el('h2', 'category-name', cat.name));
      var checkedInCat = catItemsAll.filter(function (x) { return x.checked; }).length;
      left.appendChild(el('span', 'category-count', checkedInCat + '/' + catItemsAll.length));

      var catSum = 0;
      catItemsAll.forEach(function (it) { catSum += it.price; });

      var right = el('div', 'category-header-right');
      right.appendChild(el('span', 'category-sum', fmt(catSum)));

      header.appendChild(left);
      header.appendChild(right);
      block.appendChild(header);

      var itemsWrap = el('div', 'category-items');
      if (catItems.length === 0) {
        var emptyRow = el('div', 'category-empty');
        emptyRow.appendChild(el('span', '', WM.i18n.t('cat_empty_text')));
        var addOne = el('button', 'btn btn-ghost btn-sm', WM.i18n.t('cat_empty_btn'));
        addOne.type = 'button';
        addOne.addEventListener('click', function () {
          handlers.onAddItemInCategory(cat.id);
        });
        emptyRow.appendChild(addOne);
        itemsWrap.appendChild(emptyRow);
      } else {
        catItems.forEach(function (item) {
          itemsWrap.appendChild(renderItemRow(item, handlers));
        });
      }

      block.appendChild(itemsWrap);
      root.appendChild(block);
    });

    if (!renderedAnyCategory) {
      var noMatch = el('div', 'empty-state');
      noMatch.appendChild(el('h2', '', WM.i18n.t('no_match_title')));
      noMatch.appendChild(el('p', '', WM.i18n.t('no_match_desc')));
      var resetBtn = el('button', 'btn btn-secondary', WM.i18n.t('btn_reset_filters'));
      resetBtn.type = 'button';
      resetBtn.addEventListener('click', handlers.onResetFilters);
      noMatch.appendChild(resetBtn);
      root.appendChild(noMatch);
    }
  }

  function sortItemsList(items, sortMode) {
    var mode = sortMode || 'priority';
    return items.slice().sort(function (a, b) {
      var ia = a.item || a;
      var ib = b.item || b;
      if (mode === 'price_desc') {
        if (ib.price !== ia.price) return ib.price - ia.price;
        return ia.title.localeCompare(ib.title, 'ru');
      }
      if (mode === 'price_asc') {
        if (ia.price !== ib.price) return ia.price - ib.price;
        return ia.title.localeCompare(ib.title, 'ru');
      }
      if (mode === 'newest') {
        var ta = Date.parse(ia.createdAt || '') || 0;
        var tb = Date.parse(ib.createdAt || '') || 0;
        if (tb !== ta) return tb - ta;
        return ia.title.localeCompare(ib.title, 'ru');
      }
      if (mode === 'alpha') {
        return ia.title.localeCompare(ib.title, 'ru');
      }
      if (ia.checked !== ib.checked) return ia.checked ? 1 : -1;
      return WM.utils.getPriority(ia.priority).rank - WM.utils.getPriority(ib.priority).rank;
    });
  }

  function renderAllItemsFlat(state, filters, handlers) {
    var root = document.getElementById('checklistRoot');
    root.innerHTML = '';

    var entries = [];
    state.tabs.forEach(function (tab) {
      var catMap = {};
      tab.categories.forEach(function (c) { catMap[c.id] = c.name; });
      tab.items.forEach(function (it) {
        if (itemMatchesFilters(it, filters)) {
          var catName = catMap[it.categoryId] || '';
          entries.push({
            tab: tab,
            item: it,
            originLabel: catName ? (tab.name + ' · ' + catName) : tab.name
          });
        }
      });
    });

    var totalAll = WM.storage.getTotalItemsCount();
    if (totalAll === 0) {
      var empty = el('div', 'empty-state');
      empty.appendChild(el('h2', '', WM.i18n.t('all_items_empty_title')));
      empty.appendChild(el('p', '', WM.i18n.t('all_items_empty_desc')));
      root.appendChild(empty);
      return;
    }

    if (entries.length === 0) {
      var noMatch = el('div', 'empty-state');
      noMatch.appendChild(el('h2', '', WM.i18n.t('no_match_title')));
      noMatch.appendChild(el('p', '', WM.i18n.t('no_match_desc')));
      var resetBtn = el('button', 'btn btn-secondary', WM.i18n.t('btn_reset_filters'));
      resetBtn.type = 'button';
      resetBtn.addEventListener('click', handlers.onResetFilters);
      noMatch.appendChild(resetBtn);
      root.appendChild(noMatch);
      return;
    }

    var sorted = sortItemsList(entries, filters.sort);
    var sum = 0;
    sorted.forEach(function (e) { sum += e.item.price; });

    var block = el('section', 'all-items-flat-block');
    var head = el('div', 'all-items-flat-head');
    head.appendChild(el('span', '', WM.i18n.t('all_items_head', { a: sorted.length, b: totalAll })));
    head.appendChild(el('span', 'category-sum', WM.utils.formatMoney(sum)));
    block.appendChild(head);

    var wrap = el('div', 'category-items');
    sorted.forEach(function (entry) {
      wrap.appendChild(renderItemRow(entry.item, handlers, entry.originLabel));
    });
    block.appendChild(wrap);
    root.appendChild(block);
  }

  function renderItemRow(item, handlers, originLabel) {
    var fmt = WM.utils.formatMoney;
    var prio = WM.utils.getPriority(item.priority);
    var bundle = WM.storage.getBundleForItem(item.id);
    var isSingleCredit = bundle && bundle.itemIds.length === 1;

    var row = el('div', 'item-row' + (item.checked ? ' is-checked' : ''));

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'check-input';
    cb.checked = !!item.checked;
    cb.setAttribute('aria-label', item.title);
    cb.addEventListener('change', function () {
      handlers.onToggleItem(item.id, cb.checked);
    });
    row.appendChild(cb);

    var content = el('div', 'item-content');
    content.title = WM.i18n.t('tip_open_card');
    content.addEventListener('click', function () {
      handlers.onViewItem(item.id);
    });

    var badges = el('div', 'item-badges');
    if (originLabel) {
      badges.appendChild(el('span', 'badge badge-origin', originLabel));
    }
    badges.appendChild(el('span', 'badge badge-prio-' + prio.id, prio.label));
    if (bundle) {
      badges.appendChild(createCreditBadge(bundle.type, bundle.customType, isSingleCredit ? null : bundle.name));
    }
    if (item.store || item.link) {
      badges.appendChild(createStoreBadge(item.store, item.link));
    }
    if (item.note) {
      badges.appendChild(el('span', 'badge badge-note-hint', WM.i18n.t('badge_note')));
    }
    content.appendChild(badges);

    content.appendChild(el('div', 'item-title', item.title));
    row.appendChild(content);

    var right = el('div', 'item-right');
    var priceWrap = el('div', 'item-price-block');
    if (isSingleCredit && bundle.totalAmount > 0 && bundle.totalAmount !== item.price) {
      priceWrap.appendChild(el('div', 'item-price', fmt(bundle.totalAmount)));
      priceWrap.appendChild(el('div', 'item-price-sub', WM.i18n.t('price_base', { v: fmt(item.price) })));
    } else if (bundle && !isSingleCredit) {
      priceWrap.appendChild(el('div', 'item-price', fmt(item.price)));
      priceWrap.appendChild(el('div', 'item-price-sub', WM.i18n.t('price_in_bundle')));
    } else {
      priceWrap.appendChild(el('div', 'item-price', fmt(item.price)));
    }
    right.appendChild(priceWrap);

    var editBtn = el('button', 'icon-action');
    editBtn.type = 'button';
    editBtn.title = WM.i18n.t('tip_edit_item');
    editBtn.setAttribute('aria-label', WM.i18n.t('tip_edit') + ' ' + item.title);
    editBtn.appendChild(createPencilIcon());
    editBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      handlers.onEditItem(item.id);
    });
    right.appendChild(editBtn);

    row.appendChild(right);
    return row;
  }

  function renderItemDrawer(item, tab, handlers) {
    var fmt = WM.utils.formatMoney;
    var cat = tab.categories.find(function (c) { return c.id === item.categoryId; });
    var prio = WM.utils.getPriority(item.priority);
    var bundle = WM.storage.getBundleForItem(item.id);
    var isSingleCredit = bundle && bundle.itemIds.length === 1;

    document.getElementById('drawerCategoryLabel').textContent = cat ? cat.name : WM.i18n.t('drawer_kicker');
    document.getElementById('drawerItemTitle').textContent = item.title;

    var badgesWrap = document.getElementById('drawerBadges');
    badgesWrap.innerHTML = '';
    badgesWrap.appendChild(el('span', 'badge badge-prio-' + prio.id, prio.label));
    if (bundle) {
      badgesWrap.appendChild(createCreditBadge(bundle.type, bundle.customType, isSingleCredit ? null : bundle.name));
    }
    if (item.store || item.link) {
      badgesWrap.appendChild(createStoreBadge(item.store, item.link));
    }

    var priceMain = document.getElementById('drawerPriceMain');
    var priceSub = document.getElementById('drawerPriceSub');
    if (isSingleCredit && bundle.totalAmount > 0) {
      priceMain.textContent = fmt(bundle.totalAmount);
      var lbl = WM.utils.getCreditTypeLabel(bundle.type, bundle.customType, false);
      priceSub.textContent = bundle.totalAmount !== item.price ? WM.i18n.t('drawer_base_price', { v: fmt(item.price) }) : lbl;
    } else if (bundle && !isSingleCredit) {
      priceMain.textContent = fmt(item.price);
      priceSub.textContent = WM.i18n.t('drawer_in_shared', { name: bundle.name });
    } else {
      priceMain.textContent = fmt(item.price);
      priceSub.textContent = WM.i18n.t('drawer_cash_label');
    }

    var toggle = document.getElementById('drawerCheckedToggle');
    toggle.checked = !!item.checked;
    document.getElementById('drawerCheckedText').textContent = WM.i18n.t(item.checked ? 'drawer_checked' : 'drawer_unchecked');

    var creditBlock = document.getElementById('drawerCreditBlock');
    creditBlock.innerHTML = '';
    if (bundle) {
      creditBlock.classList.remove('hidden');
      var bDetails = WM.storage.getBundleDetails(bundle);
      var titleRow = el('div', 'bundle-card-top');
      var titleInfo = el('div');
      titleInfo.appendChild(createMetricSpan(
        WM.i18n.t(isSingleCredit ? 'drawer_type_label' : 'drawer_shared_label'),
        isSingleCredit
          ? WM.utils.getCreditTypeLabel(bundle.type, bundle.customType, false)
          : bundle.name + ' (' + WM.utils.getCreditTypeLabel(bundle.type, bundle.customType, false) + ')'
      ));
      titleRow.appendChild(titleInfo);

      if (handlers && handlers.onEditBundle) {
        var editCreditBtn = el('button', 'icon-action');
        editCreditBtn.type = 'button';
        editCreditBtn.title = WM.i18n.t('tip_edit_credit_terms');
        editCreditBtn.appendChild(createPencilIcon());
        editCreditBtn.addEventListener('click', function () {
          handlers.onEditBundle(bundle.id);
        });
        titleRow.appendChild(editCreditBtn);
      }
      creditBlock.appendChild(titleRow);

      if (bDetails.isCrossTab) {
        creditBlock.appendChild(createMetricSpan(WM.i18n.t('drawer_tabs_label'), bDetails.tabNames.join(' + ')));
      }
      if (bundle.type !== 'grace') {
        if (bundle.months > 0) creditBlock.appendChild(createMetricSpan(WM.i18n.t('drawer_term_label'), WM.i18n.t('drawer_term_months', { m: bundle.months })));
        creditBlock.appendChild(createMetricSpan(WM.i18n.t(isSingleCredit ? 'drawer_monthly_single' : 'drawer_monthly_shared'), WM.i18n.t('drawer_per_month', { v: fmt(bundle.monthlyPayment) })));
      }
      creditBlock.appendChild(createMetricSpan(WM.i18n.t(isSingleCredit ? 'drawer_total_single' : 'drawer_total_shared'), fmt(bundle.totalAmount)));
      var bOverpay = Math.round((bundle.totalAmount - bDetails.baseSum) * 100) / 100;
      if (bOverpay > 0) {
        creditBlock.appendChild(el('span', 'bundle-overpay', WM.i18n.t('drawer_overpay', { v: fmt(bOverpay) })));
      }
      appendScheduleOrGraceBlock(creditBlock, bundle);
    } else {
      creditBlock.classList.add('hidden');
    }

    if (handlers && handlers.onRenderDrawerGallery) {
      handlers.onRenderDrawerGallery(Array.isArray(item.images) ? item.images : []);
    }

    var linkWrap = document.getElementById('drawerLinkWrap');
    var linkAnchor = document.getElementById('drawerLinkAnchor');
    var safeItemLink = WM.utils.sanitizeUrl(item.link);
    if (safeItemLink) {
      linkWrap.classList.remove('hidden');
      linkAnchor.href = safeItemLink;
      linkAnchor.textContent = WM.i18n.t('drawer_open_in', { store: item.store || 'Web' });
    } else {
      linkWrap.classList.add('hidden');
    }

    var noteSection = document.getElementById('drawerNoteSection');
    var noteContent = document.getElementById('drawerNoteContent');
    noteContent.innerHTML = '';

    if (!item.note) {
      noteSection.classList.add('hidden');
    } else {
      noteSection.classList.remove('hidden');
      var lines = item.note.split(/\r?\n/);
      lines.forEach(function (rawLine) {
        var line = rawLine.trim();
        if (!line) return;
        var colonIdx = line.indexOf(':');
        if (colonIdx > 0 && colonIdx <= 42 && line.indexOf('http://') === -1 && line.indexOf('https://') === -1) {
          var key = line.slice(0, colonIdx).trim();
          var val = line.slice(colonIdx + 1).trim();
          if (key && val) {
            var specRow = el('div', 'note-spec-row');
            specRow.appendChild(el('span', 'note-spec-key', key));
            specRow.appendChild(el('span', 'note-spec-val', val));
            noteContent.appendChild(specRow);
            return;
          }
        }
        noteContent.appendChild(el('div', 'note-plain-line', line));
      });
    }
  }

  function renderGlobalCreditsModal(typeFilter, handlers) {
    var data = WM.storage.calculateGlobalCredits();
    var fmt = WM.utils.formatMoney;

    var limitInput = document.getElementById('cardLimitInput');
    if (document.activeElement !== limitInput) {
      limitInput.value = data.cardLimit > 0 ? data.cardLimit : '';
    }

    var limitStats = document.getElementById('cardLimitStats');
    var limitTrack = document.getElementById('cardLimitTrack');
    var limitFill = document.getElementById('cardLimitFill');
    limitStats.innerHTML = '';

    if (data.cardLimit > 0) {
      limitStats.appendChild(createMetricSpan(WM.i18n.t('credits_used_debt'), fmt(data.totalDebtRemaining)));
      var availSpan = el('span', data.cardAvailable < 0 ? 'bundle-danger' : 'bundle-ok');
      availSpan.textContent = WM.i18n.t('credits_available', { v: fmt(data.cardAvailable) });
      limitStats.appendChild(availSpan);
      limitStats.appendChild(el('span', '', '(' + data.limitPct + '%)'));
      limitTrack.classList.remove('hidden');
      limitFill.style.width = data.limitPct + '%';
      limitFill.className = 'credit-progress-fill' + (data.cardAvailable < 0 ? ' over' : '');
    } else {
      limitStats.appendChild(el('span', 'form-hint', WM.i18n.t('credits_limit_hint')));
      limitTrack.classList.add('hidden');
    }

    // Справочный доход / мес и нагрузка кредитов
    var incomeInput = document.getElementById('monthlyIncomeInput');
    if (incomeInput && document.activeElement !== incomeInput) {
      incomeInput.value = data.monthlyIncome > 0 ? data.monthlyIncome : '';
    }
    var incomeStats = document.getElementById('monthlyIncomeStats');
    var incomeTrack = document.getElementById('monthlyIncomeTrack');
    var incomeFill = document.getElementById('monthlyIncomeFill');
    if (incomeStats) {
      incomeStats.innerHTML = '';
      if (data.monthlyIncome > 0) {
        incomeStats.appendChild(createMetricSpan(WM.i18n.t('credits_load'), String(data.incomeLoadPct).replace('.', ',') + '%'));
        var remSpan = el('span', data.incomeAfterCredits < 0 ? 'bundle-danger' : 'bundle-ok');
        remSpan.textContent = WM.i18n.t('credits_remaining_income', { v: fmt(data.incomeAfterCredits) });
        incomeStats.appendChild(remSpan);
        incomeTrack.classList.remove('hidden');
        incomeFill.style.width = Math.min(100, Math.max(0, data.incomeLoadPct)) + '%';
        incomeFill.className = 'credit-progress-fill' + (data.incomeAfterCredits < 0 ? ' over' : '');
      } else {
        incomeStats.appendChild(el('span', 'form-hint', WM.i18n.t('credits_income_hint')));
        incomeTrack.classList.add('hidden');
      }
    }

    document.getElementById('globalCreditMonthly').textContent = fmt(data.monthlyTotal);
    document.getElementById('globalCreditMonthlyMeta').textContent = WM.i18n.t('credits_kpi_active', { n: data.activeCount });

    document.getElementById('globalCreditGrace').textContent = fmt(data.graceTotal);
    document.getElementById('globalCreditGraceMeta').textContent = data.nearestGrace
      ? WM.i18n.t('credits_kpi_grace_near', { date: data.nearestGrace.dueFormatted, status: data.nearestGrace.statusText })
      : WM.i18n.t('credits_kpi_grace_none');

    document.getElementById('globalCreditRemaining').textContent = fmt(data.totalDebtRemaining);

    var listEl = document.getElementById('globalCreditsList');
    listEl.innerHTML = '';

    var filtered = data.records.filter(function (rec) {
      return typeFilter === 'all' || rec.type === typeFilter;
    });

    if (filtered.length === 0) {
      var empty = el('div', 'empty-state');
      empty.style.gridColumn = '1 / -1';
      empty.appendChild(el('p', '', WM.i18n.t('credits_empty')));
      listEl.appendChild(empty);
      return;
    }

    filtered.forEach(function (rec) {
      var card = el('article', 'bundle-card' + (rec.checked ? ' is-active' : ''));

      var top = el('div', 'bundle-card-top');
      var left = el('div', 'bundle-check-title');

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'check-input';
      cb.checked = !!rec.checked;
      cb.addEventListener('change', function () {
        handlers.onToggleBundle(rec.id, cb.checked);
      });

      var info = el('div');
      var badges = el('div', 'item-badges');
      badges.style.marginBottom = '4px';
      badges.appendChild(createCreditBadge(rec.type, rec.customType, null));
      badges.appendChild(el('span', 'badge badge-store', rec.tabNames.join(' + ')));
      if (!rec.isSingleItem) {
        badges.appendChild(el('span', 'badge badge-note-hint', WM.i18n.t('badge_bundle_pack')));
      }
      info.appendChild(badges);
      info.appendChild(el('div', 'bundle-name', rec.title));
      info.appendChild(el('div', 'item-price-sub', WM.i18n.t(rec.checked ? 'credits_status_active' : 'credits_status_planned')));

      left.appendChild(cb);
      left.appendChild(info);

      var editBtn = el('button', 'icon-action');
      editBtn.type = 'button';
      editBtn.title = WM.i18n.t('tip_edit_credit');
      editBtn.appendChild(createPencilIcon());
      editBtn.addEventListener('click', function () {
        handlers.onEditBundle(rec.id);
      });

      top.appendChild(left);
      top.appendChild(editBtn);
      card.appendChild(top);

      var metrics = el('div', 'bundle-metrics');
      metrics.appendChild(createMetricSpan(WM.i18n.t('credits_metric_total'), fmt(rec.totalAmount)));
      if (rec.type !== 'grace') {
        metrics.appendChild(createMetricSpan(WM.i18n.t('credits_metric_pay'), WM.i18n.t('drawer_per_month', { v: fmt(rec.monthlyPayment) })));
        if (rec.months > 0) metrics.appendChild(createMetricSpan(WM.i18n.t('drawer_term_label'), WM.i18n.t('drawer_term_months', { m: rec.months })));
      }
      if (rec.overpay > 0) {
        metrics.appendChild(el('span', 'bundle-overpay', WM.i18n.t('credits_metric_overpay', { v: fmt(rec.overpay) })));
      }
      card.appendChild(metrics);

      appendScheduleOrGraceBlock(card, rec);

      if (!rec.isSingleItem && rec.itemsList.length > 0) {
        var tags = el('div', 'bundle-items-tags');
        rec.itemsList.forEach(function (entry) {
          tags.appendChild(el('span', 'mini-tag', '[' + entry.tab.name + '] ' + entry.item.title + ' (' + fmt(entry.item.price) + ')'));
        });
        card.appendChild(tags);
      }

      listEl.appendChild(card);
    });
  }

  function renderSortableManagerList(container, entries, callbacks) {
    container.innerHTML = '';
    if (entries.length === 0) {
      var empty = el('div', 'empty-state');
      empty.appendChild(el('p', '', callbacks.emptyText || WM.i18n.t('mgr_empty_default')));
      container.appendChild(empty);
      return;
    }

    var dragFromIdx = -1;

    entries.forEach(function (entry, idx) {
      var row = el('div', 'manager-row' + (entry.isActive ? ' is-active' : ''));
      row.draggable = true;
      row.dataset.index = String(idx);

      row.addEventListener('dragstart', function (e) {
        dragFromIdx = idx;
        row.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(idx));
        }
      });

      row.addEventListener('dragend', function () {
        row.classList.remove('dragging');
        container.querySelectorAll('.drag-over').forEach(function (n) { n.classList.remove('drag-over'); });
      });

      row.addEventListener('dragover', function (e) {
        e.preventDefault();
        if (dragFromIdx !== -1 && dragFromIdx !== idx) {
          row.classList.add('drag-over');
        }
      });

      row.addEventListener('dragleave', function () {
        row.classList.remove('drag-over');
      });

      row.addEventListener('drop', function (e) {
        e.preventDefault();
        row.classList.remove('drag-over');
        if (dragFromIdx !== -1 && dragFromIdx !== idx) {
          callbacks.onReorder(dragFromIdx, idx);
        }
        dragFromIdx = -1;
      });

      var left = el('div', 'manager-row-left');
      left.appendChild(el('span', 'drag-handle', '⋮⋮'));
      left.appendChild(el('span', 'manager-row-name', entry.name));
      left.appendChild(el('span', 'manager-row-count', entry.countText));

      var actions = el('div', 'manager-row-actions');

      var upBtn = el('button', 'icon-action', '↑');
      upBtn.type = 'button';
      upBtn.title = WM.i18n.t('tip_move_up');
      upBtn.disabled = idx === 0;
      upBtn.addEventListener('click', function () { callbacks.onMove(entry.id, -1); });

      var downBtn = el('button', 'icon-action', '↓');
      downBtn.type = 'button';
      downBtn.title = WM.i18n.t('tip_move_down');
      downBtn.disabled = idx === entries.length - 1;
      downBtn.addEventListener('click', function () { callbacks.onMove(entry.id, 1); });

      var editBtn = el('button', 'icon-action');
      editBtn.type = 'button';
      editBtn.title = WM.i18n.t('tip_edit');
      editBtn.appendChild(createPencilIcon());
      editBtn.addEventListener('click', function () { callbacks.onEdit(entry.id); });

      actions.appendChild(upBtn);
      actions.appendChild(downBtn);
      actions.appendChild(editBtn);

      row.appendChild(left);
      row.appendChild(actions);
      container.appendChild(row);
    });
  }

  function renderTabsManager(state, handlers) {
    var list = document.getElementById('tabsManagerList');
    var entries = state.tabs.map(function (t) {
      return {
        id: t.id,
        name: t.name,
        countText: WM.i18n.t('mgr_count_items', { n: t.items.length }),
        isActive: t.id === state.activeTabId
      };
    });
    renderSortableManagerList(list, entries, {
      emptyText: WM.i18n.t('mgr_empty_tabs'),
      onMove: handlers.onMoveTab,
      onReorder: handlers.onReorderTab,
      onEdit: handlers.onEditTab
    });
  }

  function renderCategoriesManager(tab, handlers) {
    var kicker = document.getElementById('categoriesManagerKicker');
    if (kicker) kicker.textContent = WM.i18n.t('mgr_kicker_tab', { name: tab.name.toUpperCase() });
    var list = document.getElementById('categoriesManagerList');
    var entries = tab.categories.map(function (c) {
      var count = tab.items.filter(function (it) { return it.categoryId === c.id; }).length;
      return {
        id: c.id,
        name: c.name,
        countText: WM.i18n.t('mgr_count_items', { n: count }),
        isActive: false
      };
    });
    renderSortableManagerList(list, entries, {
      emptyText: WM.i18n.t('mgr_empty_cats'),
      onMove: handlers.onMoveCategory,
      onReorder: handlers.onReorderCategory,
      onEdit: handlers.onEditCategory
    });
  }

  function appendHighlightedText(container, text, tokens) {
    if (!tokens || tokens.length === 0) {
      container.appendChild(document.createTextNode(text));
      return;
    }
    var escaped = tokens.map(function (t) {
      return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    var re = new RegExp('(' + escaped.join('|') + ')', 'ig');
    var parts = String(text).split(re);
    parts.forEach(function (part) {
      if (!part) return;
      var isMatch = tokens.some(function (t) { return part.toLowerCase() === t; });
      if (isMatch) {
        container.appendChild(el('mark', 'spotlight-mark', part));
      } else {
        container.appendChild(document.createTextNode(part));
      }
    });
  }

  function findNoteMatchSnippet(note, tokens) {
    if (!note || !tokens || tokens.length === 0) return '';
    var lines = note.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var low = line.toLowerCase();
      for (var j = 0; j < tokens.length; j++) {
        if (low.indexOf(tokens[j]) !== -1) {
          return line;
        }
      }
    }
    return '';
  }

  function renderGlobalSearch(query, activeIdx, chipFilters, handlers) {
    var state = WM.storage.getState();
    var metaEl = document.getElementById('globalSearchMeta');
    var listEl = document.getElementById('globalSearchResults');
    listEl.innerHTML = '';

    var cf = chipFilters || {};
    var hasChip = !!(cf.status || cf.pay);
    var raw = String(query || '').trim().toLowerCase();
    var tokens = raw ? raw.split(/\s+/).filter(Boolean) : [];
    var allEntries = [];

    state.tabs.forEach(function (tab) {
      var catMap = {};
      tab.categories.forEach(function (c) { catMap[c.id] = c.name; });
      tab.items.forEach(function (it) {
        var catName = catMap[it.categoryId] || '';
        var bundle = WM.storage.getBundleForItem(it.id);
        var bundleLabel = bundle
          ? (WM.utils.getCreditTypeLabel(bundle.type, bundle.customType, false) + ' ' + bundle.name)
          : '';
        allEntries.push({
          tab: tab,
          catName: catName,
          item: it,
          bundle: bundle,
          haystack: (it.title + ' ' + it.note + ' ' + catName + ' ' + tab.name + ' ' + it.store + ' ' + bundleLabel).toLowerCase()
        });
      });
    });

    var matches;
    if (tokens.length === 0 && !hasChip) {
      matches = allEntries.slice().sort(function (a, b) {
        return (Date.parse(b.item.createdAt || '') || 0) - (Date.parse(a.item.createdAt || '') || 0);
      }).slice(0, 8);
      metaEl.textContent = WM.i18n.t('spotlight_total', { n: allEntries.length }) + (matches.length ? WM.i18n.t('spotlight_recent') : '');
    } else {
      matches = allEntries.filter(function (entry) {
        if (cf.status === 'unchecked' && entry.item.checked) return false;
        if (cf.status === 'checked' && !entry.item.checked) return false;
        if (cf.pay === 'credit' && !entry.bundle) return false;
        if (cf.pay === 'cash' && entry.bundle) return false;
        return tokens.every(function (tok) { return entry.haystack.indexOf(tok) !== -1; });
      });
      metaEl.textContent = WM.i18n.t('spotlight_found', { a: matches.length, b: allEntries.length });
    }

    if (matches.length === 0) {
      listEl.appendChild(el('div', 'spotlight-empty', WM.i18n.t((tokens.length || hasChip) ? 'spotlight_empty_query' : 'spotlight_empty_all')));
      return [];
    }

    var fmt = WM.utils.formatMoney;
    matches.forEach(function (entry, idx) {
      var btn = el('button', 'spotlight-item' + (entry.item.checked ? ' is-checked' : '') + (idx === activeIdx ? ' is-focused' : ''));
      btn.type = 'button';
      btn.dataset.idx = String(idx);

      var main = el('div', 'spotlight-item-main');
      var path = el('div', 'spotlight-item-path');
      path.appendChild(el('span', 'badge badge-store', entry.tab.name + (entry.catName ? ' → ' + entry.catName : '')));
      if (entry.item.store) {
        path.appendChild(el('span', 'badge badge-note-hint', entry.item.store));
      }
      if (entry.bundle) {
        path.appendChild(createCreditBadge(entry.bundle.type, entry.bundle.customType, null));
      }
      main.appendChild(path);

      var titleEl = el('div', 'spotlight-item-title');
      appendHighlightedText(titleEl, entry.item.title, tokens);
      main.appendChild(titleEl);

      var snippet = findNoteMatchSnippet(entry.item.note, tokens);
      if (snippet) {
        var snipEl = el('div', 'spotlight-snippet');
        appendHighlightedText(snipEl, snippet, tokens);
        main.appendChild(snipEl);
      }

      btn.appendChild(main);
      btn.appendChild(el('span', 'spotlight-item-price', fmt(entry.item.price)));

      btn.addEventListener('click', function () {
        handlers.onSelectSearchResult(entry.tab.id, entry.item.id);
      });
      listEl.appendChild(btn);
    });

    return matches;
  }

  function renderDonateLinks(containerId) {
    var box = document.getElementById(containerId);
    if (!box) return;
    box.innerHTML = '';
    var activeLinks = (WM.CONFIG.DONATE_LINKS || []).filter(function (d) {
      return !!WM.utils.sanitizeUrl(d.url);
    });
    if (activeLinks.length === 0) {
      var fallback = el('a', 'btn btn-accent btn-sm', WM.i18n.t('donate_coming_soon'));
      fallback.href = WM.CONFIG.REPO_URL;
      fallback.target = '_blank';
      fallback.rel = 'noopener noreferrer';
      box.appendChild(fallback);
      return;
    }
    activeLinks.forEach(function (d) {
      var lbl = d.labelKey ? WM.i18n.t(d.labelKey) : d.label;
      var a = el('a', 'btn btn-accent btn-sm', lbl + ' ↗');
      a.href = WM.utils.sanitizeUrl(d.url);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      box.appendChild(a);
    });
  }

  function renderGeneralSettings(handlers) {
    var langSel = document.getElementById('langSelect');
    if (langSel) langSel.value = WM.i18n.getLang();
    var remSel = document.getElementById('backupReminderSelect');
    if (remSel) remSel.value = String(WM.storage.getBackupReminderDays());
    renderDonateLinks('aboutDonateLinks');
    renderDonateLinks('modalDonateLinks');

    var cur = WM.storage.getCurrency();
    var curSel = document.getElementById('currencyPresetSelect');
    var curCustomGroup = document.getElementById('customCurrencyGroup');
    var curCustomInput = document.getElementById('customCurrencyInput');

    if (curSel) {
      curSel.innerHTML = '';
      var isPreset = false;
      WM.CONFIG.CURRENCY_PRESETS.forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p.symbol;
        opt.textContent = WM.i18n.t(p.labelKey);
        if (p.symbol === cur) isPreset = true;
        curSel.appendChild(opt);
      });
      var customOpt = document.createElement('option');
      customOpt.value = '__custom__';
      customOpt.textContent = WM.i18n.t('gen_currency_custom_opt');
      curSel.appendChild(customOpt);

      if (isPreset) {
        curSel.value = cur;
        if (curCustomGroup) curCustomGroup.classList.add('hidden');
      } else {
        curSel.value = '__custom__';
        if (curCustomGroup) curCustomGroup.classList.remove('hidden');
        if (curCustomInput && document.activeElement !== curCustomInput) {
          curCustomInput.value = cur;
        }
      }
    }

    // Магазины
    var storesList = document.getElementById('storesPrefsList');
    if (storesList) {
      storesList.innerHTML = '';
      WM.storage.getStores(true).forEach(function (st) {
        var row = el('div', 'pref-row' + (st.hidden ? ' is-hidden-pref' : ''));
        var left = el('div', 'pref-row-left');
        left.appendChild(el('span', 'pref-row-name', st.name));
        if (st.builtin) left.appendChild(el('span', 'pref-row-tag', WM.i18n.t('tag_builtin')));
        row.appendChild(left);

        var actions = el('div', 'pref-row-actions');
        var renameBtn = el('button', 'icon-action');
        renameBtn.type = 'button';
        renameBtn.title = WM.i18n.t('tip_rename');
        renameBtn.appendChild(createPencilIcon());
        renameBtn.addEventListener('click', function () { handlers.onRenameStorePref(st.id, st.name); });
        actions.appendChild(renameBtn);

        var eyeBtn = el('button', 'icon-action');
        eyeBtn.type = 'button';
        eyeBtn.title = WM.i18n.t(st.hidden ? 'tip_show' : 'tip_hide');
        eyeBtn.appendChild(createEyeIcon(st.hidden));
        eyeBtn.addEventListener('click', function () { handlers.onToggleStorePref(st.id); });
        actions.appendChild(eyeBtn);

        if (!st.builtin) {
          var delBtn = el('button', 'icon-action icon-action--danger');
          delBtn.type = 'button';
          delBtn.title = WM.i18n.t('tip_delete_from_list');
          delBtn.appendChild(createTrashIcon());
          delBtn.addEventListener('click', function () { handlers.onDeleteStorePref(st.id, st.name); });
          actions.appendChild(delBtn);
        }

        row.appendChild(actions);
        storesList.appendChild(row);
      });
    }

    // Типы кредитов
    var ctList = document.getElementById('creditTypesPrefsList');
    if (ctList) {
      ctList.innerHTML = '';
      var ctPrefs = WM.storage.getCreditTypePrefs();

      ctPrefs.builtins.forEach(function (bt) {
        var row = el('div', 'pref-row' + (bt.hidden ? ' is-hidden-pref' : ''));
        var left = el('div', 'pref-row-left');
        left.appendChild(el('span', 'pref-row-name', bt.label));
        left.appendChild(el('span', 'pref-row-tag', WM.i18n.t('tag_builtin')));
        row.appendChild(left);

        var actions = el('div', 'pref-row-actions');
        var eyeBtn = el('button', 'icon-action');
        eyeBtn.type = 'button';
        eyeBtn.title = WM.i18n.t(bt.hidden ? 'tip_show' : 'tip_hide');
        eyeBtn.appendChild(createEyeIcon(bt.hidden));
        eyeBtn.addEventListener('click', function () { handlers.onToggleBuiltinCreditPref(bt.id); });
        actions.appendChild(eyeBtn);

        row.appendChild(actions);
        ctList.appendChild(row);
      });

      ctPrefs.customs.forEach(function (ct) {
        var row = el('div', 'pref-row' + (ct.hidden ? ' is-hidden-pref' : ''));
        var left = el('div', 'pref-row-left');
        left.appendChild(el('span', 'pref-row-name', ct.name));
        left.appendChild(el('span', 'pref-row-tag', WM.i18n.t('tag_custom')));
        row.appendChild(left);

        var actions = el('div', 'pref-row-actions');
        var renameBtn = el('button', 'icon-action');
        renameBtn.type = 'button';
        renameBtn.title = WM.i18n.t('tip_rename');
        renameBtn.appendChild(createPencilIcon());
        renameBtn.addEventListener('click', function () { handlers.onRenameCustomCreditPref(ct.id, ct.name); });
        actions.appendChild(renameBtn);

        var eyeBtn = el('button', 'icon-action');
        eyeBtn.type = 'button';
        eyeBtn.title = WM.i18n.t(ct.hidden ? 'tip_show' : 'tip_hide');
        eyeBtn.appendChild(createEyeIcon(ct.hidden));
        eyeBtn.addEventListener('click', function () { handlers.onToggleCustomCreditPref(ct.id); });
        actions.appendChild(eyeBtn);

        var delBtn = el('button', 'icon-action icon-action--danger');
        delBtn.type = 'button';
        delBtn.title = WM.i18n.t('btn_delete');
        delBtn.appendChild(createTrashIcon());
        delBtn.addEventListener('click', function () { handlers.onDeleteCustomCreditPref(ct.id, ct.name); });
        actions.appendChild(delBtn);

        row.appendChild(actions);
        ctList.appendChild(row);
      });
    }
  }

  WM.render = {
    renderAll: function (state, filters, handlers) {
      syncCurrencyLabels();
      var isAllMode = WM.storage.isAllTabActive();
      var tab = WM.storage.getActiveTab();
      renderTabs(state, handlers);
      renderSummary(tab, isAllMode, state);
      renderFilterOptions(tab, filters, isAllMode, state);

      var addItemBtn = document.getElementById('addItemBtn');
      var addCatBtn = document.getElementById('addCategoryBtn');
      var manageCatsBtn = document.getElementById('manageCategoriesBtn');
      var toggleAllBtn = document.getElementById('toggleAllCategoriesBtn');

      if (addItemBtn) addItemBtn.classList.toggle('hidden', isAllMode);
      if (addCatBtn) addCatBtn.classList.toggle('hidden', isAllMode);
      if (manageCatsBtn) manageCatsBtn.classList.toggle('hidden', isAllMode);

      if (isAllMode) {
        if (toggleAllBtn) toggleAllBtn.classList.add('hidden');
        renderAllItemsFlat(state, filters, handlers);
      } else {
        renderChecklist(tab, filters, handlers);
        if (toggleAllBtn) {
          if (tab.categories.length === 0) {
            toggleAllBtn.classList.add('hidden');
          } else {
            toggleAllBtn.classList.remove('hidden');
            var allCollapsed = tab.categories.every(function (c) { return !!c.collapsed; });
            toggleAllBtn.dataset.allCollapsed = allCollapsed ? '1' : '0';
            toggleAllBtn.title = WM.i18n.t(allCollapsed ? 'expand_all' : 'collapse_all');
            toggleAllBtn.innerHTML = allCollapsed
              ? '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
              : '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
          }
        }
      }
    },
    renderItemDrawer: renderItemDrawer,
    renderGlobalCreditsModal: renderGlobalCreditsModal,
    renderTabsManager: renderTabsManager,
    renderCategoriesManager: renderCategoriesManager,
    renderGlobalSearch: renderGlobalSearch,
    renderGeneralSettings: renderGeneralSettings,
    renderDonateLinks: renderDonateLinks
  };
})(window);
