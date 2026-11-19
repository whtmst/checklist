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

  function createStoreBadge(storeName, link) {
    if (link) {
      var a = document.createElement('a');
      a.className = 'badge badge-store-link';
      a.href = link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = (storeName || 'Ссылка') + ' ↗';
      a.title = 'Открыть товар в магазине';
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
      gWrap.appendChild(el('span', cls, 'Вернуть до: ' + grace.dueFormatted + ' (' + grace.statusText + ')'));
      container.appendChild(gWrap);
      return;
    }

    var sched = WM.utils.calcCreditSchedule(opts.startDate, opts.months, opts.monthlyPayment);
    if (!sched) return;

    var wrap = el('div', 'credit-progress-wrap');
    wrap.appendChild(createMetricSpan('Оформлен: ', sched.startFormatted + ' → до ' + sched.endFormatted));

    if (sched.isFinished) {
      wrap.appendChild(el('span', 'bundle-ok', 'Статус: ПОГАШЕН (' + sched.totalMonths + ' из ' + sched.totalMonths + ' мес.)'));
    } else {
      var remText = sched.remainingMonths + ' из ' + sched.totalMonths + ' мес.';
      if (sched.remainingAmount > 0) {
        remText += ' (~' + WM.utils.formatMoney(sched.remainingAmount) + ')';
      }
      wrap.appendChild(createMetricSpan('Осталось платежей: ', remText));
    }

    var track = el('div', 'credit-progress-track');
    var fill = el('div', 'credit-progress-fill' + (sched.isFinished ? ' done' : ''));
    fill.style.width = sched.paidPct + '%';
    track.appendChild(fill);
    wrap.appendChild(track);

    container.appendChild(wrap);
  }

  function renderTabs(state, handlers) {
    var container = document.getElementById('tabsList');
    container.innerHTML = '';

    state.tabs.forEach(function (tab) {
      var btn = el('button', 'tab-chip' + (tab.id === state.activeTabId ? ' active' : ''));
      btn.type = 'button';
      btn.appendChild(el('span', '', tab.name));
      btn.appendChild(el('span', 'tab-chip-count', String(tab.items.length)));
      btn.addEventListener('click', function () {
        handlers.onSelectTab(tab.id);
      });
      container.appendChild(btn);
    });
  }

  function renderSummary(tab) {
    var totals = WM.storage.calculateTabTotals(tab);
    var globalSummary = WM.storage.calculateGlobalCredits();
    var fmt = WM.utils.formatMoney;

    // Мини-индикатор месячного платежа на кнопке «Кредиты» в шапке
    var pill = document.getElementById('topbarCreditsPill');
    if (globalSummary.monthlyTotal > 0) {
      pill.textContent = fmt(globalSummary.monthlyTotal) + '/м';
      pill.classList.remove('hidden');
    } else if (globalSummary.graceTotal > 0) {
      pill.textContent = fmt(globalSummary.graceTotal);
      pill.classList.remove('hidden');
    } else {
      pill.classList.add('hidden');
    }

    document.getElementById('statSpent').textContent = fmt(totals.spentTotal);
    var spentParts = ['Отмечено: ' + totals.checkedItemsCount + ' из ' + totals.totalItemsCount];
    if (totals.spentCash > 0 || totals.spentCredit > 0) {
      spentParts.push('Нал: ' + fmt(totals.spentCash) + ' · Кредит: ' + fmt(totals.spentCredit));
    }
    document.getElementById('statSpentMeta').textContent = spentParts.join(' · ');

    document.getElementById('statMonthly').textContent = fmt(totals.monthlyCreditTotal);
    document.getElementById('statMonthlyMeta').textContent = 'Активных кредитов во вкладке: ' + totals.activeCreditsCount;

    document.getElementById('statPlanned').textContent = fmt(totals.plannedTotal);
    document.getElementById('statPlannedMeta').textContent =
      'Нал: ' + fmt(totals.plannedCash) + ' · Кредит: ' + fmt(totals.plannedCredit);

    document.getElementById('footerStats').textContent =
      tab.name.toUpperCase() + ' // КАТЕГОРИЙ: ' + tab.categories.length + ' · ПОЗИЦИЙ: ' + tab.items.length;
  }

  function renderFilterOptions(tab, filters) {
    var prioSelect = document.getElementById('priorityFilter');
    if (prioSelect.options.length <= 1) {
      WM.CONFIG.PRIORITIES.forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.label;
        prioSelect.appendChild(opt);
      });
    }
    prioSelect.value = filters.priority;

    var storeSelect = document.getElementById('storeFilter');
    var seen = {};
    var stores = [];
    WM.CONFIG.STORES.forEach(function (s) {
      seen[s] = true;
      stores.push(s);
    });
    tab.items.forEach(function (it) {
      if (it.store && !seen[it.store]) {
        seen[it.store] = true;
        stores.push(it.store);
      }
    });

    storeSelect.innerHTML = '<option value="all">Все магазины</option>';
    stores.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      storeSelect.appendChild(opt);
    });
    storeSelect.value = seen[filters.store] ? filters.store : 'all';
  }

  function renderBundleCard(bundle, handlers) {
    var fmt = WM.utils.formatMoney;
    var details = WM.storage.getBundleDetails(bundle);
    var card = el('article', 'bundle-card' + (bundle.checked ? ' is-active' : ''));

    var top = el('div', 'bundle-card-top');
    var checkTitle = el('div', 'bundle-check-title');

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'check-input';
    cb.checked = !!bundle.checked;
    cb.setAttribute('aria-label', 'Отметить кредит ' + bundle.name);
    cb.addEventListener('change', function () {
      handlers.onToggleBundle(bundle.id, cb.checked);
    });

    var nameWrap = el('div');
    var badgeRow = el('div', 'item-badges');
    badgeRow.style.marginBottom = '4px';
    badgeRow.appendChild(createCreditBadge(bundle.type, bundle.customType, null));
    if (details.isCrossTab) {
      badgeRow.appendChild(el('span', 'badge badge-store', details.tabNames.join(' + ')));
    }
    nameWrap.appendChild(badgeRow);
    nameWrap.appendChild(el('div', 'bundle-name', bundle.name));
    nameWrap.appendChild(el('div', 'item-price-sub', bundle.checked ? 'Оформлен' : 'Запланирован'));

    checkTitle.appendChild(cb);
    checkTitle.appendChild(nameWrap);

    var editBtn = el('button', 'icon-action');
    editBtn.type = 'button';
    editBtn.title = 'Редактировать общий кредит';
    editBtn.setAttribute('aria-label', 'Редактировать общий кредит');
    editBtn.appendChild(createPencilIcon());
    editBtn.addEventListener('click', function () {
      handlers.onEditBundle(bundle.id);
    });

    top.appendChild(checkTitle);
    top.appendChild(editBtn);
    card.appendChild(top);

    var overpay = Math.round((bundle.totalAmount - details.baseSum) * 100) / 100;
    var metrics = el('div', 'bundle-metrics');
    metrics.appendChild(createMetricSpan('Итого: ', fmt(bundle.totalAmount)));
    if (bundle.type !== 'grace') {
      metrics.appendChild(createMetricSpan('Платёж: ', fmt(bundle.monthlyPayment) + '/мес'));
      if (bundle.months > 0) metrics.appendChild(createMetricSpan('Срок: ', bundle.months + ' мес.'));
    }
    if (overpay > 0) {
      metrics.appendChild(el('span', 'bundle-overpay', 'Переплата: +' + fmt(overpay)));
    }
    card.appendChild(metrics);

    appendScheduleOrGraceBlock(card, {
      type: bundle.type,
      startDate: bundle.startDate,
      dueDate: bundle.dueDate,
      months: bundle.months,
      monthlyPayment: bundle.monthlyPayment
    });

    var tagsWrap = el('div', 'bundle-items-tags');
    details.items.forEach(function (entry) {
      var label = details.isCrossTab
        ? '[' + entry.tab.name + '] ' + entry.item.title + ' (' + fmt(entry.item.price) + ')'
        : entry.item.title + ' (' + fmt(entry.item.price) + ')';
      tagsWrap.appendChild(el('span', 'mini-tag', label));
    });
    card.appendChild(tagsWrap);
    return card;
  }

  function renderBundles(tab, handlers) {
    var section = document.getElementById('bundlesSection');
    var list = document.getElementById('bundlesList');
    list.innerHTML = '';

    var tabBundles = WM.storage.getBundlesForTab(tab);
    if (tabBundles.length === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    tabBundles.forEach(function (bundle) {
      list.appendChild(renderBundleCard(bundle, handlers));
    });
  }

  function itemMatchesFilters(item, filters) {
    var q = (filters.search || '').trim().toLowerCase();
    if (q) {
      var hay = (item.title + ' ' + item.note + ' ' + item.store).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }

    if (filters.status === 'checked' && !item.checked) return false;
    if (filters.status === 'unchecked' && item.checked) return false;
    if (filters.status === 'credit') {
      var isIndCredit = !!(item.credit && item.credit.enabled);
      var isBundled = !!WM.storage.getBundleForItem(item.id);
      if (!isIndCredit && !isBundled) return false;
    }

    if (filters.priority !== 'all' && item.priority !== filters.priority) return false;
    if (filters.store !== 'all' && item.store !== filters.store) return false;

    return true;
  }

  function renderChecklist(tab, filters, handlers) {
    var root = document.getElementById('checklistRoot');
    root.innerHTML = '';

    if (tab.categories.length === 0) {
      var empty = el('div', 'empty-state');
      empty.appendChild(el('h2', '', 'Вкладка «' + tab.name + '» пока пуста'));
      empty.appendChild(el('p', '', 'Создай первую категорию (например, «Экипировка», «Техника» или «Дом») и добавь в неё нужные позиции.'));
      var actions = el('div', 'empty-actions');
      var addCat = el('button', 'btn btn-accent', '+ Создать категорию');
      addCat.type = 'button';
      addCat.addEventListener('click', handlers.onAddCategory);
      actions.appendChild(addCat);
      empty.appendChild(actions);
      root.appendChild(empty);
      return;
    }

    var fmt = WM.utils.formatMoney;
    var hasActiveFilter = !!(
      (filters.search && filters.search.trim()) ||
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

      catItems.sort(function (a, b) {
        if (a.checked !== b.checked) return a.checked ? 1 : -1;
        return WM.utils.getPriority(a.priority).rank - WM.utils.getPriority(b.priority).rank;
      });

      var block = el('section', 'category-block' + (cat.collapsed ? ' is-collapsed' : ''));

      var header = el('div', 'category-header');
      var left = el('div', 'category-header-left');
      left.addEventListener('click', function () {
        handlers.onToggleCategoryCollapse(cat.id);
      });
      left.appendChild(el('span', 'cat-chevron', '▾'));
      left.appendChild(el('h2', 'category-name', cat.name));
      var checkedInCat = catItemsAll.filter(function (x) { return x.checked; }).length;
      left.appendChild(el('span', 'category-count', checkedInCat + '/' + catItemsAll.length));

      var catSum = 0;
      catItemsAll.forEach(function (it) {
        var val = (it.credit && it.credit.enabled && it.credit.totalAmount > 0) ? it.credit.totalAmount : it.price;
        catSum += val;
      });

      var right = el('div', 'category-header-right');
      right.appendChild(el('span', 'category-sum', fmt(catSum)));

      var quickAddBtn = el('button', 'icon-action', '+');
      quickAddBtn.type = 'button';
      quickAddBtn.title = 'Добавить позицию в эту категорию';
      quickAddBtn.addEventListener('click', function () {
        handlers.onAddItemInCategory(cat.id);
      });

      var editCatBtn = el('button', 'icon-action');
      editCatBtn.type = 'button';
      editCatBtn.title = 'Переименовать, перенести или удалить категорию';
      editCatBtn.setAttribute('aria-label', 'Редактировать категорию');
      editCatBtn.appendChild(createPencilIcon());
      editCatBtn.addEventListener('click', function () {
        handlers.onEditCategory(cat.id);
      });

      right.appendChild(quickAddBtn);
      right.appendChild(editCatBtn);

      header.appendChild(left);
      header.appendChild(right);
      block.appendChild(header);

      var itemsWrap = el('div', 'category-items');
      if (catItems.length === 0) {
        var emptyRow = el('div', 'category-empty');
        emptyRow.appendChild(el('span', '', 'В этой категории пока нет позиций'));
        var addOne = el('button', 'btn btn-ghost btn-sm', '+ Добавить позицию');
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
      noMatch.appendChild(el('h2', '', 'Ничего не найдено'));
      noMatch.appendChild(el('p', '', 'По выбранным фильтрам позиций нет. Попробуй сбросить поиск или фильтры.'));
      var resetBtn = el('button', 'btn btn-secondary', 'Сбросить фильтры');
      resetBtn.type = 'button';
      resetBtn.addEventListener('click', handlers.onResetFilters);
      noMatch.appendChild(resetBtn);
      root.appendChild(noMatch);
    }
  }

  function renderItemRow(item, handlers) {
    var fmt = WM.utils.formatMoney;
    var prio = WM.utils.getPriority(item.priority);
    var bundle = WM.storage.getBundleForItem(item.id);
    var isIndCredit = !bundle && !!(item.credit && item.credit.enabled);

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
    content.title = 'Нажми, чтобы открыть полную карточку';
    content.addEventListener('click', function () {
      handlers.onViewItem(item.id);
    });

    var badges = el('div', 'item-badges');
    badges.appendChild(el('span', 'badge badge-prio-' + prio.id, prio.label));
    if (isIndCredit) {
      badges.appendChild(createCreditBadge(item.credit.type, item.credit.customType, null));
    } else if (bundle) {
      badges.appendChild(createCreditBadge(bundle.type, bundle.customType, bundle.name));
    }
    if (item.store || item.link) {
      badges.appendChild(createStoreBadge(item.store, item.link));
    }
    if (item.note) {
      badges.appendChild(el('span', 'badge badge-note-hint', '≡ Заметка'));
    }
    content.appendChild(badges);

    content.appendChild(el('div', 'item-title', item.title));
    row.appendChild(content);

    var right = el('div', 'item-right');
    var priceWrap = el('div', 'item-price-block');
    if (isIndCredit && item.credit.totalAmount > 0 && item.credit.totalAmount !== item.price) {
      priceWrap.appendChild(el('div', 'item-price', fmt(item.credit.totalAmount)));
      priceWrap.appendChild(el('div', 'item-price-sub', 'Цена: ' + fmt(item.price)));
    } else if (bundle) {
      priceWrap.appendChild(el('div', 'item-price', fmt(item.price)));
      priceWrap.appendChild(el('div', 'item-price-sub', 'В общем кредите'));
    } else {
      priceWrap.appendChild(el('div', 'item-price', fmt(item.price)));
    }
    right.appendChild(priceWrap);

    var editBtn = el('button', 'icon-action');
    editBtn.type = 'button';
    editBtn.title = 'Редактировать позицию';
    editBtn.setAttribute('aria-label', 'Редактировать ' + item.title);
    editBtn.appendChild(createPencilIcon());
    editBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      handlers.onEditItem(item.id);
    });
    right.appendChild(editBtn);

    row.appendChild(right);
    return row;
  }

  function renderItemDrawer(item, tab) {
    var fmt = WM.utils.formatMoney;
    var cat = tab.categories.find(function (c) { return c.id === item.categoryId; });
    var prio = WM.utils.getPriority(item.priority);
    var bundle = WM.storage.getBundleForItem(item.id);
    var isIndCredit = !bundle && !!(item.credit && item.credit.enabled);

    document.getElementById('drawerCategoryLabel').textContent = cat ? cat.name : 'КАРТОЧКА ПОЗИЦИИ';
    document.getElementById('drawerItemTitle').textContent = item.title;

    var badgesWrap = document.getElementById('drawerBadges');
    badgesWrap.innerHTML = '';
    badgesWrap.appendChild(el('span', 'badge badge-prio-' + prio.id, prio.label));
    if (isIndCredit) {
      badgesWrap.appendChild(createCreditBadge(item.credit.type, item.credit.customType, null));
    } else if (bundle) {
      badgesWrap.appendChild(createCreditBadge(bundle.type, bundle.customType, bundle.name));
    }
    if (item.store || item.link) {
      badgesWrap.appendChild(createStoreBadge(item.store, item.link));
    }

    var priceMain = document.getElementById('drawerPriceMain');
    var priceSub = document.getElementById('drawerPriceSub');
    if (isIndCredit && item.credit.totalAmount > 0) {
      priceMain.textContent = fmt(item.credit.totalAmount);
      var lbl = WM.utils.getCreditTypeLabel(item.credit.type, item.credit.customType, false);
      priceSub.textContent = item.credit.totalAmount !== item.price ? 'Базовая цена: ' + fmt(item.price) : lbl;
    } else if (bundle) {
      priceMain.textContent = fmt(item.price);
      priceSub.textContent = 'Входит в общий пакет «' + bundle.name + '»';
    } else {
      priceMain.textContent = fmt(item.price);
      priceSub.textContent = 'Оплата наличными / картой';
    }

    var toggle = document.getElementById('drawerCheckedToggle');
    toggle.checked = !!item.checked;
    document.getElementById('drawerCheckedText').textContent = item.checked ? 'Куплено' : 'Не куплено';

    var creditBlock = document.getElementById('drawerCreditBlock');
    creditBlock.innerHTML = '';
    if (isIndCredit) {
      creditBlock.classList.remove('hidden');
      var c = item.credit;
      var total = c.totalAmount > 0 ? c.totalAmount : item.price;
      var overpay = Math.round((total - item.price) * 100) / 100;
      creditBlock.appendChild(createMetricSpan('Тип: ', WM.utils.getCreditTypeLabel(c.type, c.customType, false)));
      if (c.type !== 'grace') {
        if (c.months > 0) creditBlock.appendChild(createMetricSpan('Срок: ', c.months + ' мес.'));
        creditBlock.appendChild(createMetricSpan('Ежемесячный платёж: ', fmt(c.monthlyPayment) + '/мес'));
      }
      creditBlock.appendChild(createMetricSpan('Итого к возврату: ', fmt(total)));
      if (overpay > 0) {
        creditBlock.appendChild(el('span', 'bundle-overpay', 'Переплата банку: +' + fmt(overpay)));
      }
      appendScheduleOrGraceBlock(creditBlock, c);
    } else if (bundle) {
      creditBlock.classList.remove('hidden');
      var bDetails = WM.storage.getBundleDetails(bundle);
      creditBlock.appendChild(createMetricSpan('Общий пакет: ', bundle.name + ' (' + WM.utils.getCreditTypeLabel(bundle.type, bundle.customType, false) + ')'));
      if (bDetails.isCrossTab) {
        creditBlock.appendChild(createMetricSpan('Вкладки: ', bDetails.tabNames.join(' + ')));
      }
      if (bundle.type !== 'grace') {
        if (bundle.months > 0) creditBlock.appendChild(createMetricSpan('Срок: ', bundle.months + ' мес.'));
        creditBlock.appendChild(createMetricSpan('Общий платёж: ', fmt(bundle.monthlyPayment) + '/мес'));
      }
      creditBlock.appendChild(createMetricSpan('Общая сумма пакета: ', fmt(bundle.totalAmount)));
      var bOverpay = Math.round((bundle.totalAmount - bDetails.baseSum) * 100) / 100;
      if (bOverpay > 0) {
        creditBlock.appendChild(el('span', 'bundle-overpay', 'Общая переплата: +' + fmt(bOverpay)));
      }
      appendScheduleOrGraceBlock(creditBlock, bundle);
    } else {
      creditBlock.classList.add('hidden');
    }

    var linkWrap = document.getElementById('drawerLinkWrap');
    var linkAnchor = document.getElementById('drawerLinkAnchor');
    if (item.link) {
      linkWrap.classList.remove('hidden');
      linkAnchor.href = item.link;
      linkAnchor.textContent = 'Открыть в ' + (item.store || 'магазине') + ' ↗';
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

  /* Отрисовка единой панели «Все кредиты и лимит карты» */
  function renderGlobalCreditsModal(typeFilter, handlers) {
    var data = WM.storage.calculateGlobalCredits();
    var fmt = WM.utils.formatMoney;

    // Лимит карты
    var limitInput = document.getElementById('cardLimitInput');
    if (document.activeElement !== limitInput) {
      limitInput.value = data.cardLimit > 0 ? data.cardLimit : '';
    }

    var limitStats = document.getElementById('cardLimitStats');
    var limitTrack = document.getElementById('cardLimitTrack');
    var limitFill = document.getElementById('cardLimitFill');
    limitStats.innerHTML = '';

    if (data.cardLimit > 0) {
      limitStats.appendChild(createMetricSpan('Занято долгом: ', fmt(data.totalDebtRemaining)));
      var availSpan = el('span', data.cardAvailable < 0 ? 'bundle-danger' : 'bundle-ok');
      availSpan.textContent = 'Доступно: ' + fmt(data.cardAvailable);
      limitStats.appendChild(availSpan);
      limitStats.appendChild(el('span', '', '(' + data.limitPct + '%)'));
      limitTrack.classList.remove('hidden');
      limitFill.style.width = data.limitPct + '%';
      limitFill.className = 'credit-progress-fill' + (data.cardAvailable < 0 ? ' over' : '');
    } else {
      limitStats.appendChild(el('span', 'form-hint', 'Укажи лимит карты (напр. 2450), чтобы видеть свободный остаток.'));
      limitTrack.classList.add('hidden');
    }

    // 3 главные цифры
    document.getElementById('globalCreditMonthly').textContent = fmt(data.monthlyTotal);
    document.getElementById('globalCreditMonthlyMeta').textContent = 'Активных долгов: ' + data.activeCount;

    document.getElementById('globalCreditGrace').textContent = fmt(data.graceTotal);
    document.getElementById('globalCreditGraceMeta').textContent = data.nearestGrace
      ? 'Ближайший срок: до ' + data.nearestGrace.dueFormatted + ' (' + data.nearestGrace.statusText + ')'
      : 'Нет активных льготных долгов';

    document.getElementById('globalCreditRemaining').textContent = fmt(data.totalDebtRemaining);

    // Фильтрация списка записей
    var listEl = document.getElementById('globalCreditsList');
    listEl.innerHTML = '';

    var filtered = data.records.filter(function (rec) {
      return typeFilter === 'all' || rec.type === typeFilter;
    });

    if (filtered.length === 0) {
      var empty = el('div', 'empty-state');
      empty.style.gridColumn = '1 / -1';
      empty.appendChild(el('p', '', 'По выбранному фильтру кредитов или рассрочек пока нет.'));
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
        if (rec.kind === 'bundle') handlers.onToggleBundle(rec.id, cb.checked);
        else handlers.onToggleItem(rec.id, cb.checked);
      });

      var info = el('div');
      var badges = el('div', 'item-badges');
      badges.style.marginBottom = '4px';
      badges.appendChild(createCreditBadge(rec.type, rec.customType, null));
      badges.appendChild(el('span', 'badge badge-store', rec.tabNames.join(' + ')));
      if (rec.kind === 'bundle') {
        badges.appendChild(el('span', 'badge badge-note-hint', 'ОБЩИЙ'));
      }
      info.appendChild(badges);
      info.appendChild(el('div', 'bundle-name', rec.title));
      info.appendChild(el('div', 'item-price-sub', rec.checked ? 'Активен / оформлен' : 'Запланирован'));

      left.appendChild(cb);
      left.appendChild(info);

      var editBtn = el('button', 'icon-action');
      editBtn.type = 'button';
      editBtn.title = 'Редактировать';
      editBtn.appendChild(createPencilIcon());
      editBtn.addEventListener('click', function () {
        if (rec.kind === 'bundle') handlers.onEditBundle(rec.id);
        else handlers.onEditItemAcrossTabs(rec.tabId, rec.id);
      });

      top.appendChild(left);
      top.appendChild(editBtn);
      card.appendChild(top);

      var metrics = el('div', 'bundle-metrics');
      metrics.appendChild(createMetricSpan('Итого: ', fmt(rec.totalAmount)));
      if (rec.type !== 'grace') {
        metrics.appendChild(createMetricSpan('Платёж: ', fmt(rec.monthlyPayment) + '/мес'));
        if (rec.months > 0) metrics.appendChild(createMetricSpan('Срок: ', rec.months + ' мес.'));
      }
      if (rec.overpay > 0) {
        metrics.appendChild(el('span', 'bundle-overpay', 'Переплата: +' + fmt(rec.overpay)));
      }
      card.appendChild(metrics);

      appendScheduleOrGraceBlock(card, rec);

      if (rec.kind === 'bundle' && rec.itemsList.length > 0) {
        var tags = el('div', 'bundle-items-tags');
        rec.itemsList.forEach(function (entry) {
          tags.appendChild(el('span', 'mini-tag', '[' + entry.tab.name + '] ' + entry.item.title + ' (' + fmt(entry.item.price) + ')'));
        });
        card.appendChild(tags);
      }

      listEl.appendChild(card);
    });
  }

  WM.render = {
    renderAll: function (state, filters, handlers) {
      var tab = WM.storage.getActiveTab();
      renderTabs(state, handlers);
      renderSummary(tab);
      renderFilterOptions(tab, filters);
      renderBundles(tab, handlers);
      renderChecklist(tab, filters, handlers);
    },
    renderItemDrawer: renderItemDrawer,
    renderGlobalCreditsModal: renderGlobalCreditsModal
  };
})(window);
