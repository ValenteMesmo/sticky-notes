const COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange', 'white'];

const storage = {
  load() {
    try { return JSON.parse(localStorage.getItem('sticky_notes_v2') || '[]'); }
    catch { return []; }
  },
  save(notes) {
    localStorage.setItem('sticky_notes_v2', JSON.stringify(notes));
  }
};

let notes = storage.load();
let dragging = null;
let dragOffset = { x: 0, y: 0 };
let nextId = notes.reduce((max, n) => Math.max(max, n.id || 0), 0) + 1;

const board = document.getElementById('board');

// Tauri APIs exposed globally via withGlobalTauri
const Tauri = window.__TAURI__ || null;
const getCurrentWebviewWindow = Tauri ? (Tauri.window.getCurrentWebviewWindow || Tauri.window.getCurrentWindow) : null;
const listen = Tauri ? Tauri.event.listen : null;

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
    <div class="note-header" data-drag>
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

  // Drag via header
  const header = el.querySelector('[data-drag]');
  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('.note-actions') || e.target.closest('.note-dots')) return;
    dragging = el;
    dragOffset.x = e.clientX - el.offsetLeft;
    dragOffset.y = e.clientY - el.offsetTop;
    el.classList.add('dragging');
    el.style.zIndex = 1000;
  });

  // Textarea
  const ta = el.querySelector('textarea');
  let typeTimer;
  ta.addEventListener('input', () => {
    note.text = ta.value;
    save();
    if (!typeTimer) {
      SFX.type();
      typeTimer = setTimeout(() => { typeTimer = null; }, 60);
    }
    autoResize(ta);
  });
  ta.addEventListener('focus', () => el.style.zIndex = 999);

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
      save();
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

// ── Add note ──
function addNote(x, y) {
  const note = {
    id: nextId++,
    color: COLORS[Math.floor(Math.random() * 5)],
    x: x !== undefined ? x : 60 + Math.random() * 300,
    y: y !== undefined ? y : 60 + Math.random() * 200,
    w: 220,
    text: ''
  };
  notes.push(note);
  save();
  const el = createNoteEl(note);
  board.appendChild(el);
  SFX.pop();
  spawnParticles(el, colorVal(note.color));
  spawnRipple(el, colorVal(note.color));
  el.querySelector('textarea').focus();
}

// ── Delete note ──
function deleteNote(id, el) {
  SFX.delete();
  spawnParticles(el, '#ef4444');
  el.classList.add('deleting');
  const idx = notes.findIndex(n => n.id === id);
  notes = notes.filter(n => n.id !== id);
  save();
  // Closing the last note closes the app.
  if (notes.length === 0) {
    setTimeout(() => {
      if (appWin) appWin.close();
      else window.close();
    }, 350);
    return;
  }
  // Focus another note so Ctrl+W can keep chaining through all of them:
  // the note that now occupies the deleted one's spot, or the last one.
  focusNote(Math.min(idx, notes.length - 1));
  el.addEventListener('animationend', () => el.remove());
}

// ── Save ──
function save() {
  storage.save(notes.map(n => {
    const el = board.querySelector(`[data-id="${n.id}"]`);
    return {
      ...n,
      x: el ? el.offsetLeft : n.x,
      y: el ? el.offsetTop : n.y,
      w: el ? el.offsetWidth : n.w,
      h: el ? el.offsetHeight : n.h
    };
  }));
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
  dragging.style.left = (e.clientX - dragOffset.x) + 'px';
  dragging.style.top = (e.clientY - dragOffset.y) + 'px';
});

document.addEventListener('mouseup', () => {
  if (dragging) {
    dragging.classList.remove('dragging');
    dragging.style.zIndex = '';
    dragging = null;
    save();
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
  const topKeys = Object.keys(Tauri).join(',');
  const winKeys = Tauri.window ? Object.keys(Tauri.window).join(',') : 'NO window ns';
  const evKeys = Tauri.event ? Object.keys(Tauri.event).join(',') : 'NO event ns';
  dbg(`dbgTauri: top=[${topKeys}] window=[${winKeys}] event=[${evKeys}]`);
}async function setIgnore(ignore) {
  if (!appWin || ignore === cursorIgnore) return;
  cursorIgnore = ignore;
  dbg(`setIgnore(${ignore})`);
  try {
    await appWin.setIgnoreCursorEvents(ignore);
    dbg('setIgnoreCursorEvents OK');
  } catch (err) {
    dbg(`setIgnoreCursorEvents FAIL: ${err}`);
    console.error('setIgnoreCursorEvents failed:', err);
  }
}

async function updateCursorCapture() {
  if (!appWin) return;
  // Cursor above a note or the add button? Capture; otherwise click-through.
  const underNote = document.elementFromPoint(lastX, lastY)?.closest?.('.note');
  await setIgnore(!underNote);
}

function initClickThrough() {
  if (!appWin || !listen) return;

  // Window covers the primary monitor; map the global cursor (device px)
  // to CSS px relative to the window/viewport via the window's screen origin.
  const dpr = window.devicePixelRatio || 1;
  const origin = () => ({ x: window.screenX || 0, y: window.screenY || 0 });

  listen('device-mouse-move', (e) => {
    const [dx, dy] = e.payload;
    const o = origin();
    lastX = (dx / dpr) - o.x;
    lastY = (dy / dpr) - o.y;
    updateCursorCapture();
  });

  // Start in click-through mode so the empty area does not block other windows.
  dbg('init: __TAURI__ available, starting click-through');
  setIgnore(true);
}

// ── Focus navigation ──
// Focuses the note at the given index in the `notes` array (creation order).
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
    void el.offsetWidth; // restart animation
    el.classList.add('focusPulse');
  }
  return el;
}

// Index (in `notes`) of the note whose textarea currently has focus, or -1.
function focusedNoteIndex() {
  const active = document.activeElement?.closest?.('.note');
  if (!active) return -1;
  return notes.findIndex(n => n.id === +active.dataset.id);
}

// ── Keyboard ──
document.addEventListener('keydown', (e) => {
  if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    addNote(60 + Math.random() * 300, 60 + Math.random() * 200);
  }
  if (e.key === 'w' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const el = document.activeElement?.closest?.('.note');
    if (el) deleteNote(+el.dataset.id, el);
  }
  if (e.key === 'Tab' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const dir = e.shiftKey ? -1 : 1;
    let i = focusedNoteIndex();
    if (i === -1) i = dir === 1 ? -1 : 0; // start from first/last when nothing focused
    focusNote((i + dir + notes.length) % notes.length, true);
  }
  if (e.key === 'q' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (appWin) appWin.close();
    else window.close();
  }
});

// ── Render ──
function render() {
  notes.forEach(n => board.appendChild(createNoteEl(n)));
}

window.addEventListener('load', () => {
  dbgTauri();
  dbg(`onload: __TAURI__=${!!window.__TAURI__}, hasAppWin=${!!getCurrentWebviewWindow}, screen=${screen.width}x${screen.height}, dpr=${window.devicePixelRatio}, inner=${window.innerWidth}x${window.innerHeight}`);

  if (notes.length === 0) {
    // App always opens with at least one note, ready to type.
    addNote(80, 60);
  } else {
    render();
  }
  initClickThrough();
  SFX.restore();
});
