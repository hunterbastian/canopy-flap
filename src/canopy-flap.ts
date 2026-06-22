import { createAudio } from "./audio.ts";
import { config, floorY, H, palette, STORAGE_KEYS, W } from "./config.ts";
import type { Bird, ButtonRect, Floater, GameMode, Particle, Pipe } from "./types.ts";
import { clamp, makeRng, pointInRect, roundRect } from "./utils.ts";

export interface CanopyFlapOptions {
  onMuteChange?: (muted: boolean) => void;
}

export function initCanopyFlap(canvas: HTMLCanvasElement, options: CanopyFlapOptions = {}) {
  const rawContext = canvas.getContext("2d");
  if (!rawContext) throw new Error("Canvas 2D context unavailable");
  const ctx: CanvasRenderingContext2D = rawContext;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { audio, ensureAudio, playSound, toggleMute } = createAudio();

  const state = {
    mode: "ready" as GameMode,
    time: 0,
    score: 0,
    best: Number(localStorage.getItem(STORAGE_KEYS.best) || 0),
    pipeTimer: 0,
    seed: 1337,
    rng: makeRng(1337),
    fxRng: makeRng(7331),
    lastGapY: 336,
    shake: 0,
    flash: 0,
    scorePulse: 0,
    pacePulse: 0,
    lastLevel: 0,
    newBest: false,
    streak: 0,
    overlayProgress: 1,
    buttonPress: 0,
    pointerDown: false,
    bird: { x: config.birdX, y: 292, vy: 0, rotation: 0 } satisfies Bird,
    pipes: [] as Pipe[],
    particles: [] as Particle[],
    floaters: [] as Floater[],
  };

  function setMode(mode: GameMode) {
    state.mode = mode;
    state.overlayProgress = reducedMotion ? 1 : 0;
  }

  function currentLevel(score = state.score) {
    return Math.min(config.maxLevel, Math.floor(score / config.levelEvery));
  }

  function currentDifficulty(score = state.score) {
    const level = currentLevel(score);
    const pipeSpeed = config.pipeSpeed + level * config.speedPerLevel;
    const pipeGap = Math.max(config.minPipeGap, config.pipeGap - level * 5.5);
    const pipeInterval = Math.max(config.minPipeInterval, config.pipeInterval - level * config.intervalStep);
    return {
      level,
      grove: level + 1,
      pipeSpeed,
      pipeGap,
      pipeInterval,
      pace: pipeSpeed / config.pipeSpeed,
    };
  }

  function spawnPipe(x = W + 84, friendly = false) {
    const difficulty = currentDifficulty();
    const gap = difficulty.pipeGap;
    const minGapY = Math.max(198, config.safeCeiling + gap / 2 + 86);
    const maxGapY = Math.min(floorY - 166, floorY - gap / 2 - 86);
    const step = (state.rng() - 0.5) * 136;
    const gapY = friendly ? 336 : clamp(state.lastGapY + step, minGapY, maxGapY);
    state.lastGapY = gapY;

    const pipe: Pipe = { x, gapY, gap, passed: false };
    if (!friendly && state.rng() < config.berryChance) {
      pipe.berry = {
        y: gapY + (state.rng() - 0.5) * gap * 0.35,
        collected: false,
      };
    }
    state.pipes.push(pipe);
  }

  function resetGame(nextMode: GameMode = "ready") {
    setMode(nextMode);
    state.time = 0;
    state.score = 0;
    state.pipeTimer = 0;
    state.seed = 1337;
    state.rng = makeRng(state.seed);
    state.fxRng = makeRng(state.seed + 5994);
    state.lastGapY = 336;
    state.shake = 0;
    state.flash = 0;
    state.scorePulse = 0;
    state.pacePulse = 0;
    state.lastLevel = 0;
    state.newBest = false;
    state.streak = 0;
    state.buttonPress = 0;
    state.bird = { x: config.birdX, y: 292, vy: 0, rotation: 0 };
    state.pipes = [];
    state.particles = [];
    state.floaters = [];
    spawnPipe(W + 132, true);
  }

  function spawnFloater(kind: Floater["kind"], text: string, x: number, y: number, vy = -24, life = 0.9) {
    state.floaters.push({ kind, text, x, y, vy, life, age: 0 });
  }

  function spawnFlapTrail() {
    if (reducedMotion) return;
    for (let i = 0; i < 5; i += 1) {
      state.particles.push({
        kind: "leaf",
        x: state.bird.x - 26 - i * 4,
        y: state.bird.y + 8 + (state.fxRng() - 0.5) * 14,
        vx: -42 - state.fxRng() * 36,
        vy: -22 + state.fxRng() * 44,
        life: 0.48 + state.fxRng() * 0.22,
        age: 0,
        size: 4 + state.fxRng() * 4,
        spin: state.fxRng() * Math.PI,
        color: i % 2 ? "oklch(0.800 0.110 92)" : "oklch(0.720 0.110 130)",
      });
    }
  }

  function spawnBurst(count: number, colors: string[]) {
    if (reducedMotion) return;
    for (let i = 0; i < count; i += 1) {
      const angle = -Math.PI * 0.9 + state.fxRng() * Math.PI * 0.8;
      const speed = 38 + state.fxRng() * 74;
      state.particles.push({
        kind: "spark",
        x: state.bird.x + 12,
        y: state.bird.y - 8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.56 + state.fxRng() * 0.28,
        age: 0,
        size: 2.5 + state.fxRng() * 3.5,
        spin: 0,
        color: colors[i % colors.length] ?? palette.accent,
      });
    }
  }

  function spawnScoreBurst() {
    state.scorePulse = reducedMotion ? 0.12 : 0.34;
    spawnFloater("score", "+1", state.bird.x + 20, state.bird.y - 28, -28, 0.78);
    playSound("score");
    spawnBurst(14, [palette.accent, palette.wing, palette.berry]);
  }

  function spawnBerryBurst(x: number, y: number) {
    playSound("berry");
    spawnFloater("bonus", `+${config.berryBonus}`, x, y - 12, -30, 0.82);
    if (reducedMotion) return;
    for (let i = 0; i < 12; i += 1) {
      const angle = state.fxRng() * Math.PI * 2;
      const speed = 24 + state.fxRng() * 56;
      state.particles.push({
        kind: "berry",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5 + state.fxRng() * 0.3,
        age: 0,
        size: 3 + state.fxRng() * 4,
        spin: state.fxRng() * Math.PI,
        color: i % 2 ? palette.berry : palette.accent,
      });
    }
  }

  function spawnLevelFloater(level: number) {
    state.pacePulse = reducedMotion ? 0.18 : 0.44;
    spawnFloater("level", `GROVE ${level + 1}`, state.bird.x + 48, state.bird.y - 50, -22, 1.05);
    spawnBurst(10, [palette.primary, palette.accent]);
  }

  function spawnCrashBurst() {
    if (reducedMotion) return;
    for (let i = 0; i < 18; i += 1) {
      const angle = Math.PI + state.fxRng() * Math.PI;
      const speed = 45 + state.fxRng() * 120;
      state.particles.push({
        kind: "leaf",
        x: state.bird.x + (state.fxRng() - 0.5) * 22,
        y: state.bird.y + (state.fxRng() - 0.5) * 22,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.35 + state.fxRng() * 0.55,
        age: 0,
        size: 5 + state.fxRng() * 8,
        spin: state.fxRng() * Math.PI,
        color: i % 2 ? palette.bronto : palette.brontoBelly,
      });
    }
  }

  function crash() {
    if (state.mode !== "playing") return;
    setMode("gameover");
    state.shake = reducedMotion ? 0 : 0.28;
    state.flash = 0.2;
    state.newBest = state.score > state.best;
    state.best = Math.max(state.best, state.score);
    state.streak = 0;
    localStorage.setItem(STORAGE_KEYS.best, String(state.best));
    spawnCrashBurst();
    playSound(state.newBest ? "best" : "crash");
  }

  function flap() {
    if (state.mode === "gameover") return;
    state.bird.vy = config.flapVelocity;
    state.bird.rotation = -0.34;
    spawnFlapTrail();
    playSound("flap");
  }

  function startGame() {
    if (state.mode !== "playing") resetGame("playing");
    flap();
  }

  function retryGame() {
    resetGame("playing");
    flap();
  }

  function effectiveRadius() {
    return state.bird.vy < 0 ? config.birdRadius * config.risingHitboxScale : config.birdRadius;
  }

  function circleHitsPipe(cx: number, cy: number, radius: number, pipe: Pipe) {
    const left = pipe.x;
    const right = pipe.x + config.pipeWidth;
    const gapTop = pipe.gapY - pipe.gap / 2;
    const gapBottom = pipe.gapY + pipe.gap / 2;
    const inPipeX = cx + radius > left && cx - radius < right;
    const outsideGap = cy - radius < gapTop || cy + radius > gapBottom;
    return inPipeX && outsideGap;
  }

  function tryCollectBerry(pipe: Pipe) {
    const berry = pipe.berry;
    if (!berry || berry.collected) return;
    const bx = pipe.x + config.pipeWidth / 2;
    const by = berry.y;
    const dx = state.bird.x - bx;
    const dy = state.bird.y - by;
    const reach = config.birdRadius + config.berryRadius;
    if (dx * dx + dy * dy <= reach * reach) {
      berry.collected = true;
      state.score += config.berryBonus;
      state.scorePulse = reducedMotion ? 0.14 : 0.38;
      spawnBerryBurst(bx, by);
    }
  }

  function handlePipePass(pipe: Pipe) {
    pipe.passed = true;
    state.score += 1;
    state.streak += 1;
    spawnScoreBurst();

    const perfectBand = pipe.gap * config.perfectGapRatio * 0.5;
    if (Math.abs(state.bird.y - pipe.gapY) <= perfectBand) {
      state.score += config.perfectBonus;
      spawnFloater("bonus", "Perfect!", state.bird.x + 34, state.bird.y - 42, -26, 0.88);
      playSound("perfect");
    }

    if (state.streak >= config.streakAnnounceEvery && state.streak % config.streakAnnounceEvery === 0) {
      spawnFloater("streak", `${state.streak} flow`, state.bird.x + 40, state.bird.y - 58, -20, 0.95);
    }

    const nextLevel = currentLevel();
    if (nextLevel > state.lastLevel) {
      state.lastLevel = nextLevel;
      spawnLevelFloater(nextLevel);
    }
  }

  function updateFeedback(dt: number) {
    state.scorePulse = Math.max(0, state.scorePulse - dt);
    state.pacePulse = Math.max(0, state.pacePulse - dt);
    state.buttonPress = Math.max(0, state.buttonPress - dt * 6);
    if (state.overlayProgress < 1) state.overlayProgress = Math.min(1, state.overlayProgress + dt * (reducedMotion ? 8 : 4.5));

    for (const particle of state.particles) {
      particle.age += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 72 * dt;
      particle.spin += dt * 5.2;
    }
    state.particles = state.particles.filter((p) => p.age < p.life);

    for (const floater of state.floaters) {
      floater.age += dt;
      floater.y += floater.vy * dt;
    }
    state.floaters = state.floaters.filter((f) => f.age < f.life);
  }

  function update(dt: number) {
    state.time += dt;
    state.shake = Math.max(0, state.shake - dt);
    state.flash = Math.max(0, state.flash - dt);
    updateFeedback(dt);

    if (state.mode === "ready") {
      state.bird.y = 292 + Math.sin(state.time * 2.6) * 8;
      state.bird.rotation = Math.sin(state.time * 2.6) * 0.08;
      return;
    }

    if (state.mode !== "playing") {
      state.bird.vy += config.gravity * dt;
      state.bird.y += state.bird.vy * dt;
      state.bird.rotation = Math.min(1.25, state.bird.rotation + dt * 3.6);
      if (state.bird.y > floorY - config.birdRadius) {
        state.bird.y = floorY - config.birdRadius;
        state.bird.vy = 0;
      }
      return;
    }

    const difficulty = currentDifficulty();
    if (difficulty.grove >= config.windGrove) {
      state.bird.vy += Math.sin(state.time * 2.3) * config.windStrength * dt;
    }

    state.bird.vy += config.gravity * dt;
    state.bird.y += state.bird.vy * dt;
    state.bird.rotation = clamp(state.bird.vy / 470, -0.38, 1.18);

    state.pipeTimer += dt;
    if (state.pipeTimer >= difficulty.pipeInterval) {
      state.pipeTimer -= difficulty.pipeInterval;
      spawnPipe();
    }

    for (const pipe of state.pipes) {
      pipe.x -= difficulty.pipeSpeed * dt;
      tryCollectBerry(pipe);
      if (!pipe.passed && pipe.x + config.pipeWidth < state.bird.x - config.birdRadius) {
        handlePipePass(pipe);
      }
    }

    state.pipes = state.pipes.filter((pipe) => pipe.x > -config.pipeWidth - 20);

    const radius = effectiveRadius();
    if (state.bird.y - radius < config.safeCeiling || state.bird.y + radius > floorY) {
      crash();
      return;
    }

    for (const pipe of state.pipes) {
      if (circleHitsPipe(state.bird.x, state.bird.y, radius, pipe)) {
        crash();
        return;
      }
    }
  }

  function overlayLayout() {
    const isReady = state.mode === "ready";
    return {
      isReady,
      panelX: 48,
      panelY: isReady ? 154 : 194,
      panelW: W - 96,
      panelH: isReady ? 338 : 244,
      primaryButton: isReady
        ? ({ x: 133, y: 256, w: 214, h: 48, action: "start" } satisfies ButtonRect)
        : ({ x: 139, y: 168, w: 202, h: 48, action: "retry" } satisfies ButtonRect),
    };
  }

  function canvasPoint(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function handlePrimaryInput(event: Event) {
    event.preventDefault();
    ensureAudio();
    canvas.focus({ preventScroll: true });

    if (state.mode === "ready") startGame();
    else if (state.mode === "playing") flap();
    else retryGame();
  }

  function handlePointerDown(event: PointerEvent) {
    const point = canvasPoint(event);
    const { primaryButton } = overlayLayout();
    if (state.mode !== "playing" && pointInRect(point.x, point.y, primaryButton)) {
      state.buttonPress = 1;
      state.pointerDown = true;
    }
    handlePrimaryInput(event);
  }

  function handlePointerUp() {
    state.pointerDown = false;
  }

  // --- Rendering ---

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, floorY);
    sky.addColorStop(0, palette.skyTop);
    sky.addColorStop(0.48, palette.skyMid);
    sky.addColorStop(1, palette.skyLow);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const sunX = 384;
    const sunY = 118;
    const glow = ctx.createRadialGradient(sunX, sunY, 14, sunX, sunY, 210);
    glow.addColorStop(0, "oklch(0.920 0.125 82 / 0.62)");
    glow.addColorStop(0.34, "oklch(0.810 0.100 92 / 0.24)");
    glow.addColorStop(1, "oklch(0.620 0.070 135 / 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, floorY);

    drawRidge(0.18, 500, palette.primaryDeep, 0.42);
    drawRidge(0.34, 548, "oklch(0.270 0.070 148 / 0.70)", 0.62);
    drawRidge(0.54, 594, "oklch(0.320 0.085 146 / 0.86)", 0.90);

    for (let i = 0; i < 28; i += 1) {
      const x = (i * 43 + state.time * 8) % (W + 60) - 30;
      const y = 86 + (i % 7) * 57;
      ctx.fillStyle = `oklch(0.960 0.010 145 / ${0.1 + (i % 3) * 0.05})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.2 + (i % 2), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRidge(speedFactor: number, baseY: number, color: string, alpha: number) {
    const drift = (state.time * currentDifficulty().pipeSpeed * speedFactor) % W;
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(-W - drift, floorY);
    for (let x = -W; x <= W * 2; x += 80) {
      const px = x - drift;
      const peak = baseY + Math.sin((x + speedFactor * 500) * 0.024) * 18;
      ctx.lineTo(px + 40, peak - 44);
      ctx.lineTo(px + 92, peak);
    }
    ctx.lineTo(W * 2, floorY);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawPipeSegment(x: number, y: number, width: number, height: number, upsideDown: boolean) {
    const radius = 13;
    const grad = ctx.createLinearGradient(x, 0, x + width, 0);
    grad.addColorStop(0, palette.primaryDark);
    grad.addColorStop(0.46, palette.primary);
    grad.addColorStop(1, palette.primaryDeep);
    ctx.fillStyle = grad;
    ctx.strokeStyle = "oklch(0.190 0.055 145)";
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, width, height, radius);
    ctx.fill();
    ctx.stroke();

    const capH = 28;
    const capY = upsideDown ? y + height - capH : y;
    ctx.fillStyle = "oklch(0.700 0.115 140)";
    roundRect(ctx, x - 8, capY, width + 16, capH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "oklch(0.890 0.090 118 / 0.16)";
    ctx.fillRect(x + 14, y + 10, 8, Math.max(0, height - 20));
  }

  function drawBerry(x: number, y: number, pulse: number) {
    const scale = 1 + Math.sin(state.time * 5 + pulse) * 0.08;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 18);
    glow.addColorStop(0, palette.berryGlow);
    glow.addColorStop(1, "oklch(0.760 0.170 68 / 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.berry;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.arc(-2, -3, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPipes() {
    for (const pipe of state.pipes) {
      const gapTop = pipe.gapY - pipe.gap / 2;
      const gapBottom = pipe.gapY + pipe.gap / 2;
      drawPipeSegment(pipe.x, 0, config.pipeWidth, gapTop, true);
      drawPipeSegment(pipe.x, gapBottom, config.pipeWidth, floorY - gapBottom, false);
      if (pipe.berry && !pipe.berry.collected) {
        drawBerry(pipe.x + config.pipeWidth / 2, pipe.berry.y, pipe.x * 0.01);
      }
    }
  }

  function drawGround() {
    const ground = ctx.createLinearGradient(0, floorY, 0, H);
    ground.addColorStop(0, "oklch(0.430 0.070 112)");
    ground.addColorStop(1, "oklch(0.210 0.035 125)");
    ctx.fillStyle = ground;
    ctx.fillRect(0, floorY, W, H - floorY);

    const offset = (state.time * currentDifficulty().pipeSpeed) % 54;
    for (let x = -54; x < W + 54; x += 54) {
      ctx.fillStyle = "oklch(0.800 0.100 92 / 0.32)";
      ctx.beginPath();
      ctx.ellipse(x - offset + 26, floorY + 16, 24, 7, -0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "oklch(0.190 0.030 132 / 0.26)";
      ctx.fillRect(x - offset, floorY + 42, 34, 6);
    }
  }

  function drawFeedback() {
    for (const particle of state.particles) {
      const t = particle.age / particle.life;
      const alpha = Math.max(0, 1 - t);
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.spin);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      if (particle.kind === "spark" || particle.kind === "berry") {
        ctx.beginPath();
        ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.ellipse(0, 0, particle.size, particle.size * 0.48, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    for (const floater of state.floaters) {
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

  function drawWing(x: number, y: number, rotation: number, front: boolean) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillStyle = front ? palette.wing : "oklch(0.760 0.060 102)";
    ctx.strokeStyle = palette.brontoDark;
    ctx.lineWidth = front ? 2.5 : 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-14, -20, -30, -11);
    ctx.quadraticCurveTo(-23, 4, -7, 13);
    ctx.quadraticCurveTo(-9, 5, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawMascot() {
    const bird = state.bird;
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rotation);

    ctx.fillStyle = "oklch(0 0 0 / 0.22)";
    ctx.beginPath();
    ctx.ellipse(0, 18, 27, 7, 0.12, 0, Math.PI * 2);
    ctx.fill();

    const flap = state.mode === "playing" ? Math.sin(state.time * 24) * 0.56 : Math.sin(state.time * 5) * 0.24;

    ctx.fillStyle = palette.brontoDark;
    ctx.beginPath();
    ctx.moveTo(-19, 3);
    ctx.quadraticCurveTo(-33, -7, -43, -3);
    ctx.quadraticCurveTo(-32, 4, -19, 11);
    ctx.closePath();
    ctx.fill();

    drawWing(-8, -6, -0.64 - flap * 0.55, false);

    ctx.strokeStyle = palette.brontoDark;
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.moveTo(6, -5);
    ctx.quadraticCurveTo(16, -23, 31, -24);
    ctx.stroke();

    ctx.strokeStyle = palette.bronto;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(6, -5);
    ctx.quadraticCurveTo(17, -22, 31, -24);
    ctx.stroke();

    ctx.fillStyle = palette.bronto;
    ctx.beginPath();
    ctx.ellipse(-3, 4, 25, 17, 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = palette.brontoDark;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = palette.brontoBelly;
    ctx.beginPath();
    ctx.ellipse(0, 10, 13, 8, 0.02, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.brontoDark;
    for (const [x, y] of [[-15, 18], [5, 19]] as const) {
      ctx.beginPath();
      ctx.ellipse(x, y, 5, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = palette.bronto;
    ctx.beginPath();
    ctx.ellipse(34, -24, 13, 10, -0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = palette.brontoDark;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = palette.brontoBelly;
    ctx.beginPath();
    ctx.ellipse(43, -22, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.white;
    ctx.beginPath();
    ctx.arc(36, -28, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "oklch(0.090 0.010 130)";
    ctx.beginPath();
    ctx.arc(38, -27.5, 1.8, 0, Math.PI * 2);
    ctx.fill();

    drawWing(-6, -5, -0.18 + flap, true);
    ctx.restore();
  }

  function drawPill(x: number, y: number, text: string) {
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

  function drawCenterPill(centerX: number, y: number, text: string, pulse: number) {
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

  function drawHud() {
    const difficulty = currentDifficulty();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const pulse = state.scorePulse > 0 ? 1 + Math.sin(state.scorePulse * 22) * 0.045 : 1;
    ctx.save();
    ctx.translate(W / 2, 82);
    ctx.scale(pulse, pulse);
    ctx.font = '700 62px "Inter", system-ui, sans-serif';
    const scoreText = String(state.score);
    const scoreWidth = Math.max(74, Math.ceil(ctx.measureText(scoreText).width + 36));
    ctx.fillStyle = "oklch(0.060 0.008 145 / 0.54)";
    roundRect(ctx, -scoreWidth / 2, -34, scoreWidth, 68, 22);
    ctx.fill();
    ctx.fillStyle = "oklch(0 0 0 / 0.28)";
    ctx.fillText(scoreText, 2, 3);
    ctx.fillStyle = palette.ink;
    ctx.fillText(scoreText, 0, 0);
    ctx.restore();

    drawPill(18, 18, `BEST ${state.best}`);
    const paceText = `GROVE ${difficulty.grove}  PACE ${difficulty.pace.toFixed(2)}x`;
    drawCenterPill(W / 2, 124, paceText, state.pacePulse);
    if (state.streak >= 2 && state.mode === "playing") {
      drawCenterPill(W / 2, 158, `${state.streak} streak`, state.scorePulse);
    }
  }

  function drawControlChip(x: number, y: number, label: string) {
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

  function drawStatBox(x: number, y: number, label: string, value: number) {
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

  function drawButton(rect: ButtonRect, label: string, fill: string) {
    const press = state.buttonPress * 0.04;
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

  function scoreMessage() {
    if (state.score === 0) return "Find the rhythm and flap again.";
    if (state.score < 4) return "Good first flight.";
    if (state.score < 8) return "Clean canopy run.";
    if (state.score < 16) return "Bronto is cruising.";
    return "Canopy legend.";
  }

  function drawOverlay() {
    if (state.mode === "playing") return;

    const { isReady, panelX, panelY, panelW, panelH, primaryButton } = overlayLayout();
    const enter = state.overlayProgress;
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
      drawControlChip(132, panelY + 148, "Space");
      drawControlChip(240, panelY + 148, "Tap");
      drawControlChip(344, panelY + 148, "Click");
      drawControlChip(177, panelY + 188, "W / Up");
      drawControlChip(303, panelY + 188, "M Sound");
      drawButton(primaryButton, "START FLAPPING", palette.primary);
    } else {
      if (state.newBest && state.score > 0) {
        ctx.fillStyle = palette.accent;
        roundRect(ctx, W / 2 - 52, panelY + 76, 104, 26, 10);
        ctx.fill();
        ctx.fillStyle = "oklch(0.100 0.020 80)";
        ctx.font = '900 12px "Inter", system-ui, sans-serif';
        ctx.fillText("NEW BEST", W / 2, panelY + 89);
      } else {
        ctx.fillText(scoreMessage(), W / 2, panelY + 86);
      }
      drawStatBox(102, panelY + 102, "Score", state.score);
      drawStatBox(258, panelY + 102, "Best", state.best);
      drawButton(primaryButton, "TRY AGAIN", palette.danger);
    }
    ctx.restore();
  }

  function render() {
    const shakeX = state.shake > 0 ? Math.sin(state.time * 92) * state.shake * 12 : 0;
    const shakeY = state.shake > 0 ? Math.cos(state.time * 75) * state.shake * 9 : 0;

    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.translate(shakeX, shakeY);
    drawBackground();
    drawPipes();
    drawGround();
    drawFeedback();
    drawMascot();
    drawHud();
    drawOverlay();

    if (state.flash > 0) {
      ctx.fillStyle = `oklch(0.980 0.006 120 / ${state.flash * 1.8})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const nextWidth = Math.round(rect.width * dpr);
    const nextHeight = Math.round(rect.height * dpr);
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    render();
  }

  function renderGameToText() {
    const difficulty = currentDifficulty();
    return JSON.stringify({
      coordinateSystem: "origin top-left, x right, y down, units are 480x720 game pixels",
      mode: state.mode,
      score: state.score,
      best: state.best,
      streak: state.streak,
      avatar: "winged brontosaurus",
      difficulty: {
        level: difficulty.level,
        grove: difficulty.grove,
        pipeSpeed: Number(difficulty.pipeSpeed.toFixed(2)),
        pipeGap: Number(difficulty.pipeGap.toFixed(2)),
        pipeInterval: Number(difficulty.pipeInterval.toFixed(3)),
        pace: Number(difficulty.pace.toFixed(3)),
      },
      feedback: {
        particles: state.particles.length,
        floaters: state.floaters.length,
        scorePulse: Number(state.scorePulse.toFixed(2)),
        pacePulse: Number(state.pacePulse.toFixed(2)),
        newBest: state.newBest,
      },
      audio: {
        muted: audio.muted,
        available: audio.available,
      },
      bird: {
        x: Number(state.bird.x.toFixed(1)),
        y: Number(state.bird.y.toFixed(1)),
        vy: Number(state.bird.vy.toFixed(1)),
        radius: config.birdRadius,
      },
      pipes: state.pipes.slice(0, 4).map((pipe) => ({
        gap: Number(pipe.gap.toFixed(1)),
        x: Number(pipe.x.toFixed(1)),
        gapY: Number(pipe.gapY.toFixed(1)),
        berry: pipe.berry ? { y: Number(pipe.berry.y.toFixed(1)), collected: pipe.berry.collected } : null,
        passed: pipe.passed,
      })),
      floorY,
      controls: ["Space", "ArrowUp", "KeyW", "click", "tap", "Enter to retry", "KeyM toggles sound", "KeyF fullscreen"],
    });
  }

  function advanceTime(ms: number) {
    const step = 1 / 60;
    const steps = Math.max(1, Math.round(ms / (step * 1000)));
    for (let i = 0; i < steps; i += 1) update(step);
    render();
    return renderGameToText();
  }

  let lastFrame = performance.now();
  function loop(now: number) {
    const dt = Math.min(0.033, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerUp);

  window.addEventListener("keydown", (event) => {
    if (["Space", "ArrowUp", "KeyW"].includes(event.code)) {
      handlePrimaryInput(event);
    } else if (event.code === "KeyM") {
      event.preventDefault();
      toggleMute(options.onMuteChange);
    } else if (event.code === "Enter" && state.mode === "gameover") {
      event.preventDefault();
      retryGame();
    } else if (event.code === "KeyF") {
      event.preventDefault();
      const frame = canvas.parentElement;
      if (!document.fullscreenElement) frame?.requestFullscreen?.();
      else document.exitFullscreen?.();
    }
  });

  window.addEventListener("resize", resizeCanvas);
  document.addEventListener("fullscreenchange", resizeCanvas);

  resetGame("ready");
  resizeCanvas();
  requestAnimationFrame(loop);

  return {
    toggleMute: () => toggleMute(options.onMuteChange),
    renderGameToText,
    advanceTime,
    get muted() {
      return audio.muted;
    },
  };
}