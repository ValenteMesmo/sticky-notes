const COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange', 'white'];

// The event-sourced store (see store.js) is the source of truth. This layer
// persists the full history (log + pointer) so undo/redo survive an app restart.
const storage = {
  KEY: 'sticky_notes_v3_state',
  load() {
    try { return JSON.parse(localStorage.getItem(this.KEY)); }
    catch { return null; }
  },
  save(snapshot) {
    localStorage.setItem(this.KEY, JSON.stringify(snapshot));
  }
};

const store = createStore();
store.restore(storage.load());

// Anchor: the blank note created on open. It lives OUTSIDE the store, so undo
// never touches it and therefore can never drop the app to zero notes. It only
// becomes a real (undoable, persisted) note once the user types into it.
let anchor = null; // { note, el }

const board = document.getElementById('board');

let dragging = null;
let dragOffset = { x: 0, y: 0 };
let dragStart = { x: 0, y: 0 };
let dragActivated = false;
let nextId = store.asArray().reduce((max, n) => Math.max(max, n.id || 0), 0) + 1;

// Combined visible notes (store + anchor), refreshed before rendering/nav.
let notes = [];

// Debounce timers keyed by note id, so typing coalesces into one `text` event.
const textTimers = {};

// Materialize any pending debounced text now (e.g. on blur / before another op).
function flushText(id, text) {
  const t = textTimers[id];
  if (!t) return;
  clearTimeout(t);
  delete textTimers[id];
  store.setText(id, text);
  logEvents('text flushed');
  save();
}

// Drop any pending text timer (used when a note is removed/undone).
function clearTextTimer(id) {
  const t = textTimers[id];
  if (t) { clearTimeout(t); delete textTimers[id]; }
}

// Debug helper: dump the event log (event sourcing) to the DevTools console AND
// to the debug file (via the Rust `debug_log` command, so it shows in dev STDOUT).
function logEvents(msg) {
  const snap = store.getSnapshot();
  const evs = snap.log.map((e) => {
    switch (e.type) {
      case 'add': return `add(#${e.id})`;
      case 'delete': return `del(#${e.id})`;
      case 'text': return `text(#${e.id})`;
      case 'color': return `color(#${e.id})`;
      case 'move': return `move(#${e.id})`;
      case 'resize': return `resize(#${e.id})`;
      default: return e.type;
    }
  });
  const line = `[events] ${msg} | log.length=${snap.log.length}, ptr=${snap.pointer} :: ${evs.join(', ')}`;
  console.log(line);
  dbg(line);
}

const Tauri = window.__TAURI__ || null;
const getCurrentWebviewWindow = Tauri ? (Tauri.window.getCurrentWebviewWindow || Tauri.window.getCurrentWindow) : null;
const listen = Tauri ? Tauri.event.listen : null;

function isAnchorNote(id) { return !!(anchor && anchor.note.id === id); }
function visibleCount() { return store.asArray().length + (anchor ? 1 : 0); }
function syncNotes() { notes = store.asArray().concat(anchor ? [anchor.note] : []); }

