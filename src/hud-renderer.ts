import { H, palette, W } from "./config.ts";
import { overlayLayout, type GameSnapshot } from "./game-engine.ts";
import type { ButtonRect } from "./types.ts";
import { roundRect } from "./utils.ts";

function drawPill(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  ctx.font = '700 13px "Inter", system-ui, sans-serif';
  const width = Math.ceil(ctx.measureText(text).width + 28);
  ctx.fillStyle = "oklch(0.080 0 0 / 0.34)";
  roundRect(ctx, x, y, width, 32, 12);
  ctx.fill();
  ctx.fillStyle = palette.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + width / 2, y + 16);
}

function drawCenterPill(ctx: CanvasRenderingContext2D, centerX: number, y: number, text: string, pulse: number) {
  ctx.font = '800 12px "Inter", system-ui, sans-serif';
  const width = Math.ceil(ctx.measureText(text).width + 30);
  const active = pulse > 0;
  ctx.fillStyle = active ? "oklch(0.195 0.055 140 / 0.84)" : "oklch(0.070 0.010 145 / 0.42)";
  roundRect(ctx, centerX - width / 2, y, width, 30, 11);
  ctx.fill();
  ctx.strokeStyle = active ? "oklch(0.720 0.120 88 / 0.68)" : "oklch(0.430 0.050 145 / 0.34)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = active ? palette.white : palette.muted;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, centerX, y + 15);
}

function drawHud(ctx: CanvasRenderingContext2D, snapshot: GameSnapshot) {
  const { difficulty } = snapshot;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const pulse = snapshot.scorePulse > 0 ? 1 + Math.sin(snapshot.scorePulse * 22) * 0.045 : 1;
  ctx.save();
  ctx.translate(W / 2, 82);
  ctx.scale(pulse, pulse);
  ctx.font = '700 62px "Inter", system-ui, sans-serif';
  const scoreText = String(snapshot.score);
  const scoreWidth = Math.max(74, Math.ceil(ctx.measureText(scoreText).width + 36));
  ctx.fillStyle = "oklch(0.060 0.008 145 / 0.54)";
  roundRect(ctx, -scoreWidth / 2, -34, scoreWidth, 68, 22);
  ctx.fill();
  ctx.fillStyle = "oklch(0 0 0 / 0.28)";
  ctx.fillText(scoreText, 2, 3);
  ctx.fillStyle = palette.ink;
  ctx.fillText(scoreText, 0, 0);
  ctx.restore();

  drawPill(ctx, 18, 18, `BEST ${snapshot.best}`);
  const paceText = `GROVE ${difficulty.grove}  PACE ${difficulty.pace.toFixed(2)}x`;
  drawCenterPill(ctx, W / 2, 124, paceText, snapshot.pacePulse);
  if (snapshot.streak >= 2 && snapshot.mode === "playing") {
    drawCenterPill(ctx, W / 2, 158, `${snapshot.streak} streak`, snapshot.scorePulse);
  }
}

function drawControlChip(ctx: CanvasRenderingContext2D, x: number, y: number, label: string) {
  ctx.font = '800 12px "Inter", system-ui, sans-serif';
  const width = Math.ceil(ctx.measureText(label).width + 22);
  ctx.fillStyle = "oklch(0.190 0.030 145 / 0.86)";
  roundRect(ctx, x - width / 2, y, width, 32, 12);
  ctx.fill();
  ctx.strokeStyle = "oklch(0.500 0.060 145 / 0.54)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = palette.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y + 16);
}

function drawStatBox(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, value: number) {
  ctx.fillStyle = "oklch(0.180 0.022 145 / 0.84)";
  roundRect(ctx, x, y, 120, 54, 12);
  ctx.fill();
  ctx.strokeStyle = "oklch(0.470 0.060 145 / 0.46)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = palette.muted;
  ctx.font = '700 12px "Inter", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 60, y + 16);
  ctx.fillStyle = palette.ink;
  ctx.font = '800 22px "Inter", system-ui, sans-serif';
  ctx.fillText(String(value), x + 60, y + 36);
}

function drawButton(ctx: CanvasRenderingContext2D, rect: ButtonRect, label: string, fill: string, buttonPress: number) {
  const press = buttonPress * 0.04;
  const scale = 1 - press;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = fill;
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 14);
  ctx.fill();
  ctx.strokeStyle = "oklch(0.080 0.015 145 / 0.50)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = palette.white;
  ctx.font = '800 14px "Inter", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, cy);
  ctx.restore();
}

