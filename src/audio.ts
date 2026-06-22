import { STORAGE_KEYS } from "./config.ts";

export function createAudio() {
  const audio = {
    context: null as AudioContext | null,
    master: null as GainNode | null,
    muted: localStorage.getItem(STORAGE_KEYS.muted) === "1",
    available: false,
  };

  function ensureAudio() {
    if (audio.context || audio.muted) return;
    try {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      audio.context = new AudioContextCtor();
      audio.master = audio.context.createGain();
      audio.master.gain.value = 0.16;
      audio.master.connect(audio.context.destination);
      audio.available = true;
    } catch {
      audio.available = false;
    }
  }

  function tone(frequency: number, duration: number, gainValue: number, type: OscillatorType, delay: number) {
    const ac = audio.context;
    if (!ac || !audio.master) return;
    const start = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(start);
    osc.stop(start + duration + 0.025);
  }

  function playSound(kind: "flap" | "score" | "best" | "crash" | "toggle" | "berry" | "perfect") {
    if (audio.muted) return;
    ensureAudio();
    const ac = audio.context;
    if (!ac || !audio.master) return;
    if (ac.state === "suspended") ac.resume().catch(() => {});

    if (kind === "score" || kind === "best") {
      tone(kind === "best" ? 690 : 580, 0.035, 0.04, "sine", 0);
      tone(kind === "best" ? 920 : 780, 0.055, 0.05, "triangle", 0.055);
      return;
    }
    if (kind === "berry") {
      tone(520, 0.04, 0.045, "sine", 0);
      tone(740, 0.05, 0.05, "triangle", 0.04);
      tone(980, 0.035, 0.035, "sine", 0.08);
      return;
    }
    if (kind === "perfect") {
      tone(640, 0.03, 0.04, "sine", 0);
      tone(860, 0.045, 0.045, "triangle", 0.035);
      return;
    }
    if (kind === "crash") {
      tone(94, 0.11, 0.09, "sawtooth", 0);
      tone(52, 0.13, 0.07, "triangle", 0.045);
      return;
    }
    if (kind === "toggle") {
      tone(460, 0.03, 0.025, "triangle", 0);
      return;
    }
    tone(360, 0.04, 0.04, "triangle", 0);
    tone(520, 0.025, 0.03, "sine", 0.035);
  }

  function toggleMute(onChange?: (muted: boolean) => void) {
    audio.muted = !audio.muted;
    localStorage.setItem(STORAGE_KEYS.muted, audio.muted ? "1" : "0");
    if (!audio.muted) ensureAudio();
    playSound("toggle");
    onChange?.(audio.muted);
  }

  return { audio, ensureAudio, playSound, toggleMute };
}