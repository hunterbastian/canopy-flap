import { createGameEngine, type GameEngineOptions } from "./game-engine.ts";
import { H, W } from "./config.ts";
import { renderHud } from "./hud-renderer.ts";
import { CanopyScene3D } from "./scene-three.ts";

export interface CanopyFlapOptions extends GameEngineOptions {}

export function initCanopyFlap(
  viewport: HTMLElement,
  hudCanvas: HTMLCanvasElement,
  options: CanopyFlapOptions = {},
) {
  const rawContext = hudCanvas.getContext("2d");
  if (!rawContext) throw new Error("HUD canvas 2D context unavailable");
  const hudCtx: CanvasRenderingContext2D = rawContext;

  const engine = createGameEngine(viewport, options);
  const threeScene = new CanopyScene3D(viewport);

  function resize() {
    const rect = viewport.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const nextWidth = Math.round(rect.width * dpr);
    const nextHeight = Math.round(rect.height * dpr);
    if (hudCanvas.width !== nextWidth || hudCanvas.height !== nextHeight) {
      hudCanvas.width = nextWidth;
      hudCanvas.height = nextHeight;
    }
    hudCtx.setTransform(hudCanvas.width / W, 0, 0, hudCanvas.height / H, 0, 0);
    threeScene.resize();
  }

  function renderFrame(dt = 0) {
    const snapshot = engine.getSnapshot();
    threeScene.render(snapshot, dt);
    renderHud(hudCtx, snapshot);
  }

  function advanceTime(ms: number) {
    return engine.advanceTime(ms, renderFrame);
  }

  let lastFrame = performance.now();
  function loop(now: number) {
    const dt = Math.min(0.033, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    engine.update(dt);
    renderFrame(dt);
    requestAnimationFrame(loop);
  }

  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyF") {
      event.preventDefault();
      const frame = viewport.parentElement;
      if (!document.fullscreenElement) frame?.requestFullscreen?.();
      else document.exitFullscreen?.();
    }
  });

  window.addEventListener("resize", resize);
  document.addEventListener("fullscreenchange", resize);

  resize();
  requestAnimationFrame(loop);

  return {
    toggleMute: engine.toggleMute,
    renderGameToText: engine.renderGameToText,
    advanceTime,
    get muted() {
      return engine.muted;
    },
  };
}