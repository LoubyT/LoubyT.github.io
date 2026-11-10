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
  var giftFilter = 'all';
  var giftPerson = null;
  var giftOpen = {};
  var liveSession = null;
  var mediaVault = null;
  var filmAsked = false;

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
  function announce(text, action) {
    var live = $('live');
    if (live) live.textContent = text;
    var toast = $('toast');
    if (!toast) return;
    $('toastText').textContent = text;
    $('toastActions').replaceChildren();
    if (action && action.label) {
      var undo = el('button', { type: 'button', class: 'btn', text: action.label });
      undo.addEventListener('click', function () {
        toast.hidden = true;
        action.run();
      });
      $('toastActions').appendChild(undo);
    }
    toast.hidden = false;
    clearTimeout(announce.timer);
    announce.timer = setTimeout(function () { toast.hidden = true; }, action ? 9000 : 5000);
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

  function helloLine() {
    var now = new Date();
    var mood = ElfPlan.mood(now);
    var name = (!view.meta.sampleStory && view.meta.displayName) ? view.meta.displayName : '';
    if (mood.feast === 'day') return name ? 'Merry Christmas, ' + name : 'Merry Christmas';
    if (mood.feast === 'eve') return name ? 'Christmas Eve, ' + name : 'Christmas Eve';
    return ElfPlan.greeting(mood.hour, name).replace(/\.$/, '');
  }

  function seasonLine() {
    var mood = ElfPlan.mood(new Date());
    if (mood.feast === 'eve') return 'One quiet chapter left tonight.';
    if (mood.feast === 'day') return 'The last chapter is open.';
    return daysUntilElves();
  }

  function applyMood() {
    var mood = ElfPlan.mood(new Date());
    document.body.setAttribute('data-mood', mood.part);
    if (mood.feast) document.body.setAttribute('data-feast', mood.feast);
    else document.body.removeAttribute('data-feast');
  }

  function catchUp() {
    if (!fixture || !overrides || !view) return;
    var prevKey = view.phase.todayKey;
    var prevMood = document.body.getAttribute('data-mood') || '';
    var prevFeast = document.body.getAttribute('data-feast') || '';
    refresh();
    applyMood();
    var mood = ElfPlan.mood(new Date());
    if (prevKey !== view.phase.todayKey || prevMood !== mood.part || prevFeast !== (mood.feast || '')) paint(true);
    else paintClock();
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
    var liveView = liveSession ? liveSession.view() : { state: 'disconnected', deployed: false, connected: false };
    var text = window.ElfLive ? ElfLive.statusLabel(liveView) : 'Only on this phone';
    if (node.textContent !== text) node.textContent = text;
  }

  function paintClock() {
    if (!view) return;
    applyMood();
    $('title').textContent = 'Elf HQ';
    var house = ElfPlan.houseKicker(view.meta);
    var eyebrow = $('eyebrow');
    if (eyebrow) {
      eyebrow.textContent = house;
      eyebrow.hidden = !house;
    }
    document.title = ElfPlan.appTitle(view.meta);
    var apple = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (apple) apple.setAttribute('content', ElfPlan.appTitle(view.meta));
    if (!document.getElementById('elfLockNow')) {
      var lock = el('button', { type: 'button', class: 'sound', id: 'elfLockNow', text: 'Lock' });
      lock.addEventListener('click', function () {
        var done = window.ElfPin && ElfPin.forget ? ElfPin.forget() : Promise.resolve();
        Promise.resolve(done).then(function () { location.reload(); });
      });
      var tools = document.querySelector('.tools');
      if (tools) tools.appendChild(lock);
    }
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
    var today = view.phase.phase === 'during' && day.number === view.phase.todayNumber && !view.meta.peekDayId;
    var mark = day.displayDate === '2026-12-24' ? ' is-eve' : day.displayDate === '2026-12-25' ? ' is-christmas' : '';
    return el('a', { class: 'day-card' + (today ? ' is-today' : '') + mark, href: '#chapter/' + day.id, 'aria-current': today ? 'date' : null },
      el('span', { class: 'day-badge', text: String(day.number) }),
      el('div', {},
        el('div', { class: 'when', text: ElfPlan.formatLong(day.displayDate, 'America/Chicago', false) }),
        el('strong', { text: labelOf(day) }),
        el('p', { text: day.description || 'A quiet page, waiting.' })
      )
    );
  }

  function wholeStoryCard() {
    return mountBonus();
  }

  function mountBonus() {
    var tile = el('article', { class: 'story-tile' });
    var thumb = el('div', { class: 'story-thumb' });
    var copy = el('div', {});
    var token = {};
    tile.id = 'whole-story';
    tile._bonusToken = token;
    thumb.appendChild(posterCard('', false));
    copy.appendChild(el('h2', { text: 'Whole story' }));
    var entry = mediaVault && mediaVault.bonus ? mediaVault.bonus() : null;
    if (!entry || !entry.video) {
      copy.appendChild(el('button', { type: 'button', class: 'coming', disabled: true, text: 'Coming soon' }));
      tile.appendChild(thumb);
      tile.appendChild(copy);
      return tile;
    }
    if (entry.badge) copy.appendChild(el('p', { class: 'cut-badge', text: entry.badge }));
    copy.appendChild(el('button', { type: 'button', class: 'btn', 'data-act': 'bonus-play', text: 'Play' }));
    tile.appendChild(thumb);
    tile.appendChild(copy);
    if (mediaVault.bonusPoster) {
      mediaVault.bonusPoster().then(function (url) {
        if (!url || tile._bonusToken !== token || !thumb.isConnected || tile.querySelector('video')) return;
        var img = document.createElement('img');
        img.alt = '';
        img.src = url;
        thumb.replaceChildren(img);
      }, function () {});
    }
    return tile;
  }

  function playBonus(button) {
    if (!mediaVault || !mediaVault.openBonus) return;
    var tile = document.getElementById('whole-story');
    if (!tile || tile.querySelector('video')) return;
    if (button) button.disabled = true;
    mediaVault.openBonus().then(function (slot) {
      if (!slot || !slot.videoUrl || !tile.isConnected) return;
      var wash = el('div', { class: 'film-wash' });
      var host = el('div', { class: 'film-host' });
      var video = document.createElement('video');
      video.className = 'chapter-film';
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.controls = true;
      video.preload = 'auto';
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.setAttribute('muted', '');
      video.src = slot.videoUrl;
      video.addEventListener('loadeddata', function () { blendFilm(host, video); });
      host.appendChild(video);
      wash.appendChild(host);
      tile.classList.add('is-playing');
      tile._bonusHome = { parent: tile.parentNode, next: tile.nextSibling };
      var layout = tile.closest('.today-layout');
      if (layout && tile.parentNode !== layout) layout.appendChild(tile);
      var bar = el('p', { class: 'row' }, el('button', { type: 'button', class: 'btn ghost', 'data-act': 'bonus-close', text: 'Close the film' }));
      tile.replaceChildren(bar, wash);
      var started = video.play();
      if (started && started.catch) started.catch(function () {});
    }, function () {
      if (button) button.disabled = false;
    });
  }

  function closeBonus() {
    var tile = document.getElementById('whole-story');
    if (!tile) return;
    var home = tile._bonusHome;
    var fresh = mountBonus();
    if (home && home.parent && home.parent.isConnected) {
      home.parent.insertBefore(fresh, home.next && home.next.parentNode === home.parent ? home.next : null);
      tile.remove();
      return;
    }
    tile.replaceWith(fresh);
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
      el('h2', { text: helloLine() }),
      el('p', { class: 'lede', text: seasonLine() }),
      el('button', { type: 'button', class: 'btn', 'data-act': 'sit', text: 'Come in' })
    );
  }

  function paintToday() {
    var shown = view.shown;
    var day = shown.day;
    var phase = view.phase;
    var hello = helloLine();
    var intro = seasonLine();
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
    var film = mountFilm(day);
    var capSlot = film.querySelector('.film-caption-slot');
    var copy = el('div', { class: 'today-copy' });
    if (capSlot) copy.appendChild(capSlot);
    add(copy, wholeStoryCard());
    add(copy, el('h2', { text: hello }));
    add(copy, el('p', { class: 'lede', text: intro }));
    add(copy, dayCard(day));
    if (next) add(copy, dayCard(next));
    mount($('page'), el('div', { class: 'today-layout' }, film, copy));
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

  function allGifts() {
    return ElfGifts.listGifts(fixture.gifts || [], overrides.gifts);
  }

  function rememberGift(gift) {
    overrides.gifts = ElfGifts.saveGift(overrides.gifts, fixture.gifts || [], gift);
    scheduleSave();
    pushLive('gifts/' + gift.id, gift);
    refresh();
  }

  function ring(done, total) {
    var pct = total ? Math.round((done / total) * 100) : 0;
    var svg = '<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" fill="none" stroke="#E8F2E5" stroke-width="4"></circle><circle cx="18" cy="18" r="15" fill="none" stroke="#9c2744" stroke-width="4" stroke-linecap="round" pathLength="100" stroke-dasharray="' + pct + ' 100" transform="rotate(-90 18 18)"></circle></svg>';
    var node = el('span', { class: 'ring', 'aria-hidden': 'true' });
    node.insertAdjacentHTML('beforeend', svg);
    node.appendChild(el('span', { class: 'ring-num', text: done + '/' + total }));
    return node;
  }

  function whenChecked(isoText) {
    if (!isoText) return 'earlier';
    var date = new Date(isoText);
    if (isNaN(date.getTime())) return 'earlier';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }).format(date);
  }

  function giftCard(gift) {
    var bought = gift.status === 'purchased';
    var chip = ElfGifts.chipFor(gift);
    var shop = gift.offer && gift.offer.sourceUrl && ElfGifts.retailLink(gift.offer.sourceUrl).ok && ElfGifts.exactEnough(gift);
    var line = ElfGifts.checkedLine(gift, whenChecked(gift.offer && gift.offer.checkedAt));
    var card = el('article', { class: 'gift-tag', 'data-id': gift.id },
      el('div', { class: 'tag-main' },
        el('button', {
          type: 'button',
          class: 'buy-check' + (bought ? ' is-on' : ''),
          'data-act': 'gift-bought',
          'data-id': gift.id,
          'aria-pressed': bought ? 'true' : 'false',
          'aria-label': bought ? 'Mark ' + gift.idea + ' not bought' : 'Mark ' + gift.idea + ' bought'
        }),
        el('div', { class: 'tag-copy' },
          el('strong', { text: gift.idea || 'Untitled gift' }),
          el('p', { class: gift.offer && gift.offer.stale ? 'stale-note' : '', text: giftLine(gift) }),
          line ? el('p', { class: 'when', text: line }) : null,
          chip ? el('span', { class: 'delta ' + chip.dir, text: chip.text }) : null
        ),
        el('button', { type: 'button', class: 'more', 'data-act': 'gift-menu', 'data-id': gift.id, 'aria-label': 'Edit or delete ' + (gift.idea || 'gift'), text: '···' })
      ),
      el('div', { class: 'tag-menu' },
        shop ? el('a', { class: 'btn', href: gift.offer.sourceUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Shop' }) : null,
        el('button', { type: 'button', class: 'btn ghost', 'data-act': 'gift-edit', 'data-id': gift.id, text: 'Edit' }),
        el('button', { type: 'button', class: 'btn ghost', 'data-act': 'gift-delete', 'data-id': gift.id, text: 'Delete' })
      )
    );
    return card;
  }

  function chosenPerson(people) {
    if (giftPerson == null) {
      try { giftPerson = localStorage.getItem('elf-hq-gift-person') || 'all'; }
      catch (e) { giftPerson = 'all'; }
    }
    giftPerson = ElfGifts.keepPerson(giftPerson, people);
    return giftPerson;
  }

  function personChip(id, label, count, pressed) {
    var button = el('button', {
      type: 'button',
      class: 'person-pick',
      'data-act': 'gift-person',
      'data-id': id,
      'aria-pressed': pressed ? 'true' : 'false',
      'aria-label': label + ', ' + count + ' still to buy'
    });
    button.appendChild(document.createTextNode(label));
    button.appendChild(el('span', { class: 'pick-count', text: String(count) }));
    return button;
  }

  function paintGifts() {
    var gifts = allGifts();
    var people = fixture.recipients || [];
    var picked = chosenPerson(people);
    var scoped = ElfGifts.giftsForPerson(gifts, picked);
    var whole = ElfGifts.totals(scoped);
    var who = picked === 'all' ? 'Everyone' : (people.filter(function (person) { return person.id === picked; })[0] || {}).name || 'Everyone';
    var shownPeople = picked === 'all' ? people : people.filter(function (person) { return person.id === picked; });
    mount($('page'),
      el('h2', { text: 'Gifts' }),
      el('div', { class: 'gift-bar' },
        el('div', { class: 'person-picks', role: 'group', 'aria-label': 'Whose gifts' },
          [personChip('all', 'All', ElfGifts.remainingCount(gifts), picked === 'all')].concat(people.map(function (person) {
            var mine = ElfGifts.giftsForPerson(gifts, person.id);
            return personChip(person.id, person.name, ElfGifts.remainingCount(mine), picked === person.id);
          }))
        ),
        el('div', { class: 'filters', role: 'group', 'aria-label': 'Which gifts' },
          ['remaining', 'bought', 'all'].map(function (name) {
            var labels = { remaining: 'Remaining', bought: 'Bought', all: 'All' };
            return el('button', { type: 'button', 'data-act': 'gift-filter', 'data-filter': name, 'aria-pressed': giftFilter === name ? 'true' : 'false', text: labels[name] });
          })
        )
      ),
      el('p', { class: 'totals-who', text: who }),
      el('div', { class: 'gift-totals' },
        el('div', {}, el('div', { class: 'when', text: 'Bought' }), el('strong', { text: ElfGifts.boughtDisplay(whole) })),
        el('div', {}, el('div', { class: 'when', text: 'Remaining' }), el('strong', { text: ElfGifts.remainingDisplay(whole).text })),
        el('div', {}, el('div', { class: 'when', text: 'Total' }), el('strong', { text: ElfGifts.totalDisplay(whole).text }))
      ),
      ElfGifts.remainingDisplay(whole).note ? el('p', { class: 'when', text: ElfGifts.remainingDisplay(whole).note }) : null,
      whole.unknownPriceCount ? el('p', { class: 'when', text: whole.unknownPriceCount + (whole.unknownPriceCount === 1 ? ' with no price.' : ' with no price.') }) : null,
      shownPeople.map(function (person) {
        var mine = gifts.filter(function (gift) { return gift.recipientId === person.id; });
        var visible = mine.filter(function (gift) { return ElfGifts.passesFilter(gift, giftFilter); });
        var sub = ElfGifts.totals(mine);
        var boughtN = mine.filter(function (gift) { return gift.status === 'purchased'; }).length;
        var open = giftOpen[person.id] !== false;
        return el('section', { class: 'person' + (open ? ' is-open' : '') },
          el('button', { type: 'button', class: 'person-head', 'data-act': 'gift-toggle', 'data-id': person.id, 'aria-expanded': open ? 'true' : 'false' },
            ring(boughtN, mine.length),
            el('span', {},
              el('strong', { text: person.name }),
              el('span', { class: 'when', text: 'Bought ' + ElfGifts.boughtDisplay(sub) + ' \u00b7 Remaining ' + ElfGifts.remainingDisplay(sub).text + (ElfGifts.remainingDisplay(sub).note ? ' (' + ElfGifts.remainingDisplay(sub).note + ')' : '') + ' \u00b7 Total ' + ElfGifts.totalDisplay(sub).text })
            )
          ),
          open ? el('div', { class: 'person-body' },
            visible.map(giftCard),
            visible.length ? null : el('p', { class: 'when', text: 'Nothing in this filter.' }),
            el('button', { type: 'button', class: 'btn', 'data-act': 'gift-add', 'data-id': person.id, text: 'Add gift' })
          ) : null
        );
      })
    );
    var selected = document.querySelector('.person-pick[aria-pressed="true"]');
    var row = selected && selected.parentNode;
    if (row && selected) {
      var left = selected.offsetLeft - Math.max(0, (row.clientWidth - selected.offsetWidth) / 2);
      row.scrollLeft = Math.max(0, left);
    }
  }

  function openGiftSheet(personId, gift) {
    var layer = $('giftLayer');
    var body = $('giftBody');
    if (!layer || !body) return;
    var blank = gift || ElfGifts.blankGift('gift-' + Date.now().toString(36), personId);
    $('giftTitle').textContent = gift ? 'Edit gift' : 'Add gift';
    body.replaceChildren(
      el('label', { class: 'field' }, 'Name', el('input', { id: 'giftName', type: 'text', maxlength: '80', value: blank.idea || '' })),
      el('label', { class: 'field' }, 'Exact item', el('input', { id: 'giftModel', type: 'text', maxlength: '80', value: (blank.variant && blank.variant.model) || '' })),
      el('label', { class: 'field' }, 'Size, color, or pack', el('input', { id: 'giftVariant', type: 'text', maxlength: '80', value: [blank.variant && blank.variant.size, blank.variant && blank.variant.color, blank.variant && blank.variant.pack].filter(Boolean).join(', ') })),
      el('label', { class: 'field' }, 'Link', el('input', { id: 'giftLink', type: 'url', inputmode: 'url', placeholder: 'https://', value: blank.url || '' })),
      el('label', { class: 'field' }, 'Quantity', el('input', { id: 'giftQty', type: 'number', min: '1', max: '99', value: String(blank.quantity || 1) })),
      el('label', { class: 'field' }, 'My price', el('input', { id: 'giftMine', type: 'text', inputmode: 'decimal', placeholder: '18.00', value: blank.myPriceCents ? ElfGifts.moneyLabel(blank.myPriceCents).slice(1) : '' })),
      el('label', { class: 'field' }, 'Notes', el('textarea', { id: 'giftNotes', maxlength: '400', text: blank.notes || '' }))
    );
    var name = body.querySelector('#giftName');
    if (name) name.value = blank.idea || '';
    var model = body.querySelector('#giftModel');
    if (model) model.value = (blank.variant && blank.variant.model) || '';
    var variant = body.querySelector('#giftVariant');
    if (variant) variant.value = [blank.variant && blank.variant.size, blank.variant && blank.variant.color, blank.variant && blank.variant.pack].filter(Boolean).join(', ');
    var link = body.querySelector('#giftLink');
    if (link) link.value = blank.url || '';
    var qty = body.querySelector('#giftQty');
    if (qty) qty.value = String(blank.quantity || 1);
    var mine = body.querySelector('#giftMine');
    if (mine) mine.value = blank.myPriceCents ? ElfGifts.moneyLabel(blank.myPriceCents).slice(1) : (blank.spentConfirmed && blank.spentCents != null ? ElfGifts.moneyLabel(blank.spentCents).slice(1) : '');
    body.dataset.giftId = blank.id;
    body.dataset.personId = personId;
    layer.hidden = false;
    document.body.classList.add('sheet-open');
    if (name) name.focus();
  }

  function closeGiftSheet() {
    var layer = $('giftLayer');
    if (layer) layer.hidden = true;
    if ($('sheetLayer').hidden) document.body.classList.remove('sheet-open');
  }

  function saveGiftForm() {
    var body = $('giftBody');
    var id = body.dataset.giftId;
    var personId = body.dataset.personId;
    var current = allGifts().filter(function (gift) { return gift.id === id; })[0] || ElfGifts.blankGift(id, personId);
    var link = ElfGifts.retailLink($('giftLink').value);
    if (!link.ok) { announce('The link needs to start with https. Nothing was saved.'); return; }
    var mineText = $('giftMine').value.trim();
    var mine = mineText ? ElfGifts.dollarsToCents(mineText) : { ok: true, cents: null };
    if (!mine.ok) { announce('My price needs dollars and cents, like 18.00. Nothing was saved.'); return; }
    var qty = Number($('giftQty').value);
    if (!(qty > 0) || qty !== Math.round(qty)) { announce('Quantity needs a whole number. Nothing was saved.'); return; }
    var parts = $('giftVariant').value.split(',').map(function (part) { return part.trim(); });
    current = JSON.parse(JSON.stringify(current));
    current.idea = $('giftName').value.trim();
    if (!current.idea) { announce('Add a name first. Nothing was saved.'); return; }
    current.url = link.href;
    current.variant = { size: parts[0] || '', color: parts[1] || '', model: $('giftModel').value.trim(), pack: parts[2] || '' };
    current.quantity = qty;
    current.notes = $('giftNotes').value;
    current.myPriceCents = mine.cents;
    if (current.status === 'purchased' && mine.cents != null) current = ElfGifts.confirmSpent(current, mine.cents);
    rememberGift(current);
    closeGiftSheet();
    paint(true);
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
      paintConnect(),
      el('h2', { text: 'The desk' }),
      el('label', { class: 'field' }, 'Name of the book', el('input', { id: 'bookTitle', type: 'text', maxlength: '40', value: view.meta.title || 'Elf HQ', 'data-field': 'bookTitle' })),
      el('label', { class: 'field' }, 'House name', el('input', { id: 'houseName', type: 'text', maxlength: '60', value: view.meta.houseName || '', 'data-field': 'houseName', autocomplete: 'off', placeholder: 'Shown above Elf HQ' })),
      el('label', { class: 'field' }, 'What the book calls you', el('input', { id: 'deskName', type: 'text', maxlength: '40', value: view.meta.displayName || '', 'data-field': 'displayName', autocomplete: 'off' })),
      el('div', { class: 'card' },
        el('h3', { text: 'Scene reading' }),
        el('p', { text: nextText }),
        el('p', { class: 'fine', text: liveParts().worker ? 'A reader can look. They cannot rewrite a chapter.' : 'Nothing is sent.' })
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
    var houseInput = $('houseName');
    if (houseInput) houseInput.value = view.meta.houseName || '';
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
      mountFilm(day),
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
    paintConflicts();
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
    releaseFilm();
  }

  function releaseFilm() {
    document.querySelectorAll('video').forEach(function (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
    });
    if (mediaVault) mediaVault.close();
    filmAsked = false;
  }

  function liveParts() {
    if (!window.ElfLive || typeof ElfLive.resolveLive !== 'function') return { worker: null, session: null };
    return ElfLive.resolveLive(window.ElfLiveConfig || {});
  }

  function conflictText(value) {
    if (value == null) return 'Removed';
    var text = typeof value === 'string' ? value : (value.idea || value.note || value.title || '');
    text = String(text).replace(/\s+/g, ' ').trim();
    if (!text) return 'A different edit';
    return text.length > 80 ? text.slice(0, 77) + '...' : text;
  }

  function conflictCard(c) {
    return el('div', { class: 'conflict', role: 'status' },
      el('p', { text: 'Two phones changed the same line.' }),
      el('p', { text: 'This phone: ' + conflictText(c.local) }),
      el('p', { text: 'The other phone: ' + conflictText(c.server) }),
      el('p', { class: 'row' },
        el('button', { type: 'button', class: 'btn', 'data-act': 'keep-local', 'data-path': c.path, text: 'Keep this phone' }),
        el('button', { type: 'button', class: 'btn ghost', 'data-act': 'keep-server', 'data-path': c.path, text: 'Keep the other phone' })
      )
    );
  }

  function paintConflicts() {
    var list = liveSession ? liveSession.view().conflicts : [];
    var host = $('banners');
    if (host) mount(host, list.map(conflictCard));
    var slot = $('conflictSlot');
    if (slot) mount(slot, $('sheetLayer').hidden ? [] : list.map(conflictCard));
  }

  function applyLiveValue(ch) {
    if (!ch || !overrides || typeof ch.path !== 'string') return;
    if (ch.path.indexOf('gifts/') === 0) {
      var id = ch.path.slice('gifts/'.length);
      if (ch.deleted || (ch.value && ch.value.deleted)) overrides.gifts = ElfGifts.deleteGift(overrides.gifts, id);
      else if (ch.value) overrides.gifts = ElfGifts.saveGift(overrides.gifts, (fixture && fixture.gifts) || [], ch.value);
      scheduleSave();
      refresh();
      if (parseHash().name === 'gifts') paint(true);
      return;
    }
    var note = /^story\.([A-Za-z0-9_-]+)\.note$/.exec(ch.path);
    if (!note) return;
    var focused = document.activeElement;
    if (focused && focused.dataset && focused.dataset.field === 'note' && focused.dataset.day === note[1]) return;
    ElfPlan.setField(overrides, note[1], 'note', ch.deleted ? '' : String(ch.value == null ? '' : ch.value), iso());
    scheduleSave();
    refresh();
    if (sheetDay === note[1]) {
      var box = document.getElementById('note-' + note[1]);
      if (box && document.activeElement !== box) box.value = ch.deleted ? '' : String(ch.value == null ? '' : ch.value);
    }
  }

  function mediaBase() {
    var path = window.location.pathname || '/';
    var at = path.indexOf('/elf-hq/');
    var dir = at >= 0 ? path.slice(0, at + '/elf-hq/'.length) : '/elf-hq/';
    return window.location.origin + dir;
  }

  var filmDiag = { session: 'no', key: '?', manifest: '?', film: '?', err: '' };
  var ornamentTaps = 0;

  function sessionBit() {
    var token = '';
    var exp = 0;
    try {
      token = sessionStorage.getItem('elf-hq-session') || '';
      exp = Number(sessionStorage.getItem('elf-hq-session-exp') || 0);
    } catch (e) {}
    return token && exp > Date.now() ? 'ok' : 'no';
  }

  function errBit(err) {
    var text = '';
    if (!err) return 'fail';
    if (err.name && err.name !== 'Error') text = err.name;
    else text = err.message || err.code || 'fail';
    text = String(text).replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 48);
    return text || 'fail';
  }

  function filmLine() {
    return 'session:' + filmDiag.session + ' key:' + filmDiag.key + ' manifest:' + filmDiag.manifest + ' film:' + filmDiag.film + (filmDiag.err ? ' err:' + filmDiag.err : '');
  }

  function filmTrace(patch) {
    if (patch) {
      Object.keys(patch).forEach(function (key) { filmDiag[key] = patch[key]; });
    }
    filmDiag.session = sessionBit();
    var node = $('filmTrace');
    if (node) node.textContent = filmLine();
  }

  function showFilmDiag() {
    filmTrace();
    var node = $('filmTrace');
    if (node) node.hidden = false;
  }

  function armMedia() {
    filmDiag = { session: sessionBit(), key: '?', manifest: '?', film: '?', err: '' };
    if (!liveParts().worker || !window.ElfVault || !liveSession || typeof liveSession.mediaKey !== 'function') {
      filmTrace({ key: 'no', manifest: 'no', film: 'no', err: 'nosession' });
      showFilmDiag();
      return Promise.resolve();
    }
    filmTrace({ key: 'wait', manifest: '?', film: '?', err: '' });
    mediaVault = ElfVault.createVault({ base: mediaBase() });
    var watchdog = setTimeout(function () {
      if (filmDiag.key !== 'wait') return;
      var sock = liveSession.socketState ? liveSession.socketState() : { ready: -1, close: 0, reason: '' };
      var err = 'ready' + sock.ready + '.close' + (sock.close || 0);
      if (sock.reason) err += '.' + String(sock.reason).replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 24);
      filmTrace({ key: 'timeout', err: err });
      showFilmDiag();
    }, 10000);
    return liveSession.mediaKey().then(function (text) {
      clearTimeout(watchdog);
      filmTrace({ key: 'yes', manifest: 'wait', film: '?', err: '' });
      try { mediaVault.setKey(ElfVault.decodeKey(text)); }
      catch (err) {
        var decodeErr = err instanceof Error ? err : new Error('media-key');
        decodeErr.keyStage = 'decode';
        throw decodeErr;
      }
      return mediaVault.loadManifest();
    }).then(function () {
      filmTrace({ key: 'yes', manifest: 'yes', film: '?', err: '' });
      if (sheetDay) paintSheet();
      else paint(true);
    }, function (err) {
      clearTimeout(watchdog);
      var sock = liveSession && liveSession.socketState ? liveSession.socketState() : { ready: -1, close: 0, reason: '' };
      var detail = 'ready' + sock.ready + '.close' + (sock.close || 0);
      if (sock.reason) detail += '.' + String(sock.reason).replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 24);
      var key = filmDiag.key === 'yes' ? (err && err.keyStage === 'decode' ? 'bad' : 'yes') : (sock.close ? 'closed' : 'timeout');
      filmTrace({ key: key, manifest: 'no', film: 'no', err: filmDiag.key === 'yes' ? errBit(err) : detail });
      showFilmDiag();
      if (mediaVault) mediaVault.close();
      mediaVault = null;
    });
  }

  function blendFilm(host, video) {
    if (!host || !video || video.videoWidth < 2 || video.videoHeight < 2) return;
    var canvas = document.createElement('canvas');
    var w = 32;
    var h = 32;
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    try { ctx.drawImage(video, 0, 0, w, h); }
    catch (e) { return; }
    var data;
    try { data = ctx.getImageData(0, 0, w, h).data; }
    catch (e) { return; }
    var r = 0;
    var g = 0;
    var b = 0;
    var n = 0;
    var edge = 3;
    var y;
    var x;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        if (x >= edge && y >= edge && x < w - edge && y < h - edge) continue;
        var i = (y * w + x) * 4;
        if (data[i + 3] < 128) continue;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n += 1;
      }
    }
    if (!n) return;
    r = Math.round(r / n);
    g = Math.round(g / n);
    b = Math.round(b / n);
    if (r + g + b < 48) return;
    var plate = host.closest ? (host.closest('.film-wash') || host) : host;
    plate.style.setProperty('--film-plate', 'rgb(' + r + ',' + g + ',' + b + ')');
    plate.classList.add('is-blended');
  }

  function mountFilm(day) {
    var block = el('div', { class: 'film-block' });
    var host = el('div', { class: 'film-host' });
    var wash = el('div', { class: 'film-wash' });
    var capSlot = el('div', { class: 'film-caption-slot' });
    var token = {};
    host._filmToken = token;
    wash.appendChild(host);
    block.appendChild(wash);
    block.appendChild(capSlot);
    host.appendChild(posterCard(labelOf(day), false));
    if (!mediaVault || !mediaVault.ready()) return block;
    var entry = mediaVault.peek(day.number);
    if (!entry || !entry.video) {
      filmTrace({ key: 'yes', manifest: 'yes', film: 'no', err: 'noday' });
      showFilmDiag();
      return block;
    }
    var asked = filmAsked;
    mediaVault.openDay(day.number, { play: asked || !reduced(), reduced: reduced() }).then(function (slot) {
      if (!slot || host._filmToken !== token || !host.isConnected) return;
      var bits = [];
      if (slot.badge) bits.push(el('p', { class: 'cut-badge', text: slot.badge }));
      if (slot.videoUrl) {
        var video = document.createElement('video');
        video.className = 'chapter-film';
        video.muted = true;
        video.defaultMuted = true;
        video.loop = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('muted', '');
        video.setAttribute('loop', '');
        video.preload = 'auto';
        video.controls = false;
        if (slot.posterUrl) video.poster = slot.posterUrl;
        video.addEventListener('loadeddata', function () {
          blendFilm(host, video);
          filmTrace({ key: 'yes', manifest: 'yes', film: 'yes', err: slot.note || '' });
        });
        video.src = slot.videoUrl;
        if (video.readyState >= 2) blendFilm(host, video);
        video.addEventListener('error', function () {
          var code = video.error ? video.error.code : 0;
          filmTrace({ key: 'yes', manifest: 'yes', film: 'no', err: 'video' + code });
          showFilmDiag();
        });
        bits.push(video);
        if (slot.play) video.autoplay = true;
        else bits.push(el('button', { type: 'button', class: 'btn', 'data-act': 'film-play', text: 'Play' }));
      } else bits.push(posterCard(labelOf(day), false));
      mount(host, bits);
      if (slot.caption) capSlot.appendChild(el('p', { class: 'film-caption', text: slot.caption }));
      var playing = host.querySelector('video');
      if (playing && slot.play) {
        var started = playing.play();
        if (started && started.catch) started.catch(function () {});
      }
    }, function (err) {
      filmTrace({ key: 'yes', manifest: 'yes', film: 'no', err: errBit(err) });
      showFilmDiag();
    });
    return block;
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
    if (target.dataset.field === 'houseName') {
      ElfPlan.setMeta(overrides, 'houseName', target.value.trim());
      scheduleSave();
      refresh();
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
    if (target.dataset.field === 'note') pushLive('story.' + target.dataset.day + '.note', target.value);
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

  function toggleBought(id) {
    var gift = allGifts().filter(function (item) { return item.id === id; })[0];
    if (!gift) return;
    var prev = JSON.parse(JSON.stringify(gift));
    var nextStatus = gift.status === 'purchased' ? 'planned' : 'purchased';
    var next = ElfGifts.setStatus(gift, nextStatus, iso().slice(0, 10)).gift;
    if (nextStatus === 'purchased' && gift.myPriceCents) next = ElfGifts.confirmSpent(next, gift.myPriceCents);
    else if (nextStatus === 'purchased' && gift.spentCents != null && gift.spentConfirmed) next = ElfGifts.confirmSpent(next, gift.spentCents);
    rememberGift(next);
    paint(true);
    announce(nextStatus === 'purchased' ? 'Marked bought.' : 'Moved back.', {
      label: 'Undo',
      run: function () { rememberGift(prev); paint(true); }
    });
  }

  function deleteGift(id) {
    var gift = allGifts().filter(function (item) { return item.id === id; })[0];
    if (!gift) return;
    var prev = JSON.parse(JSON.stringify(gift));
    overrides.gifts = ElfGifts.deleteGift(overrides.gifts, id);
    scheduleSave();
    pushLive('gifts/' + id, Object.assign({}, prev, { deleted: true }));
    refresh();
    paint(true);
    announce('Gift removed.', {
      label: 'Undo',
      run: function () {
        overrides.gifts = ElfGifts.saveGift(overrides.gifts, fixture.gifts || [], prev);
        if (overrides.gifts.removed) overrides.gifts.removed = overrides.gifts.removed.filter(function (gone) { return gone !== id; });
        scheduleSave();
        pushLive('gifts/' + id, prev);
        paint(true);
      }
    });
  }

  function pushLive(path, value) {
    if (!liveSession || !liveSession.view().connected) return;
    liveSession.commit(path, value);
  }

  function deviceId() {
    var key = 'pin.device';
    var id = '';
    try { id = localStorage.getItem(key) || ''; } catch (e) {}
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      var bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      id = btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      try { localStorage.setItem(key, id); } catch (e) {}
    }
    return id;
  }

  function bootLive() {
    var live = liveParts();
    var token = '';
    var exp = 0;
    try { token = sessionStorage.getItem('elf-hq-session') || ''; exp = Number(sessionStorage.getItem('elf-hq-session-exp') || 0); } catch (e) {}
    if (!live.worker || !token || !(exp > Date.now())) {
      liveSession = window.ElfLive ? ElfLive.open({ enabled: false }) : null;
      mediaVault = null;
      paintSave();
      return;
    }
    liveSession = ElfLive.open({ worker: live.worker, token: token, pollMs: 0, enabled: true });
    if (liveSession.on) liveSession.on(function () { paintSave(); paintConflicts(); });
    if (liveSession.onRemote) liveSession.onRemote(applyLiveValue);
    var sync = function () {
      liveSession.start().then(function () {
        paintSave();
        paintClock();
      }, function () { paintSave(); });
    };
    var media = armMedia();
    if (media && media.then) media.then(sync, sync);
    else sync();
  }

  function connectPhones() {
    var live = liveParts();
    var input = $('elfPin');
    if (!live.worker || !live.session || !input) { announce('Only on this phone.'); return; }
    var pin = input.value;
    input.value = '';
    if (!/^\d{4}$/.test(pin)) { announce('Enter the 4 digit PIN. Nothing was sent.'); return; }
    fetch(live.session, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pin, deviceId: deviceId(), app: 'elf-hq' })
    }).then(function (res) { return res.json().then(function (body) { return { status: res.status, body: body }; }); }).then(function (res) {
      pin = '';
      if (res.body && (res.body.key || res.body.kid)) { announce('The phones did not connect. Nothing from the budget apps was kept.'); return; }
      if (res.status !== 200 || !res.body.session) { announce('The phones did not connect.'); return; }
      try {
        sessionStorage.setItem('elf-hq-session', res.body.session);
        sessionStorage.setItem('elf-hq-session-exp', String(Date.parse(res.body.exp) || 0));
      } catch (e) {}
      var liveNow = liveParts();
      var token = '';
      var exp = 0;
      try { token = sessionStorage.getItem('elf-hq-session') || ''; exp = Number(sessionStorage.getItem('elf-hq-session-exp') || 0); } catch (e) {}
      if (!liveNow.worker || !token) { announce('The phones did not connect.'); return; }
      liveSession = ElfLive.open({ worker: liveNow.worker, token: token, pollMs: 0, enabled: true });
      if (liveSession.on) liveSession.on(function () { paintSave(); paintConflicts(); });
      if (liveSession.onRemote) liveSession.onRemote(applyLiveValue);
      var sync = function () {
        liveSession.start().then(function () {
          paintSave();
          if (parseHash().name === 'settings') paintDesk();
          announce(ElfLive.statusLabel(liveSession.view()));
        }, function () {
          paintSave();
          announce('The phones did not connect.');
        });
      };
      var media = armMedia();
      if (media && media.then) media.then(sync, sync);
      else sync();
    }, function () { announce('The phones did not connect.'); });
  }

  function paintConnect() {
    var live = liveParts();
    var label = window.ElfLive ? ElfLive.statusLabel(liveSession ? liveSession.view() : { state: 'disconnected', deployed: false, connected: false }) : 'Only on this phone';
    return el('div', { class: 'card' },
      el('h3', { text: 'Phones' }),
      el('p', { text: live.worker ? label : 'Only on this phone.' })
    );
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
    if (event.target.closest && event.target.closest('.film-host')) {
      ornamentTaps += 1;
      if (ornamentTaps >= 5) showFilmDiag();
    }
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
    else if (act === 'bonus-play') playBonus(button);
    else if (act === 'bonus-close') closeBonus();
    else if (act === 'gift-filter') { giftFilter = button.dataset.filter || 'all'; paint(true); }
    else if (act === 'gift-person') {
      giftPerson = ElfGifts.keepPerson(button.dataset.id, (fixture && fixture.recipients) || []);
      try { localStorage.setItem('elf-hq-gift-person', giftPerson); } catch (e) {}
      paint(true);
    }
    else if (act === 'gift-toggle') {
      giftOpen[button.dataset.id] = giftOpen[button.dataset.id] === false;
      paint(true);
    }
    else if (act === 'gift-add') openGiftSheet(button.dataset.id, null);
    else if (act === 'gift-edit') {
      var editing = allGifts().filter(function (gift) { return gift.id === button.dataset.id; })[0];
      if (editing) openGiftSheet(editing.recipientId, editing);
    }
    else if (act === 'gift-menu') {
      var tag = button.closest('.gift-tag');
      if (tag) tag.classList.toggle('is-open');
    }
    else if (act === 'gift-bought') toggleBought(button.dataset.id);
    else if (act === 'gift-delete') deleteGift(button.dataset.id);
    else if (act === 'gift-save') saveGiftForm();
    else if (act === 'gift-close') closeGiftSheet();
    else if (act === 'elf-connect') connectPhones();
    else if (act === 'film-play') { filmAsked = true; if (sheetDay) paintSheet(); }
    else if (act === 'keep-local' || act === 'keep-server') {
      if (!liveSession) return;
      var path = button.dataset.path;
      liveSession.resolve(path, act === 'keep-server' ? 'server' : 'local').then(function () {
        var value = liveSession.get(path);
        applyLiveValue({ path: path, value: value, deleted: value == null });
        paintConflicts();
        paintSave();
      });
    }
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
        if (data && data.elfHqSeed === 1) {
          var seeded = ElfPlan.importSeed(overrides, data, iso(), (fixture.shopping || []).map(function (item) { return item.id; }));
          if (!seeded.ok) { announce('That story file was not used. Nothing was replaced.'); return; }
          refresh();
          scheduleSave();
          paint(true);
          announce('Your story is on this phone.');
          return;
        }
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

  var swipe = null;
  document.addEventListener('pointerdown', function (event) {
    var tag = event.target.closest ? event.target.closest('.gift-tag') : null;
    if (!tag) { swipe = null; return; }
    swipe = { id: tag.getAttribute('data-id'), x: event.clientX, y: event.clientY };
  });
  document.addEventListener('pointerup', function (event) {
    if (!swipe) return;
    var dx = event.clientX - swipe.x;
    var dy = Math.abs(event.clientY - swipe.y);
    var tag = document.querySelector('.gift-tag[data-id="' + swipe.id + '"]');
    if (tag && dx < -56 && dy < 36) tag.classList.add('is-open');
    if (tag && dx > 56 && dy < 36) tag.classList.remove('is-open');
    swipe = null;
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) flush();
    else {
      catchUp();
      if (liveSession && liveSession.resume) liveSession.resume().then(function () { paintSave(); });
    }
  });
  window.addEventListener('pageshow', catchUp);
  window.addEventListener('online', function () {
    if (liveSession && liveSession.resume) liveSession.resume().then(function () { paintSave(); paintConflicts(); });
  });
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
      if (!overrides.meta.welcomedAt) ElfPlan.setMeta(overrides, 'welcomedAt', iso());
      bootLive();
      refresh();
      if (scratch.failed) announce('This browser cannot keep the story after you leave. Export a backup if you need one.');
      $('boot').remove();
      paint(true);
      setInterval(catchUp, 30000);
      (function armMidnight() {
        var z = ElfPlan.zonedParts(new Date());
        var minute = Number(z.minute) || 0;
        var second = new Date().getSeconds();
        var wait = (((23 - z.hour) * 60 + (59 - minute)) * 60 + (60 - second)) * 1000 + 500;
        if (wait < 1000) wait = 1000;
        setTimeout(function () { catchUp(); armMidnight(); }, wait);
      })();
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(function () {});
    }).catch(function () {
      $('boot').textContent = 'Elf HQ hit a snag while opening. Your notebook was not cleared. Reload the page.';
    });
  }

  window.addEventListener('error', function () {
    var bootNode = $('boot');
    if (bootNode) bootNode.textContent = 'Elf HQ hit a snag while opening. Your notebook was not cleared. Reload the page.';
  });

  if (window.ElfPin && ElfPin.whenOpen) ElfPin.whenOpen(boot);
  else boot();
})();
