import { initCanopyFlap } from "./canopy-flap.ts";
import "./styles.css";

const viewport = document.getElementById("viewport");
const hudCanvas = document.getElementById("hud");
const soundToggle = document.getElementById("sound-toggle");
const soundLabel = document.getElementById("sound-label");

if (!(viewport instanceof HTMLElement)) {
  throw new Error("Missing #viewport element");
}
if (!(hudCanvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing #hud canvas");
}

function syncSoundUi(muted: boolean) {
  if (soundToggle instanceof HTMLButtonElement) {
    soundToggle.setAttribute("aria-pressed", muted ? "true" : "false");
  }
  if (soundLabel) {
    soundLabel.textContent = muted ? "Sound off" : "Sound on";
  }
}

const game = initCanopyFlap(viewport, hudCanvas, { onMuteChange: syncSoundUi });
syncSoundUi(game.muted);

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => string;
  }
}

window.render_game_to_text = game.renderGameToText;
window.advanceTime = game.advanceTime;

if (soundToggle instanceof HTMLButtonElement) {
  soundToggle.addEventListener("click", () => {
    game.toggleMute();
  });
}