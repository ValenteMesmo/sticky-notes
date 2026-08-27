// Regression tests for focus navigation logic (pure index math).
// Run with: node tests/nav-logic.test.js
const assert = require('assert');
const { nextAfterDelete, cycle } = require('../src/nav-logic.js');

// Ctrl+W chaining: after deleting a note, another note must always get focus,
// and the focused index must be valid (in range) even for edge cases.
// Regression: deleting the last note relied on a fragile index clamp.
{
  // delete middle note (idx 2) of 5 → 4 remain → focus idx 2 (valid)
  assert.strictEqual(nextAfterDelete(2, 4), 2);
  // delete first note (idx 0) → focus 0 (next one took its place)
  assert.strictEqual(nextAfterDelete(0, 5), 0);
  // delete the last note (idx 4 of 5) → focus the now-last (idx 3)
  assert.strictEqual(nextAfterDelete(4, 4), 3);
  // no notes left → nothing to focus (and must NOT throw)
  assert.strictEqual(nextAfterDelete(0, 0), -1);
}

// Ctrl+Tab / Ctrl+Shift+Tab: circular, bidirectional, never out of range.
{
  // from 0 forward across 3 → 1, 2, then wraps to 0
  assert.strictEqual(cycle(0, 1, 3), 1);
  assert.strictEqual(cycle(2, 1, 3), 0); // wraps
  // backward from 0 across 3 → 2 (wraps other way)
  assert.strictEqual(cycle(0, -1, 3), 2);
  // single note: stays on itself in both directions
  assert.strictEqual(cycle(0, 1, 1), 0);
  assert.strictEqual(cycle(0, -1, 1), 0);
  // no notes
  assert.strictEqual(cycle(0, 1, 0), -1);
}

console.log('all nav-logic tests passed');
