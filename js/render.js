/* ==========================================================================
   WM_CHECKLIST — ОТРИСОВКА ИНТЕРФЕЙСА (DOM RENDERING)
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
        e.stopPropagation(); // Не открывать карточку при клике по ссылке магазина
      });
      return a;
    }
    return el('span', 'badge badge-store', storeName);
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
    var fmt = WM.utils.formatMoney;

    document.getElementById('statSpent').textContent = fmt(totals.spentTotal);
    var spentParts = ['Отмечено: ' + totals.checkedItemsCount + ' из ' + totals.totalItemsCount];
    if (totals.spentCash > 0 || totals.spentCredit > 0) {
      spentParts.push('Нал: ' + fmt(totals.spentCash) + ' · Кредит: ' + fmt(totals.spentCredit));
    }
    document.getElementById('statSpentMeta').textContent = spentParts.join(' · ');

    document.getElementById('statMonthly').textContent = fmt(totals.monthlyCreditTotal);
    document.getElementById('statMonthlyMeta').textContent = 'Активных кредитов: ' + totals.activeCreditsCount;

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

  function renderBundles(tab, handlers) {
    var section = document.getElementById('bundlesSection');
    var list = document.getElementById('bundlesList');
    list.innerHTML = '';

    if (!tab.creditBundles || tab.creditBundles.length === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    var fmt = WM.utils.formatMoney;

    tab.creditBundles.forEach(function (bundle) {
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

      var baseSum = 0;
      var tagsWrap = el('div', 'bundle-items-tags');
      bundle.itemIds.forEach(function (id) {
        var it = tab.items.find(function (x) { return x.id === id; });
        if (it) {
          baseSum += it.price;
          tagsWrap.appendChild(el('span', 'mini-tag', it.title + ' (' + fmt(it.price) + ')'));
        }
      });

      var overpay = Math.round((bundle.totalAmount - baseSum) * 100) / 100;
      var metrics = el('div', 'bundle-metrics');
      metrics.appendChild(createMetricSpan('Итого: ', fmt(bundle.totalAmount)));
      metrics.appendChild(createMetricSpan('Платёж: ', fmt(bundle.monthlyPayment) + '/мес'));
      if (bundle.months > 0) {
        metrics.appendChild(createMetricSpan('Срок: ', bundle.months + ' мес.'));
      }
      if (overpay > 0) {
        metrics.appendChild(el('span', 'bundle-overpay', 'Переплата: +' + fmt(overpay)));
      }

      card.appendChild(metrics);
      card.appendChild(tagsWrap);
      list.appendChild(card);
    });
  }

  function createMetricSpan(label, value) {
    var span = el('span');
    span.appendChild(document.createTextNode(label));
    span.appendChild(el('strong', '', value));
    return span;
  }

  function itemMatchesFilters(item, tab, filters) {
    var q = (filters.search || '').trim().toLowerCase();
    if (q) {
      var hay = (item.title + ' ' + item.note + ' ' + item.store).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }

    if (filters.status === 'checked' && !item.checked) return false;
    if (filters.status === 'unchecked' && item.checked) return false;
    if (filters.status === 'credit') {
      var isIndCredit = !!(item.credit && item.credit.enabled);
      var isBundled = !!WM.storage.getBundleForItem(tab, item.id);
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
      var catItems = catItemsAll.filter(function (it) { return itemMatchesFilters(it, tab, filters); });

      if (hasActiveFilter && catItems.length === 0) {
        return;
      }
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
      editCatBtn.title = 'Переименовать или удалить категорию';
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
          itemsWrap.appendChild(renderItemRow(item, tab, handlers));
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

  /* Компактная строка товара: клик по контенту открывает полную карточку в выдвижной панели */
  function renderItemRow(item, tab, handlers) {
    var fmt = WM.utils.formatMoney;
    var prio = WM.utils.getPriority(item.priority);
    var bundle = WM.storage.getBundleForItem(tab, item.id);
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
    if (item.store || item.link) {
      badges.appendChild(createStoreBadge(item.store, item.link));
    }
    if (isIndCredit) {
      badges.appendChild(el('span', 'badge badge-credit', 'КРЕДИТ / РАССРОЧКА'));
    } else if (bundle) {
      badges.appendChild(el('span', 'badge badge-bundle', 'ОБЩИЙ КРЕДИТ: ' + bundle.name));
    }
    if (item.note) {
      badges.appendChild(el('span', 'badge badge-note-hint', '≡ Заметка'));
    }
    content.appendChild(badges);

    var titleLine = el('div', 'item-title-line');
    titleLine.appendChild(el('div', 'item-title', item.title));
    if (isIndCredit) {
      var parts = [];
      if (item.credit.months > 0) parts.push(item.credit.months + ' мес.');
      if (item.credit.monthlyPayment > 0) parts.push(fmt(item.credit.monthlyPayment) + '/мес');
      if (parts.length > 0) {
        titleLine.appendChild(el('span', 'item-credit-inline', parts.join(' · ')));
      }
    }
    content.appendChild(titleLine);

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

  /* Отрисовка полной карточки в выдвижной панели (с умным разбором «Ключ: Значение») */
  function renderItemDrawer(item, tab) {
    var fmt = WM.utils.formatMoney;
    var cat = tab.categories.find(function (c) { return c.id === item.categoryId; });
    var prio = WM.utils.getPriority(item.priority);
    var bundle = WM.storage.getBundleForItem(tab, item.id);
    var isIndCredit = !bundle && !!(item.credit && item.credit.enabled);

    document.getElementById('drawerCategoryLabel').textContent = cat ? cat.name : 'КАРТОЧКА ПОЗИЦИИ';
    document.getElementById('drawerItemTitle').textContent = item.title;

    var badgesWrap = document.getElementById('drawerBadges');
    badgesWrap.innerHTML = '';
    badgesWrap.appendChild(el('span', 'badge badge-prio-' + prio.id, prio.label));
    if (item.store || item.link) {
      badgesWrap.appendChild(createStoreBadge(item.store, item.link));
    }
    if (isIndCredit) {
      badgesWrap.appendChild(el('span', 'badge badge-credit', 'КРЕДИТ / РАССРОЧКА'));
    } else if (bundle) {
      badgesWrap.appendChild(el('span', 'badge badge-bundle', 'ОБЩИЙ КРЕДИТ: ' + bundle.name));
    }

    var priceMain = document.getElementById('drawerPriceMain');
    var priceSub = document.getElementById('drawerPriceSub');
    if (isIndCredit && item.credit.totalAmount > 0) {
      priceMain.textContent = fmt(item.credit.totalAmount);
      priceSub.textContent = item.credit.totalAmount !== item.price ? 'Базовая цена: ' + fmt(item.price) : 'Рассрочка без переплаты';
    } else if (bundle) {
      priceMain.textContent = fmt(item.price);
      priceSub.textContent = 'Входит в общий кредит «' + bundle.name + '»';
    } else {
      priceMain.textContent = fmt(item.price);
      priceSub.textContent = 'Оплата наличными / картой';
    }

    var toggle = document.getElementById('drawerCheckedToggle');
    toggle.checked = !!item.checked;
    document.getElementById('drawerCheckedText').textContent = item.checked ? 'Куплено' : 'Не куплено';

    // Блок кредита
    var creditBlock = document.getElementById('drawerCreditBlock');
    creditBlock.innerHTML = '';
    if (isIndCredit) {
      creditBlock.classList.remove('hidden');
      var total = item.credit.totalAmount > 0 ? item.credit.totalAmount : item.price;
      var overpay = Math.round((total - item.price) * 100) / 100;
      if (item.credit.months > 0) creditBlock.appendChild(createMetricSpan('Срок: ', item.credit.months + ' мес.'));
      creditBlock.appendChild(createMetricSpan('Ежемесячный платёж: ', fmt(item.credit.monthlyPayment) + '/мес'));
      creditBlock.appendChild(createMetricSpan('Итоговая сумма: ', fmt(total)));
      if (overpay > 0) {
        creditBlock.appendChild(el('span', 'bundle-overpay', 'Переплата банку: +' + fmt(overpay)));
      }
    } else if (bundle) {
      creditBlock.classList.remove('hidden');
      creditBlock.appendChild(createMetricSpan('Общий кредит: ', bundle.name));
      if (bundle.months > 0) creditBlock.appendChild(createMetricSpan('Срок: ', bundle.months + ' мес.'));
      creditBlock.appendChild(createMetricSpan('Общий платёж: ', fmt(bundle.monthlyPayment) + '/мес'));
      creditBlock.appendChild(createMetricSpan('Общая сумма кредита: ', fmt(bundle.totalAmount)));
    } else {
      creditBlock.classList.add('hidden');
    }

    // Кнопка ссылки на товар
    var linkWrap = document.getElementById('drawerLinkWrap');
    var linkAnchor = document.getElementById('drawerLinkAnchor');
    if (item.link) {
      linkWrap.classList.remove('hidden');
      linkAnchor.href = item.link;
      linkAnchor.textContent = 'Открыть в ' + (item.store || 'магазине') + ' ↗';
    } else {
      linkWrap.classList.add('hidden');
    }

    // Заметка / характеристики (строки вида "Ключ: Значение" красиво раскладываются в 2 колонки)
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
        // Если есть короткий ключ до двоеточия (и это не URL), оформляем как строку характеристики
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

  WM.render = {
    renderAll: function (state, filters, handlers) {
      var tab = WM.storage.getActiveTab();
      renderTabs(state, handlers);
      renderSummary(tab);
      renderFilterOptions(tab, filters);
      renderBundles(tab, handlers);
      renderChecklist(tab, filters, handlers);
    },
    renderItemDrawer: renderItemDrawer
  };
})(window);