// ── Create note element ──
function createNoteEl(note) {
  const el = document.createElement('div');
  el.className = 'note';
  el.dataset.id = note.id;
  el.dataset.color = note.color;
  el.style.left = note.x + 'px';
  el.style.top = note.y + 'px';
  el.style.width = (note.w || 220) + 'px';
  if (note.h) el.style.height = note.h + 'px';

  el.innerHTML = `
    <div class="note-header">
      <div class="note-dots">
        ${COLORS.map(c => `<div class="dot ${c === note.color ? 'active' : ''}" data-color="${c}" style="background:${colorVal(c)}"></div>`).join('')}
      </div>
      <div class="note-actions">
        <button data-action="add" title="Nova nota">＋</button>
        <button data-action="delete" title="Deletar">✕</button>
      </div>
    </div>
    <div class="note-body">
      <textarea placeholder="Escreva algo...">${note.text || ''}</textarea>
    </div>
  `;

  // Drag from anywhere on the note.
  el.addEventListener('mousedown', (e) => {
    if (e.target.closest('.note-actions') || e.target.closest('.note-dots')) return;
    dragging = el;
    dragStart.x = e.clientX;
    dragStart.y = e.clientY;
    dragOffset.x = e.clientX - el.offsetLeft;
    dragOffset.y = e.clientY - el.offsetTop;
    dragActivated = false;
  });

  // Textarea
  const ta = el.querySelector('textarea');
  let typeTimer;
  ta.addEventListener('input', () => {
    handleTextInput(note, el, ta);
    if (!typeTimer) {
      SFX.type();
      typeTimer = setTimeout(() => { typeTimer = null; }, 60);
    }
    autoResize(ta);
  });
  ta.addEventListener('focus', () => el.style.zIndex = 999);
  ta.addEventListener('blur', () => flushText(note.id, ta.value));

  autoResize(ta);

  // Color dots
  el.querySelectorAll('.dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const c = dot.dataset.color;
      note.color = c;
      el.dataset.color = c;
      el.querySelectorAll('.dot').forEach(d => d.classList.toggle('active', d === dot));
      SFX.color();
      spawnRipple(dot, colorVal(c));
      if (!isAnchorNote(note.id)) { store.setColor(note.id, c); save(); }
    });
  });

  // Add note (nearby)
  el.querySelector('[data-action="add"]').addEventListener('click', () => {
    addNote(el.offsetLeft + el.offsetWidth + 20, el.offsetTop);
  });

  // Delete
  el.querySelector('[data-action="delete"]').addEventListener('click', () => deleteNote(note.id, el));

  // Prevent drag on textarea / buttons
  ta.addEventListener('mousedown', (e) => e.stopPropagation());

  return el;
}

