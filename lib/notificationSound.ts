export type NotificationSoundId = "beep" | "chime" | "doorbell" | "pokemon";

export function normalizeSoundId(id: string | null | undefined): NotificationSoundId {
  if (id === "chime") return "chime";
  if (id === "doorbell") return "doorbell";
  if (id === "pokemon") return "pokemon";
  return "beep";
}

export async function playNotificationSound(opts: {
  sound: NotificationSoundId;
  volume: number; // 0-100
}) {
  const volume = Math.max(0, Math.min(100, Math.trunc(opts.volume))) / 100;
  if (volume <= 0) return;

  // For the custom mp3-based sound, use the HTMLAudioElement API.
  if (opts.sound === "doorbell" || opts.sound === "pokemon") {
    if (typeof window === "undefined" || typeof Audio === "undefined") return;
    const audio = new Audio(opts.sound === "doorbell" ? "/doorbell.mp3" : "/pokemon.mp3");
    audio.volume = volume;
    try {
      await audio.play();
    } catch {
      // If autoplay is blocked or play fails, just silently ignore
    }
    return;
  }

  const AudioContextCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;

  const ctx = new AudioContextCtor();
  try {
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (opts.sound === "chime" ? 0.75 : 0.25));
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(opts.sound === "chime" ? 784 : 880, now);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + (opts.sound === "chime" ? 0.75 : 0.25));

    if (opts.sound === "chime") {
      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(988, now + 0.15);
      const gain2 = ctx.createGain();
      gain2.gain.setValueAtTime(0.0001, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.8), now + 0.16);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.65);
    }

    await new Promise<void>((resolve) => {
      const t = window.setTimeout(resolve, opts.sound === "chime" ? 900 : 350);
      // if timers are blocked, still resolve on close
      void t;
    });
  } finally {
    // close releases resources; safe even if already closed
    await ctx.close().catch(() => {});
  }
}

