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

  private tone(type: OscillatorType, from: number, to: number, duration: number, volume = 0.3) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
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

  private noise(duration: number, volume = 0.4) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * duration), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.buffer = buffer;
    src.connect(gain).connect(this.master);
    src.start(t);
  }

  coin = () => this.tone("square", 988, 1976, 0.09, 0.12);
  jump = () => this.tone("triangle", 300, 700, 0.18, 0.25);
  crouch = () => this.tone("sawtooth", 400, 150, 0.15, 0.12);
  lane = () => this.tone("sine", 500, 650, 0.06, 0.12);
  stumble = () => {
    this.noise(0.15, 0.3);
    this.tone("square", 220, 110, 0.2, 0.2);
  };
  crash = () => {
    this.noise(0.5, 0.5);
    this.tone("sawtooth", 200, 40, 0.6, 0.3);
  };
  lifeline = () => {
    this.tone("triangle", 523, 1046, 0.25, 0.25);
    setTimeout(() => this.tone("triangle", 784, 1568, 0.3, 0.2), 120);
  };

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
