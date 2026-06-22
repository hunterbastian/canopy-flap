import { createAudio } from "./audio.ts";
import { config, floorY, H, palette, STORAGE_KEYS, W } from "./config.ts";
import type { Bird, ButtonRect, Floater, GameMode, Particle, Pipe } from "./types.ts";
import { clamp, makeRng, pointInRect } from "./utils.ts";

export interface GameSnapshot {
  mode: GameMode;
  time: number;
  score: number;
  best: number;
  streak: number;
  bird: Bird;
  pipes: Pipe[];
  particles: Particle[];
  floaters: Floater[];
  shake: number;
  flash: number;
  scorePulse: number;
  pacePulse: number;
  overlayProgress: number;
  buttonPress: number;
  newBest: boolean;
  lastLevel: number;
  difficulty: {
    level: number;
    grove: number;
    pipeSpeed: number;
    pipeGap: number;
    pipeInterval: number;
    pace: number;
  };
}

export interface GameEngineOptions {
  onMuteChange?: (muted: boolean) => void;
}

export function overlayLayout(mode: GameMode) {
  const isReady = mode === "ready";
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

export function createGameEngine(inputTarget: HTMLElement, options: GameEngineOptions = {}) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { audio, ensureAudio, playSound, toggleMute } = createAudio();

  let pipeIdCounter = 0;

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

    const pipe: Pipe = {
      id: pipeIdCounter++,
      x,
      gapY,
      gap,
      passed: false,
    };
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
    pipeIdCounter = 0;
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

  function getSnapshot(): GameSnapshot {
    return {
      mode: state.mode,
      time: state.time,
      score: state.score,
      best: state.best,
      streak: state.streak,
      bird: { ...state.bird },
      pipes: state.pipes.map((pipe) => ({
        ...pipe,
        berry: pipe.berry ? { ...pipe.berry } : undefined,
      })),
      particles: state.particles.map((p) => ({ ...p })),
      floaters: state.floaters.map((f) => ({ ...f })),
      shake: state.shake,
      flash: state.flash,
      scorePulse: state.scorePulse,
      pacePulse: state.pacePulse,
      overlayProgress: state.overlayProgress,
      buttonPress: state.buttonPress,
      newBest: state.newBest,
      lastLevel: state.lastLevel,
      difficulty: currentDifficulty(),
    };
  }

  function canvasPoint(event: PointerEvent) {
    const rect = inputTarget.getBoundingClientRect();
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
    inputTarget.focus({ preventScroll: true });

    if (state.mode === "ready") startGame();
    else if (state.mode === "playing") flap();
    else retryGame();
  }

  function handlePointerDown(event: PointerEvent) {
    const point = canvasPoint(event);
    const { primaryButton } = overlayLayout(state.mode);
    if (state.mode !== "playing" && pointInRect(point.x, point.y, primaryButton)) {
      state.buttonPress = 1;
      state.pointerDown = true;
    }
    handlePrimaryInput(event);
  }

  function handlePointerUp() {
    state.pointerDown = false;
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
        id: pipe.id,
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

  function advanceTime(ms: number, onFrame?: () => void) {
    const step = 1 / 60;
    const steps = Math.max(1, Math.round(ms / (step * 1000)));
    for (let i = 0; i < steps; i += 1) {
      update(step);
      onFrame?.();
    }
    return renderGameToText();
  }

  inputTarget.addEventListener("pointerdown", handlePointerDown);
  inputTarget.addEventListener("pointerup", handlePointerUp);
  inputTarget.addEventListener("pointercancel", handlePointerUp);

  window.addEventListener("keydown", (event) => {
    if (["Space", "ArrowUp", "KeyW"].includes(event.code)) {
      handlePrimaryInput(event);
    } else if (event.code === "KeyM") {
      event.preventDefault();
      toggleMute(options.onMuteChange);
    } else if (event.code === "Enter" && state.mode === "gameover") {
      event.preventDefault();
      retryGame();
    }
  });

  resetGame("ready");

  return {
    getSnapshot,
    update,
    toggleMute: () => toggleMute(options.onMuteChange),
    renderGameToText,
    advanceTime,
    get muted() {
      return audio.muted;
    },
    resetGame,
    startGame,
    retryGame,
    flap,
    handlePrimaryInput,
    overlayLayout: () => overlayLayout(state.mode),
    canvasPoint,
  };
}