function autoResize(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

function colorVal(c) {
  const map = {
    yellow: '#fde047', pink: '#f472b6', blue: '#7dd3fc',
    green: '#86efac', purple: '#c084fc', orange: '#fdba74', white: '#e2e8f0'
  };
  return map[c] || map.yellow;
}

// Typing handler. Detects the anchor becoming a real note on first keystroke.
function handleTextInput(note, el, ta) {
  if (isAnchorNote(note.id)) {
    // Promote anchor -> real note. Reuse the same object so the element's
    // closures stay wired; only the id changes and it enters the store.
    note.text = ta.value;
    note.id = nextId++;
    el.dataset.id = note.id;
    store.add(note.id, { ...note });
    anchor = null;
    syncNotes();
    logEvents('anchor promoted');
    save();
    return;
  }
  // Debounced text commit: only emit one `text` event once the user pauses
  // (800ms), instead of one per keystroke.
  note.text = ta.value;
  clearTimeout(textTimers[note.id]);
  textTimers[note.id] = setTimeout(() => {
    store.setText(note.id, ta.value);
    logEvents('text committed');
    save();
    delete textTimers[note.id];
  }, 800);
}

// Picks a spot against the screen edges/corners.
function edgePosition() {
  const W = window.innerWidth, H = window.innerHeight;
  const side = Math.floor(Math.random() * 4);
  const jitter = () => Math.random() * 120;
  switch (side) {
    case 0: return { x: 20 + jitter(), y: 20 + jitter() };
    case 1: return { x: W - 260 + jitter() * -1, y: 20 + jitter() };
    case 2: return { x: 20 + jitter(), y: H - 220 + jitter() * -1 };
    default: return { x: W - 260 + jitter() * -1, y: H - 220 + jitter() * -1 };
  }
}

// ── Add a real note (Ctrl+N / "＋"): always enters the store.
function addNote(x, y) {
  const pos = (x === undefined || y === undefined) ? edgePosition() : { x, y };
  const note = {
    id: nextId++,
    color: COLORS[Math.floor(Math.random() * 5)],
    x: pos.x,
    y: pos.y,
    w: 220,
    text: ''
  };
  store.add(note.id, note);
  save();
  const el = createNoteEl(note);
  board.appendChild(el);
  syncNotes();
  SFX.pop();
  spawnParticles(el, colorVal(note.color));
  spawnRipple(el, colorVal(note.color));
  el.querySelector('textarea').focus();
}

// Blank anchor note that keeps the app alive and anchors undo.
function createAnchor() {
  if (anchor) return;
  const note = { id: -1, color: COLORS[0], x: 80, y: 60, w: 220, text: '' };
  const el = createNoteEl(note);
  board.appendChild(el);
  anchor = { note, el };
  syncNotes();
  el.querySelector('textarea').focus();
}

// ── Delete note / close app ──
function deleteNote(id, el) {
  SFX.delete();
  spawnParticles(el, '#ef4444');
  el.classList.remove('focusPulse');
  el.classList.add('deleting');

  const isAnchor = isAnchorNote(id);
  if (isAnchor) {
    anchor = null;
    if (el.parentNode) el.parentNode.removeChild(el);
    syncNotes();
    // Never close if there's history to recover: restore the next note.
    if (store.canUndo()) doUndo();
    else closeApp();
    return;
  }

  const idx = store.asArray().findIndex(n => n.id === id);
  clearTextTimer(id);
  store.remove(id);
  save();

  if (visibleCount() === 0) {
    // Closing the last real note closes the app (recoverable on reopen via
    // Ctrl+Z, since "remove" is in the log). Only the anchor restores instead.
    closeApp();
    return;
  }

  setTimeout(() => el.remove(), 360);
  syncNotes();
  focusNote(nextAfterDelete(idx, store.asArray().length));
}

function closeApp() {
  setTimeout(() => {
    if (appWin) appWin.close();
    else window.close();
  }, 350);
}

// ── Undo / Redo ──
function doUndo() {
  const before = new Set(store.asArray().map(n => n.id));
  store.undo();
  logEvents('undo');
  if (visibleCount() === 0) createAnchor(); // undo never leaves you at zero
  const after = new Set(store.asArray().map(n => n.id));
  const removed = [...before].filter(id => !after.has(id));
  const added = [...after].filter(id => !before.has(id));
  // If a card was restored, drop the empty anchor so it doesn't sit in front.
  if (added.length && anchor) removeAnchor();
  if (removed.length) SFX.delete();           // a card got destroyed
  else if (added.length) SFX.pop();           // a card came back
  else SFX.focus();
  renderAll(new Set(removed));
  save();
}

// Remove the anchor note from view/state (it lives outside the store).
function removeAnchor() {
  if (!anchor) return;
  if (anchor.el && anchor.el.parentNode) anchor.el.parentNode.removeChild(anchor.el);
  clearTextTimer(anchor.note.id);
  anchor = null;
  syncNotes();
}

function doRedo() {
  const before = new Set(store.asArray().map(n => n.id));
  store.redo();
  logEvents('redo');
  if (visibleCount() === 0) createAnchor();
  const after = new Set(store.asArray().map(n => n.id));
  const removed = [...before].filter(id => !after.has(id));
  const added = [...after].filter(id => !before.has(id));
  if (added.length && anchor) removeAnchor();
  if (added.length) SFX.pop();                // a card was restored
  else if (removed.length) SFX.delete();
  else SFX.focus();
  renderAll(new Set(removed));
  save();
}

function save() { storage.save(store.getSnapshot()); }

// ── Render ──
// Incremental: update existing note elements in place (keeps focus + avoids
// re-triggering the spawn animation), only create/remove what actually changed.
// Cards removed by `undo` are given the delete juice; freshly restored ones get
// the spawn juice (particles + ripple).
function renderAll(removedIds) {
  removedIds = removedIds || new Set();
  syncNotes();
  const els = new Map(); // numeric id -> element (anchor id is -1)
  for (const child of [...board.children]) {
    if (child.classList.contains('particle')) continue;
    els.set(Number(child.dataset.id), child);
  }

  const wantedIds = new Set(store.asArray().map(n => n.id));
  if (anchor) wantedIds.add(anchor.note.id);

  const alive = [];
  for (const el of els.values()) {
    const id = +el.dataset.id;
    let note = store.get(id);
    if (!note && anchor && anchor.note.id === id) note = anchor.note;
    if (!note) {
      if (removedIds.has(id)) juiceRemove(el);   // undo removed it -> delete juice
      else el.remove();                           // stale node, drop silently
      continue;
    }
    applyToEl(el, note);
    alive.push(el);
  }

  store.asArray().forEach(n => {
    const el = els.get(n.id);
    if (el) return;
    const created = createNoteEl(n);               // new/restored note -> spawns
    board.appendChild(created);
    juiceSpawn(created, n.color);
    alive.push(created);
  });
  if (anchor && !els.has(anchor.note.id)) {
    const el = createNoteEl(anchor.note);          // (re)created anchor
    board.appendChild(el);
    anchor.el = el;
    alive.push(el);
  }
}

// Delete juice for a card the undo removed: shrink/fade it out.
function juiceRemove(el) {
  clearTextTimer(+el.dataset.id);
  el.classList.remove('focusPulse');
  el.classList.add('deleting');
  spawnParticles(el, '#ef4444');
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 360);
}

