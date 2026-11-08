/* Elf HQ — the author's December story, on this browser until a private shelf exists. */
(function () {
  'use strict';

  var fixture = null;
  var manifest = null;
  var scratch = null;
  var overrides = null;
  var canWrite = true;
  var view = null;
  var syncPort = null;
  var saveTimer = 0;
  var saveState = 'idle';
  var lastTab = 'today';
  var sheetDay = null;
  var urls = {};
  var audioCtx = null;

  function $(id) { return document.getElementById(id); }
  function iso() { return new Date().toISOString(); }
  function reduced() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function dataSaver() { return !!(navigator.connection && navigator.connection.saveData); }

  function el(tag, props) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value == null || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else node.setAttribute(key, value === true ? '' : String(value));
      });
    }
    for (var i = 2; i < arguments.length; i++) add(node, arguments[i]);
    return node;
  }
  function add(node, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (item) { add(node, item); }); return; }
    node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  function mount(parent) {
    var nodes = [];
    function collect(kid) {
      if (kid == null || kid === false) return;
      if (Array.isArray(kid)) { kid.forEach(collect); return; }
      nodes.push(kid);
    }
    for (var i = 1; i < arguments.length; i++) collect(arguments[i]);
    parent.replaceChildren.apply(parent, nodes);
  }
  function announce(text) {
    var live = $('live');
    if (live) live.textContent = text;
    var toast = $('toast');
    if (!toast) return;
    $('toastText').textContent = text;
    $('toastActions').replaceChildren();
    toast.hidden = false;
    clearTimeout(announce.timer);
    announce.timer = setTimeout(function () { toast.hidden = true; }, 7000);
  }

  function pageScrolls() {
    return window.matchMedia('(max-width: 500px), (max-width: 926px) and (max-height: 450px) and (orientation: landscape)').matches;
  }

  function labelOf(day) { return day.title ? day.title : 'Untitled chapter'; }

  function parseHash() {
    var hash = (location.hash || '#today').replace(/^#/, '');
    if (hash.indexOf('chapter/') === 0) return { name: 'chapter', id: decodeURIComponent(hash.slice(8)) };
    if (hash === 'making') hash = 'crafts';
    if (hash === 'supplies') hash = 'shopping';
    if (hash === 'desk') hash = 'settings';
    if (['today', 'story', 'crafts', 'shopping', 'gifts', 'settings'].indexOf(hash) !== -1) return { name: hash };
    return { name: 'today' };
  }

  function daysUntilElves() {
    var n = ElfPlan.diffDays(view.phase.todayKey, view.season.startDate);
    if (n > 1) return n + ' days until the elves return';
    if (n === 1) return '1 day until the elves return';
    if (n === 0) return 'The elves return today';
    if (view.phase.phase === 'after') return 'The elves have tucked the book away';
    return 'The elves are here';
  }

  function hiLine() {
    if (!view.meta.sampleStory && view.meta.displayName) return 'Hi ' + view.meta.displayName;
    return 'Hi there';
  }

  function ornament() {
    return '<svg viewBox="0 0 160 130" aria-hidden="true"><circle cx="28" cy="24" r="2.2" fill="#fff"/><circle cx="132" cy="18" r="2" fill="#fff"/><circle cx="118" cy="108" r="2" fill="#fff"/><path d="M80 8 v14" stroke="#9c2744" stroke-width="2" stroke-linecap="round"/><circle cx="80" cy="8" r="3" fill="#9c2744"/><circle cx="80" cy="72" r="40" fill="#c43b55"/><circle cx="66" cy="58" r="12" fill="#fff" opacity=".28"/><path d="M80 36 l4 10 h10 l-8 6 3 10 -9 -6 -9 6 3 -10 -8 -6 h10 z" fill="#E8F2E5"/></svg>';
  }

  function refresh() {
    if (!fixture || !overrides) return;
    view = ElfPlan.buildView(fixture, overrides, new Date());
  }

  function scheduleSave() {
    if (!canWrite) return;
    saveState = 'saving';
    paintSave();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 280);
  }

  function flush() {
    if (!scratch || !canWrite) return Promise.resolve();
    saveState = 'saving';
    return scratch.save(overrides).then(function (result) {
      saveState = result && result.ok ? 'kept' : 'failed';
      if (saveState === 'failed') announce('Could not keep that on this browser. It is still on screen. Nothing older was erased.');
      paintSave();
    });
  }

  function paintSave() {
    var node = $('saveState');
    if (!node) return;
    var live = window.ElfLive ? ElfLive.open({ endpoint: null }) : null;
    var remote = live ? live.view().state : 'disconnected';
    var text = remote === 'offline' ? 'Offline'
      : remote === 'reconnecting' ? 'Reconnecting'
      : remote === 'saving' ? 'Saving'
      : remote === 'saved' && live && live.view().deployed ? 'Saved'
      : 'Only on this phone';
    if (node.textContent !== text) node.textContent = text;
  }

  function paintClock() {
    if (!view) return;
    var z = view.phase.zoned;
    $('clock').textContent = z.longDate + ' · ' + z.clock + ' · Chicago';
    $('title').textContent = view.meta.title || 'Elf HQ';
    var sound = $('soundBtn');
    var on = !!view.meta.soundEnabled;
    sound.setAttribute('aria-pressed', on ? 'true' : 'false');
    sound.textContent = on ? (reduced() ? 'Sound quiet' : 'Sound on') : 'Sound off';
    document.querySelectorAll('#nav a').forEach(function (link) {
      var tab = link.getAttribute('data-tab');
      var current = parseHash().name === 'chapter' ? lastTab : parseHash().name;
      if (tab === current) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    paintSave();
  }

  function posterCard(title, withSoon) {
    var card = el('div', { class: 'poster' });
    card.insertAdjacentHTML('beforeend', ornament());
    if (title) card.appendChild(el('p', { class: 'poster-title', text: title }));
    if (withSoon) card.appendChild(el('button', { type: 'button', class: 'coming', disabled: true, text: 'Coming soon' }));
    return card;
  }

  function dayCard(day) {
    return el('a', { class: 'day-card', href: '#chapter/' + day.id },
      el('span', { class: 'day-badge', text: String(day.number) }),
      el('div', {},
        el('div', { class: 'when', text: ElfPlan.formatLong(day.displayDate, 'America/Chicago', false) }),
        el('strong', { text: labelOf(day) }),
        el('p', { text: day.description || 'A quiet page, waiting.' })
      )
    );
  }

  function wholeStoryCard() {
    var card = posterCard('Watch the whole story', true);
    card.id = 'whole-story';
    return card;
  }

  function chapterLink(day) {
    return el('a', {
      class: 'chip',
      href: '#chapter/' + day.id,
      'aria-label': ElfPlan.formatLong(day.displayDate, 'America/Chicago', true) + '. ' + labelOf(day) + '. Open.'
    }, el('strong', { text: 'Chapter ' + day.number }), ElfPlan.formatLong(day.displayDate, 'America/Chicago', false));
  }

  function paintWelcome() {
    $('page').replaceChildren(
      posterCard('', false),
      el('h2', { text: 'Hi there' }),
      el('p', { class: 'lede', text: daysUntilElves() }),
      el('button', { type: 'button', class: 'btn', 'data-act': 'sit', text: 'Come in' })
    );
  }

  function paintToday() {
    var shown = view.shown;
    var day = shown.day;
    var phase = view.phase;
    var hello = hiLine();
    var intro = daysUntilElves();
    void phase;
    var peek = el('label', { class: 'field' }, 'Open the book at', el('select', { id: 'peek', 'data-act': 'peek' },
      el('option', { value: '', text: 'The real Chicago date', selected: !view.meta.peekDayId })
    ));
    view.days.forEach(function (item) {
      peek.querySelector('select').appendChild(el('option', {
        value: item.id,
        text: 'Chapter ' + item.number + ' · ' + ElfPlan.formatLong(item.displayDate, 'America/Chicago', false),
        selected: view.meta.peekDayId === item.id
      }));
    });
    var next = view.days[day.number] || null;
    mount($('page'),
      wholeStoryCard(),
      el('h2', { text: hello }),
      el('p', { class: 'lede', text: intro }),
      dayCard(day),
      next ? dayCard(next) : null
    );
  }

  function paintStory() {
    var cards = view.days.map(dayCard);
    mount($('page'),
      el('h2', { text: 'The story' }),
      el('div', { class: 'stack' }, cards)
    );
  }

  function paintMaking() {
    var noted = ElfPlan.craftEntries(view.days).filter(function (day) { return day.craftNote || day.isCraft; });
    mount($('page'),
      el('h2', { text: 'Crafts' }),
      el('p', { class: 'lede', text: 'Make these a little early, if you like.' }),
      el('div', {}, noted.map(dayCard))
    );
  }

  function money(cents) {
    var n = Math.abs(cents || 0);
    return (cents < 0 ? '-' : '') + '$' + Math.floor(n / 100) + '.' + (n % 100 < 10 ? '0' : '') + (n % 100);
  }

  function giftLine(gift) {
    if (gift.status === 'purchased') {
      return gift.spentConfirmed && gift.spentCents != null ? 'Bought ' + money(gift.spentCents) : 'Bought';
    }
    if (gift.offer && gift.offer.stale && gift.offer.amountCents) return money(gift.offer.amountCents) + ', may be old';
    if (gift.offer && gift.offer.amountCents) return money(gift.offer.amountCents);
    return 'Choose the exact item';
  }

  function paintGifts() {
    var gifts = (fixture.gifts || []).filter(function (gift) { return !gift.deleted; });
    var totals = window.ElfGifts ? ElfGifts.totals(gifts) : { spentCents: 0, remainingCents: 0, unknownPriceCount: 0 };
    var people = fixture.recipients || [];
    mount($('page'),
      el('h2', { text: 'Gifts' }),
      el('div', { class: 'gift-totals' },
        el('div', {}, el('div', { class: 'when', text: 'Bought' }), el('strong', { text: money(totals.spentCents) })),
        el('div', {}, el('div', { class: 'when', text: 'Still to buy' }), el('strong', { text: money(totals.remainingCents) })),
        el('div', {}, el('div', { class: 'when', text: 'No fresh amount' }), el('strong', { text: String(totals.unknownPriceCount) }))
      ),
      people.map(function (person) {
        var mine = gifts.filter(function (gift) { return gift.recipientId === person.id; });
        return el('section', { class: 'person' },
          el('h3', { text: person.name }),
          mine.map(function (gift) {
            return el('article', { class: 'gift-row' },
              el('strong', { text: gift.idea }),
              el('p', { class: gift.offer && gift.offer.stale ? 'stale-note' : '', text: giftLine(gift) })
            );
          })
        );
      })
    );
  }

  function paintSupplies() {
    var groups = ElfPlan.groupShopping(view.shopping, view.phase.todayKey, fixture.season.timeZone);
    var lists = groups.length ? groups.map(function (group) {
      return el('section', { class: 'shop' },
        el('h3', { text: group.label }),
        el('div', { class: 'stack' }, group.items.map(function (item) {
          return el('article', { class: 'card' },
            el('p', {}, el('strong', { text: item.name }), item.qtyNote ? ' · ' + item.qtyNote : ''),
            el('div', { class: 'states', role: 'group', 'aria-label': 'State for ' + item.name },
              ['need', 'owned', 'bought'].map(function (state) {
                var names = { need: 'Need', owned: 'Owned', bought: 'Bought' };
                return el('button', { type: 'button', 'data-act': 'shop-state', 'data-id': item.id, 'data-state': state, 'aria-pressed': item.state === state ? 'true' : 'false', text: names[state] });
              })
            ),
            el('button', { type: 'button', class: 'btn ghost', 'data-act': 'shop-remove', 'data-id': item.id, text: 'Remove' })
          );
        }))
      );
    }) : [el('div', { class: 'card' }, el('h3', { text: 'The list is empty' }), el('p', { text: 'Add what the story needs. Nothing here has a price.' }))];
    mount($('page'),
      el('h2', { text: 'Shopping' }),
      el('p', { class: 'lede', text: 'Walmart in Bastrop, with the weekly groceries.' }),
      el('div', { class: 'card' },
        el('label', { class: 'field' }, 'Add something', el('input', { id: 'newShopName', type: 'text', maxlength: '80', placeholder: 'What to pick up' })),
        el('label', { class: 'field' }, 'Need date, if you know it', el('input', { id: 'newShopDate', type: 'date' })),
        el('button', { type: 'button', class: 'btn', 'data-act': 'shop-add', text: 'Add to the list' })
      ),
      lists,
      groups.length ? el('p', { class: 'row' }, el('button', { type: 'button', class: 'btn ghost', 'data-act': 'copy-list', text: 'Copy the list' })) : null
    );
  }

  function paintDesk() {
    var routine = ElfMonitor.runRoutine(new Date(), {
      schemaVersion: 1,
      readiness: 'not-configured',
      endpoint: null,
      access: 'read-only'
    }, { implemented: false });
    var next = routine.nextAt ? new Date(routine.nextAt) : null;
    var nextText = next
      ? 'Next planned look: ' + ElfPlan.zonedParts(next, 'America/Chicago').longDate + ' at 9:00 Chicago. It will not run.'
      : 'The morning looks go through December 25. None remain.';
    mount($('page'),
      el('h2', { text: 'The desk' }),
      el('label', { class: 'field' }, 'Name of the book', el('input', { id: 'bookTitle', type: 'text', maxlength: '40', value: view.meta.title || 'Elf HQ', 'data-field': 'bookTitle' })),
      el('label', { class: 'field' }, 'What the book calls you', el('input', { id: 'deskName', type: 'text', maxlength: '40', value: view.meta.displayName || '', 'data-field': 'displayName', autocomplete: 'off' })),
      el('div', { class: 'card' },
        el('h3', { text: 'Scene reading' }),
        el('ul', {}, ElfSync.SUMMARY.map(function (line) { return el('li', { text: line }); })),
        el('p', { text: nextText }),
        el('p', { class: 'fine', text: 'Including weekends. Not connected. Nothing is sent.' })
      ),
      el('div', { class: 'card' },
        el('h3', { text: 'A copy on purpose' }),
        el('p', { text: 'A backup file is the way to carry the rehearsal until a private shelf exists. It is not a shared copy, and it should not go in the public site.' }),
        el('p', { class: 'row' },
          el('button', { type: 'button', class: 'btn', 'data-act': 'export-text', text: 'Export words' }),
          el('button', { type: 'button', class: 'btn ghost', 'data-act': 'export-photos', text: 'Export with pictures' })
        ),
        el('label', { class: 'field' }, 'Bring a backup back to this browser', el('input', { id: 'importFile', type: 'file', accept: 'application/json,.json' }))
      ),
      el('div', { class: 'card' },
        el('h3', { text: 'Clear this browser' }),
        el('p', { text: 'This removes the rehearsal notebook on this browser only. Export first if you want a copy. Pictures stay until you delete them from the chapter.' }),
        el('label', { class: 'field' }, 'Type RESET', el('input', { id: 'resetPhrase', type: 'text', autocomplete: 'off' })),
        el('label', { class: 'check' }, el('input', { id: 'resetOk', type: 'checkbox' }), 'I exported, or I do not need this copy.'),
        el('button', { type: 'button', class: 'btn danger', 'data-act': 'reset', text: 'Reset this browser' })
      )
    );
    var title = $('bookTitle');
    if (title) title.value = view.meta.title || 'Elf HQ';
    var name = $('deskName');
    if (name) name.value = view.meta.displayName || '';
  }

  function paintTab(name) {
    if (name === 'story') paintStory();
    else if (name === 'crafts' || name === 'making') paintMaking();
    else if (name === 'shopping' || name === 'supplies') paintSupplies();
    else if (name === 'gifts') paintGifts();
    else if (name === 'settings' || name === 'desk') paintDesk();
    else paintToday();
  }

  function field(day, key, label, value, multiline) {
    var input = multiline
      ? el('textarea', { id: key + '-' + day.id, 'data-field': key, 'data-day': day.id, maxlength: key === 'note' ? '4000' : '2000' })
      : el('input', { id: key + '-' + day.id, type: 'text', 'data-field': key, 'data-day': day.id, maxlength: '120' });
    if (multiline) input.value = value || '';
    else input.value = value || '';
    return el('label', { class: 'field' }, label, input);
  }

  function checks(day, listName, title) {
    var items = listName === 'prep' ? day.prepChecks : day.completionChecks;
    return el('section', {},
      el('h3', { text: title }),
      el('ul', { class: 'checks' }, items.map(function (item) {
        return el('li', { class: 'check' },
          el('input', { type: 'checkbox', 'data-act': 'check', 'data-day': day.id, 'data-list': listName, 'data-check': item.id, checked: item.done ? 'checked' : null }),
          el('input', { type: 'text', value: item.label, 'data-field': 'checkLabel', 'data-day': day.id, 'data-list': listName, 'data-check': item.id, maxlength: '140' }),
          el('button', { type: 'button', class: 'btn ghost', 'data-act': 'check-remove', 'data-day': day.id, 'data-list': listName, 'data-check': item.id, text: 'Remove' })
        );
      })),
      el('button', { type: 'button', class: 'btn ghost', 'data-act': 'check-add', 'data-day': day.id, 'data-list': listName, text: 'Add a step' })
    );
  }

  function paintSheet() {
    refresh();
    var day = view.days.filter(function (item) { return item.id === sheetDay; })[0];
    if (!day) return;
    $('sheetTitle').textContent = labelOf(day);
    var prev = day.number > 1 ? view.days[day.number - 2] : null;
    var next = day.number < 25 ? view.days[day.number] : null;
    var photo = day.photo
      ? el('img', { class: 'photo-preview', alt: 'Inspiration picture for ' + ElfPlan.formatLong(day.displayDate, 'America/Chicago', true) + '. Unnamed.', 'data-photo': day.photo.id })
      : el('p', { class: 'fine', text: 'No inspiration picture yet. A picture stays on this browser until private sync exists. It does not need a name.' });
    mount($('sheetBody'),
      posterCard(labelOf(day), false),
      el('p', { text: ElfPlan.formatLong(day.displayDate, 'America/Chicago', true) }),
      day.hint ? el('p', { class: 'guess', text: 'The note says ' + day.hint.mentioned.join(' and ') + '. This page stays on ' + day.hint.displayWeekday + '.' }) : null,
      field(day, 'title', 'Chapter title, if you want one', day.title, false),
      field(day, 'idea', 'What happens', day.description, true),
      field(day, 'note', 'Your exact words', day.note, true),
      el('p', { class: 'row' }, el('button', { type: 'button', class: 'btn ghost', 'data-act': 'copy-note', 'data-day': day.id, text: 'Copy the words' })),
      field(day, 'arrival', 'Who arrives, if anyone', day.arrival, false),
      field(day, 'setup', 'How the chapter is set', day.setup, true),
      field(day, 'props', 'Props', day.props, true),
      field(day, 'craft', 'Making note', day.craftNote, true),
      el('label', { class: 'field' }, 'Prep date you choose', el('input', { type: 'date', 'data-act': 'prep-date', 'data-day': day.id, value: day.prep.source === 'date' ? day.prep.date : '' })),
      el('label', { class: 'field' }, 'Or lead time, in days before this chapter', el('input', { type: 'number', min: '0', max: '30', 'data-act': 'lead', 'data-day': day.id, value: day.prep.source === 'lead' ? String(day.prep.leadDays) : '' })),
      el('button', { type: 'button', class: 'btn ghost', 'data-act': 'clear-prep', 'data-day': day.id, text: 'Clear prep date' }),
      el('p', { class: 'fine', text: 'Checking a step does not count as changing the chapter’s picture.' }),
      checks(day, 'prep', 'Before the day'),
      checks(day, 'completion', 'On the day'),
      el('label', { class: 'check' }, el('input', { type: 'checkbox', 'data-act': 'done', 'data-day': day.id, checked: day.done ? 'checked' : null }), 'This chapter is told'),
      el('h3', { text: 'Inspiration picture' }),
      photo,
      el('label', { class: 'field' }, 'Add a JPEG, PNG, or WebP', el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', 'data-act': 'photo', 'data-day': day.id })),
      day.photo ? el('button', { type: 'button', class: 'btn ghost', 'data-act': 'photo-remove', 'data-day': day.id, text: 'Take the picture off this chapter' }) : null,
      el('p', { class: 'row' },
        prev ? el('a', { class: 'btn ghost', href: '#chapter/' + prev.id, text: 'Previous chapter' }) : null,
        next ? el('a', { class: 'btn ghost', href: '#chapter/' + next.id, text: 'Next chapter' }) : null
      )
    );
    hydrate($('sheetBody'));
  }

  function hydrate(root) {
    root.querySelectorAll('img[data-photo]').forEach(function (img) {
      var id = img.getAttribute('data-photo');
      scratch.getPhoto(id).then(function (blob) {
        if (!img.isConnected) return;
        if (!blob) {
          img.replaceWith(el('p', { class: 'film-fail', text: 'This chapter remembers a picture, but the file could not be read. Nothing was replaced.' }));
          return;
        }
        if (urls[id]) URL.revokeObjectURL(urls[id]);
        urls[id] = URL.createObjectURL(blob);
        img.src = urls[id];
      });
    });
  }

  function openSheet(id) {
    var known = view.days.some(function (day) { return day.id === id; });
    var layer = $('sheetLayer');
    if (!known) {
      layer.hidden = true;
      document.body.classList.remove('sheet-open');
      mount($('page'),el('h2', { text: 'That chapter is not in the book.' }), el('p', { text: 'Nothing was changed.' }));
      return;
    }
    var first = layer.hidden || sheetDay !== id;
    sheetDay = id;
    $('toast').hidden = true;
    layer.hidden = false;
    document.body.classList.add('sheet-open');
    $('book').setAttribute('aria-hidden', 'true');
    paintSheet();
    if (first) $('closeSheet').focus();
  }

  function hideSheet() {
    $('sheetLayer').hidden = true;
    document.body.classList.remove('sheet-open');
    $('book').removeAttribute('aria-hidden');
    sheetDay = null;
    document.querySelectorAll('video').forEach(function (video) { video.pause(); video.removeAttribute('src'); video.remove(); });
  }

  function paint(force) {
    if (!fixture || !overrides) return;
    refresh();
    paintClock();
    if (!force && document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) && document.activeElement.closest('#page, #sheetBody')) return;
    if (!view.meta.welcomedAt) {
      hideSheet();
      document.querySelectorAll('#nav a').forEach(function (link) { link.removeAttribute('aria-current'); });
      paintWelcome();
      return;
    }
    var route = parseHash();
    if (route.name === 'chapter') {
      paintTab(lastTab);
      openSheet(route.id);
    } else {
      lastTab = route.name;
      hideSheet();
      paintTab(route.name);
    }
    paintClock();
  }

  function commitFrom(target) {
    if (!target || !target.dataset) return;
    if (target.dataset.field === 'bookTitle') {
      ElfPlan.setMeta(overrides, 'title', target.value.trim());
      scheduleSave();
      paintClock();
      return;
    }
    if (target.dataset.field === 'displayName') {
      ElfPlan.setMeta(overrides, 'displayName', target.value.trim());
      scheduleSave();
      return;
    }
    if (target.dataset.field === 'checkLabel') {
      ElfPlan.setCheckLabel(overrides, target.dataset.day, target.dataset.list, target.dataset.check, target.value, iso());
      scheduleSave();
      return;
    }
    var map = { title: 'title', idea: 'description', note: 'note', setup: 'setup', props: 'props', arrival: 'arrival', craft: 'craftNote' };
    var fieldName = map[target.dataset.field];
    if (!fieldName) return;
    ElfPlan.draftField(overrides, target.dataset.day, fieldName, target.value, iso());
    scheduleSave();
  }

  function commitBlur(target) {
    var map = { title: 'title', idea: 'description', note: 'note', setup: 'setup', props: 'props', arrival: 'arrival', craft: 'craftNote' };
    if (!target || !target.dataset || !map[target.dataset.field]) return;
    ElfPlan.setField(overrides, target.dataset.day, map[target.dataset.field], target.value, iso());
    scheduleSave();
  }

  function sit() {
    var input = $('helloName');
    var name = input ? input.value.trim().slice(0, 40) : '';
    if (name) ElfPlan.setMeta(overrides, 'displayName', name);
    ElfPlan.setMeta(overrides, 'welcomedAt', iso());
    scheduleSave();
    if (!location.hash) location.hash = '#today';
    paint(true);
  }

  function chime() {
    if (!view.meta.soundEnabled || reduced()) return;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 523.25;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.04, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.24);
  }

  function askForFeature() {
    var msg = $('featureMsg');
    syncPort.getPhoto({ id: 'whole-story' }).then(function () {
      if (msg) msg.textContent = 'A film came back, which this build does not expect.';
    }, function () {
      var text = 'There is no whole-story film to play. The private shelf is not connected, so nothing was loaded and nothing public was opened.';
      if (msg) msg.textContent = text;
      var time = $('featureTime');
      if (time) time.textContent = 'No film loaded';
      announce(text);
    });
    document.querySelectorAll('video').forEach(function (video) { video.remove(); });
  }

  function addShop() {
    var name = $('newShopName');
    if (!name || !name.value.trim()) { announce('Add a name first. The list was not changed.'); return; }
    var date = $('newShopDate');
    ElfPlan.addShopping(overrides, { name: name.value.trim(), needDate: date && date.value ? date.value : null }, iso());
    scheduleSave();
    paint(true);
  }

  function download(filename, obj) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    var link = document.createElement('a');
    var url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  async function shrink(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { error: 'type' };
    var img = await new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
      image.src = url;
    }).catch(function () { return null; });
    if (!img) return { error: 'decode' };
    var scale = Math.min(1, 1280 / Math.max(img.width, img.height));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', 0.72); });
    if (!blob) return { error: 'decode' };
    if (blob.size > ElfPlan.PHOTO_MAX_BYTES) return { error: 'too-big' };
    return { blob: blob, bytes: blob.size, type: 'image/jpeg' };
  }

  async function onPhoto(input) {
    var file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    var shrunk = await shrink(file);
    if (shrunk.error) { announce(ElfPlan.photoError(shrunk.error)); return; }
    var metas = await scratch.listPhotoMeta();
    var check = ElfPlan.checkPhotoAdd(metas, { dayId: input.dataset.day, bytes: shrunk.bytes, type: shrunk.type });
    if (!check.ok) { announce(ElfPlan.photoError(check.code)); return; }
    var id = 'pic-' + Date.now().toString(36);
    var put = await scratch.putPhoto({ id: id, dayId: input.dataset.day, blob: shrunk.blob, bytes: shrunk.bytes, type: shrunk.type, createdAt: iso() });
    if (!put.ok) { announce(ElfPlan.photoError(put.code || 'quota')); return; }
    ElfPlan.setPhoto(overrides, input.dataset.day, { id: id, bytes: shrunk.bytes, type: shrunk.type }, iso());
    scheduleSave();
    paintSheet();
    announce('Picture kept on this browser. It was not uploaded.');
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-act]');
    if (!button) return;
    var act = button.dataset.act;
    if (act === 'sit') sit();
    else if (act === 'sound') {
      ElfPlan.setMeta(overrides, 'soundEnabled', !overrides.meta.soundEnabled);
      refresh();
      scheduleSave();
      paintClock();
      if (view.meta.soundEnabled && reduced()) announce('Sound is on, and it stays quiet while reduce motion is on.');
      else if (view.meta.soundEnabled) chime();
    } else if (act === 'close-sheet') {
      if (document.activeElement) commitBlur(document.activeElement);
      location.hash = '#' + lastTab;
    } else if (act === 'feature-play') askForFeature();
    else if (act === 'shop-add') addShop();
    else if (act === 'shop-state') {
      ElfPlan.setShoppingState(overrides, button.dataset.id, button.dataset.state, iso());
      scheduleSave();
      paint(true);
    } else if (act === 'shop-remove') {
      ElfPlan.removeShopping(overrides, button.dataset.id);
      scheduleSave();
      paint(true);
      announce('Removed from this browser’s list.');
    } else if (act === 'copy-list') {
      var groups = ElfPlan.groupShopping(view.shopping, view.phase.todayKey, fixture.season.timeZone);
      var text = ElfPlan.shoppingPlainText(groups);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { announce('List copied. No prices were included.'); }, function () { announce('Copy was blocked. Nothing was sent.'); });
    } else if (act === 'copy-note') {
      var note = document.getElementById('note-' + button.dataset.day);
      var words = note ? note.value : '';
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(words).then(function () { announce('Your words were copied as written.'); }, function () { if (note) note.select(); announce('Copy was blocked. The words are selected.'); });
    } else if (act === 'check-add') {
      var added = ElfPlan.addCheck(overrides, button.dataset.day, button.dataset.list, 'New step', iso());
      scheduleSave();
      paintSheet();
      var created = document.querySelector('[data-check="' + added.id + '"]');
      if (created) created.focus();
    } else if (act === 'check-remove') {
      ElfPlan.removeCheck(overrides, button.dataset.day, button.dataset.list, button.dataset.check);
      scheduleSave();
      paintSheet();
    } else if (act === 'clear-prep') {
      ElfPlan.setPrepDate(overrides, button.dataset.day, '', iso());
      ElfPlan.setLeadDays(overrides, button.dataset.day, '', iso());
      scheduleSave();
      paintSheet();
    } else if (act === 'photo-remove') {
      ElfPlan.setPhoto(overrides, button.dataset.day, null, iso());
      scheduleSave();
      paintSheet();
      announce('Picture taken off the chapter. The file is still in this browser until you clear site data.');
    } else if (act === 'export-text') {
      scratch.listPhotoMeta().then(function (metas) {
        var built = ElfPlan.buildBackup(overrides, metas, 'text', iso());
        if (!built.ok) { announce('The export was not written.'); return; }
        download('elf-hq-rehearsal-words.json', built.backup);
        announce(metas.length ? 'Words exported. Pictures were left out of this file on purpose and are still here.' : 'Words exported.');
      });
    } else if (act === 'export-photos') {
      scratch.listPhotoMeta().then(async function (metas) {
        var photos = [];
        for (var i = 0; i < metas.length; i++) {
          var blob = await scratch.getPhoto(metas[i].id);
          if (!blob) continue;
          var dataUrl = await new Promise(function (resolve) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.readAsDataURL(blob);
          });
          photos.push({ id: metas[i].id, bytes: blob.size, type: blob.type, dataUrl: dataUrl });
        }
        var built = ElfPlan.buildBackup(overrides, photos, 'photos', iso());
        if (!built.ok) { announce(built.code === 'too-big' ? 'The pictures are too large for one file. Nothing was left out quietly, and nothing was deleted. Export the words, or remove a picture.' : 'There are no pictures to export. Nothing was deleted.'); return; }
        download('elf-hq-rehearsal-with-pictures.json', built.backup);
      });
    } else if (act === 'reset') {
      var phrase = $('resetPhrase');
      var ok = $('resetOk');
      if (!phrase || phrase.value !== 'RESET' || !ok || !ok.checked) { announce('Type RESET and confirm you have a copy, or that you do not need one. Nothing was cleared.'); return; }
      overrides = ElfPlan.blankOverrides();
      scratch.save(overrides).then(function () { location.hash = '#today'; paint(true); announce('This browser’s notebook was cleared.'); });
    } else if (act === 'update') location.reload();
  });

  document.addEventListener('input', function (event) { commitFrom(event.target); });
  document.addEventListener('focusout', function (event) { commitBlur(event.target); });
  document.addEventListener('change', function (event) {
    var target = event.target;
    if (target.id === 'peek') {
      ElfPlan.setMeta(overrides, 'peekDayId', target.value || null);
      scheduleSave();
      refresh();
      var day = view.shown.day;
      announce(view.shown.mode === 'peek'
        ? 'Peeking at ' + ElfPlan.formatLong(day.displayDate, 'America/Chicago', true) + '. No chapter was moved.'
        : 'Using the real Chicago date. No chapter was moved.');
      paint(true);
    } else if (target.dataset.act === 'check') {
      ElfPlan.setCheckDone(overrides, target.dataset.day, target.dataset.list, target.dataset.check, target.checked, iso());
      scheduleSave();
      if (target.checked) chime();
    } else if (target.dataset.act === 'done') {
      ElfPlan.setDone(overrides, target.dataset.day, target.checked, iso());
      scheduleSave();
    } else if (target.dataset.act === 'prep-date') {
      ElfPlan.setPrepDate(overrides, target.dataset.day, target.value, iso());
      scheduleSave();
    } else if (target.dataset.act === 'lead') {
      ElfPlan.setLeadDays(overrides, target.dataset.day, target.value, iso());
      scheduleSave();
    } else if (target.dataset.act === 'photo') onPhoto(target);
    else if (target.id === 'importFile' && target.files && target.files[0]) {
      var file = target.files[0];
      target.value = '';
      file.text().then(function (text) {
        var data;
        try { data = JSON.parse(text); } catch (e) { announce('That file could not be read. The notebook was not changed.'); return; }
        var parsed = ElfPlan.parseBackup(data);
        if (!parsed.ok) {
          announce(parsed.code === 'private' ? 'That file is marked private. Sync is not connected, so it was not stored. Your file is unchanged.' : 'That file is not an Elf HQ rehearsal backup. Nothing was replaced.');
          return;
        }
        if (!window.confirm('Replace the notebook on this browser with this file? Nothing is uploaded.')) return;
        overrides = parsed.overrides;
        scratch.save(overrides).then(function (result) {
          if (!result.ok) { announce('The file was not stored. The previous notebook is still here.'); return; }
          paint(true);
          announce('Backup restored on this browser only.');
        });
      });
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && event.target.id === 'helloName') { event.preventDefault(); sit(); }
    if (event.key === 'Enter' && event.target.id === 'newShopName') { event.preventDefault(); addShop(); }
    if (event.key === 'Escape' && !$('sheetLayer').hidden) location.hash = '#' + lastTab;
    if (event.key === 'Tab' && !$('sheetLayer').hidden) {
      var focusable = $('sheetLayer').querySelectorAll('a, button, input, textarea, select');
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  window.addEventListener('hashchange', function () { paint(true); });

  function fitViewport() {
    var vv = window.visualViewport;
    if (!vv) return;
    document.documentElement.style.setProperty('--vvh', vv.height + 'px');
    document.documentElement.style.setProperty('--vvtop', vv.offsetTop + 'px');
  }
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', fitViewport);
    visualViewport.addEventListener('scroll', fitViewport);
    fitViewport();
  }
  document.addEventListener('focusin', function (event) {
    var fieldNode = event.target;
    if (!fieldNode || !/^(INPUT|TEXTAREA|SELECT)$/.test(fieldNode.tagName)) return;
    setTimeout(function () {
      var scroller = fieldNode.closest('.sheet-body') || (pageScrolls() ? document.scrollingElement : fieldNode.closest('.page'));
      if (!scroller) return;
      var vv = window.visualViewport;
      var top = (vv ? vv.offsetTop : 0) + 12;
      var bottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - 12;
      var rect = fieldNode.getBoundingClientRect();
      if (rect.bottom > bottom) scroller.scrollTop += rect.bottom - bottom;
      else if (rect.top < top) scroller.scrollTop -= top - rect.top;
    }, 280);
  });

  document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
  window.addEventListener('beforeunload', function (event) {
    if ((scratch && !scratch.persistent && overrides && overrides.meta.welcomedAt) || saveState === 'failed') {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  function boot() {
    var built = ElfPlan.finalizeFixture(ElfDemo.raw);
    var audit = ElfPlan.auditManifest(ElfMedia.manifest);
    if (!built.ok || audit.length) {
      $('boot').textContent = 'The book could not open its blank chapters. Nothing was erased.';
      return;
    }
    fixture = built.fixture;
    manifest = ElfMedia.manifest;
    syncPort = ElfSync.createSyncPort();
    ElfScratch.open().then(function (store) {
      scratch = store;
      return scratch.load();
    }).then(function (raw) {
      var norm = ElfPlan.normalizeOverrides(raw);
      if (!norm.canWrite) {
        mount($('page'),
          el('h2', { text: 'This notebook is from a newer Elf HQ.' }),
          el('p', { text: 'This version will not open it and will not replace it.' })
        );
        $('boot').remove();
        return;
      }
      overrides = norm.overrides;
      canWrite = true;
      refresh();
      if (scratch.failed) announce('This browser cannot keep the story after you leave. Export a backup if you need one.');
      $('boot').remove();
      paint(true);
      setInterval(function () {
        var key = ElfPlan.dateKeyInZone(new Date(), 'America/Chicago');
        if (view && key !== view.phase.todayKey) paint(true);
        else paintClock();
      }, 30000);
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(function () {});
    }).catch(function () {
      $('boot').textContent = 'Elf HQ hit a snag while opening. Your notebook was not cleared. Reload the page.';
    });
  }

  window.addEventListener('error', function () {
    var bootNode = $('boot');
    if (bootNode) bootNode.textContent = 'Elf HQ hit a snag while opening. Your notebook was not cleared. Reload the page.';
  });

  boot();
})();
