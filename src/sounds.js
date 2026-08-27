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
    const t = c.currentTime + start;
    const o = c.createOscillator();
    const g = c.createGain();
    const lp = c.createBiquadFilter(); // lowpass tames the "sharp" high end
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(gainVal, t + 0.008);       // soft attack
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);           // tapering tail
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    o.connect(lp).connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  return {
    pop() {
      osc('sine', 700, 0, 0.22, 0.22);
      osc('sine', 1000, 0.03, 0.16, 0.12);
    },

    delete() {
      osc('triangle', 320, 0, 0.2, 0.14);
      osc('sine', 140, 0.04, 0.3, 0.12);
      osc('sine', 90, 0.12, 0.35, 0.1);
    },

    type() {
      const freq = 500 + Math.random() * 300;
      osc('triangle', freq, 0, 0.05, 0.03);
    },

    click() {
      osc('sine', 800, 0, 0.08, 0.07);
    },

    focus() {
      osc('sine', 550, 0, 0.1, 0.1);
      osc('sine', 830, 0.04, 0.09, 0.07);
    },

    color() {
      osc('sine', 520, 0, 0.12, 0.1);
      osc('sine', 780, 0.05, 0.12, 0.08);
      osc('sine', 1040, 0.1, 0.14, 0.06);
    },

    minimize() {
      osc('sine', 420, 0, 0.12, 0.09);
      osc('sine', 300, 0.05, 0.14, 0.07);
    },

    restore() {
      osc('sine', 300, 0, 0.12, 0.09);
      osc('sine', 550, 0.05, 0.14, 0.07);
    }
  };
})();