// Spawn juice for a note brought back by undo/redo.
function juiceSpawn(el, color) {
  spawnParticles(el, colorVal(color));
  spawnRipple(el, colorVal(color));
}

function applyToEl(el, note) {
  el.dataset.color = note.color;
  el.style.left = note.x + 'px';
  el.style.top = note.y + 'px';
  el.style.width = (note.w || 220) + 'px';
  if (note.h) el.style.height = note.h + 'px';
  const ta = el.querySelector('textarea');
  if (ta && ta.value !== note.text) ta.value = note.text;
  el.querySelectorAll('.dot').forEach(d => {
    d.classList.toggle('active', d.dataset.color === note.color);
  });
}

// ── Particles ──
function spawnParticles(el, color) {
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const angle = (Math.PI * 2 * i) / 12;
    const dist = 40 + Math.random() * 60;
    p.style.cssText = `
      left:${cx}px; top:${cy}px;
      width:${4 + Math.random() * 6}px;
      height:${4 + Math.random() * 6}px;
      background:${color};
      --px:${Math.cos(angle) * dist}px;
      --py:${Math.sin(angle) * dist}px;
    `;
    document.body.appendChild(p);
    p.addEventListener('animationend', () => p.remove());
  }
}

function spawnRipple(el, color) {
  const rect = el.getBoundingClientRect();
  const r = document.createElement('div');
  r.className = 'ripple';
  r.style.left = (rect.left + rect.width / 2 - 20) + 'px';
  r.style.top = (rect.top + rect.height / 2 - 20) + 'px';
  r.style.borderColor = color;
  document.body.appendChild(r);
  r.addEventListener('animationend', () => r.remove());
}

// ── Mouse move (drag) ──
document.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  if (!dragActivated) {
    if (Math.abs(e.clientX - dragStart.x) < 4 && Math.abs(e.clientY - dragStart.y) < 4) return;
    dragActivated = true;
    dragging.classList.add('dragging');
    dragging.style.zIndex = 1000;
  }
  dragging.style.left = (e.clientX - dragOffset.x) + 'px';
  dragging.style.top = (e.clientY - dragOffset.y) + 'px';
});

document.addEventListener('mouseup', () => {
  if (dragging) {
    if (dragActivated) {
      dragging.classList.remove('dragging');
      dragging.style.zIndex = '';
      const id = +dragging.dataset.id;
      if (!isAnchorNote(id)) {
        store.move(id, { x: dragging.offsetLeft, y: dragging.offsetTop });
        save();
      } else {
        anchor.note.x = dragging.offsetLeft;
        anchor.note.y = dragging.offsetTop;
      }
    }
    dragging = null;
    dragActivated = false;
  }
});

