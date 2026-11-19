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
    // Приоритеты
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

    // Магазины (базовые + все кастомные из текущей вкладки)
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

      var editBtn = el('button', 'icon-action', 'Изм.');
      editBtn.type = 'button';
      editBtn.addEventListener('click', function () {
        handlers.onEditBundle(bundle.id);
      });

      top.appendChild(checkTitle);
      top.appendChild(editBtn);
      card.appendChild(top);

      // Считаем базовую сумму входящих товаров
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
        var ov = el('span', 'bundle-overpay', 'Переплата: +' + fmt(overpay));
        metrics.appendChild(ov);
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

      // Сортируем: сначала некупленные, затем по приоритету (1 -> 5)
      catItems.sort(function (a, b) {
        if (a.checked !== b.checked) return a.checked ? 1 : -1;
        return WM.utils.getPriority(a.priority).rank - WM.utils.getPriority(b.priority).rank;
      });

      var block = el('section', 'category-block' + (cat.collapsed ? ' is-collapsed' : ''));

      // Заголовок категории
      var header = el('div', 'category-header');
      var left = el('div', 'category-header-left');
      left.addEventListener('click', function () {
        handlers.onToggleCategoryCollapse(cat.id);
      });
      left.appendChild(el('span', 'cat-chevron', '▾'));
      left.appendChild(el('h2', 'category-name', cat.name));
      var checkedInCat = catItemsAll.filter(function (x) { return x.checked; }).length;
      left.appendChild(el('span', 'category-count', checkedInCat + '/' + catItemsAll.length));

      // Сумма категории (справочно по ценам позиций)
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

      var editCatBtn = el('button', 'icon-action', 'Изм.');
      editCatBtn.type = 'button';
      editCatBtn.title = 'Переименовать или удалить категорию';
      editCatBtn.addEventListener('click', function () {
        handlers.onEditCategory(cat.id);
      });

      right.appendChild(quickAddBtn);
      right.appendChild(editCatBtn);

      header.appendChild(left);
      header.appendChild(right);
      block.appendChild(header);

      // Список позиций категории
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

  function renderItemRow(item, tab, handlers) {
    var fmt = WM.utils.formatMoney;
    var prio = WM.utils.getPriority(item.priority);
    var bundle = WM.storage.getBundleForItem(tab, item.id);
    var isIndCredit = !bundle && !!(item.credit && item.credit.enabled);

    var row = el('div', 'item-row' + (item.checked ? ' is-checked' : ''));

    // Чекбокс
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'check-input';
    cb.checked = !!item.checked;
    cb.setAttribute('aria-label', item.title);
    cb.addEventListener('change', function () {
      handlers.onToggleItem(item.id, cb.checked);
    });
    row.appendChild(cb);

    // Основной контент
    var content = el('div', 'item-content');

    var badges = el('div', 'item-badges');
    badges.appendChild(el('span', 'badge badge-prio-' + prio.id, prio.label));
    if (item.store) {
      badges.appendChild(el('span', 'badge badge-store', item.store));
    }
    if (isIndCredit) {
      badges.appendChild(el('span', 'badge badge-credit', 'КРЕДИТ / РАССРОЧКА'));
    } else if (bundle) {
      badges.appendChild(el('span', 'badge badge-bundle', 'ОБЩИЙ КРЕДИТ: ' + bundle.name));
    }
    content.appendChild(badges);

    content.appendChild(el('div', 'item-title', item.title));

    if (item.note) {
      content.appendChild(el('div', 'item-note', item.note));
    }

    if (isIndCredit) {
      var creditLine = el('div', 'item-credit-line');
      var total = item.credit.totalAmount > 0 ? item.credit.totalAmount : item.price;
      var overpay = Math.round((total - item.price) * 100) / 100;
      if (item.credit.months > 0) {
        creditLine.appendChild(el('span', '', 'Срок: ' + item.credit.months + ' мес.'));
      }
      creditLine.appendChild(el('span', '', 'Платёж: ' + fmt(item.credit.monthlyPayment) + '/мес'));
      creditLine.appendChild(el('span', '', 'Итого: ' + fmt(total)));
      if (overpay > 0) {
        creditLine.appendChild(el('span', 'bundle-overpay', 'Переплата: +' + fmt(overpay)));
      }
      content.appendChild(creditLine);
    }

    if (item.link) {
      var links = el('div', 'item-links');
      var a = document.createElement('a');
      a.href = item.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Открыть ссылку ↗';
      links.appendChild(a);
      content.appendChild(links);
    }

    row.appendChild(content);

    // Правая колонка: цена и действия
    var right = el('div', 'item-right');
    var priceWrap = el('div');
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

    var actions = el('div', 'item-actions');
    var editBtn = el('button', 'icon-action', 'Изм.');
    editBtn.type = 'button';
    editBtn.addEventListener('click', function () {
      handlers.onEditItem(item.id);
    });
    actions.appendChild(editBtn);
    right.appendChild(actions);

    row.appendChild(right);
    return row;
  }

  WM.render = {
    renderAll: function (state, filters, handlers) {
      var tab = WM.storage.getActiveTab();
      renderTabs(state, handlers);
      renderSummary(tab);
      renderFilterOptions(tab, filters);
      renderBundles(tab, handlers);
      renderChecklist(tab, filters, handlers);
    }
  };
})(window);
