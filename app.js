/* =========================================================
   일과 매니저 — app.js
   Vanilla JS, no build step, no external runtime deps.
   All data is stored locally on this device via localStorage.
========================================================= */

const STORAGE_KEY = 'ilgwa-manager-data-v1';
const PERIODS = ['morning', 'afternoon', 'evening'];
const PERIOD_EMOJI = { morning: '🌅', afternoon: '🎒', evening: '🌙' };

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ---------------- small utils ---------------- */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}
function pad(n) { return n.toString().padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeekMon(d) {
  const r = new Date(d);
  const day = r.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  r.setDate(r.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function koreanWeekday(d) { return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]; }
function formatDateDisplay(d) { return `${d.getMonth() + 1}월 ${d.getDate()}일 (${koreanWeekday(d)})`; }
function todayMidnight() { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }

/* ---------------- default data ---------------- */
function defaultRoutineSet() {
  return {
    morning: [
      { id: uid(), text: '일어나기', emoji: '🌅' },
      { id: uid(), text: '이불 정리하기', emoji: '🛏️' },
      { id: uid(), text: '세수하고 양치하기', emoji: '🦷' },
      { id: uid(), text: '옷 갈아입기', emoji: '👕' },
    ],
    afternoon: [
      { id: uid(), text: '손 씻기', emoji: '🧴' },
      { id: uid(), text: '숙제하기', emoji: '✏️' },
      { id: uid(), text: '가방 정리하기', emoji: '🎒' },
    ],
    evening: [
      { id: uid(), text: '책 읽기', emoji: '📖' },
      { id: uid(), text: '샤워하기', emoji: '🚿' },
      { id: uid(), text: '장난감 정리하기', emoji: '🧸' },
    ],
  };
}
function defaultState() {
  const children = [
    { id: uid(), name: '토끼', emoji: '🐰', stickers: 0, bonusEarned: 0 },
    { id: uid(), name: '곰돌이', emoji: '🐻', stickers: 0, bonusEarned: 0 },
    { id: uid(), name: '병아리', emoji: '🐥', stickers: 0, bonusEarned: 0 },
  ];
  const routines = {};
  children.forEach((c) => { routines[c.id] = defaultRoutineSet(); });
  return {
    appTitle: '일과 매니저',
    password: '0000',
    selectedChildId: children[0].id,
    children,
    routines,
    logs: {},
    rewards: [
      { id: uid(), name: '아이스크림', cost: 5, emoji: '🍦' },
      { id: uid(), name: '장난감 뽑기', cost: 10, emoji: '🎮' },
      { id: uid(), name: '주말 외식 메뉴 선택권', cost: 20, emoji: '🍕' },
    ],
  };
}
function normalizeState(s) {
  if (!s || typeof s !== 'object') return defaultState();
  if (!Array.isArray(s.children)) s.children = [];
  s.children.forEach((c) => {
    c.stickers = c.stickers || 0;
    c.bonusEarned = c.bonusEarned || 0;
    c.emoji = c.emoji || '🧒';
    c.name = c.name || '이름없음';
  });
  if (!s.routines) s.routines = {};
  if (!s.logs) s.logs = {};
  if (!Array.isArray(s.rewards)) s.rewards = [];
  s.rewards.forEach((r) => { if (!r.emoji) r.emoji = '🎁'; });
  // 일과 항목에도 emoji 필드 보정
  if (s.routines) {
    Object.values(s.routines).forEach((childRoutines) => {
      if (!childRoutines) return;
      ['morning', 'afternoon', 'evening'].forEach((p) => {
        if (Array.isArray(childRoutines[p])) {
          childRoutines[p].forEach((item) => { if (!item.emoji) item.emoji = '📌'; });
        }
      });
    });
  }
  if (!s.appTitle) s.appTitle = '일과 매니저';
  if (!s.password) s.password = '0000';
  if (!s.selectedChildId || !s.children.find((c) => c.id === s.selectedChildId)) {
    s.selectedChildId = s.children[0] ? s.children[0].id : null;
  }
  return s;
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeState(JSON.parse(raw));
  } catch (e) { console.error('failed to load state', e); }
  const fresh = defaultState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ---------------- state ---------------- */
let state = loadState();
let uiDate = todayMidnight();
let currentView = 'routine';
let currentPeriod = 'morning';
let currentAdminPeriod = 'morning';
let pendingConfirmAction = null;

/* ---------------- data helpers ---------------- */
function getChild(id) { return state.children.find((c) => c.id === id); }
function getSelectedChild() { return getChild(state.selectedChildId) || state.children[0]; }
function ensureRoutines(childId) {
  if (!state.routines[childId]) state.routines[childId] = { morning: [], afternoon: [], evening: [] };
  PERIODS.forEach((p) => { if (!state.routines[childId][p]) state.routines[childId][p] = []; });
  return state.routines[childId];
}
function getRoutineItems(childId, period) { return ensureRoutines(childId)[period]; }

function computeDayStats(childId, dateStr) {
  const routines = ensureRoutines(childId);
  let total = 0, checked = 0;
  const dayLog = (state.logs[childId] && state.logs[childId][dateStr]) || {};
  PERIODS.forEach((p) => {
    (routines[p] || []).forEach((item) => {
      total += 1;
      if (dayLog[p] && dayLog[p][item.id]) checked += 1;
    });
  });
  return { total, checked, pct: total ? Math.round((checked / total) * 100) : 0 };
}

function toggleRoutineItem(childId, dateStr, period, itemId) {
  if (!state.logs[childId]) state.logs[childId] = {};
  if (!state.logs[childId][dateStr]) state.logs[childId][dateStr] = { morning: {}, afternoon: {}, evening: {}, bonusAwarded: false };
  const dayLog = state.logs[childId][dateStr];
  if (!dayLog[period]) dayLog[period] = {};
  if (dayLog.bonusAwarded == null) dayLog.bonusAwarded = false;
  const was = !!dayLog[period][itemId];
  dayLog[period][itemId] = !was;

  const child = getChild(childId);
  const stats = computeDayStats(childId, dateStr);
  let justCompleted = false;

  if (stats.total > 0 && stats.pct === 100 && !dayLog.bonusAwarded) {
    // morning + afternoon + evening all fully checked off for the first time today
    dayLog.bonusAwarded = true;
    if (child) child.stickers += 1;
    justCompleted = true;
  } else if (dayLog.bonusAwarded && stats.pct < 100) {
    // an item got unchecked after the day was already fully completed — undo the bonus
    dayLog.bonusAwarded = false;
    if (child) child.stickers = Math.max(0, child.stickers - 1);
  }

  saveState();
  return { justCompleted };
}

function countDayBonusesForChild(childId) {
  const childLogs = state.logs[childId];
  if (!childLogs) return 0;
  let count = 0;
  Object.values(childLogs).forEach((dayLog) => { if (dayLog.bonusAwarded) count += 1; });
  return count;
}

/* ---------------- celebration (full-day completion) ---------------- */
let celebrateTimer = null;
function celebrate() {
  const overlay = $('#celebrate-overlay');
  const field = $('#confetti-field');
  if (!overlay || !field) return;
  field.innerHTML = '';
  const colors = ['#FF6F59', '#FFC23C', '#1FA7A0', '#6C5CE0', '#3FAE73', '#FF9F40'];
  for (let i = 0; i < 46; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = (1.6 + Math.random() * 1.2) + 's';
    piece.style.animationDelay = (Math.random() * 0.3) + 's';
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    field.appendChild(piece);
  }
  overlay.hidden = false;
  clearTimeout(celebrateTimer);
  celebrateTimer = setTimeout(() => {
    overlay.hidden = true;
    field.innerHTML = '';
  }, 2400);
}

/* ---------------- toast & modal helpers ---------------- */
let toastTimer = null;
function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
}
function openModal(id) { $('#' + id).hidden = false; }
function closeModal(id) { $('#' + id).hidden = true; }
function showConfirm(text, action) {
  $('#confirm-modal-text').textContent = text;
  pendingConfirmAction = action;
  openModal('confirm-modal-overlay');
}

/* ---------------- header / nav ---------------- */
function renderDateDisplay() { $('#date-display').textContent = formatDateDisplay(uiDate); }

function setActiveNav(viewKey) {
  $$('.nav-btn').forEach((b) => {
    const isSettings = viewKey === 'admin' || viewKey === 'admin-gate';
    b.classList.toggle('active', b.dataset.view === viewKey || (isSettings && b.dataset.view === 'admin-gate'));
  });
}
function showView(viewKey) {
  $$('.view').forEach((v) => v.classList.remove('active'));
  $('#view-' + viewKey).classList.add('active');
  setActiveNav(viewKey);
  currentView = viewKey;
  if (viewKey === 'routine') renderRoutineView();
  if (viewKey === 'stats') renderStatsView();
  if (viewKey === 'admin') renderAdminView();
  window.scrollTo(0, 0);
}
function refreshCurrentView() {
  if (currentView === 'routine') renderRoutineView();
  else if (currentView === 'stats') renderStatsView();
  else if (currentView === 'admin') renderAdminView();
}

function renderChildrenRow() {
  const row = $('#children-row');
  row.innerHTML = state.children.map((c) => `
    <button class="child-tab ${c.id === state.selectedChildId ? 'active' : ''}" data-id="${c.id}">
      <span class="child-avatar">${c.emoji}</span>
      <span class="child-name">${escapeHtml(c.name)}</span>
    </button>`).join('');
  row.querySelectorAll('.child-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedChildId = btn.dataset.id;
      saveState();
      renderChildrenRow();
      refreshCurrentView();
    });
  });
}

