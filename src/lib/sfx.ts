type SfxKind = 'place' | 'success' | 'capture' | 'power';

let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === 'undefined') {
    return null;
  }
  const AudioCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) {
    return null;
  }
  if (!audioContext) {
    audioContext = new AudioCtor();
  }
  return audioContext;
}

function scheduleTone(
  ctx: AudioContext,
  startAt: number,
  frequency: number,
  duration: number,
  gainPeak: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(gainPeak, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.03);
}

export function playUiTone(kind: SfxKind) {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }

  void ctx.resume().catch(() => {});
  const now = ctx.currentTime;

  switch (kind) {
    case 'success':
      scheduleTone(ctx, now, 560, 0.18, 0.06);
      scheduleTone(ctx, now + 0.08, 740, 0.22, 0.05);
      break;
    case 'capture':
      scheduleTone(ctx, now, 420, 0.12, 0.05);
      scheduleTone(ctx, now + 0.06, 620, 0.16, 0.045);
      break;
    case 'power':
      scheduleTone(ctx, now, 300, 0.12, 0.05);
      scheduleTone(ctx, now + 0.04, 390, 0.14, 0.04);
      break;
    default:
      scheduleTone(ctx, now, 480, 0.1, 0.04);
      break;
  }
}
