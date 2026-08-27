const SFX = (() => {
  let ctx;

  function getCtx() {
    if (!ctx) ctx = new AudioContext();
    return ctx;
  }

  function now() {
    return getCtx().currentTime;
  }

  function osc(type, freq, start, dur, gainVal) {
    const c = getCtx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime + start);
    g.gain.setValueAtTime(gainVal, c.currentTime + start);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + dur);
    o.connect(g).connect(c.destination);
    o.start(c.currentTime + start);
    o.stop(c.currentTime + start + dur);
  }

  return {
    pop() {
      osc('sine', 800, 0, 0.15, 0.25);
      osc('sine', 1200, 0.02, 0.1, 0.15);
      osc('triangle', 600, 0.04, 0.08, 0.1);
    },

    delete() {
      osc('sawtooth', 400, 0, 0.12, 0.12);
      osc('sawtooth', 200, 0.05, 0.2, 0.1);
      osc('sine', 150, 0.1, 0.25, 0.08);
    },

    type() {
      const freq = 800 + Math.random() * 600;
      osc('square', freq, 0, 0.03, 0.03);
    },

    click() {
      osc('sine', 1000, 0, 0.05, 0.08);
      osc('triangle', 1400, 0.01, 0.04, 0.06);
    },

    focus() {
      osc('sine', 660, 0, 0.06, 0.12);
      osc('sine', 990, 0.03, 0.05, 0.08);
    },

    color() {
      osc('sine', 600, 0, 0.08, 0.12);
      osc('sine', 900, 0.04, 0.08, 0.1);
      osc('sine', 1200, 0.08, 0.1, 0.08);
    },

    minimize() {
      osc('sine', 500, 0, 0.08, 0.1);
      osc('sine', 350, 0.04, 0.1, 0.08);
    },

    restore() {
      osc('sine', 350, 0, 0.08, 0.1);
      osc('sine', 600, 0.04, 0.1, 0.08);
    }
  };
})();