/* ---------------- VIEW: routine (메인화면) ---------------- */
function renderRoutineView() {
  renderDateDisplay();
  const child = getSelectedChild();
  if (!child) return;
  const ds = toDateStr(uiDate);
  const stats = computeDayStats(child.id, ds);
  const circumference = 326.7;
  const offset = circumference - (stats.pct / 100) * circumference;
  $('#ring-fg').style.strokeDashoffset = offset;
  $('#progress-pct').textContent = stats.pct + '%';
  $('#sticker-count').textContent = child.stickers;
  renderChecklist(child.id, ds);
}
function renderChecklist(childId, dateStr) {
  const items = getRoutineItems(childId, currentPeriod);
  const ul = $('#checklist');
  if (items.length === 0) {
    ul.innerHTML = '';
    $('#routine-empty-hint').hidden = false;
    return;
  }
  $('#routine-empty-hint').hidden = true;
  const dayLog = (state.logs[childId] && state.logs[childId][dateStr] && state.logs[childId][dateStr][currentPeriod]) || {};
  ul.innerHTML = items.map((item) => {
    const done = !!dayLog[item.id];
    const emoji = item.emoji || '';
    return `<li class="checklist-item ${done ? 'done' : ''}" data-id="${item.id}">
      <span class="check-circle">${done ? '✓' : ''}</span>
      ${emoji ? `<span class="checklist-item-emoji">${emoji}</span>` : ''}
      <span class="checklist-item-text">${escapeHtml(item.text)}</span>
    </li>`;
  }).join('');
  ul.querySelectorAll('.checklist-item').forEach((li) => {
    li.addEventListener('click', () => {
      const result = toggleRoutineItem(childId, dateStr, currentPeriod, li.dataset.id);
      renderRoutineView();
      if (result.justCompleted) celebrate();
    });
  });
}

