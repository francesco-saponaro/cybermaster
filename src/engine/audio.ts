// Sound effects made with the Web Audio API. No files: every sound is a
// short envelope on an oscillator, so the whole set weighs nothing.

type SoundName = 'blip' | 'hit' | 'miss' | 'shoot' | 'boom' | 'clear' | 'levelup' | 'tick' | 'unlock' | 'alert' | 'break' | 'hint' | 'lock' | 'breach' | 'contain';

let context: AudioContext | null = null;
let muted = false;

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!context) context = new Ctor();
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

function tone(
  c: AudioContext,
  { freq, to, type = 'square', start = 0, length = 0.1, gain = 0.08 }: { freq: number; to?: number; type?: OscillatorType; start?: number; length?: number; gain?: number },
): void {
  const osc = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime + start;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + length);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

function noise(c: AudioContext, length = 0.25, gain = 0.12): void {
  const buffer = c.createBuffer(1, Math.floor(c.sampleRate * length), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  const g = c.createGain();
  src.buffer = buffer;
  g.gain.value = gain;
  src.connect(g).connect(c.destination);
  src.start();
}

export function play(name: SoundName): void {
  if (muted) return;
  const c = ctx();
  if (!c) return;
  switch (name) {
    case 'blip':
      tone(c, { freq: 880, length: 0.06, type: 'sine', gain: 0.05 });
      break;
    case 'tick':
      tone(c, { freq: 1200, length: 0.03, type: 'sine', gain: 0.03 });
      break;
    case 'hit':
      tone(c, { freq: 523, to: 1046, length: 0.12, type: 'triangle' });
      tone(c, { freq: 1568, length: 0.1, start: 0.08, type: 'sine', gain: 0.05 });
      break;
    case 'miss':
      tone(c, { freq: 220, to: 110, length: 0.25, type: 'sawtooth', gain: 0.07 });
      break;
    case 'shoot':
      tone(c, { freq: 900, to: 300, length: 0.09, type: 'square', gain: 0.05 });
      break;
    case 'boom':
      noise(c, 0.3, 0.15);
      tone(c, { freq: 120, to: 40, length: 0.3, type: 'sine', gain: 0.12 });
      break;
    case 'clear':
      [523, 659, 784, 1046].forEach((f, i) => tone(c, { freq: f, start: i * 0.09, length: 0.18, type: 'triangle', gain: 0.07 }));
      break;
    case 'levelup':
      [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone(c, { freq: f, start: i * 0.08, length: 0.3, type: 'square', gain: 0.05 }));
      break;
    case 'unlock':
      tone(c, { freq: 660, length: 0.12, type: 'sine', gain: 0.06 });
      tone(c, { freq: 990, length: 0.2, start: 0.1, type: 'sine', gain: 0.06 });
      break;
    case 'alert':
      // Two low notes, like a console alarm heard from the next room.
      tone(c, { freq: 440, length: 0.16, type: 'triangle', gain: 0.06 });
      tone(c, { freq: 330, length: 0.22, start: 0.18, type: 'triangle', gain: 0.06 });
      break;
    case 'break':
      tone(c, { freq: 660, to: 220, length: 0.22, type: 'triangle', gain: 0.06 });
      break;
    case 'hint':
      tone(c, { freq: 740, length: 0.08, type: 'sine', gain: 0.04 });
      tone(c, { freq: 554, length: 0.12, start: 0.07, type: 'sine', gain: 0.04 });
      break;
    case 'lock':
      // The reticle closing: a quick rising sweep and a bright click.
      tone(c, { freq: 220, to: 880, length: 0.28, type: 'sine', gain: 0.06 });
      tone(c, { freq: 1760, length: 0.06, start: 0.28, type: 'square', gain: 0.03 });
      break;
    case 'breach':
      tone(c, { freq: 196, to: 98, length: 0.6, type: 'sawtooth', gain: 0.05 });
      break;
    case 'contain':
      [392, 523, 784].forEach((f, i) => tone(c, { freq: f, start: i * 0.1, length: 0.26, type: 'sine', gain: 0.06 }));
      break;
    default:
      break;
  }
}

/** A combo step: the same soft note, a little higher each time (up to an octave). */
export function playCombo(n: number): void {
  if (muted || n < 2) return;
  const c = ctx();
  if (!c) return;
  const f = 880 * Math.pow(2, Math.min(12, (n - 2) * 2) / 12);
  tone(c, { freq: f, length: 0.07, type: 'sine', gain: 0.035, start: 0.12 });
}
