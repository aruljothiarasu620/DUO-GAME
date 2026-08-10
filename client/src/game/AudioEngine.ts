// client/src/game/AudioEngine.ts
// Synthesised audio using Web Audio API — zero external dependencies

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientOscillators: OscillatorNode[] = [];
  private muted = false;

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3;
      this.masterGain.connect(this.ctx.destination);
      this.startAmbient();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  private playTone(
    frequency: number,
    duration: number,
    type: OscillatorType = 'square',
    gainVal = 0.2,
    attack = 0.01,
    decay = 0.1
  ) {
    if (this.muted) return;
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(gainVal, ctx.currentTime + attack);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch {}
  }

  playJump() {
    const ctx = this.getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(); osc.stop(ctx.currentTime + 0.2);
  }

  playSwitch() {
    this.playTone(880, 0.12, 'square', 0.15);
    setTimeout(() => this.playTone(1320, 0.2, 'sine', 0.12), 80);
  }

  playDeath() {
    const ctx = this.getCtx();
    [300, 200, 150].forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.3, 'sawtooth', 0.2), i * 100);
    });
  }

  playCheckpoint() {
    [523, 659, 784].forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.25, 'sine', 0.15), i * 80);
    });
  }

  playLevelComplete() {
    [523, 659, 784, 1047].forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.4, 'sine', 0.2), i * 120);
    });
  }

  playDoorOpen() {
    this.playTone(440, 0.3, 'sine', 0.1);
    setTimeout(() => this.playTone(880, 0.4, 'sine', 0.08), 200);
  }

  playChat() {
    this.playTone(600, 0.05, 'sine', 0.08);
  }

  private startAmbient() {
    if (!this.ctx || !this.masterGain) return;
    try {
      const ambGain = this.ctx.createGain();
      ambGain.gain.value = 0.04;

      // Low drone
      const drone = this.ctx.createOscillator();
      drone.type = 'sine';
      drone.frequency.value = 55;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 200;
      drone.connect(filter);
      filter.connect(ambGain);
      ambGain.connect(this.masterGain);
      drone.start();
      this.ambientOscillators.push(drone);

      // High shimmer
      const shimmer = this.ctx.createOscillator();
      shimmer.type = 'sine';
      shimmer.frequency.value = 440;
      const shimGain = this.ctx.createGain();
      shimGain.gain.value = 0.015;
      shimmer.connect(shimGain);
      shimGain.connect(this.masterGain);
      shimmer.start();
      this.ambientOscillators.push(shimmer);
    } catch {}
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.masterGain) this.masterGain.gain.value = m ? 0 : 0.3;
  }

  destroy() {
    this.ambientOscillators.forEach(o => { try { o.stop(); } catch {} });
    this.ctx?.close();
  }
}