/* ---------------- shop modal ---------------- */
function openShopModal() {
  const child = getSelectedChild();
  if (!child) return;
  $('#shop-child-name').textContent = child.name;
  $('#shop-child-stickers').textContent = child.stickers;
  const list = $('#shop-list');
  if (state.rewards.length === 0) {
    list.innerHTML = '';
    $('#shop-empty-hint').hidden = false;
  } else {
    $('#shop-empty-hint').hidden = true;
    list.innerHTML = state.rewards.map((r) => `
      <li class="shop-item">
        <span class="shop-item-emoji">${r.emoji || '🎁'}</span>
        <span class="shop-item-name">${escapeHtml(r.name)}</span>
        <span class="shop-item-cost">⭐️ ${r.cost}</span>
        <button class="btn btn-primary btn-small" data-id="${r.id}" ${child.stickers < r.cost ? 'disabled' : ''}>교환</button>
      </li>`).join('');
    list.querySelectorAll('button[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const reward = state.rewards.find((rw) => rw.id === btn.dataset.id);
        if (!reward) return;
        if (child.stickers < reward.cost) { showToast('스티커가 부족해요!'); return; }
        child.stickers -= reward.cost;
        saveState();
        showToast(`🎉 "${reward.name}" 교환 완료!`);
        openShopModal();
        renderRoutineView();
      });
    });
  }
  openModal('shop-modal-overlay');
}

/* ---------------- VIEW: stats (통계) ---------------- */
function renderStatsView() {
  const child = getSelectedChild();
  if (!child) return;
  $('#stats-child-name').textContent = child.name;

  const today = todayMidnight();
  const weekStart = startOfWeekMon(today);
  const monthStart = startOfMonth(today);

  const weekDays = [];
  for (let d = new Date(weekStart); d <= today; d = addDays(d, 1)) weekDays.push(new Date(d));
  const weekPcts = weekDays.map((d) => computeDayStats(child.id, toDateStr(d)).pct);
  const weekAvg = weekPcts.length ? Math.round(weekPcts.reduce((a, b) => a + b, 0) / weekPcts.length) : 0;
  $('#stat-week-avg').textContent = weekAvg + '%';

  const monthDays = [];
  for (let d = new Date(monthStart); d <= today; d = addDays(d, 1)) monthDays.push(new Date(d));
  const monthPcts = monthDays.map((d) => computeDayStats(child.id, toDateStr(d)).pct);
  const monthAvg = monthPcts.length ? Math.round(monthPcts.reduce((a, b) => a + b, 0) / monthPcts.length) : 0;
  $('#stat-month-avg').textContent = monthAvg + '%';

  const cumulative = countDayBonusesForChild(child.id) + (child.bonusEarned || 0);
  $('#stat-total-stickers').textContent = cumulative;

  let streak = 0, maxStreak = 0;
  for (let d = addDays(today, -119); d <= today; d = addDays(d, 1)) {
    const st = computeDayStats(child.id, toDateStr(d));
    if (st.total === 0) continue;
    if (st.pct === 100) { streak += 1; maxStreak = Math.max(maxStreak, streak); }
    else streak = 0;
  }
  $('#stat-max-streak').textContent = maxStreak + '일';

  renderWeeklyBarChart(child.id, weekStart, today);
  renderFamilyCompareChart(weekStart, today);
  renderItemStats(child.id, today);
}

