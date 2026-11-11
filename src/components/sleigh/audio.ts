/** Locally synthesised wind and sleigh bells. No recordings or network requests. */
export class SleighAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private wind: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private active = false;
  async enable() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.12;
      this.master.connect(this.context.destination);
      const buffer = this.context.createBuffer(
        1,
        this.context.sampleRate * 3,
        this.context.sampleRate,
      );
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = this.context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 420;
      this.wind = this.context.createGain();
      this.wind.gain.value = 0.15;
      source.connect(filter).connect(this.wind).connect(this.master);
      source.start();
    }
    await this.context.resume();
    this.active = true;
    if (!this.timer)
      this.timer = setInterval(
        () => this.bell(880 + Math.random() * 700, 0.08),
        1200,
      );
  }
  setSpeed(speed: number) {
    if (this.context && this.wind)
      this.wind.gain.setTargetAtTime(
        0.08 + speed / 400,
        this.context.currentTime,
        0.3,
      );
  }
  bell(frequency = 1320, volume = 0.23) {
    if (!this.context || !this.master || !this.active) return;
    const now = this.context.currentTime;
    for (const ratio of [1, 2.76, 4.1]) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.frequency.value = frequency * ratio;
      gain.gain.setValueAtTime(volume / (ratio * 2), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
      oscillator.connect(gain).connect(this.master);
      oscillator.start(now);
      oscillator.stop(now + 1.5);
    }
  }
  disable() {
    this.active = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.context?.suspend();
  }
  dispose() {
    this.disable();
    void this.context?.close();
    this.context = null;
  }
}
