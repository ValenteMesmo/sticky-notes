const SFX = (() => {
  let ctx;

  function getCtx() {
    if (!ctx) ctx = new AudioContext();
    return ctx;
  }

  // Percussive "thock": a short pitched impact that drops fast (like striking
  // wood / a thocky keycap), through a closed lowpass so it stays warm, dry and
  // soft rather than sharp. freq = body resonance, cutoff lowend cream.
  function thock(t0, freq, dur, gainVal, cutoff) {
    const c = getCtx();
    const t = c.currentTime + t0;
    const o = c.createOscillator();
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    o.type = 'sine';
    // fast pitch drop gives the "knock/thump" body
    o.frequency.setValueAtTime(freq * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.02);
    // immediate attack, fast natural decay (percussive), soft tail
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(gainVal, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    lp.Q.value = 0.8;
    o.connect(lp).connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  return {
    pop() {
      thock(0, 220, 0.16, 0.2, 900);
      thock(0.015, 140, 0.18, 0.14, 650);
    },

    delete() {
      thock(0, 180, 0.15, 0.18, 800);
      thock(0.03, 110, 0.2, 0.15, 550);
    },

    type() {
      // the per-key thock: short, dry, slightly randomized pitch
      const f = 170 + Math.random() * 130;
      thock(0, f, 0.05, 0.05, 700);
    },

    click() {
      thock(0, 300, 0.07, 0.07, 900);
    },

    focus() {
      thock(0, 300, 0.09, 0.12, 900);
      thock(0.05, 200, 0.12, 0.09, 700);
    },

    color() {
      thock(0, 240, 0.11, 0.13, 850);
      thock(0.05, 160, 0.12, 0.1, 650);
      thock(0.1, 120, 0.13, 0.08, 600);
    },

    minimize() {
      thock(0, 180, 0.12, 0.12, 750);
      thock(0.04, 120, 0.14, 0.09, 600);
    },

    restore() {
      thock(0, 200, 0.12, 0.12, 800);
      thock(0.05, 130, 0.15, 0.1, 620);
    }
  };
})();