function renderWeeklyBarChart(childId, weekStart, today) {
  const labels = ['월', '화', '수', '목', '금', '토', '일'];
  let html = '';
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(weekStart, i);
    const future = d > today;
    const pct = future ? 0 : computeDayStats(childId, toDateStr(d)).pct;
    html += `<div class="bar-col">
      <div class="bar-col-pct">${future ? '' : pct + '%'}</div>
      <div class="bar-fill" style="height:${future ? 2 : Math.max(pct, 3)}%; opacity:${future ? 0.25 : 1}"></div>
      <div class="bar-col-label">${labels[i]}</div>
    </div>`;
  }
  $('#weekly-bar-chart').innerHTML = html;
}

function renderFamilyCompareChart(weekStart, today) {
  const html = state.children.map((c) => {
    const days = [];
    for (let d = new Date(weekStart); d <= today; d = addDays(d, 1)) days.push(new Date(d));
    const pcts = days.map((d) => computeDayStats(c.id, toDateStr(d)).pct);
    const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
    return `<div class="bar-col">
      <div class="bar-col-pct">${avg}%</div>
      <div class="bar-fill" style="height:${Math.max(avg, 3)}%"></div>
      <div class="bar-col-label">${c.emoji} ${escapeHtml(c.name)}</div>
    </div>`;
  }).join('');
  $('#family-compare-chart').innerHTML = html;
}

function renderItemStats(childId, today) {
  const routines = ensureRoutines(childId);
  const rows = [];
  PERIODS.forEach((p) => {
    (routines[p] || []).forEach((item) => {
      let count = 0, denom = 0;
      for (let d = addDays(today, -29); d <= today; d = addDays(d, 1)) {
        denom += 1;
        const ds = toDateStr(d);
        const dayLog = (state.logs[childId] && state.logs[childId][ds] && state.logs[childId][ds][p]) || {};
        if (dayLog[item.id]) count += 1;
      }
      const pct = denom ? Math.round((count / denom) * 100) : 0;
      rows.push({ name: `${PERIOD_EMOJI[p]} ${item.text}`, pct });
    });
  });
  const box = $('#item-stats-list');
  if (rows.length === 0) {
    box.innerHTML = '<p class="empty-hint">등록된 일과가 없어요.</p>';
    return;
  }
  rows.sort((a, b) => b.pct - a.pct);
  box.innerHTML = rows.map((r) => `
    <div class="item-stat-row">
      <span class="item-stat-name">${escapeHtml(r.name)}</span>
      <span class="item-stat-track"><span class="item-stat-fill" style="width:${r.pct}%"></span></span>
      <span class="item-stat-pct">${r.pct}%</span>
    </div>`).join('');
}

/* ---------------- VIEW: admin (대시보드) ---------------- */
function renderAdminView() {
  $('#admin-app-title').value = state.appTitle;
  renderAdminChildrenList();
  renderStickerGiftSelect();
  renderRoutineEditChildSelect();
  renderAdminRoutineList();
  renderAdminRewardList();
}

const CHILD_EMOJIS = [
  '🐰','🐻','🐥','🐱','🐶','🐹','🐼','🦊','🐸','🐨',
  '🦁','🐯','🐮','🐷','🐙','🐧','🦄','🐳','🦋','🐝',
  '👦','👧','🧒','👶','⭐️','🌟','🌈','🍀','🍭','🎈',
];
const ROUTINE_EMOJIS = [
  '🌅','🌙','🎒','📚','🍚','🥛','🛁','🦷','💪','🏃',
  '👕','🧤','👟','🎨','🎮','🎵','📖','✏️','🧹','🛏️',
  '🚿','🧴','😴','🥗','🥤','🍎','🧸','🌿','❤️','✅',
];
const REWARD_EMOJIS = [
  '🍦','🍕','🎮','🎪','🎁','🎠','🎡','🎢','🎬','🍿',
  '🧁','🍰','🍩','🍫','🎯','⚽','🏊','🎸','🎨','🎭',
  '🦄','🌈','🍭','🎀','🏆','🌟','💎','🎊','🎉','🛹',
];