// ── Click-through (ignore cursor events unless hovering a note) ──
const appWin = getCurrentWebviewWindow ? getCurrentWebviewWindow() : null;
let cursorIgnore = null;

let lastX = 0, lastY = 0;

function dbg(msg) {
  if (Tauri && Tauri.core) {
    Tauri.core.invoke('debug_log', { line: msg }).catch(() => {});
  }
}

function dbgTauri() {
  if (!Tauri) { dbg('dbgTauri: Tauri is null'); return; }
  dbg(`dbgTauri: top=[${Object.keys(Tauri).join(',')}] winNs=${Tauri.window ? Object.keys(Tauri.window).join(',') : 'none'} evNs=${Tauri.event ? Object.keys(Tauri.event).join(',') : 'none'}`);
}

async function setIgnore(ignore) {
  if (!appWin || ignore === cursorIgnore) return;
  cursorIgnore = ignore;
  dbg(`setIgnore(${ignore})`);
  try {
    await appWin.setIgnoreCursorEvents(ignore);
  } catch (err) {
    dbg(`setIgnoreCursorEvents FAIL: ${err}`);
    console.error('setIgnoreCursorEvents failed:', err);
  }
}

async function updateCursorCapture() {
  if (!appWin) return;
  const underNote = document.elementFromPoint(lastX, lastY)?.closest?.('.note');
  await setIgnore(!underNote);
}

function initClickThrough() {
  if (!appWin || !listen) return;

  const dpr = window.devicePixelRatio || 1;
  const origin = () => ({ x: window.screenX || 0, y: window.screenY || 0 });

  listen('device-mouse-move', (e) => {
    const [dx, dy] = e.payload;
    const o = origin();
    lastX = (dx / dpr) - o.x;
    lastY = (dy / dpr) - o.y;
    updateCursorCapture();
  });

  setIgnore(true);
}

// ── Focus navigation ──
function focusNote(index, juice) {
  const n = notes[index];
  if (!n) return;
  const el = board.querySelector(`[data-id="${n.id}"]`);
  if (!el) return;
  const ta = el.querySelector('textarea');
  if (ta) {
    ta.focus();
    const len = ta.value.length;
    ta.setSelectionRange(len, len);
  }
  if (juice) {
    SFX.focus();
    spawnRipple(el, colorVal(n.color));
    el.classList.remove('focusPulse');
    void el.offsetWidth;
    el.classList.add('focusPulse');
  }
  return el;
}

function focusedNoteIndex() {
  const active = document.activeElement?.closest?.('.note');
  if (!active) return -1;
  return notes.findIndex(n => n.id === +active.dataset.id);
}

// ── Keyboard ──
document.addEventListener('keydown', (e) => {
  if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    addNote();
  }
  if (e.key === 'w' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const el = document.activeElement?.closest?.('.note');
    if (el) deleteNote(+el.dataset.id, el);
  }
  if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
    e.preventDefault();
    doUndo();
  }
  if ((e.key === 'Z' || e.key === 'z') && (e.ctrlKey || e.metaKey) && e.shiftKey) {
    e.preventDefault();
    doRedo();
  }
  if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    doRedo();
  }
  if (e.key === 'Tab' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const dir = e.shiftKey ? -1 : 1;
    let i = focusedNoteIndex();
    if (i === -1) i = dir === 1 ? -1 : 0;
    focusNote(cycle(i, dir, notes.length), true);
  }
  if (e.key === 'q' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (appWin) appWin.close();
    else window.close();
  }
});

window.addEventListener('load', () => {
  dbgTauri();

  if (visibleCount() === 0) {
    // Always open with at least one note ready to type. If there's undoable
    // history (e.g. notes were deleted last session), the anchor lets the user
    // Ctrl+Z to bring them all back without the app closing.
    createAnchor();
  } else {
    renderAll();
  }
  logEvents('load');
  initClickThrough();
  SFX.restore();
});
