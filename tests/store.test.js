// Regression tests for the event-sourced store (undo/redo, persistence).
// Run with: node tests/store.test.js
const assert = require('assert');
const { createStore } = require('../src/store.js');

// Basic add + text + undo/redo.
{
  const s = createStore();
  s.add(1, { id: 1, x: 0, y: 0, w: 220, text: '', color: 'blue' });
  s.setText(1, 'hello');
  assert.deepStrictEqual(s.get(1).text, 'hello');
  assert.strictEqual(s.canUndo(), true);

  s.undo(); // undo text
  assert.strictEqual(s.get(1).text, '');
  s.redo();
  assert.strictEqual(s.get(1).text, 'hello');

  s.undo(); // undo text
  s.undo(); // undo add
  assert.strictEqual(s.get(1), undefined); // note gone
  assert.strictEqual(s.asArray().length, 0);
  assert.strictEqual(s.canUndo(), false);
}

// Delete then undo restores the full note snapshot.
{
  const s = createStore();
  s.add(7, { id: 7, x: 5, y: 6, w: 220, text: 'note', color: 'pink' });
  s.setText(7, 'typed something');
  s.remove(7);
  assert.strictEqual(s.get(7), undefined);
  assert.strictEqual(s.asArray().length, 0);
  s.undo(); // undo delete -> note should come back with all fields
  const n = s.get(7);
  assert.ok(n, 'note restored after undo');
  assert.strictEqual(n.text, 'typed something');
  assert.strictEqual(n.x, 5);
  assert.strictEqual(n.color, 'pink');
}

// Move/color undo/redo.
{
  const s = createStore();
  s.add(2, { id: 2, x: 0, y: 0, w: 220, text: '', color: 'green' });
  s.move(2, { x: 100, y: 50 });
  s.setColor(2, 'orange');
  assert.strictEqual(s.get(2).x, 100);
  assert.strictEqual(s.get(2).color, 'orange');
  s.undo(); // undo color
  assert.strictEqual(s.get(2).color, 'green');
  s.undo(); // undo move
  assert.strictEqual(s.get(2).x, 0);
  assert.strictEqual(s.get(2).y, 0);
  s.redo(); s.redo();
  assert.strictEqual(s.get(2).x, 100);
  assert.strictEqual(s.get(2).color, 'orange');
}

// Doing a new action after undo clears the redo tail.
{
  const s = createStore();
  s.add(1, { id: 1, text: '', color: 'blue' });
  s.setText(1, 'a');
  s.setText(1, 'b');
  s.undo(); // back to 'a'
  assert.strictEqual(s.canRedo(), true);
  s.setText(1, 'c'); // new action wipes redo
  assert.strictEqual(s.canRedo(), false);
  assert.strictEqual(s.get(1).text, 'c');
}

// Redo is preserved across session restores (snapshot round-trip).
{
  const s1 = createStore();
  s1.add(1, { id: 1, text: '', color: 'blue' });
  s1.setText(1, 'x');
  s1.undo();

  const s2 = createStore();
  s2.restore(s1.getSnapshot());
  assert.strictEqual(s2.canUndo(), true);
  assert.strictEqual(s2.canRedo(), true);
  assert.strictEqual(s2.get(1).text, ''); // undone state preserved
  s2.redo();
  assert.strictEqual(s2.get(1).text, 'x');
}

// Multiple notes, undo removes one without touching others.
{
  const s = createStore();
  s.add(1, { id: 1, text: '', color: 'blue' });
  s.add(2, { id: 2, text: '', color: 'pink' });
  s.undo(); // undo add(2)
  assert.strictEqual(s.get(2), undefined);
  assert.strictEqual(s.get(1) !== undefined, true);
  assert.strictEqual(s.asArray().length, 1);
  s.redo();
  assert.strictEqual(s.asArray().length, 2);
}

// The lockout scenario: delete all notes, app closes, reopens, undo restores.
// Simulates the sequence the UI drives, cross-checking session restore.
{
  // session 1: three notes, all deleted (app then closes)
  const s1 = createStore();
  s1.add(1, { id: 1, text: 'a', color: 'blue' });
  s1.add(2, { id: 2, text: 'b', color: 'pink' });
  s1.add(3, { id: 3, text: 'c', color: 'green' });
  s1.remove(1); s1.remove(2); s1.remove(3);
  assert.strictEqual(s1.asArray().length, 0);

  // session 2: reopen restores history; undo brings notes back (LIFO)
  const s2 = createStore();
  s2.restore(s1.getSnapshot());
  assert.strictEqual(s1.canUndo(), true, 'history must survive restart');
  assert.strictEqual(s2.asArray().length, 0);

  s2.undo(); // undoes remove(3)
  assert.strictEqual(s2.asArray().length, 1);
  assert.strictEqual(s2.get(3).text, 'c');
  s2.undo(); // undoes remove(2)
  assert.strictEqual(s2.get(2).text, 'b');
  s2.undo(); // undoes remove(1)
  assert.strictEqual(s2.get(1).text, 'a');
  assert.strictEqual(s2.asArray().length, 3);
}

// Undoing an add removes a note; subsequent redo restores it — and doing a new
// action afterwards still keeps prior history intact.
{
  const s = createStore();
  s.add(1, { id: 1, text: '', color: 'blue' });
  s.add(2, { id: 2, text: '', color: 'pink' });
  s.undo();           // remove note 2
  assert.strictEqual(s.asArray().length, 1);
  s.redo();           // restore note 2
  assert.strictEqual(s.asArray().length, 2);
  s.remove(1);        // new action: deletes 1, keeps 2, wipes redo
  assert.strictEqual(s.get(2) !== undefined, true);
  assert.strictEqual(s.canRedo(), false);
  s.undo();           // undo remove(1) -> note 1 back
  assert.strictEqual(s.get(1) !== undefined, true);
}

console.log('all store tests passed');