let emojiPickerTarget = null; // { type: 'child'|'routine'|'reward', id, callback }

function openEmojiPicker(anchorEl, emojiSet, currentEmoji, onSelect) {
  closeEmojiPicker();
  const picker = document.createElement('div');
  picker.id = 'emoji-picker';
  picker.className = 'emoji-picker';
  picker.innerHTML = emojiSet.map((e) =>
    `<button class="emoji-option${e === currentEmoji ? ' selected' : ''}" data-emoji="${e}">${e}</button>`
  ).join('');
  document.body.appendChild(picker);

  // Position near anchor (fixed positioning — scroll offset 불필요)
  const rect = anchorEl.getBoundingClientRect();
  const pickerW = 280;
  const pickerH = 160;
  let left = rect.left;
  let top = rect.bottom + 6;
  if (left + pickerW > window.innerWidth - 10) left = window.innerWidth - pickerW - 10;
  if (left < 6) left = 6;
  if (top + pickerH > window.innerHeight - 10) top = rect.top - pickerH - 6;
  picker.style.left = left + 'px';
  picker.style.top = top + 'px';

  picker.querySelectorAll('.emoji-option').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelect(btn.dataset.emoji);
      closeEmojiPicker();
    });
  });

  setTimeout(() => {
    document.addEventListener('click', onOutsideClick);
  }, 0);
}

function onOutsideClick(e) {
  const picker = document.getElementById('emoji-picker');
  if (picker && !picker.contains(e.target)) {
    closeEmojiPicker();
  }
}

function closeEmojiPicker() {
  const existing = document.getElementById('emoji-picker');
  if (existing) existing.remove();
  document.removeEventListener('click', onOutsideClick);
}

function renderAdminChildrenList() {
  const box = $('#admin-children-list');
  box.innerHTML = state.children.map((c) => `
    <div class="admin-row" data-id="${c.id}">
      <button class="admin-row-emoji emoji-pick-btn" data-id="${c.id}" title="아이콘 바꾸기">${c.emoji}<span class="emoji-pick-hint">▾</span></button>
      <input type="text" class="text-input child-name-input" data-id="${c.id}" value="${escapeHtml(c.name)}">
      <button class="btn btn-danger btn-small child-delete" data-id="${c.id}">삭제</button>
    </div>`).join('');

  box.querySelectorAll('.emoji-pick-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const c = getChild(btn.dataset.id);
      openEmojiPicker(btn, CHILD_EMOJIS, c.emoji, (newEmoji) => {
        c.emoji = newEmoji;
        saveState();
        renderAdminChildrenList();
        renderChildrenRow();
      });
    });
  });
  box.querySelectorAll('.child-name-input').forEach((inp) => {
    inp.addEventListener('change', () => {
      const c = getChild(inp.dataset.id);
      c.name = inp.value.trim() || '이름없음';
      saveState();
      renderChildrenRow();
      renderStickerGiftSelect();
      renderRoutineEditChildSelect();
    });
  });
  box.querySelectorAll('.child-delete').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.children.length <= 1) { showToast('최소 1명의 자녀가 필요해요.'); return; }
      showConfirm('이 자녀를 삭제할까요? 기록도 함께 사라져요.', () => {
        const id = btn.dataset.id;
        state.children = state.children.filter((c) => c.id !== id);
        delete state.routines[id];
        delete state.logs[id];
        if (state.selectedChildId === id) state.selectedChildId = state.children[0].id;
        saveState();
        renderChildrenRow();
        renderAdminChildrenList();
        renderStickerGiftSelect();
        renderRoutineEditChildSelect();
        renderAdminRoutineList();
      });
    });
  });
}

function renderStickerGiftSelect() {
  const sel = $('#sticker-gift-child');
  const prev = sel.value;
  sel.innerHTML = state.children.map((c) => `<option value="${c.id}">${c.emoji} ${escapeHtml(c.name)}</option>`).join('');
  if (state.children.find((c) => c.id === prev)) sel.value = prev;
  updateGiftBalance();
}

function updateGiftBalance() {
  const child = getChild($('#sticker-gift-child').value);
  $('#sticker-gift-balance').textContent = child ? `⭐️ 보유 ${child.stickers}개` : '⭐️ 0개';
}

function renderRoutineEditChildSelect() {
  const sel = $('#routine-edit-child');
  const prev = sel.value;
  sel.innerHTML = state.children.map((c) => `<option value="${c.id}">${c.emoji} ${escapeHtml(c.name)}</option>`).join('');
  if (state.children.find((c) => c.id === prev)) sel.value = prev;
}

