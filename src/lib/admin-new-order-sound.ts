/**
 * Loud warning-siren alert for new admin orders (Web Audio API).
 * Reuses one AudioContext so playback works after a user gesture (autoplay policy).
 */

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const AC = w.AudioContext ?? w.webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AC();
  }
  return sharedCtx;
}

export function primeAdminNewOrderAudio(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
}

function scheduleSiren(ctx: AudioContext): void {
  const duration = 2.15;
  const t0 = ctx.currentTime;
  const master = ctx.createGain();
  master.connect(ctx.destination);
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(0.7, t0 + 0.03);
  master.gain.setValueAtTime(0.7, t0 + duration - 0.1);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  const wail = ctx.createOscillator();
  const wailGain = ctx.createGain();
  wail.type = "sawtooth";
  wailGain.gain.value = 0.85;
  wail.connect(wailGain);
  wailGain.connect(master);

  const bite = ctx.createOscillator();
  const biteGain = ctx.createGain();
  bite.type = "square";
  biteGain.gain.value = 0.28;
  bite.connect(biteGain);
  biteGain.connect(master);

  const low = 620;
  const high = 1480;
  const sweeps = 5;
  wail.frequency.setValueAtTime(low, t0);
  bite.frequency.setValueAtTime(low * 1.5, t0);
  for (let i = 0; i < sweeps; i++) {
    const up = t0 + ((i + 0.5) * duration) / sweeps;
    const down = t0 + ((i + 1) * duration) / sweeps;
    wail.frequency.linearRampToValueAtTime(high, up);
    wail.frequency.linearRampToValueAtTime(low, down);
    bite.frequency.linearRampToValueAtTime(high * 1.5, up);
    bite.frequency.linearRampToValueAtTime(low * 1.5, down);
  }

  wail.start(t0);
  bite.start(t0);
  wail.stop(t0 + duration + 0.02);
  bite.stop(t0 + duration + 0.02);
}

export function playAdminNewOrderRingtone(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const run = () => {
      try {
        scheduleSiren(ctx);
      } catch {
        /* ignore */
      }
    };
    if (ctx.state === "suspended") {
      void ctx.resume().then(run).catch(() => {});
      return;
    }
    run();
  } catch {
    // ignore
  }
}
