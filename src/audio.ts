/**
 * All sound is synthesized with WebAudio — no asset downloads, tiny bundle.
 * SFX are rate-limited per type so 300 simultaneous hits don't turn into noise.
 */
export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private last = new Map<string, number>();
  sfxOn = true;
  musicOn = true;
  private pickupStreak = 0;
  private pickupT = 0;

  // music
  private nextNote = 0;
  private step = 0;
  private playing = false;
  intensity = 0; // 0..1, raised by the game as runs progress
  private timer: number | null = null;
  bossMode = false;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.55;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.32;
    this.musicBus.connect(this.master);
    const len = this.ctx.sampleRate * 1;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (this.musicBus) this.musicBus.gain.value = on ? 0.32 : 0;
  }

  private gate(key: string, minGap: number) {
    if (!this.ctx || !this.sfxOn) return false;
    const now = this.ctx.currentTime;
    const l = this.last.get(key) ?? -1;
    if (now - l < minGap) return false;
    this.last.set(key, now);
    return true;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, when = 0, bus = this.sfxBus) {
    const c = this.ctx!;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseHit(dur: number, vol: number, filter: BiquadFilterType, freq: number, when = 0, bus = this.sfxBus, q = 1) {
    const c = this.ctx!;
    const t = c.currentTime + when;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(bus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  // ------------------------------------------------------------------ sfx

  shoot(weapon: string) {
    if (!this.gate('shoot-' + weapon, 0.07)) return;
    switch (weapon) {
      case 'pistol':
        this.tone(980, 0.07, 'square', 0.05, 420);
        break;
      case 'arc':
        this.noiseHit(0.12, 0.12, 'bandpass', 3200, 0, this.sfxBus, 4);
        this.tone(1800, 0.08, 'sawtooth', 0.03, 300);
        break;
      case 'frag':
      case 'napalm':
        this.tone(220, 0.12, 'triangle', 0.08, 120);
        break;
      case 'disc':
        this.tone(600, 0.18, 'sine', 0.06, 1200);
        break;
      case 'drill':
        this.tone(140, 0.2, 'sawtooth', 0.04, 260);
        break;
      case 'cleaver':
        this.noiseHit(0.14, 0.12, 'bandpass', 1400, 0, this.sfxBus, 1.5);
        this.tone(300, 0.12, 'sawtooth', 0.04, 120);
        break;
      case 'blades':
        this.tone(400, 0.25, 'sine', 0.05, 900);
        break;
    }
  }

  hit() {
    if (!this.gate('hit', 0.035)) return;
    this.noiseHit(0.04, 0.05, 'highpass', 2500);
  }

  kill() {
    if (!this.gate('kill', 0.045)) return;
    this.noiseHit(0.09, 0.09, 'lowpass', 900 + Math.random() * 500);
    this.tone(160 + Math.random() * 60, 0.08, 'sine', 0.05, 70);
  }

  pickup(kind: string) {
    if (!this.ctx) return;
    if (kind === 'xp') {
      const now = this.ctx.currentTime;
      if (now - this.pickupT > 0.5) this.pickupStreak = 0;
      this.pickupT = now;
      if (!this.gate('xp', 0.03)) return;
      this.pickupStreak = Math.min(this.pickupStreak + 1, 24);
      const f = 660 * Math.pow(2, (this.pickupStreak % 12) / 12);
      this.tone(f, 0.06, 'sine', 0.045);
      return;
    }
    if (!this.gate('pk-' + kind, 0.05)) return;
    if (kind === 'gold') {
      this.tone(1320, 0.06, 'square', 0.03);
      this.tone(1760, 0.1, 'square', 0.03, undefined, 0.05);
    } else if (kind === 'chest') {
      [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.08, undefined, i * 0.06));
    } else {
      [440, 660, 880].forEach((f, i) => this.tone(f, 0.18, 'square', 0.04, undefined, i * 0.05));
    }
  }

  explode() {
    if (!this.gate('boom', 0.06)) return;
    this.noiseHit(0.45, 0.28, 'lowpass', 500);
    this.tone(90, 0.35, 'sine', 0.18, 35);
  }

  emp() {
    if (!this.gate('emp', 0.3)) return;
    this.tone(60, 0.8, 'sawtooth', 0.15, 2000);
    this.noiseHit(0.8, 0.25, 'bandpass', 1500, 0, this.sfxBus, 0.7);
  }

  hurt() {
    if (!this.gate('hurt', 0.12)) return;
    this.tone(180, 0.15, 'square', 0.08, 70);
  }

  levelUp() {
    if (!this.gate('lvl', 0.2)) return;
    [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.22, 'square', 0.05, undefined, i * 0.045));
  }

  evolve() {
    if (!this.gate('evo', 0.4)) return;
    [261, 329, 392, 523, 659, 784].forEach((f, i) => {
      this.tone(f, 0.9, 'sawtooth', 0.05, undefined, i * 0.07);
      this.tone(f * 2, 0.6, 'sine', 0.04, undefined, i * 0.07);
    });
  }

  warn() {
    if (!this.gate('warn', 1)) return;
    for (let i = 0; i < 3; i++) {
      this.tone(440, 0.22, 'sawtooth', 0.06, 660, i * 0.28);
    }
  }

  bossRoar() {
    if (!this.gate('roar', 1)) return;
    this.tone(70, 1.4, 'sawtooth', 0.2, 40);
    this.noiseHit(1.2, 0.2, 'lowpass', 300);
  }

  click() {
    if (!this.gate('click', 0.03)) return;
    this.tone(1200, 0.035, 'square', 0.035);
  }

  // ------------------------------------------------------------------ music

  startMusic() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic() {
    this.playing = false;
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * A driving 16-step loop in A minor: kick/snare/hat kit, sidechained-feeling bass, and an arp
   * that fades in as intensity rises. Boss mode switches to a darker progression and double-time hats.
   */
  private schedule() {
    const c = this.ctx!;
    const bpm = this.bossMode ? 150 : 132;
    const sixteenth = 60 / bpm / 4;
    while (this.nextNote < c.currentTime + 0.12) {
      this.playStep(this.step, this.nextNote - c.currentTime);
      this.nextNote += sixteenth;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(s: number, when: number) {
    const bar = Math.floor(s / 16);
    const i = s % 16;
    const prog = this.bossMode ? [[45, 57], [46, 58], [43, 55], [44, 56]] : [[45, 57], [41, 53], [48, 60], [43, 55]];
    const root = prog[bar][0];
    const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    const bus = this.musicBus;
    // kick: 4 on the floor + pickup
    if (i % 4 === 0 || (i === 14 && bar % 2 === 1)) {
      this.tone(150, 0.22, 'sine', 0.55, 40, when, bus);
    }
    // snare on 2 and 4 with ghost note
    if (i === 4 || i === 12) this.noiseHit(0.16, 0.32, 'bandpass', 1800, when, bus, 0.8);
    if (i === 15 && this.intensity > 0.4) this.noiseHit(0.06, 0.12, 'bandpass', 2000, when, bus, 0.8);
    // hats
    const hatEvery = this.bossMode || this.intensity > 0.6 ? 1 : 2;
    if (i % hatEvery === 0) this.noiseHit(0.03, i % 4 === 2 ? 0.12 : 0.06, 'highpass', 7000, when, bus);
    // bass: eighths, octave bounce
    if (i % 2 === 0) {
      const m = i % 4 === 2 ? root + 12 : root;
      this.tone(hz(m - 12), 0.14, 'sawtooth', 0.14, undefined, when, bus);
    }
    // arp
    if (this.intensity > 0.2 && i % 2 === 1) {
      const chord = [0, 3, 7, 12, 15, 12, 7, 3];
      const m = prog[bar][1] + 12 + chord[(i >> 1) % chord.length];
      this.tone(hz(m), 0.1, 'square', 0.03 + this.intensity * 0.02, undefined, when, bus);
    }
    // pad swell at bar start
    if (i === 0) {
      for (const k of [0, 3, 7]) this.tone(hz(prog[bar][1] + k), 1.6, 'triangle', 0.035, undefined, when, bus);
    }
  }
}

export const audio = new Audio();