function renderAdminRoutineList() {
  const sel = $('#routine-edit-child');
  if (!sel.value && state.children.length) sel.value = state.children[0].id;
  const childId = sel.value;
  const ul = $('#admin-routine-list');
  if (!childId) { ul.innerHTML = ''; return; }
  const items = getRoutineItems(childId, currentAdminPeriod);
  if (items.length === 0) {
    ul.innerHTML = '<p class="hint-text">아직 등록된 일과가 없어요. 아래에서 추가해 보세요.</p>';
    return;
  }
  ul.innerHTML = items.map((item, idx) => `
    <li class="admin-row draggable-routine" data-id="${item.id}" draggable="true">
      <span class="drag-handle" title="드래그해서 순서 변경">⠿</span>
      <button class="routine-emoji-btn emoji-pick-btn" data-id="${item.id}" title="이모지 선택">${item.emoji || '📌'}<span class="emoji-pick-hint">▾</span></button>
      <input type="text" class="text-input routine-text-input" data-id="${item.id}" value="${escapeHtml(item.text)}">
      <button class="btn btn-danger btn-small routine-delete" data-id="${item.id}">삭제</button>
    </li>`).join('');

  // Emoji picker for routine items
  ul.querySelectorAll('.routine-emoji-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = items.find((it) => it.id === btn.dataset.id);
      if (!item) return;
      openEmojiPicker(btn, ROUTINE_EMOJIS, item.emoji || '📌', (newEmoji) => {
        item.emoji = newEmoji;
        saveState();
        renderAdminRoutineList();
      });
    });
  });

  // Drag-and-drop for routine order
  setupDragSort(ul, items, () => { saveState(); renderAdminRoutineList(); });

  ul.querySelectorAll('.order-up').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = items.findIndex((it) => it.id === btn.dataset.id);
      if (i > 0) { [items[i - 1], items[i]] = [items[i], items[i - 1]]; saveState(); renderAdminRoutineList(); }
    });
  });
  ul.querySelectorAll('.order-down').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = items.findIndex((it) => it.id === btn.dataset.id);
      if (i < items.length - 1) { [items[i + 1], items[i]] = [items[i], items[i + 1]]; saveState(); renderAdminRoutineList(); }
    });
  });
  ul.querySelectorAll('.routine-text-input').forEach((inp) => {
    inp.addEventListener('change', () => {
      const item = items.find((it) => it.id === inp.dataset.id);
      if (item) { item.text = inp.value.trim() || item.text; saveState(); }
    });
  });
  ul.querySelectorAll('.routine-delete').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = items.findIndex((it) => it.id === btn.dataset.id);
      if (i > -1) { items.splice(i, 1); saveState(); renderAdminRoutineList(); }
    });
  });
}

function renderAdminRewardList() {
  const ul = $('#admin-reward-list');
  if (state.rewards.length === 0) {
    ul.innerHTML = '<p class="hint-text">아직 등록된 보상이 없어요. 아래에서 추가해 보세요.</p>';
    return;
  }
  ul.innerHTML = state.rewards.map((r) => `
    <li class="admin-row draggable-reward" data-id="${r.id}" draggable="true">
      <span class="drag-handle" title="드래그해서 순서 변경">⠿</span>
      <button class="reward-emoji-btn emoji-pick-btn" data-id="${r.id}" title="이모지 선택">${r.emoji || '🎁'}<span class="emoji-pick-hint">▾</span></button>
      <input type="text" class="text-input reward-name-input" data-id="${r.id}" value="${escapeHtml(r.name)}">
      <input type="number" class="num-input reward-cost-input" data-id="${r.id}" value="${r.cost}" min="1">
      <button class="btn btn-danger btn-small reward-delete" data-id="${r.id}">삭제</button>
    </li>`).join('');

  // Emoji picker for reward items
  ul.querySelectorAll('.reward-emoji-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = state.rewards.find((rw) => rw.id === btn.dataset.id);
      if (!r) return;
      openEmojiPicker(btn, REWARD_EMOJIS, r.emoji || '🎁', (newEmoji) => {
        r.emoji = newEmoji;
        saveState();
        renderAdminRewardList();
      });
    });
  });

  // Drag-and-drop for reward order
  setupDragSort(ul, state.rewards, () => { saveState(); renderAdminRewardList(); });

  ul.querySelectorAll('.reward-name-input').forEach((inp) => {
    inp.addEventListener('change', () => {
      const r = state.rewards.find((rw) => rw.id === inp.dataset.id);
      if (r) { r.name = inp.value.trim() || r.name; saveState(); }
    });
  });
  ul.querySelectorAll('.reward-cost-input').forEach((inp) => {
    inp.addEventListener('change', () => {
      const r = state.rewards.find((rw) => rw.id === inp.dataset.id);
      if (r) { r.cost = Math.max(1, parseInt(inp.value, 10) || 1); saveState(); }
    });
  });
  ul.querySelectorAll('.reward-delete').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.rewards = state.rewards.filter((rw) => rw.id !== btn.dataset.id);
      saveState();
      renderAdminRewardList();
    });
  });
}

