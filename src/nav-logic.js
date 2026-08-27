// Pure index math for focus navigation. Kept free of DOM so it is unit-testable.
// `arrLen` is the number of notes AFTER the current operation.

// Which index to focus after deleting the note at `deletedIdx`,
// given an array of `arrLen` notes (deleted one already removed).
function nextAfterDelete(deletedIdx, arrLen) {
  if (arrLen <= 0) return -1; // no notes left → nothing to focus
  return Math.min(deletedIdx, arrLen - 1);
}

// Circular navigation: from `current`, move `dir` (+1 / -1) across `arrLen` items.
function cycle(current, dir, arrLen) {
  if (arrLen <= 0) return -1;
  return (current + dir + arrLen) % arrLen;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { nextAfterDelete, cycle };
}
