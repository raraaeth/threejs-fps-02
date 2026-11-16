// VEILPOINT — audio.js: all sound is synthesised with WebAudio. No external assets.
// A lazy AudioContext (created on first user gesture) keeps autoplay policies happy.
export function createAudio() {
  let ctx = null;
  let master = null;
  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.4;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }
  function noiseBurst(dur, freq, gain, type) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
  }
  function tone(freq, dur, gain, type, slideTo) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur);
  }
  // Distance attenuation for world sounds: gain falls off past 8 m.
  function dist(pos, listener) {
    if (!listener) return 1;
    const d = Math.hypot(pos.x - listener.x, pos.z - listener.z);
    return Math.max(0.08, 1 - Math.max(0, d - 8) / 40);
  }
  return {
    unlock: ensure,
    shot(pos, def, own, listener) {
      const g = (own ? 0.5 : 0.3) * dist(pos, listener);
      noiseBurst(def.kind === 'sniper' ? 0.22 : 0.09, def.kind === 'sniper' ? 900 : 2400, g);
      if (own) tone(160, 0.06, 0.18, 'square', 70);
    },
    dryFire() { tone(1200, 0.03, 0.12, 'square'); },
    reload() { tone(700, 0.05, 0.15, 'square'); setTimeout(() => tone(500, 0.05, 0.15, 'square'), 160); },
    explosion(pos, listener) {
      const g = 0.8 * dist(pos, listener);
      noiseBurst(0.7, 320, g);
      tone(70, 0.5, 0.5, 'sine', 35);
    },
    smokePop(pos, listener) { noiseBurst(0.4, 900, 0.3 * dist(pos, listener), 'bandpass'); },
    throwSound() { noiseBurst(0.08, 1200, 0.2, 'bandpass'); },
    hit() { tone(1900, 0.04, 0.2, 'sine'); },
    headshot() { tone(2400, 0.06, 0.25, 'sine'); tone(1200, 0.08, 0.15, 'sine'); },
    hurt() { tone(220, 0.12, 0.25, 'sawtooth', 110); },
    plantBeep() { tone(880, 0.09, 0.2, 'square'); },
    roundStart() { tone(440, 0.12, 0.2, 'sine'); setTimeout(() => tone(660, 0.16, 0.2, 'sine'), 130); },
    roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.22, 'sine'), i * 140)); },
    roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.2, 0.2, 'sine'), i * 150)); },
    buy() { tone(990, 0.07, 0.18, 'sine'); },
    denied() { tone(180, 0.12, 0.2, 'square'); },
  };
}
