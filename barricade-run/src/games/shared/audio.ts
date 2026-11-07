import type { Sound } from "./types";

/** Tiny Web Audio synth for game sounds. No audio files to download or cache. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private siren: { osc: OscillatorNode; gain: GainNode } | null = null;
  private sirenOn = false;
  muted = false;

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  private tone(type: OscillatorType, from: number, to: number, duration: number, volume = 0.3, delay = 0) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private noise(duration: number, volume = 0.4, filter?: number) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * duration), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.buffer = buffer;
    if (filter) {
      const bq = this.ctx.createBiquadFilter();
      bq.type = "bandpass";
      bq.frequency.setValueAtTime(filter, t);
      bq.frequency.exponentialRampToValueAtTime(filter * 4, t + duration);
      src.connect(bq).connect(gain).connect(this.master);
    } else {
      src.connect(gain).connect(this.master);
    }
    src.start(t);
  }

  private sounds: Record<Sound, () => void> = {
    coin: () => this.tone("square", 988, 1976, 0.09, 0.12),
    jump: () => this.tone("triangle", 300, 700, 0.18, 0.25),
    crouch: () => this.tone("sawtooth", 400, 150, 0.15, 0.12),
    lane: () => this.tone("sine", 500, 650, 0.06, 0.12),
    stumble: () => {
      this.noise(0.15, 0.3);
      this.tone("square", 220, 110, 0.2, 0.2);
    },
    crash: () => {
      this.noise(0.5, 0.5);
      this.tone("sawtooth", 200, 40, 0.6, 0.3);
    },
    lifeline: () => {
      this.tone("triangle", 523, 1046, 0.25, 0.25);
      this.tone("triangle", 784, 1568, 0.3, 0.2, 0.12);
    },
    nitro: () => {
      this.noise(0.7, 0.35, 300);
      this.tone("sawtooth", 120, 520, 0.6, 0.12);
    },
    smash: () => {
      this.noise(0.25, 0.45, 900);
      this.tone("square", 600, 200, 0.18, 0.12);
    },
    brake: () => this.noise(0.3, 0.18, 2400),
    clank: () => {
      this.tone("square", 180, 160, 0.08, 0.18);
      this.tone("square", 140, 120, 0.08, 0.14, 0.07);
    },
    bell: () => {
      this.tone("sine", 1568, 1560, 0.5, 0.18);
      this.tone("sine", 2093, 2080, 0.4, 0.1, 0.02);
      this.tone("sine", 1568, 1560, 0.4, 0.14, 0.18);
    },
    whistle: () => {
      this.tone("sine", 2200, 2400, 0.12, 0.12);
      this.tone("sine", 2200, 2600, 0.25, 0.12, 0.15);
    },
    level: () => {
      this.tone("triangle", 523, 523, 0.12, 0.2);
      this.tone("triangle", 659, 659, 0.12, 0.2, 0.1);
      this.tone("triangle", 784, 1046, 0.3, 0.2, 0.2);
    },
    hit: () => {
      this.noise(0.08, 0.35, 180);
      this.tone("sine", 140, 60, 0.12, 0.3);
    },
    cheer: () => {
      this.noise(1.2, 0.12, 900);
      this.noise(0.9, 0.08, 1600);
    },
    horn: () => {
      this.tone("sawtooth", 415, 410, 0.35, 0.09);
      this.tone("sawtooth", 523, 518, 0.35, 0.07);
    },
  };

  play = (sound: Sound) => this.sounds[sound]();

  private rumbleNode: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; hum: OscillatorNode; humGain: GainNode } | null = null;
  private lastClack = 0;

  /** Electric local train: motor hum and wheel rumble that rise with speed, plus clacks over rail joints. Call every frame. */
  setRumble(level: number) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    if (!this.rumbleNode && level > 0.01) {
      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
        data[i] = last * 6;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 300;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.master);
      src.start();
      const hum = ctx.createOscillator();
      hum.type = "sawtooth";
      hum.frequency.value = 90;
      const humGain = ctx.createGain();
      humGain.gain.value = 0;
      hum.connect(humGain).connect(this.master);
      hum.start();
      this.rumbleNode = { src, gain, filter, hum, humGain };
    }
    const r = this.rumbleNode;
    if (!r) return;
    const t = ctx.currentTime;
    r.gain.gain.setTargetAtTime(this.muted ? 0 : level * 0.55, t, 0.3);
    r.filter.frequency.setTargetAtTime(180 + level * 520, t, 0.3);
    r.hum.frequency.setTargetAtTime(70 + level * 180, t, 0.4);
    r.humGain.gain.setTargetAtTime(this.muted ? 0 : level * 0.018, t, 0.3);
    // Wheels over a rail joint: a double clack, faster at speed.
    if (level > 0.25 && t - this.lastClack > 0.9 / level) {
      this.lastClack = t;
      this.tone("square", 120, 70, 0.05, 0.12 * level);
      this.tone("square", 110, 60, 0.05, 0.1 * level, 0.11);
    }
  }

  /** Two-tone police siren while the chase is on. Safe to call every frame. */
  setSiren(on: boolean) {
    if (on === this.sirenOn || !this.ctx || !this.master) return;
    this.sirenOn = on;
    const t = this.ctx.currentTime;
    if (on) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      for (let i = 0; i < 40; i++) osc.frequency.setValueAtTime(i % 2 ? 960 : 720, t + i * 0.4);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.06, t + 0.2);
      osc.connect(gain).connect(this.master);
      osc.start(t);
      this.siren = { osc, gain };
    } else if (this.siren) {
      const { osc, gain } = this.siren;
      gain.gain.setTargetAtTime(0, t, 0.1);
      osc.stop(t + 0.5);
      this.siren = null;
    }
  }
}