/* ---------------- drag-and-drop sort ---------------- */
function setupDragSort(ul, dataArray, onDone) {
  let dragSrcId = null;
  ul.querySelectorAll('[draggable="true"]').forEach((li) => {
    li.addEventListener('dragstart', (e) => {
      dragSrcId = li.dataset.id;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      ul.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (li.dataset.id !== dragSrcId) {
        ul.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
        li.classList.add('drag-over');
      }
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      if (li.dataset.id === dragSrcId) return;
      const fromIdx = dataArray.findIndex((it) => it.id === dragSrcId);
      const toIdx = dataArray.findIndex((it) => it.id === li.dataset.id);
      if (fromIdx > -1 && toIdx > -1) {
        const [moved] = dataArray.splice(fromIdx, 1);
        dataArray.splice(toIdx, 0, moved);
        onDone();
      }
    });
  });
}

/* ---------------- new routine/reward emoji state ---------------- */
let newRoutineEmoji = '📌';
let newRewardEmoji = '🎁';

function renderNewRoutineEmojiBtn() {
  const btn = $('#new-routine-emoji');
  if (btn) btn.textContent = newRoutineEmoji + '▾';
}
function renderNewRewardEmojiBtn() {
  const btn = $('#new-reward-emoji');
  if (btn) btn.textContent = newRewardEmoji + '▾';
}


function wireEvents() {
  // date nav
  $('#date-prev').addEventListener('click', () => { uiDate = addDays(uiDate, -1); renderRoutineView(); });
  $('#date-next').addEventListener('click', () => { uiDate = addDays(uiDate, 1); renderRoutineView(); });
  $('#today-btn').addEventListener('click', () => { uiDate = todayMidnight(); renderRoutineView(); });

  // main nav
  $$('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.view;
      if (v === 'admin-gate') {
        $('#admin-pw-input').value = '';
        $('#gate-error').hidden = true;
        showView('admin-gate');
        setTimeout(() => $('#admin-pw-input').focus(), 50);
      } else {
        showView(v);
      }
    });
  });

  // period tabs (routine view)
  $$('#period-tabs .period-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentPeriod = btn.dataset.period;
      $$('#period-tabs .period-tab').forEach((b) => b.classList.toggle('active', b === btn));
      renderRoutineView();
    });
  });

  // period tabs (admin routine editor)
  $$('#routine-edit-tabs .period-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentAdminPeriod = btn.dataset.period;
      $$('#routine-edit-tabs .period-tab').forEach((b) => b.classList.toggle('active', b === btn));
      renderAdminRoutineList();
    });
  });
  $('#routine-edit-child').addEventListener('change', renderAdminRoutineList);

  // shop
  $('#shop-btn').addEventListener('click', openShopModal);

  // generic modal close
  $$('.modal-close').forEach((btn) => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
  $$('.modal-overlay').forEach((ov) => ov.addEventListener('click', (e) => { if (e.target === ov) closeModal(ov.id); }));

  // admin gate
  $('#gate-cancel').addEventListener('click', () => showView('routine'));
  $('#gate-submit').addEventListener('click', submitAdminGate);
  $('#admin-pw-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAdminGate(); });

  // admin: app title
  $('#admin-app-title-save').addEventListener('click', () => {
    state.appTitle = $('#admin-app-title').value.trim() || '일과 매니저';
    saveState();
    $('#app-title').textContent = state.appTitle;
    showToast('앱 제목을 저장했어요!');
  });

  // admin: add child
  $('#admin-add-child').addEventListener('click', () => {
    const newChild = { id: uid(), name: '새 아이', emoji: '🧒', stickers: 0, bonusEarned: 0 };
    state.children.push(newChild);
    state.routines[newChild.id] = { morning: [], afternoon: [], evening: [] };
    saveState();
    renderChildrenRow();
    renderAdminChildrenList();
    renderStickerGiftSelect();
    renderRoutineEditChildSelect();
  });

  // admin: sticker gift
  $('#sticker-gift-child').addEventListener('change', updateGiftBalance);
  $('#sticker-plus').addEventListener('click', () => applyStickerGift(1));
  $('#sticker-minus').addEventListener('click', () => applyStickerGift(-1));

  // admin: routines
  $('#add-routine-item').addEventListener('click', addRoutineItem);
  $('#new-routine-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') addRoutineItem(); });
  $('#new-routine-emoji').addEventListener('click', (e) => {
    e.stopPropagation();
    openEmojiPicker($('#new-routine-emoji'), ROUTINE_EMOJIS, newRoutineEmoji, (em) => {
      newRoutineEmoji = em;
      renderNewRoutineEmojiBtn();
    });
  });

  // admin: rewards
  $('#add-reward-item').addEventListener('click', addRewardItem);
  $('#new-reward-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') addRewardItem(); });
  $('#new-reward-emoji').addEventListener('click', (e) => {
    e.stopPropagation();
    openEmojiPicker($('#new-reward-emoji'), REWARD_EMOJIS, newRewardEmoji, (em) => {
      newRewardEmoji = em;
      renderNewRewardEmojiBtn();
    });
  });

  // confirm modal
  $('#confirm-modal-ok').addEventListener('click', () => {
    const action = pendingConfirmAction;
    pendingConfirmAction = null;
    closeModal('confirm-modal-overlay');
    if (action) action();
  });
  $('#confirm-modal-cancel').addEventListener('click', () => {
    pendingConfirmAction = null;
    closeModal('confirm-modal-overlay');
  });

  // footer: export / import / password / reset / done
  $('#export-data-btn').addEventListener('click', exportData);
  $('#import-data-btn').addEventListener('click', () => $('#import-file-input').click());
  $('#import-file-input').addEventListener('change', importData);
  $('#change-pw-btn').addEventListener('click', changePassword);
  $('#reset-all-btn').addEventListener('click', () => {
    showConfirm('정말로 모든 데이터를 초기화할까요? 되돌릴 수 없어요.', resetAll);
  });
  $('#admin-done-btn').addEventListener('click', () => showView('routine'));
}