function scoreMessage(score: number) {
  if (score === 0) return "Find the rhythm and flap again.";
  if (score < 4) return "Good first flight.";
  if (score < 8) return "Clean canopy run.";
  if (score < 16) return "Bronto is cruising.";
  return "Canopy legend.";
}

function drawOverlay(ctx: CanvasRenderingContext2D, snapshot: GameSnapshot) {
  if (snapshot.mode === "playing") return;

  const { isReady, panelX, panelY, panelW, panelH, primaryButton } = overlayLayout(snapshot.mode);
  const enter = snapshot.overlayProgress;
  const scale = 0.96 + enter * 0.04;
  const cx = W / 2;
  const cy = panelY + panelH / 2;

  ctx.save();
  ctx.globalAlpha = 0.34 * enter;
  ctx.fillStyle = "oklch(0.060 0.008 145)";
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = enter;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  ctx.fillStyle = "oklch(0 0 0 / 0.26)";
  roundRect(ctx, panelX + 4, panelY + 6, panelW, panelH, 14);
  ctx.fill();

  ctx.fillStyle = "oklch(0.110 0.012 145 / 0.90)";
  roundRect(ctx, panelX, panelY, panelW, panelH, 14);
  ctx.fill();
  ctx.strokeStyle = "oklch(0.470 0.065 145 / 0.80)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = palette.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '800 38px "Inter", system-ui, sans-serif';
  ctx.fillText(isReady ? "Canopy Flap" : "Crash landing", W / 2, panelY + 48);

  ctx.font = '500 16px "Inter", system-ui, sans-serif';
  ctx.fillStyle = palette.muted;
  if (isReady) {
    ctx.fillText("Guide the winged bronto through the canopy.", W / 2, panelY + 88);
    ctx.fillText("Collect berries · nail perfect gaps · ride the wind.", W / 2, panelY + 112);
    drawControlChip(ctx, 132, panelY + 148, "Space");
    drawControlChip(ctx, 240, panelY + 148, "Tap");
    drawControlChip(ctx, 344, panelY + 148, "Click");
    drawControlChip(ctx, 177, panelY + 188, "W / Up");
    drawControlChip(ctx, 303, panelY + 188, "M Sound");
    drawButton(ctx, primaryButton, "START FLAPPING", palette.primary, snapshot.buttonPress);
  } else {
    if (snapshot.newBest && snapshot.score > 0) {
      ctx.fillStyle = palette.accent;
      roundRect(ctx, W / 2 - 52, panelY + 76, 104, 26, 10);
      ctx.fill();
      ctx.fillStyle = "oklch(0.100 0.020 80)";
      ctx.font = '900 12px "Inter", system-ui, sans-serif';
      ctx.fillText("NEW BEST", W / 2, panelY + 89);
    } else {
      ctx.fillText(scoreMessage(snapshot.score), W / 2, panelY + 86);
    }
    drawStatBox(ctx, 102, panelY + 102, "Score", snapshot.score);
    drawStatBox(ctx, 258, panelY + 102, "Best", snapshot.best);
    drawButton(ctx, primaryButton, "TRY AGAIN", palette.danger, snapshot.buttonPress);
  }
  ctx.restore();
}

function drawFeedback(ctx: CanvasRenderingContext2D, snapshot: GameSnapshot) {
  for (const floater of snapshot.floaters) {
    const t = floater.age / floater.life;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.translate(floater.x, floater.y);
    const isLevel = floater.kind === "level";
    const isBonus = floater.kind === "bonus" || floater.kind === "streak";
    ctx.font = isLevel
      ? '800 14px "Inter", system-ui, sans-serif'
      : '800 18px "Inter", system-ui, sans-serif';
    const width = Math.ceil(ctx.measureText(floater.text).width + (isLevel ? 28 : 24));
    ctx.fillStyle = "oklch(0.050 0.010 145 / 0.45)";
    roundRect(ctx, -width / 2, -17, width, 30, 12);
    ctx.fill();
    ctx.fillStyle = isLevel ? palette.primary : isBonus ? palette.berry : palette.accent;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(floater.text, 0, -1);
    ctx.restore();
  }
}

export function renderHud(ctx: CanvasRenderingContext2D, snapshot: GameSnapshot) {
  ctx.clearRect(0, 0, W, H);
  drawHud(ctx, snapshot);
  drawFeedback(ctx, snapshot);
  drawOverlay(ctx, snapshot);

  if (snapshot.flash > 0) {
    ctx.fillStyle = `oklch(0.980 0.006 120 / ${snapshot.flash * 1.8})`;
    ctx.fillRect(0, 0, W, H);
  }
}