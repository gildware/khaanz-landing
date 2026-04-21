/**
 * Short ringtone-style alert for new admin orders (Web Audio API).
 * Browsers may block audio until the user has interacted with the page.
 */
export function playAdminNewOrderRingtone(): void {
  try {
    const w = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const AC = w.AudioContext ?? w.webkitAudioContext;
    if (!AC || typeof window === "undefined") return;

    const ctx = new AC();
    const connect = (o: OscillatorNode, g: GainNode) => {
      o.connect(g);
      g.connect(ctx.destination);
    };

    const tone = (freq: number, start: number, duration: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      const t0 = ctx.currentTime + start;
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      connect(o, g);
      o.start(t0);
      o.stop(t0 + duration + 0.03);
    };

    tone(880, 0, 0.14);
    tone(1108, 0.16, 0.14);
    tone(1318, 0.34, 0.18);
    tone(880, 0.62, 0.14);
    tone(1174, 0.8, 0.22);

    void ctx.resume().catch(() => {});
    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 1600);
  } catch {
    // ignore
  }
}
