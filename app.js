/* ============================================================
   VOCAVOCA — app.js
   Vanilla JS SPA. Hash routing. localStorage persistence.
   ============================================================ */

(function () {
  'use strict';

  var TOTAL_DAYS = Math.max.apply(null, VOCAB_DATA.map(function (w) { return w.day; }));
  var WORDS_PER_DAY = 50;
  var STORAGE_KEY = 'vocavoca_state_v1';

  /* ---------------------------------------------------------
     word lookup helpers
  --------------------------------------------------------- */
  var byDay = {};
  var byId = {};
  VOCAB_DATA.forEach(function (w) {
    if (!byDay[w.day]) byDay[w.day] = [];
    byDay[w.day].push(w);
    byId[w.id] = w;
  });
  Object.keys(byDay).forEach(function (d) {
    byDay[d].sort(function (a, b) { return a.no - b.no; });
  });

  function wordsOfDay(day) { return byDay[day] || []; }

  /* ---------------------------------------------------------
     state
  --------------------------------------------------------- */
  function defaultState() {
    return {
      currentDay: 1,
      progress: {},      // { [day]: { studied:[ids], known:[ids], unknown:[ids] } }
      favorites: [],      // [wordId]
      wrongNotes: {},      // { [wordId]: { count, lastAt } }
      quizScores: {},      // { [day]: { best, last, attempts, lastAt, total } }
      quizMastered: [],    // [wordId] — answered correctly in quiz, not since missed
      studyLog: []        // ['YYYY-MM-DD']
    };
  }

  var state = loadState();

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      var d = defaultState();
      return Object.assign(d, parsed);
    } catch (e) {
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* storage unavailable — continue in-memory */ }
  }

  function dayProgress(day) {
    if (!state.progress[day]) {
      state.progress[day] = { studied: [], known: [], unknown: [] };
    }
    return state.progress[day];
  }

  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function dateStrOffset(offset) {
    var d = new Date();
    d.setDate(d.getDate() + offset);
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function markStudyLogToday() {
    var t = todayStr();
    if (state.studyLog.indexOf(t) === -1) {
      state.studyLog.push(t);
    }
  }

  function computeStreak() {
    var set = {};
    state.studyLog.forEach(function (d) { set[d] = true; });
    var today = todayStr();
    var startOffset = 0;
    if (!set[today]) {
      // today not studied yet — streak may still be alive via yesterday
      startOffset = 1;
      if (!set[dateStrOffset(-1)]) return 0;
    }
    var count = 0;
    var cursor = startOffset;
    while (set[dateStrOffset(-cursor)]) {
      count++;
      cursor++;
    }
    return count;
  }

  /* ---------------------------------------------------------
     small DOM helpers
  --------------------------------------------------------- */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined) return;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') {
        el.addEventListener(k.slice(2), v);
      } else if (k === 'style') el.setAttribute('style', v);
      else el.setAttribute(k, v);
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      if (typeof c === 'string' || typeof c === 'number') {
        el.appendChild(document.createTextNode(c));
      } else {
        el.appendChild(c);
      }
    });
    return el;
  }

  function text(tag, cls, str) { return h(tag, { class: cls }, [str]); }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  var toastTimer = null;
  function showToast(msg) {
    var existing = document.getElementById('toast');
    if (existing) existing.remove();
    var t = h('div', { class: 'toast', id: 'toast' }, [msg]);
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, 2200);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------------------------------------------------
     router
  --------------------------------------------------------- */
  var routes = {
    '': renderHome,
    '#/': renderHome,
    '#/words': renderWords,
    '#/quiz': renderQuiz,
    '#/notes': renderNotes,
    '#/settings': renderSettings
  };

  var mainEl = document.getElementById('view');
  var navEl = document.getElementById('nav');
  var streakChipEl = document.getElementById('streak-chip');

  function currentRoute() {
    var hash = location.hash || '#/';
    return hash.split('?')[0];
  }

  var lastRoute = null;

  function render() {
    var route = currentRoute();
    var fn = routes[route] || renderHome;
    var routeChanged = route !== lastRoute;
    if (routeChanged && route === '#/quiz' && quizSession &&
        quizSession.index >= quizSession.questions.length) {
      quizSession = null;
    }
    var savedScrollY = window.scrollY;
    clear(mainEl);
    mainEl.appendChild(fn());
    updateNav(route);
    updateStreakChip();
    if (routeChanged) {
      window.scrollTo(0, 0);
    } else {
      window.scrollTo(0, savedScrollY);
    }
    lastRoute = route;
  }

  function updateNav(route) {
    var links = navEl.querySelectorAll('a');
    links.forEach(function (a) {
      var href = a.getAttribute('href');
      var isActive = href === route || (route === '#/' && href === '#/');
      a.classList.toggle('active', isActive);
    });
  }

  function updateStreakChip() {
    var s = computeStreak();
    clear(streakChipEl);
    streakChipEl.appendChild(h('span', { class: 'flame' }, ['\u{1F525}']));
    streakChipEl.appendChild(document.createTextNode(s + '\uC77C \uC5F0\uC18D'));
  }

  window.addEventListener('hashchange', render);

  /* ---------------------------------------------------------
     Day rail component (shared)
  --------------------------------------------------------- */
  function buildDayRail(onSelect) {
    var rail = h('div', { class: 'day-rail' }, []);
    for (var d = 1; d <= TOTAL_DAYS; d++) {
      (function (day) {
        var prog = dayProgress(day);
        var done = prog.studied.length >= WORDS_PER_DAY;
        var chip = h('button', {
          class: 'day-chip' + (day === state.currentDay ? ' selected' : '') + (done ? ' done' : ''),
          type: 'button',
          onclick: function () {
            state.currentDay = day;
            saveState();
            if (onSelect) onSelect(day); else render();
          }
        }, [
          h('span', { class: 'lbl' }, ['DAY']),
          h('span', { class: 'num' }, [String(day).padStart(2, '0')])
        ]);
        rail.appendChild(chip);
      })(d);
    }
    return rail;
  }

  /* ============================================================
     HOME
  ============================================================ */
  function renderHome() {
    var frag = document.createDocumentFragment();
    var wrap = h('div', {}, []);

    wrap.appendChild(text('div', 'section-title', 'TODAY STUDY'));
    wrap.appendChild(h('div', { style: 'height:10px' }, []));
    wrap.appendChild(buildDayRail());

    var day = state.currentDay;
    var prog = dayProgress(day);
    var studiedCount = prog.studied.length;
    var score = state.quizScores[day];

    // hero tag
    var meter = h('div', { class: 'stitch-track' }, []);
    for (var i = 0; i < WORDS_PER_DAY; i++) {
      meter.appendChild(h('div', { class: 'stitch-tick' + (i < studiedCount ? ' filled' : '') }, []));
    }

    var hero = h('div', { class: 'hero-tag' }, [
      h('div', { class: 'hero-tag-top' }, [
        h('div', {}, [
          text('div', 'hero-tag-label', 'VOCAVOCA \u00B7 LOOK'),
          h('div', { class: 'hero-tag-day' }, [
            String(day).padStart(2, '0'),
            h('span', { class: 'of' }, ['/ ' + TOTAL_DAYS])
          ])
        ]),
        studiedCount >= WORDS_PER_DAY
          ? h('div', { class: 'hero-badge' }, ['\uC624\uB298\uC758 \uD559\uC2B5 \uC644\uB8CC'])
          : null
      ]),
      h('div', { class: 'stitch-meter' }, [
        h('div', { class: 'stitch-meter-row' }, [
          h('span', {}, ['\uB2E8\uC5B4 \uD559\uC2B5']),
          h('span', {}, [studiedCount + ' / ' + WORDS_PER_DAY])
        ]),
        meter
      ]),
      h('div', { class: 'hero-stats-row' }, [
        h('div', { class: 'hero-stat' }, [
          h('b', {}, [score ? String(score.best) + '/' + score.total : '\u2013']),
          '\uCD5C\uACE0 \uD034\uC988 \uC810\uC218'
        ]),
        h('div', { class: 'hero-stat' }, [
          h('b', {}, [String(prog.known.length)]),
          '\uC544\uB294 \uB2E8\uC5B4'
        ]),
        h('div', { class: 'hero-stat' }, [
          h('b', {}, [String(computeStreak())]),
          '\uC5F0\uC18D \uD559\uC2B5\uC77C'
        ])
      ])
    ]);
    wrap.appendChild(hero);

    var ctaGrid = h('div', { class: 'cta-grid' }, [
      h('a', { class: 'cta-btn primary', href: '#/words' }, [
        h('span', { class: 'cta-icon' }, ['\u{1F4D6}']),
        h('span', { class: 'cta-title' }, ['\uC624\uB298\uC758 \uB2E8\uC5B4 \uD559\uC2B5']),
        h('span', { class: 'cta-sub' }, ['DAY ' + String(day).padStart(2, '0') + ' \u00B7 50\uB2E8\uC5B4'])
      ]),
      h('a', { class: 'cta-btn secondary', href: '#/quiz' }, [
        h('span', { class: 'cta-icon' }, ['\u270D\uFE0F']),
        h('span', { class: 'cta-title' }, ['4\uC9C0\uC120\uB2E4\uD615 \uD034\uC988']),
        h('span', { class: 'cta-sub' }, ['\uB79C\uB364 \uCD9C\uC81C\uB85C \uC2E4\uB825 \uCCB4\uD06C'])
      ])
    ]);
    wrap.appendChild(ctaGrid);

    // quick summary row: favorites / wrong notes
    var wrongCount = Object.keys(state.wrongNotes).length;
    var favCount = state.favorites.length;
    var summaryCard = h('a', { class: 'plain-card', href: '#/notes', style: 'display:flex;justify-content:space-between;align-items:center;text-decoration:none;color:inherit' }, [
      h('div', {}, [
        text('div', 'section-title', '\uC624\uB2F5\uB178\uD2B8 \u00B7 \uC990\uACA8\uCC3E\uAE30'),
        text('div', 'settings-row-desc', '\uC624\uB2F5 ' + wrongCount + '\uAC1C \u00B7 \uC990\uACA8\uCC3E\uAE30 ' + favCount + '\uAC1C')
      ]),
      text('span', 'section-link', '\uBCF4\uAE30')
    ]);
    wrap.appendChild(summaryCard);

    frag.appendChild(wrap);
    return frag;
  }

  /* ============================================================
     WORDS
  ============================================================ */
  var wordsCardIndex = 0;
  var wordsRevealed = false;
  var wordsViewMode = 'list'; // 'list' | 'card'
  var wordsSortMode = 'default'; // 'default' | 'unknown' | 'favorite' | 'random'
  var wordsSortSeed = [];

  function sortedWordsOfDay(day, prog) {
    var list = wordsOfDay(day);
    if (wordsSortMode === 'unknown') {
      list = list.slice().sort(function (a, b) {
        var aM = state.quizMastered.indexOf(a.id) !== -1;
        var bM = state.quizMastered.indexOf(b.id) !== -1;
        if (aM === bM) return a.no - b.no;
        return aM ? 1 : -1; // \uD034\uC988\uC5D0\uC11C \uC544\uC9C1 \uB9DE\uD788\uC9C0 \uBABB\uD55C(\uBBF8\uC554\uAE30) \uB2E8\uC5B4\uAC00 \uBA3C\uC800
      });
    } else if (wordsSortMode === 'favorite') {
      list = list.slice().sort(function (a, b) {
        var aF = state.favorites.indexOf(a.id) !== -1;
        var bF = state.favorites.indexOf(b.id) !== -1;
        if (aF === bF) return a.no - b.no;
        return aF ? -1 : 1;
      });
    } else if (wordsSortMode === 'random') {
      if (wordsSortSeed.length !== list.length) {
        wordsSortSeed = shuffle(list.map(function (w) { return w.id; }));
      }
      var orderMap = {};
      wordsSortSeed.forEach(function (id, i) { orderMap[id] = i; });
      list = list.slice().sort(function (a, b) { return orderMap[a.id] - orderMap[b.id]; });
    } else {
      list = list.slice().sort(function (a, b) { return a.no - b.no; });
    }
    return list;
  }

  function renderWords() {
    var wrap = h('div', {}, []);
    wrap.appendChild(buildDayRail(function () {
      wordsCardIndex = 0;
      wordsRevealed = false;
      wordsSortSeed = [];
      wordsListRevealed = {};
      render();
    }));

    var day = state.currentDay;
    var prog = dayProgress(day);
    var studiedCount = prog.studied.length;

    if (studiedCount >= WORDS_PER_DAY) {
      wrap.appendChild(h('div', { class: 'words-complete-banner' }, [
        h('div', { class: 'badge-icon' }, ['\u{1F3C5}']),
        text('div', 'badge-title', 'DAY ' + String(day).padStart(2, '0') + ' \uD559\uC2B5 \uC644\uB8CC \uBC30\uC9C0 \uD68D\uB4DD'),
        text('div', 'badge-sub', '50\uB2E8\uC5B4\uB97C \uBAA8\uB450 \uD655\uC778\uD588\uC5B4\uC694. \uC624\uB298 \uC5F0\uC18D\uD559\uC2B5\uC774 \uAE30\uB85D\uB418\uC5C8\uC2B5\uB2C8\uB2E4.')
      ]));
    }

    var progRow = h('div', { class: 'words-progress-row' }, [
      h('span', {}, [String(studiedCount) + ' / ' + WORDS_PER_DAY]),
      h('div', { class: 'words-progress-track' }, [
        h('div', { class: 'words-progress-fill', style: 'width:' + (studiedCount / WORDS_PER_DAY * 100) + '%' }, [])
      ])
    ]);
    wrap.appendChild(progRow);

    var modeToggle = h('div', { class: 'words-mode-toggle' }, [
      h('button', {
        class: 'words-mode-btn' + (wordsViewMode === 'list' ? ' active' : ''),
        type: 'button',
        onclick: function () { wordsViewMode = 'list'; render(); }
      }, ['\u25A4 \uBAA9\uB85D\uD615']),
      h('button', {
        class: 'words-mode-btn' + (wordsViewMode === 'card' ? ' active' : ''),
        type: 'button',
        onclick: function () { wordsViewMode = 'card'; wordsCardIndex = 0; wordsRevealed = false; render(); }
      }, ['\u2318 \uCE74\uB4DC\uD615'])
    ]);
    wrap.appendChild(modeToggle);

    if (wordsViewMode === 'list') {
      wrap.appendChild(renderWordsListView(day, prog));
      return wrap;
    }

    var list = wordsOfDay(day);
    if (wordsCardIndex >= list.length) wordsCardIndex = 0;
    var w = list[wordsCardIndex];

    // flashcard nav
    var navRow = h('div', { class: 'flashcard-nav' }, [
      h('button', {
        class: 'icon-btn', type: 'button',
        disabled: wordsCardIndex === 0 ? 'disabled' : null,
        onclick: function () { if (wordsCardIndex > 0) { wordsCardIndex--; wordsRevealed = false; render(); } }
      }, ['\u2190']),
      h('span', {}, [(wordsCardIndex + 1) + ' / ' + list.length]),
      h('button', {
        class: 'icon-btn', type: 'button',
        disabled: wordsCardIndex === list.length - 1 ? 'disabled' : null,
        onclick: function () { if (wordsCardIndex < list.length - 1) { wordsCardIndex++; wordsRevealed = false; render(); } }
      }, ['\u2192'])
    ]);
    wrap.appendChild(navRow);

    if (w) {
      var isFav = state.favorites.indexOf(w.id) !== -1;
      var judged = prog.known.indexOf(w.id) !== -1 ? 'know' : (prog.unknown.indexOf(w.id) !== -1 ? 'unknow' : null);

      var cardChildren = [
        h('span', { class: 'flashcard-eyebrow' }, ['DAY ' + String(day).padStart(2, '0') + ' \u00B7 No.' + w.no]),
        h('button', {
          class: 'flashcard-star' + (isFav ? ' active' : ''),
          type: 'button',
          'aria-label': '\uC990\uACA8\uCC3E\uAE30',
          onclick: function (e) {
            e.stopPropagation();
            toggleFavorite(w.id);
            render();
          }
        }, [isFav ? '\u2605' : '\u2606']),
        h('div', { class: 'flashcard-word' }, [w.word])
      ];

      if (!wordsRevealed) {
        cardChildren.push(h('div', { class: 'flashcard-hint' }, ['\uCE74\uB4DC\uB97C \uD0ED\uD558\uBA74 \uB73B\uACFC \uC554\uAE30\uBC95\uC774 \uBCF4\uC5EC\uC694']));
      } else {
        cardChildren.push(h('div', { class: 'flashcard-meaning' }, [w.meaning]));
        if (w.memo) {
          cardChildren.push(h('div', { class: 'flashcard-memo' }, [w.memo]));
        }
      }

      var card = h('div', {
        class: 'flashcard',
        onclick: function () { wordsRevealed = !wordsRevealed; render(); }
      }, cardChildren);

      wrap.appendChild(h('div', { class: 'flashcard-wrap' }, [card]));

      var judgeRow = h('div', { class: 'judge-row' }, [
        h('button', {
          class: 'judge-btn know' + (judged === 'know' ? ' marked' : ''),
          type: 'button',
          onclick: function () { judgeWord(w.id, true); advanceCard(list.length); }
        }, ['\u2713 \uC544\uB294 \uB2E8\uC5B4']),
        h('button', {
          class: 'judge-btn unknow' + (judged === 'unknow' ? ' marked' : ''),
          type: 'button',
          onclick: function () { judgeWord(w.id, false); advanceCard(list.length); }
        }, ['\u2715 \uBAA8\uB974\uB294 \uB2E8\uC5B4'])
      ]);
      wrap.appendChild(judgeRow);
    }

    // mini grid to jump
    wrap.appendChild(h('div', { style: 'height:20px' }, []));
    wrap.appendChild(text('div', 'section-title', 'DAY ' + String(day).padStart(2, '0') + ' \uB2E8\uC5B4 \uBAA9\uB85D'));
    var grid = h('div', { class: 'word-mini-grid' }, []);
    list.forEach(function (item, idx) {
      var cls = 'word-mini';
      if (idx === wordsCardIndex) cls += ' current';
      if (prog.known.indexOf(item.id) !== -1) cls += ' know';
      else if (prog.unknown.indexOf(item.id) !== -1) cls += ' unknow';
      grid.appendChild(h('button', {
        class: cls, type: 'button',
        onclick: function () { wordsCardIndex = idx; wordsRevealed = false; render(); }
      }, [String(item.no)]));
    });
    wrap.appendChild(grid);

    return wrap;
  }

  /* ---------------------------------------------------------
     Words page — list view (browse & check off known words)
  --------------------------------------------------------- */
  var wordsListRevealed = {}; // { [wordId]: true } — tap-to-reveal state in list view

  function renderWordsListView(day, prog) {
    var frag = h('div', {}, []);
    var list = sortedWordsOfDay(day, prog);

    var sortSelect = h('select', {
      class: 'words-sort-select',
      onchange: function (e) {
        wordsSortMode = e.target.value;
        wordsSortSeed = [];
        render();
      }
    }, [
      h('option', { value: 'default', selected: wordsSortMode === 'default' ? 'selected' : null }, ['\uAE30\uBCF8\uC21C']),
      h('option', { value: 'unknown', selected: wordsSortMode === 'unknown' ? 'selected' : null }, ['\uBBF8\uC554\uAE30 \uC21C']),
      h('option', { value: 'favorite', selected: wordsSortMode === 'favorite' ? 'selected' : null }, ['\uC990\uACA8\uCC3E\uAE30 \uC21C']),
      h('option', { value: 'random', selected: wordsSortMode === 'random' ? 'selected' : null }, ['\uB79C\uB364'])
    ]);

    var sortBtn = h('button', {
      class: 'words-sort-shuffle', type: 'button', title: '\uB2E4\uC2DC \uC12E\uAE30',
      onclick: function () {
        if (wordsSortMode !== 'random') { wordsSortMode = 'random'; }
        wordsSortSeed = [];
        render();
      }
    }, ['\u21C4']);

    var sortGroup = h('div', { class: 'words-sort-group' }, [sortBtn, sortSelect]);

    var masteredCount = list.filter(function (w) { return state.quizMastered.indexOf(w.id) !== -1; }).length;

    var toolbar = h('div', { class: 'words-list-toolbar' }, [
      sortGroup,
      h('div', { class: 'words-select-summary' }, [
        h('span', { class: 'words-select-count' }, [String(masteredCount) + '\uAC1C \uC554\uAE30\uC644\uB8CC'])
      ])
    ]);
    frag.appendChild(toolbar);

    var revealAllBtn = h('button', {
      class: 'words-reveal-btn',
      type: 'button',
      onclick: function () {
        list.forEach(function (item) { wordsListRevealed[item.id] = true; });
        render();
      }
    }, ['\uB73B\uAE4C\uC9C0 \uBCF4\uAE30']);

    var hideAllBtn = h('button', {
      class: 'words-reveal-btn',
      type: 'button',
      onclick: function () {
        list.forEach(function (item) { wordsListRevealed[item.id] = false; });
        render();
      }
    }, ['\uB2E8\uC5B4\uB9CC \uBCF4\uAE30']);

    var revealToggleRow = h('div', { class: 'words-reveal-toggle' }, [revealAllBtn, hideAllBtn]);
    frag.appendChild(revealToggleRow);

    var listEl = h('div', { class: 'word-list' }, []);
    list.forEach(function (w) {
      listEl.appendChild(buildWordListRow(w));
    });
    frag.appendChild(listEl);

    return frag;
  }

  function buildWordListRow(w) {
    var isFav = state.favorites.indexOf(w.id) !== -1;
    var isMastered = state.quizMastered.indexOf(w.id) !== -1;
    // \uAE30\uBCF8\uAC12\uC740 true(\uB2E8\uC5B4+\uB73B \uD45C\uC2DC). \uBA85\uC2DC\uC801\uC73C\uB85C false\uB85C \uAE30\uB85D\uB41C \uACBD\uC6B0\uC5D0\uB9CC \uB2E8\uC5B4\uB9CC \uD45C\uC2DC.
    var revealed = wordsListRevealed[w.id] !== false;

    var bookmarkBtn = h('button', {
      class: 'word-list-bookmark' + (isFav ? ' active' : ''),
      type: 'button',
      'aria-label': '\uC990\uACA8\uCC3E\uAE30',
      onclick: function (e) { e.stopPropagation(); toggleFavorite(w.id); render(); }
    }, [isFav ? '\u2691' : '\u2690']);

    var bodyChildren = [h('div', { class: 'word-list-word' }, [w.word])];
    if (revealed && w.meaning) {
      bodyChildren.push(h('div', { class: 'word-list-meaning' }, [w.meaning]));
    }

    var body = h('div', {
      class: 'word-list-body',
      onclick: function () { wordsListRevealed[w.id] = !revealed; render(); }
    }, bodyChildren);

    var status = h('div', { class: 'word-list-status' + (isMastered ? ' mastered' : '') }, [
      isMastered ? '\u2713 \uC554\uAE30\uC644\uB8CC' : ''
    ]);

    return h('div', { class: 'word-list-item' + (isMastered ? ' checked' : '') }, [bookmarkBtn, body, status]);
  }

  function judgeWord(wordId, known) {
    var prog = dayProgress(state.currentDay);
    if (prog.studied.indexOf(wordId) === -1) prog.studied.push(wordId);
    prog.known = prog.known.filter(function (id) { return id !== wordId; });
    prog.unknown = prog.unknown.filter(function (id) { return id !== wordId; });
    (known ? prog.known : prog.unknown).push(wordId);

    if (prog.studied.length >= WORDS_PER_DAY) {
      markStudyLogToday();
    }
    saveState();
  }

  function advanceCard(len) {
    wordsRevealed = false;
    if (wordsCardIndex < len - 1) wordsCardIndex++;
    render();
  }

  function toggleFavorite(wordId) {
    var idx = state.favorites.indexOf(wordId);
    if (idx === -1) state.favorites.push(wordId);
    else state.favorites.splice(idx, 1);
    saveState();
  }

  /* ============================================================
     QUIZ
  ============================================================ */
  var quizSession = null; // { day, count, questions:[{wordId, choices:[{text,correct}], answered, selectedIdx}], index, score }
  var quizSelectedCount = 10;

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function buildQuizQuestions(day, count) {
    var pool = wordsOfDay(day);
    var picked = shuffle(pool).slice(0, Math.min(count, pool.length));
    return picked.map(function (w) {
      var distractPool = pool.filter(function (x) { return x.id !== w.id; });
      var distractors = shuffle(distractPool).slice(0, 3).map(function (x) { return x.meaning; });
      var choices = shuffle([w.meaning].concat(distractors)).map(function (m) {
        return { text: m, correct: m === w.meaning };
      });
      // guard against duplicate meaning strings colliding with correct flag on more than one
      var correctSeen = false;
      choices.forEach(function (c) {
        if (c.correct) {
          if (correctSeen) c.correct = false;
          correctSeen = true;
        }
      });
      return { wordId: w.id, word: w.word, choices: choices, answered: false, selectedIdx: null, passed: false };
    });
  }

  function renderQuiz() {
    var wrap = h('div', {}, []);

    if (!quizSession) {
      wrap.appendChild(buildDayRail(function () { render(); }));

      var day = state.currentDay;
      var poolSize = wordsOfDay(day).length;
      var options = [10, 20, poolSize].filter(function (v, i, arr) { return v <= poolSize && arr.indexOf(v) === i; });

      var setupCard = h('div', { class: 'quiz-setup-card' }, [
        text('div', 'quiz-setup-title', 'DAY ' + String(day).padStart(2, '0') + ' \uD034\uC988'),
        text('div', 'quiz-setup-sub', '\uC601\uB2E8\uC5B4\uB97C \uBCF4\uACE0 \uC54C\uB9DE\uC740 \uB73B\uC744 4\uC9C0\uC120\uB2E4\uC5D0\uC11C \uACE0\uB974\uC138\uC694. \uD2C0\uB9B0 \uBB38\uC81C\uB294 \uC624\uB2F5\uB178\uD2B8\uC5D0 \uC790\uB3D9 \uC800\uC7A5\uB429\uB2C8\uB2E4.'),
        h('div', { class: 'count-options' }, options.map(function (n) {
          return h('button', {
            class: 'count-opt' + (n === quizSelectedCount ? ' selected' : ''),
            type: 'button',
            onclick: function () { quizSelectedCount = n; render(); }
          }, [n + '\uBB38\uD56D']);
        })),
        h('button', {
          class: 'btn-primary-full', type: 'button',
          onclick: function () {
            quizSession = { day: day, questions: buildQuizQuestions(day, quizSelectedCount), index: 0, score: 0 };
            render();
          }
        }, ['\uD034\uC988 \uC2DC\uC791'])
      ]);
      wrap.appendChild(setupCard);

      var prevScore = state.quizScores[day];
      if (prevScore) {
        wrap.appendChild(h('div', { class: 'plain-card' }, [
          text('div', 'section-title', '\uCD5C\uADFC \uAE30\uB85D'),
          text('div', 'settings-row-desc', '\uCD5C\uACE0 ' + prevScore.best + '/' + prevScore.total + ' \u00B7 \uCD5C\uADFC ' + prevScore.last + '/' + prevScore.total + ' \u00B7 \uC2DC\uB3C4 ' + prevScore.attempts + '\uD68C')
        ]));
      }
      return wrap;
    }

    if (quizSession.index >= quizSession.questions.length) {
      return renderQuizResult();
    }

    var q = quizSession.questions[quizSession.index];

    wrap.appendChild(h('div', { class: 'quiz-progress-row' }, [
      h('span', {}, ['DAY ' + String(quizSession.day).padStart(2, '0')]),
      h('span', {}, [(quizSession.index + 1) + ' / ' + quizSession.questions.length]),
      h('span', {}, ['\uC810\uC218 ' + quizSession.score])
    ]));

    wrap.appendChild(h('div', { class: 'quiz-q-word' }, [q.word]));

    var marks = ['A', 'B', 'C', 'D'];
    var choicesWrap = h('div', { class: 'quiz-choices' }, []);
    q.choices.forEach(function (c, idx) {
      var cls = 'quiz-choice';
      if (q.answered) {
        cls += ' disabled';
        if (c.correct) cls += ' correct';
        else if (idx === q.selectedIdx) cls += ' incorrect';
      }
      choicesWrap.appendChild(h('button', {
        class: cls, type: 'button',
        onclick: function () {
          if (q.answered) return;
          q.answered = true;
          q.selectedIdx = idx;
          if (c.correct) {
            quizSession.score++;
            markQuizMastered(q.wordId);
          } else {
            registerWrongNote(q.wordId);
          }
          render();
        }
      }, [
        h('span', { class: 'mark' }, [marks[idx]]),
        c.text
      ]));
    });
    wrap.appendChild(choicesWrap);

    if (!q.answered) {
      wrap.appendChild(h('button', {
        class: 'btn-ghost-full quiz-pass-btn', type: 'button',
        onclick: function () {
          if (q.answered) return;
          q.answered = true;
          q.passed = true;
          q.selectedIdx = null;
          registerWrongNote(q.wordId);
          render();
        }
      }, ['\uBAA8\uB974\uACA0\uC5B4\uC694 (PASS)']));
    }

    if (q.answered) {
      var correctChoice = q.choices.filter(function (c) { return c.correct; })[0];
      var wasRight = !q.passed && q.choices[q.selectedIdx] && q.choices[q.selectedIdx].correct;
      var feedbackCls = wasRight ? 'right' : (q.passed ? 'passed' : 'wrong');
      wrap.appendChild(h('div', { class: 'quiz-feedback ' + feedbackCls }, [
        wasRight ? '\uC815\uB2F5\uC785\uB2C8\uB2E4.' : (q.passed ? ('\uD328\uC2A4\uD588\uC5B4\uC694. \uC815\uB2F5: ' + correctChoice.text) : ('\uC624\uB2F5\uC785\uB2C8\uB2E4. \uC815\uB2F5: ' + correctChoice.text))
      ]));
      wrap.appendChild(h('button', {
        class: 'btn-primary-full', type: 'button',
        onclick: function () {
          quizSession.index++;
          render();
        }
      }, [quizSession.index === quizSession.questions.length - 1 ? '\uACB0\uACFC \uBCF4\uAE30' : '\uB2E4\uC74C \uBB38\uC81C']));
    }

    return wrap;
  }

  function registerWrongNote(wordId) {
    var entry = state.wrongNotes[wordId];
    if (!entry) entry = { count: 0, lastAt: '' };
    entry.count++;
    entry.lastAt = todayStr();
    state.wrongNotes[wordId] = entry;
    state.quizMastered = state.quizMastered.filter(function (id) { return id !== wordId; });
    saveState();
  }

  function markQuizMastered(wordId) {
    if (state.quizMastered.indexOf(wordId) === -1) state.quizMastered.push(wordId);
    delete state.wrongNotes[wordId];
    saveState();
  }

  function renderQuizResult() {
    var wrap = h('div', {}, []);
    var day = quizSession.day;
    var total = quizSession.questions.length;
    var score = quizSession.score;

    var prev = state.quizScores[day];
    var best = prev ? Math.max(prev.best, score) : score;
    var attempts = prev ? prev.attempts + 1 : 1;
    state.quizScores[day] = { best: best, last: score, attempts: attempts, lastAt: todayStr(), total: total };
    saveState();

    var pct = Math.round(score / total * 100);
    wrap.appendChild(h('div', { class: 'quiz-result-hero' }, [
      h('div', { class: 'quiz-result-score' }, [String(score), h('span', { class: 'max' }, [' / ' + total])]),
      text('div', 'quiz-result-label', pct >= 80 ? '\uC774\uBC88 \uC2DC\uC998, \uAE68\uB057\uD558\uAC8C \uC18C\uD654\uD588\uC5B4\uC694' : (pct >= 50 ? '\uC808\uBC18\uC740 \uB0B4 \uAC83\uC774 \uB410\uC5B4\uC694' : '\uC624\uB2F5\uB178\uD2B8\uB85C \uB2E4\uC2DC \uBCF5\uC2B5\uD574\uBCFC\uAE4C\uC694'))
    ]));

    wrap.appendChild(text('div', 'section-title', '\uBB38\uD56D \uB2E4\uC2DC\uBCF4\uAE30'));
    wrap.appendChild(h('div', { style: 'height:8px' }, []));
    quizSession.questions.forEach(function (q, i) {
      var wasRight = !q.passed && q.choices[q.selectedIdx] && q.choices[q.selectedIdx].correct;
      var correctChoice = q.choices.filter(function (c) { return c.correct; })[0];
      var children = [
        h('div', { class: 'rw' }, [(i + 1) + '. ' + q.word])
      ];
      if (!wasRight) {
        var yourAnsText = q.passed ? 'PASS(\uB118\uAE40)' : (q.choices[q.selectedIdx] ? q.choices[q.selectedIdx].text : '\uBBF8\uC751\uB2F5');
        children.push(h('div', { class: 'your-ans' }, ['\uB0B4 \uB2F5: ' + yourAnsText]));
        children.push(h('div', { class: 'correct-ans' }, ['\uC815\uB2F5: ' + correctChoice.text]));
      } else {
        children.push(h('div', { class: 'correct-ans' }, [correctChoice.text]));
      }
      wrap.appendChild(h('div', { class: 'quiz-review-item ' + (wasRight ? 'right' : 'wrong') }, children));
    });

    wrap.appendChild(h('button', {
      class: 'btn-primary-full', type: 'button',
      onclick: function () {
        quizSession = null;
        render();
      }
    }, ['\uB2E4\uC2DC \uD034\uC988 \uC124\uC815']));

    wrap.appendChild(h('a', { class: 'btn-ghost-full', href: '#/', style: 'display:block;text-align:center;text-decoration:none;box-sizing:border-box' }, ['\uD648\uC73C\uB85C']));

    return wrap;
  }

  /* ============================================================
     NOTES
  ============================================================ */
  var notesTab = 'wrong'; // 'wrong' | 'fav'
  var notesDayFilter = 'all'; // 'all' | day number

  function renderNotes() {
    var wrap = h('div', {}, []);

    wrap.appendChild(h('div', { class: 'tab-row' }, [
      h('button', {
        class: 'tab-btn' + (notesTab === 'wrong' ? ' active' : ''),
        type: 'button',
        onclick: function () { notesTab = 'wrong'; render(); }
      }, ['\uC624\uB2F5\uB178\uD2B8']),
      h('button', {
        class: 'tab-btn' + (notesTab === 'fav' ? ' active' : ''),
        type: 'button',
        onclick: function () { notesTab = 'fav'; render(); }
      }, ['\uC990\uACA8\uCC3E\uAE30'])
    ]));

    var allIds = notesTab === 'wrong' ? Object.keys(state.wrongNotes).map(Number) : state.favorites.slice();
    var allWords = allIds.map(function (id) { return byId[id]; }).filter(Boolean);

    // day filter chip row — built from the days that actually appear in this list
    var dayCounts = {};
    allWords.forEach(function (w) { dayCounts[w.day] = (dayCounts[w.day] || 0) + 1; });
    var daysPresent = Object.keys(dayCounts).map(Number).sort(function (a, b) { return a - b; });

    if (notesDayFilter !== 'all' && dayCounts[notesDayFilter] === undefined) {
      notesDayFilter = 'all';
    }

    if (daysPresent.length > 0) {
      var filterRail = h('div', { class: 'day-rail notes-day-filter' }, []);
      filterRail.appendChild(h('button', {
        class: 'day-chip' + (notesDayFilter === 'all' ? ' selected' : ''),
        type: 'button',
        onclick: function () { notesDayFilter = 'all'; render(); }
      }, [
        h('span', { class: 'lbl' }, ['\uC804\uCCB4']),
        h('span', { class: 'num' }, [String(allWords.length)])
      ]));
      daysPresent.forEach(function (day) {
        filterRail.appendChild(h('button', {
          class: 'day-chip' + (notesDayFilter === day ? ' selected' : ''),
          type: 'button',
          onclick: function () { notesDayFilter = day; render(); }
        }, [
          h('span', { class: 'lbl' }, ['DAY']),
          h('span', { class: 'num' }, [String(day).padStart(2, '0')])
        ]));
      });
      wrap.appendChild(filterRail);
    }

    var words = notesDayFilter === 'all' ? allWords : allWords.filter(function (w) { return w.day === notesDayFilter; });

    if (words.length === 0) {
      wrap.appendChild(h('div', { class: 'empty-state' }, [
        text('div', 'empty-title', notesTab === 'wrong' ? '\uC544\uC9C1 \uC624\uB2F5\uC774 \uC5C6\uC5B4\uC694' : '\uC990\uACA8\uCC3E\uC740 \uB2E8\uC5B4\uAC00 \uC5C6\uC5B4\uC694'),
        text('div', '', notesTab === 'wrong' ? '\uD034\uC988\uC5D0\uC11C \uD2C0\uB9B0 \uB2E8\uC5B4\uAC00 \uC5EC\uAE30\uC5D0 \uC790\uB3D9\uC73C\uB85C \uCC44\uC6CC\uC838\uC694.' : '\uB2E8\uC5B4 \uD559\uC2B5 \uCE74\uB4DC\uC5D0\uC11C \u2606\uB97C \uB20C\uB7EC \uCC44\uC6CC\uBCF4\uC138\uC694.')
      ]));
      return wrap;
    }

    words.sort(function (a, b) { return a.day - b.day || a.no - b.no; });

    var grouped = {};
    words.forEach(function (w) {
      if (!grouped[w.day]) grouped[w.day] = [];
      grouped[w.day].push(w);
    });

    Object.keys(grouped).sort(function (a, b) { return a - b; }).forEach(function (day) {
      wrap.appendChild(text('div', 'notes-day-group-title', 'DAY ' + String(day).padStart(2, '0')));
      grouped[day].forEach(function (w) {
        wrap.appendChild(buildNoteItem(w));
      });
    });

    return wrap;
  }

  function buildNoteItem(w) {
    var isFav = state.favorites.indexOf(w.id) !== -1;
    var wrongEntry = state.wrongNotes[w.id];

    var main = h('div', { class: 'note-item-main' }, [
      h('div', {}, [
        h('span', { class: 'note-item-word' }, [w.word]),
        h('span', { class: 'note-item-day' }, ['DAY ' + String(w.day).padStart(2, '0') + ' \u00B7 No.' + w.no])
      ]),
      h('div', { class: 'note-item-meaning' }, [w.meaning])
    ]);
    if (wrongEntry) {
      main.appendChild(h('div', { class: 'note-item-wrong-count' }, ['\uD2C0\uB9B0 \uD69F\uC218 ' + wrongEntry.count + '\uD68C']));
    }

    var actions = h('div', { class: 'note-item-actions' }, [
      h('button', {
        class: 'note-action-btn', type: 'button', title: '\uC990\uACA8\uCC3E\uAE30',
        onclick: function () { toggleFavorite(w.id); render(); }
      }, [isFav ? '\u2605' : '\u2606'])
    ]);

    if (notesTab === 'wrong') {
      actions.appendChild(h('button', {
        class: 'note-action-btn', type: 'button', title: '\uBCF5\uC2B5 \uC644\uB8CC',
        onclick: function () {
          delete state.wrongNotes[w.id];
          saveState();
          render();
          showToast('\uC624\uB2F5\uB178\uD2B8\uC5D0\uC11C \uC81C\uAC70\uB418\uC5C8\uC5B4\uC694');
        }
      }, ['\u2713']));
    }

    return h('div', { class: 'note-item' }, [main, actions]);
  }

  /* ============================================================
     SETTINGS
  ============================================================ */
  function renderSettings() {
    var wrap = h('div', {}, []);

    wrap.appendChild(h('div', { class: 'settings-group' }, [
      text('div', 'settings-group-title', '\uB370\uC774\uD130 \uAD00\uB9AC'),
      buildSettingsRow('\uD559\uC2B5 \uC9C4\uD589\uB960 \uCD08\uAE30\uD654', 'DAY\uBCC4 \uB2E8\uC5B4 \uD559\uC2B5 \uAE30\uB85D\uACFC \uC5F0\uC18D\uD559\uC2B5\uC744 \uCD08\uAE30\uD654\uD574\uC694.', function () {
        if (confirm('\uD559\uC2B5 \uC9C4\uD589\uB960\uACFC \uC5F0\uC18D\uD559\uC2B5 \uAE30\uB85D\uC744 \uBAA8\uB450 \uCD08\uAE30\uD654\uD560\uAE4C\uC694?')) {
          state.progress = {};
          state.studyLog = [];
          saveState();
          render();
          showToast('\uD559\uC2B5 \uC9C4\uD589\uB960\uC774 \uCD08\uAE30\uD654\uB418\uC5C8\uC5B4\uC694');
        }
      }),
      buildSettingsRow('\uD034\uC988 \uAE30\uB85D \uCD08\uAE30\uD654', 'DAY\uBCC4 \uCD5C\uACE0/\uCD5C\uADFC \uD034\uC988 \uC810\uC218\uB97C \uCD08\uAE30\uD654\uD574\uC694.', function () {
        if (confirm('\uD034\uC988 \uC810\uC218 \uAE30\uB85D\uC744 \uCD08\uAE30\uD654\uD560\uAE4C\uC694?')) {
          state.quizScores = {};
          saveState();
          render();
          showToast('\uD034\uC988 \uAE30\uB85D\uC774 \uCD08\uAE30\uD654\uB418\uC5C8\uC5B4\uC694');
        }
      }),
      buildSettingsRow('\uC624\uB2F5\uB178\uD2B8 \uBE44\uC6B0\uAE30', '\uC800\uC7A5\uB41C \uC624\uB2F5 \uAE30\uB85D\uC744 \uBAA8\uB450 \uC0AD\uC81C\uD574\uC694.', function () {
        if (confirm('\uC624\uB2F5\uB178\uD2B8\uB97C \uBE44\uC6B8\uAE4C\uC694?')) {
          state.wrongNotes = {};
          saveState();
          render();
          showToast('\uC624\uB2F5\uB178\uD2B8\uAC00 \uBE44\uC6CC\uC84C\uC5B4\uC694');
        }
      }),
      buildSettingsRow('\uC990\uACA8\uCC3E\uAE30 \uBE44\uC6B0\uAE30', '\uBCC4\uD45C\uC2DC\uD55C \uB2E8\uC5B4\uB97C \uBAA8\uB450 \uD574\uC81C\uD574\uC694.', function () {
        if (confirm('\uC990\uACA8\uCC3E\uAE30\uB97C \uBAA8\uB450 \uBE44\uC6B8\uAE4C\uC694?')) {
          state.favorites = [];
          saveState();
          render();
          showToast('\uC990\uACA8\uCC3E\uAE30\uAC00 \uBE44\uC6CC\uC84C\uC5B4\uC694');
        }
      })
    ]));

    wrap.appendChild(h('div', { class: 'settings-group' }, [
      text('div', 'settings-group-title', '\uC804\uCCB4 \uCD08\uAE30\uD654'),
      h('div', { class: 'settings-row' }, [
        h('div', { class: 'settings-row-text' }, [
          text('div', 'settings-row-title', '\uBAA8\uB4E0 \uB370\uC774\uD130 \uCD08\uAE30\uD654'),
          text('div', 'settings-row-desc', '\uD559\uC2B5 \uAE30\uB85D, \uD034\uC988 \uC810\uC218, \uC624\uB2F5\uB178\uD2B8, \uC990\uACA8\uCC3E\uAE30\uB97C \uBAA8\uB450 \uC0AD\uC81C\uD574\uC694. \uB418\uB3CC\uB9B4 \uC218 \uC5C6\uC5B4\uC694.')
        ]),
        h('button', {
          class: 'settings-btn', type: 'button',
          onclick: function () {
            if (confirm('\uC815\uB9D0\uB85C \uBAA8\uB4E0 \uB370\uC774\uD130\uB97C \uCD08\uAE30\uD654\uD560\uAE4C\uC694? \uC774 \uC791\uC5C5\uC740 \uB418\uB3CC\uB9B4 \uC218 \uC5C6\uC5B4\uC694.')) {
              state = defaultState();
              saveState();
              location.hash = '#/';
              render();
              showToast('\uBAA8\uB4E0 \uB370\uC774\uD130\uAC00 \uCD08\uAE30\uD654\uB418\uC5C8\uC5B4\uC694');
            }
          }
        }, ['\uCD08\uAE30\uD654'])
      ])
    ]));

    wrap.appendChild(h('div', { class: 'settings-group' }, [
      text('div', 'settings-group-title', '\uC815\uBCF4'),
      h('div', { class: 'about-block' }, [
        h('div', {}, ['VOCAVOCA \u00B7 \uB9E4\uC77C \uB2E8\uC5B4 \uD559\uC2B5\uACFC \uD034\uC988\uB85C \uC644\uC131\uD558\uB294 \uC5B4\uD718 \uCEEC\uB809\uC158']),
        h('div', {}, ['\uCD1D ' + VOCAB_DATA.length + '\uB2E8\uC5B4 \u00B7 ' + TOTAL_DAYS + '\uAC1C DAY \u00B7 DAY\uB2F9 ' + WORDS_PER_DAY + '\uB2E8\uC5B4']),
        h('div', {}, ['\uBAA8\uB4E0 \uB370\uC774\uD130\uB294 \uC774 \uAE30\uAE30\uC758 \uBE0C\uB77C\uC6B0\uC800\uC5D0\uB9CC \uC800\uC7A5\uB418\uBA70, \uC11C\uBC84\uB85C \uC804\uC1A1\uB418\uC9C0 \uC54A\uC544\uC694.'])
      ])
    ]));

    return wrap;
  }

  function buildSettingsRow(title, desc, onClick) {
    return h('div', { class: 'settings-row' }, [
      h('div', { class: 'settings-row-text' }, [
        text('div', 'settings-row-title', title),
        text('div', 'settings-row-desc', desc)
      ]),
      h('button', { class: 'settings-btn neutral', type: 'button', onclick: onClick }, ['\uCD08\uAE30\uD654'])
    ]);
  }

  /* ---------------------------------------------------------
     boot
  --------------------------------------------------------- */
  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* ignore */ });
    });
  }
})();



