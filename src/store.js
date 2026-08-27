// Event-sourced store with undo/redo. Pure logic, no DOM.
//
// Source of truth: an append-only log of events plus a `pointer`. The current
// state (map of noteId -> note) is derived by folding the log up to `pointer`.
//
//   * Doing an action appends an event and advances the pointer.
//   * Undo moves the pointer back (later events simply stop being applied).
//   * Redo moves the pointer forward (events get applied again).
//
// Because state is always re-derived from the log, each event just needs its
// forward effect (`to` / full note snapshot) — no inverse logic is required.
//
// The "anchor" note (blank note created on open) lives OUTSIDE this store, so
// undo/redo never touch it. That guarantees undo can never reduce the app to
// zero visible notes and close it.
function createStore() {
  let log = [];
  let pointer = 0;
  let state = {};

  function apply(s, ev) {
    switch (ev.type) {
      case 'add':
        s[ev.id] = { ...ev.n };
        break;
      case 'delete':
        delete s[ev.id];
        break;
      case 'move':
      case 'resize': {
        const t = s[ev.id];
        if (t) {
          t.x = ev.to.x; t.y = ev.to.y;
          if (ev.to.w !== undefined) { t.w = ev.to.w; t.h = ev.to.h; }
        }
        break;
      }
      case 'text':
        if (s[ev.id]) s[ev.id].text = ev.to;
        break;
      case 'color':
        if (s[ev.id]) s[ev.id].color = ev.to;
        break;
    }
  }

  function rebuild() {
    const s = {};
    for (let i = 0; i < pointer; i++) apply(s, log[i]);
    state = s;
  }

  function commit(ev) {
    log = log.slice(0, pointer); // drop stale redo tail
    log.push(ev);
    pointer = log.length;
    rebuild();
    return state;
  }

  return {
    // actions (each appends one event)
    add(id, n) { return commit({ type: 'add', id, n: { ...n } }); },
    remove(id) { return commit({ type: 'delete', id }); },
    move(id, to) { return commit({ type: 'move', id, to: { ...to } }); },
    resize(id, to) { return commit({ type: 'resize', id, to: { ...to } }); },
    setText(id, text) { return commit({ type: 'text', id, to: text }); },
    setColor(id, color) { return commit({ type: 'color', id, to: color }); },

    undo() { if (pointer > 0) { pointer--; rebuild(); } return state; },
    redo() { if (pointer < log.length) { pointer++; rebuild(); } return state; },
    canUndo() { return pointer > 0; },
    canRedo() { return pointer < log.length; },

    asArray() { return Object.values(state); },
    get(id) { return state[id]; },
    getState() { return state; },

    // persistence of the whole history (so undo works across app restarts)
    getSnapshot() { return { log, pointer }; },
    restore(snapshot) {
      if (!snapshot) return;
      log = snapshot.log || [];
      pointer = snapshot.pointer || 0;
      rebuild();
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createStore };
}