function submitAdminGate() {
  const val = $('#admin-pw-input').value;
  if (val === state.password) {
    showView('admin');
  } else {
    $('#gate-error').hidden = false;
    $('#admin-pw-input').value = '';
    $('#admin-pw-input').focus();
  }
}

function applyStickerGift(sign) {
  const childId = $('#sticker-gift-child').value;
  const child = getChild(childId);
  if (!child) return;
  const amount = Math.max(1, parseInt($('#sticker-gift-amount').value, 10) || 1);
  if (sign > 0) { child.stickers += amount; child.bonusEarned = (child.bonusEarned || 0) + amount; }
  else child.stickers = Math.max(0, child.stickers - amount);
  saveState();
  showToast(`${child.name}에게 스티커 ${sign > 0 ? '+' : '-'}${amount}개`);
  updateGiftBalance();
  renderRoutineView();
}

function addRoutineItem() {
  const text = $('#new-routine-text').value.trim();
  if (!text) return;
  const childId = $('#routine-edit-child').value;
  const list = getRoutineItems(childId, currentAdminPeriod);
  list.push({ id: uid(), text, emoji: newRoutineEmoji });
  saveState();
  $('#new-routine-text').value = '';
  renderAdminRoutineList();
}

function addRewardItem() {
  const name = $('#new-reward-name').value.trim();
  const cost = Math.max(1, parseInt($('#new-reward-cost').value, 10) || 1);
  if (!name) return;
  state.rewards.push({ id: uid(), name, cost, emoji: newRewardEmoji });
  saveState();
  $('#new-reward-name').value = '';
  $('#new-reward-cost').value = 5;
  renderAdminRewardList();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `일과매니저-백업-${toDateStr(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('데이터를 내보냈어요!');
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || !Array.isArray(parsed.children)) throw new Error('invalid backup file');
      state = normalizeState(parsed);
      saveState();
      $('#app-title').textContent = state.appTitle;
      renderChildrenRow();
      renderAdminView();
      renderRoutineView();
      showToast('데이터를 불러왔어요!');
    } catch (err) {
      showToast('올바른 백업 파일이 아니에요.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function changePassword() {
  const cur = window.prompt('현재 비밀번호를 입력하세요.');
  if (cur === null) return;
  if (cur !== state.password) { showToast('현재 비밀번호가 일치하지 않아요.'); return; }
  const next = window.prompt('새 비밀번호를 입력하세요.');
  if (next === null || next.trim() === '') return;
  state.password = next.trim();
  saveState();
  showToast('비밀번호를 변경했어요!');
}

function resetAll() {
  state = defaultState();
  saveState();
  uiDate = todayMidnight();
  currentPeriod = 'morning';
  currentAdminPeriod = 'morning';
  $$('#period-tabs .period-tab').forEach((b) => b.classList.toggle('active', b.dataset.period === 'morning'));
  $$('#routine-edit-tabs .period-tab').forEach((b) => b.classList.toggle('active', b.dataset.period === 'morning'));
  $('#app-title').textContent = state.appTitle;
  renderChildrenRow();
  showView('routine');
  showToast('초기화했어요.');
}

/* ---------------- init ---------------- */
function init() {
  $('#app-title').textContent = state.appTitle;
  renderChildrenRow();
  wireEvents();
  showView('routine');
}

init();
