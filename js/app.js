(() => {
  "use strict";

  /* ---------------------------------------------------------------------
   * Data + state
   * ------------------------------------------------------------------- */

  const DATASETS = { "2025": window.CIVICS_2025, "2020": window.CIVICS_2020 };
  const STORAGE_KEY = "citizenship-app-state-v1";
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function defaultState() {
    return {
      version: "2025",
      theme: null, // null = follow system
      favorites: { "2025": [], "2020": [] },
      studied: { "2025": [], "2020": [] },
      testHistory: [],
      bestScore: { "2025": null, "2020": null }
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const base = defaultState();
      return {
        ...base,
        ...parsed,
        favorites: { ...base.favorites, ...(parsed.favorites || {}) },
        studied: { ...base.studied, ...(parsed.studied || {}) },
        bestScore: { ...base.bestScore, ...(parsed.bestScore || {}) }
      };
    } catch (e) {
      return defaultState();
    }
  }

  let state = loadState();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* localStorage unavailable (private mode, quota) — app still works, just won't persist */
    }
  }

  function dataset() {
    return DATASETS[state.version];
  }

  function allQuestions() {
    return dataset().questions;
  }

  function favoriteIds() {
    return state.favorites[state.version];
  }

  function isFavorite(id) {
    return favoriteIds().includes(id);
  }

  function toggleFavoriteId(id) {
    const list = favoriteIds();
    const idx = list.indexOf(id);
    if (idx === -1) {
      list.push(id);
      showToast("Added to favorites");
    } else {
      list.splice(idx, 1);
      showToast("Removed from favorites");
    }
    saveState();
  }

  function markStudied(id) {
    const list = state.studied[state.version];
    if (!list.includes(id)) {
      list.push(id);
      saveState();
    }
  }

  /* ---------------------------------------------------------------------
   * Toast
   * ------------------------------------------------------------------- */

  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), 1800);
  }

  /* ---------------------------------------------------------------------
   * Theme
   * ------------------------------------------------------------------- */

  function applyTheme() {
    const root = document.documentElement;
    if (state.theme === "dark") root.setAttribute("data-theme", "dark");
    else if (state.theme === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
  }

  function toggleTheme() {
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const currentlyDark = state.theme ? state.theme === "dark" : systemDark;
    state.theme = currentlyDark ? "light" : "dark";
    applyTheme();
    saveState();
  }

  if (prefersReducedMotion) document.documentElement.classList.add("reduce-motion");

  /* ---------------------------------------------------------------------
   * Routing
   * ------------------------------------------------------------------- */

  const ROUTES = ["home", "study", "practice", "favorites", "categories", "progress", "search"];
  let currentRoute = "home";

  function navigate(route, opts) {
    opts = opts || {};
    if (!ROUTES.includes(route)) route = "home";
    currentRoute = route;
    document.querySelectorAll(".view").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.view === route);
    });
    document.querySelectorAll(".nav-link").forEach((el) => {
      if (el.dataset.route === route) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
    closeMobileMenu();
    if (route === "study" && !opts.keepDeck) buildStudyDeck({});
    if (route === "categories") renderCategories();
    if (route === "favorites") renderFavorites();
    if (route === "progress") renderProgress();
    if (route === "practice") resetPracticeSetup();
    if (route === "home") renderHome();
    if (route === "search") document.getElementById("search-input").focus();
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }

  document.querySelectorAll("[data-route]").forEach((el) => {
    el.addEventListener("click", () => navigate(el.dataset.route));
  });

  /* ---------------------------------------------------------------------
   * Mobile menu
   * ------------------------------------------------------------------- */

  const mainNav = document.getElementById("main-nav");
  const menuToggle = document.getElementById("menu-toggle");
  function closeMobileMenu() {
    mainNav.classList.remove("mobile-open");
    menuToggle.setAttribute("aria-expanded", "false");
  }
  menuToggle.addEventListener("click", () => {
    const open = mainNav.classList.toggle("mobile-open");
    menuToggle.setAttribute("aria-expanded", String(open));
  });

  /* ---------------------------------------------------------------------
   * Version selector
   * ------------------------------------------------------------------- */

  function populateVersionSelect() {
    const select = document.getElementById("version-select-home");
    select.innerHTML = "";
    Object.values(DATASETS).forEach((ds) => {
      const opt = document.createElement("option");
      opt.value = ds.version;
      opt.textContent = `${ds.label} (${ds.totalQuestions} questions)`;
      if (ds.version === state.version) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", () => {
      state.version = select.value;
      saveState();
      renderHome();
      if (currentRoute === "study") buildStudyDeck({});
    });
  }

  function updateVersionBanner() {
    const ds = dataset();
    document.getElementById("version-summary").textContent = `${ds.label} · ${ds.totalQuestions} questions`;
    document.getElementById("official-link-home").href = ds.officialUrl;
    const select = document.getElementById("version-select-home");
    if (select.value !== state.version) select.value = state.version;
  }

  /* ---------------------------------------------------------------------
   * Home / stats
   * ------------------------------------------------------------------- */

  function computeStats() {
    const ds = dataset();
    const studiedCount = state.studied[state.version].length;
    const favCount = favoriteIds().length;
    const testsForVersion = state.testHistory.filter((t) => t.version === state.version);
    const best = state.bestScore[state.version];
    const progressPct = ds.totalQuestions ? Math.round((studiedCount / ds.totalQuestions) * 100) : 0;
    return {
      studiedCount,
      favCount,
      testsCount: testsForVersion.length,
      best,
      progressPct
    };
  }

  function renderHome() {
    updateVersionBanner();
    const s = computeStats();
    document.getElementById("stat-studied").textContent = s.studiedCount;
    document.getElementById("stat-favorites").textContent = s.favCount;
    document.getElementById("stat-tests").textContent = s.testsCount;
    document.getElementById("stat-best").textContent = s.best ? `${s.best.score}/${s.best.total}` : "—";
    document.getElementById("stat-progress").textContent = `${s.progressPct}%`;
  }

  function renderProgress() {
    const s = computeStats();
    document.getElementById("stat-studied-2").textContent = s.studiedCount;
    document.getElementById("stat-favorites-2").textContent = s.favCount;
    document.getElementById("stat-tests-2").textContent = s.testsCount;
    document.getElementById("stat-best-2").textContent = s.best ? `${s.best.score}/${s.best.total}` : "—";
    document.getElementById("stat-progress-2").textContent = `${s.progressPct}%`;

    const list = document.getElementById("test-history-list");
    const history = state.testHistory.slice().reverse().slice(0, 10);
    if (!history.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-emoji">🗒️</div><h3>No practice tests yet</h3><p>Take a practice test to see your history here.</p></div>`;
      return;
    }
    list.innerHTML = history.map((t) => {
      const date = new Date(t.date);
      const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      return `<div class="favorite-row">
        <div class="fav-num">${t.score}/${t.total}</div>
        <div class="fav-body">
          <div class="fav-q">${modeLabel(t.mode)} · ${DATASETS[t.version] ? DATASETS[t.version].label : t.version}</div>
          <div class="fav-a">${dateStr} · ${t.passed ? "Passed" : "Keep practicing"}</div>
        </div>
      </div>`;
    }).join("");
  }

  document.getElementById("reset-progress-btn").addEventListener("click", () => {
    if (!confirm("Reset all saved progress, favorites, and test history on this device?")) return;
    state = defaultState();
    saveState();
    applyTheme();
    renderHome();
    renderProgress();
    showToast("Progress reset");
  });

  function modeLabel(mode) {
    if (mode === "full") return "Full Practice Test";
    if (mode === "random20") return "Random 20";
    if (mode === "favorites") return "Favorites Test";
    return "Practice Test";
  }

  document.getElementById("home-shuffle-btn").addEventListener("click", () => {
    navigate("study");
    buildStudyDeck({ shuffle: true });
  });

  /* ---------------------------------------------------------------------
   * Study deck (shared engine for Study / Categories / Favorites study)
   * ------------------------------------------------------------------- */

  let studyDeck = [];
  let studyIndex = 0;
  let studyShuffled = false;
  let studyCategoryFilter = null;
  let studyFavoritesOnly = false;

  function buildStudyDeck(opts) {
    opts = opts || {};
    if (opts.category !== undefined) studyCategoryFilter = opts.category;
    if (opts.favoritesOnly !== undefined) studyFavoritesOnly = opts.favoritesOnly;
    if (opts.shuffle !== undefined) studyShuffled = opts.shuffle;

    let source = allQuestions();
    if (studyFavoritesOnly) source = source.filter((q) => isFavorite(q.id));
    if (studyCategoryFilter) source = source.filter((q) => q.category === studyCategoryFilter);

    studyDeck = source.slice();
    if (studyShuffled) shuffleArray(studyDeck);
    studyIndex = 0;

    document.getElementById("study-title").textContent = studyFavoritesOnly
      ? "Studying Favorites"
      : (studyCategoryFilter || "Study Questions");
    document.getElementById("study-subtitle").textContent = studyDeck.length
      ? `${dataset().label} · ${studyShuffled ? "Shuffled order" : "In order"}`
      : "No questions match this filter yet.";

    document.getElementById("study-shuffle-btn").classList.toggle("is-active", studyShuffled);
    document.getElementById("study-shuffle-btn").setAttribute("aria-pressed", String(studyShuffled));

    renderCategoryBar();
    renderStudyCard(true);
  }

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function renderCategoryBar() {
    const bar = document.getElementById("study-category-bar");
    const cats = uniqueCategories();
    bar.innerHTML = "";
    const allPill = makeCategoryPill("All questions", !studyCategoryFilter);
    allPill.addEventListener("click", () => buildStudyDeck({ category: null, favoritesOnly: false }));
    bar.appendChild(allPill);
    cats.forEach((cat) => {
      const pill = makeCategoryPill(cat, studyCategoryFilter === cat);
      pill.addEventListener("click", () => buildStudyDeck({ category: cat, favoritesOnly: false }));
      bar.appendChild(pill);
    });
  }

  function makeCategoryPill(label, active) {
    const btn = document.createElement("button");
    btn.className = "category-pill" + (active ? " is-active" : "");
    btn.textContent = label;
    return btn;
  }

  function uniqueCategories() {
    const set = new Set();
    allQuestions().forEach((q) => set.add(q.category));
    return Array.from(set);
  }

  const flashcardEl = document.getElementById("flashcard");
  const cardQuestionEl = document.getElementById("card-question");
  const cardAnswerEl = document.getElementById("card-answer");
  const cardAnswerListEl = document.getElementById("card-answer-list");
  const cardDynamicNoteEl = document.getElementById("card-dynamic-note");

  function renderStudyCard(resetFlip) {
    const total = studyDeck.length;
    document.getElementById("study-total").textContent = total || 0;

    if (!total) {
      document.getElementById("card-question").textContent = "No questions found.";
      document.getElementById("card-answer").textContent = "Try a different category or filter.";
      document.getElementById("study-position").textContent = 0;
      document.getElementById("study-percent").textContent = "0%";
      document.getElementById("study-progress-fill").style.width = "0%";
      document.getElementById("study-prev").disabled = true;
      document.getElementById("study-next").disabled = true;
      return;
    }

    document.getElementById("study-prev").disabled = false;
    document.getElementById("study-next").disabled = false;

    const q = studyDeck[studyIndex];
    document.getElementById("study-position").textContent = studyIndex + 1;
    const pct = Math.round(((studyIndex + 1) / total) * 100);
    document.getElementById("study-percent").textContent = `${pct}%`;
    document.getElementById("study-progress-fill").style.width = `${pct}%`;

    document.getElementById("card-index-front").textContent = `Question ${q.id}`;
    document.getElementById("card-index-back").textContent = `Question ${q.id}`;
    document.getElementById("card-category-front").textContent = q.category;
    cardQuestionEl.textContent = q.question;

    const primaryAnswer = q.answers[0] || "";
    if (q.dynamic) {
      cardAnswerEl.textContent = primaryAnswer || "Answer changes over time";
      cardAnswerListEl.classList.add("hidden");
      cardDynamicNoteEl.textContent = "⚠ " + (q.dynamicNote || "This answer may change. Verify the current office holder.");
      cardDynamicNoteEl.classList.remove("hidden");
    } else {
      cardAnswerEl.textContent = primaryAnswer;
      if (q.answers.length > 1) {
        cardAnswerListEl.textContent = "Also acceptable: " + q.answers.slice(1).join(" · ");
        cardAnswerListEl.classList.remove("hidden");
      } else {
        cardAnswerListEl.classList.add("hidden");
      }
      cardDynamicNoteEl.classList.add("hidden");
    }

    updateFavButtons(q.id);
    if (resetFlip) setCardFlipped(false);
    markStudied(q.id);
  }

  function updateFavButtons(id) {
    const fav = isFavorite(id);
    [document.getElementById("fav-btn-front"), document.getElementById("fav-btn-back")].forEach((btn) => {
      btn.classList.toggle("is-fav", fav);
      btn.setAttribute("aria-pressed", String(fav));
      btn.setAttribute("aria-label", fav ? "Remove from favorites" : "Add to favorites");
    });
  }

  function setCardFlipped(flipped) {
    flashcardEl.classList.toggle("is-flipped", flipped);
  }

  function flipStudyCard() {
    setCardFlipped(!flashcardEl.classList.contains("is-flipped"));
  }

  function studyNext() {
    if (!studyDeck.length) return;
    studyIndex = (studyIndex + 1) % studyDeck.length;
    renderStudyCard(true);
  }
  function studyPrev() {
    if (!studyDeck.length) return;
    studyIndex = (studyIndex - 1 + studyDeck.length) % studyDeck.length;
    renderStudyCard(true);
  }

  flashcardEl.addEventListener("click", flipStudyCard);
  flashcardEl.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); flipStudyCard(); }
  });
  document.getElementById("study-next").addEventListener("click", studyNext);
  document.getElementById("study-prev").addEventListener("click", studyPrev);
  document.getElementById("study-shuffle-btn").addEventListener("click", () => buildStudyDeck({ shuffle: !studyShuffled }));
  document.getElementById("study-restart-btn").addEventListener("click", () => buildStudyDeck({ shuffle: false, category: null, favoritesOnly: false }));

  [document.getElementById("fav-btn-front"), document.getElementById("fav-btn-back")].forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!studyDeck.length) return;
      toggleFavoriteId(studyDeck[studyIndex].id);
      updateFavButtons(studyDeck[studyIndex].id);
    });
  });

  document.getElementById("jump-btn").addEventListener("click", jumpToQuestion);
  document.getElementById("jump-input").addEventListener("keydown", (e) => { if (e.key === "Enter") jumpToQuestion(); });
  function jumpToQuestion() {
    const n = parseInt(document.getElementById("jump-input").value, 10);
    if (isNaN(n)) return;
    const idx = studyDeck.findIndex((q) => q.id === n);
    if (idx === -1) { showToast(`No question #${n} in this view`); return; }
    studyIndex = idx;
    renderStudyCard(true);
    document.getElementById("jump-input").value = "";
  }

  /* ---------------------------------------------------------------------
   * Keyboard shortcuts (global, only act while a card view is visible)
   * ------------------------------------------------------------------- */

  document.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea") return;

    if (currentRoute === "study") {
      if (e.key === "ArrowRight") { studyNext(); }
      else if (e.key === "ArrowLeft") { studyPrev(); }
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); flipStudyCard(); }
      else if (e.key.toLowerCase() === "f") { if (studyDeck.length) { toggleFavoriteId(studyDeck[studyIndex].id); updateFavButtons(studyDeck[studyIndex].id); } }
      else if (e.key.toLowerCase() === "s") { buildStudyDeck({ shuffle: !studyShuffled }); }
    } else if (currentRoute === "practice" && !document.getElementById("practice-active-screen").classList.contains("hidden")) {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); flipPracticeCard(); }
    }
  });

  /* ---------------------------------------------------------------------
   * Swipe gestures (study card) — horizontal swipe only, doesn't block scroll
   * ------------------------------------------------------------------- */

  function addSwipeHandling(sceneEl, onSwipeLeft, onSwipeRight) {
    let startX = 0, startY = 0, tracking = false, horizontal = false;
    sceneEl.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY; tracking = true; horizontal = false;
    }, { passive: true });
    sceneEl.addEventListener("touchmove", (e) => {
      if (!tracking) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (!horizontal && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) horizontal = true;
      if (horizontal) e.preventDefault();
    }, { passive: false });
    sceneEl.addEventListener("touchend", (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      if (horizontal && Math.abs(dx) > 55) {
        if (dx < 0) onSwipeLeft(); else onSwipeRight();
      }
    });
  }

  addSwipeHandling(document.querySelector("#view-study .flashcard-scene"), studyNext, studyPrev);

  /* ---------------------------------------------------------------------
   * Categories view
   * ------------------------------------------------------------------- */

  function renderCategories() {
    const grid = document.getElementById("categories-grid");
    const cats = uniqueCategories();
    grid.innerHTML = "";
    cats.forEach((cat) => {
      const qs = allQuestions().filter((q) => q.category === cat);
      const studiedInCat = qs.filter((q) => state.studied[state.version].includes(q.id)).length;
      const pct = qs.length ? Math.round((studiedInCat / qs.length) * 100) : 0;
      const card = document.createElement("button");
      card.className = "category-card";
      card.innerHTML = `
        <h3>${cat}</h3>
        <div class="cat-count">${qs.length} question${qs.length === 1 ? "" : "s"} · ${pct}% studied</div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      `;
      card.addEventListener("click", () => {
        navigate("study", { keepDeck: true });
        buildStudyDeck({ category: cat, favoritesOnly: false, shuffle: false });
      });
      grid.appendChild(card);
    });
  }

  /* ---------------------------------------------------------------------
   * Favorites view
   * ------------------------------------------------------------------- */

  function renderFavorites() {
    const ids = favoriteIds();
    document.getElementById("favorites-count").textContent = ids.length;
    document.getElementById("mode-fav-meta").textContent = `${ids.length} favorite${ids.length === 1 ? "" : "s"} saved`;
    const content = document.getElementById("favorites-content");
    const studyBtn = document.getElementById("favorites-study-btn");
    const testBtn = document.getElementById("favorites-test-btn");
    studyBtn.disabled = ids.length === 0;
    testBtn.disabled = ids.length < 4;

    if (!ids.length) {
      content.innerHTML = `<div class="empty-state">
        <div class="empty-emoji">⭐</div>
        <h3>No favorites yet</h3>
        <p>Tap the star on any flashcard while studying to save it here for quick review later.</p>
      </div>`;
      return;
    }

    const qs = allQuestions().filter((q) => ids.includes(q.id));
    content.innerHTML = `<div class="favorites-list">${qs.map((q) => `
      <div class="favorite-row">
        <div class="fav-num">#${q.id}</div>
        <div class="fav-body">
          <div class="fav-q">${escapeHtml(q.question)}</div>
          <div class="fav-a">${escapeHtml(q.dynamic ? (q.dynamicNote || "Answer may change.") : q.answers[0])}</div>
        </div>
        <div class="fav-actions">
          <button class="icon-btn" data-remove="${q.id}" aria-label="Remove from favorites" title="Remove">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>`).join("")}</div>`;

    content.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        toggleFavoriteId(parseInt(btn.dataset.remove, 10));
        renderFavorites();
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
  }

  document.getElementById("favorites-study-btn").addEventListener("click", () => {
    navigate("study", { keepDeck: true });
    buildStudyDeck({ favoritesOnly: true, category: null, shuffle: false });
  });
  document.getElementById("favorites-test-btn").addEventListener("click", () => {
    navigate("practice");
    startPracticeTest("favorites");
  });

  /* ---------------------------------------------------------------------
   * Search
   * ------------------------------------------------------------------- */

  const searchInput = document.getElementById("search-input");
  const searchResults = document.getElementById("search-results");
  const searchToggle = document.getElementById("search-toggle");
  searchToggle.addEventListener("click", () => navigate("search"));

  function runSearch(term) {
    const clearBtn = document.getElementById("search-clear-btn");
    clearBtn.parentElement.classList.toggle("has-value", !!term);
    if (!term.trim()) {
      searchResults.innerHTML = "";
      return;
    }
    const t = term.trim().toLowerCase();
    const matches = allQuestions().filter((q) =>
      q.question.toLowerCase().includes(t) ||
      q.category.toLowerCase().includes(t) ||
      q.answers.some((a) => a.toLowerCase().includes(t))
    );
    if (!matches.length) {
      searchResults.innerHTML = `<div class="empty-state"><div class="empty-emoji">🔍</div><h3>No matches</h3><p>Try a different word.</p></div>`;
      return;
    }
    searchResults.innerHTML = matches.map((q) => `
      <button class="search-result-item" data-goto="${q.id}">
        <div class="sr-q">#${q.id} · ${escapeHtml(q.question)}</div>
        <div class="sr-a">${escapeHtml(q.dynamic ? (q.dynamicNote || "Answer may change.") : q.answers[0])}</div>
        <div class="sr-meta">${escapeHtml(q.category)}</div>
      </button>`).join("");
    searchResults.querySelectorAll("[data-goto]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.dataset.goto, 10);
        navigate("study", { keepDeck: true });
        buildStudyDeck({ category: null, favoritesOnly: false, shuffle: false });
        const idx = studyDeck.findIndex((q) => q.id === id);
        if (idx !== -1) { studyIndex = idx; renderStudyCard(true); }
      });
    });
  }

  searchInput.addEventListener("input", () => runSearch(searchInput.value));
  document.getElementById("search-clear-btn").addEventListener("click", () => {
    searchInput.value = "";
    runSearch("");
    searchInput.focus();
  });

  /* ---------------------------------------------------------------------
   * Practice test
   * ------------------------------------------------------------------- */

  let practiceQuestions = [];
  let practiceIndex = 0;
  let practiceScore = 0;
  let practiceAnswers = []; // { question, correct }
  let practiceMode = "full";

  function resetPracticeSetup() {
    document.getElementById("practice-setup-screen").classList.remove("hidden");
    document.getElementById("practice-active-screen").classList.add("hidden");
    document.getElementById("practice-results-screen").classList.add("hidden");
    const ds = dataset();
    document.getElementById("mode-full-count").textContent = ds.testQuestionCount;
    document.getElementById("mode-full-meta").textContent = `Need ${ds.passingScore}/${ds.testQuestionCount} to pass`;
    document.getElementById("mode-fav-meta").textContent = `${favoriteIds().length} favorite${favoriteIds().length === 1 ? "" : "s"} saved`;
  }

  document.querySelectorAll(".practice-mode-card").forEach((btn) => {
    btn.addEventListener("click", () => startPracticeTest(btn.dataset.mode));
  });

  function startPracticeTest(mode) {
    const ds = dataset();
    let pool = allQuestions();
    let count = ds.testQuestionCount;

    if (mode === "favorites") {
      pool = pool.filter((q) => isFavorite(q.id));
      if (pool.length < 4) { showToast("Save at least 4 favorites first"); return; }
      count = Math.min(pool.length, 20);
    } else if (mode === "random20") {
      count = Math.min(20, pool.length);
    } else {
      mode = "full";
      count = Math.min(ds.testQuestionCount, pool.length);
    }

    practiceMode = mode;
    practiceQuestions = shuffleArray(pool.slice()).slice(0, count);
    practiceIndex = 0;
    practiceScore = 0;
    practiceAnswers = [];

    document.getElementById("practice-setup-screen").classList.add("hidden");
    document.getElementById("practice-results-screen").classList.add("hidden");
    document.getElementById("practice-active-screen").classList.remove("hidden");
    document.getElementById("practice-total").textContent = practiceQuestions.length;
    renderPracticeCard();
  }

  function renderPracticeCard() {
    const q = practiceQuestions[practiceIndex];
    document.getElementById("practice-flashcard").classList.remove("is-flipped");
    document.getElementById("practice-position").textContent = `Question ${practiceIndex + 1} of ${practiceQuestions.length}`;
    document.getElementById("practice-score").textContent = practiceScore;
    const pct = Math.round((practiceIndex / practiceQuestions.length) * 100);
    document.getElementById("practice-progress-fill").style.width = `${pct}%`;

    document.getElementById("practice-index-front").textContent = `Question ${q.id}`;
    document.getElementById("practice-index-back").textContent = `Question ${q.id}`;
    document.getElementById("practice-category-front").textContent = q.category;
    document.getElementById("practice-question").textContent = q.question;
    document.getElementById("practice-answer").textContent = q.answers[0] || "Answer changes over time";
    const noteEl = document.getElementById("practice-dynamic-note");
    if (q.dynamic) {
      noteEl.textContent = "⚠ " + (q.dynamicNote || "This answer may change.");
      noteEl.classList.remove("hidden");
    } else {
      noteEl.classList.add("hidden");
    }
  }

  function flipPracticeCard() {
    document.getElementById("practice-flashcard").classList.toggle("is-flipped");
  }
  document.getElementById("practice-flashcard").addEventListener("click", flipPracticeCard);
  document.getElementById("practice-flashcard").addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); flipPracticeCard(); }
  });

  function answerPractice(correct) {
    const q = practiceQuestions[practiceIndex];
    practiceAnswers.push({ question: q, correct });
    if (correct) practiceScore++;
    if (practiceIndex < practiceQuestions.length - 1) {
      practiceIndex++;
      renderPracticeCard();
    } else {
      finishPracticeTest();
    }
  }
  document.getElementById("practice-correct-btn").addEventListener("click", () => answerPractice(true));
  document.getElementById("practice-incorrect-btn").addEventListener("click", () => answerPractice(false));
  document.getElementById("practice-quit-btn").addEventListener("click", () => {
    if (confirm("Quit this practice test? Your progress won't be saved.")) resetPracticeSetup();
  });

  function finishPracticeTest() {
    const ds = dataset();
    const total = practiceQuestions.length;
    const passingRatio = ds.passingScore / ds.testQuestionCount;
    const passed = practiceScore >= Math.ceil(total * passingRatio) || practiceScore >= ds.passingScore;
    const pct = Math.round((practiceScore / total) * 100);

    document.getElementById("practice-active-screen").classList.add("hidden");
    document.getElementById("practice-results-screen").classList.remove("hidden");
    document.getElementById("result-score").textContent = `${practiceScore} / ${total}`;
    document.getElementById("result-percent").textContent = `${pct}%`;
    const badge = document.getElementById("result-badge");
    badge.textContent = passed ? "PASS" : "KEEP PRACTICING";
    badge.className = "result-badge " + (passed ? "pass" : "fail");
    document.getElementById("result-review-list").classList.add("hidden");
    document.getElementById("result-review-btn").textContent = "Review Missed Questions";

    const record = {
      date: Date.now(),
      version: state.version,
      mode: practiceMode,
      score: practiceScore,
      total,
      passed
    };
    state.testHistory.push(record);
    const best = state.bestScore[state.version];
    if (!best || (practiceScore / total) > (best.score / best.total)) {
      state.bestScore[state.version] = { score: practiceScore, total };
    }
    saveState();
  }

  document.getElementById("result-retry-btn").addEventListener("click", () => startPracticeTest(practiceMode));
  document.getElementById("result-review-btn").addEventListener("click", () => {
    const list = document.getElementById("result-review-list");
    if (!list.classList.contains("hidden")) { list.classList.add("hidden"); return; }
    const missed = practiceAnswers.filter((a) => !a.correct);
    if (!missed.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-emoji">🎉</div><h3>Perfect run</h3><p>No missed questions to review.</p></div>`;
    } else {
      list.innerHTML = missed.map((a) => `
        <div class="review-row wrong">
          <span class="review-mark">✕</span>
          <div>
            <div class="review-q">#${a.question.id} ${escapeHtml(a.question.question)}</div>
            <div class="review-a">${escapeHtml(a.question.dynamic ? (a.question.dynamicNote || "Answer may change.") : a.question.answers[0])}</div>
          </div>
        </div>`).join("");
    }
    list.classList.remove("hidden");
  });

  /* ---------------------------------------------------------------------
   * PWA install (service worker) — best effort, never blocks the app
   * ------------------------------------------------------------------- */

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  /* ---------------------------------------------------------------------
   * Init
   * ------------------------------------------------------------------- */

  document.getElementById("theme-toggle").addEventListener("click", toggleTheme);

  function init() {
    applyTheme();
    populateVersionSelect();
    buildStudyDeck({});
    navigate("home");
  }

  init();
})();
