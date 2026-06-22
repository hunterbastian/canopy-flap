export const W = 480;
export const H = 720;
export const floorY = 642;

export const config = {
  gravity: 1260,
  flapVelocity: -385,
  pipeSpeed: 154,
  pipeWidth: 76,
  pipeGap: 190,
  pipeInterval: 1.72,
  levelEvery: 4,
  maxLevel: 5,
  minPipeGap: 164,
  speedPerLevel: 7,
  intervalStep: 0.032,
  minPipeInterval: 1.56,
  birdX: 142,
  birdRadius: 18,
  safeCeiling: 22,
  risingHitboxScale: 0.88,
  perfectGapRatio: 0.35,
  berryChance: 0.38,
  berryRadius: 11,
  berryBonus: 2,
  perfectBonus: 1,
  windGrove: 3,
  windStrength: 42,
  streakAnnounceEvery: 3,
} as const;

export const palette = {
  night: "oklch(0.105 0.030 218)",
  skyTop: "oklch(0.185 0.060 215)",
  skyMid: "oklch(0.360 0.070 190)",
  skyLow: "oklch(0.720 0.100 125)",
  ink: "oklch(0.960 0.010 145)",
  muted: "oklch(0.765 0.035 145)",
  primary: "oklch(0.650 0.110 140)",
  primaryDark: "oklch(0.360 0.090 142)",
  primaryDeep: "oklch(0.220 0.060 145)",
  accent: "oklch(0.780 0.145 74)",
  accentDeep: "oklch(0.600 0.130 70)",
  bronto: "oklch(0.670 0.115 142)",
  brontoDark: "oklch(0.280 0.075 145)",
  brontoBelly: "oklch(0.780 0.130 78)",
  wing: "oklch(0.900 0.060 94)",
  wingShade: "oklch(0.690 0.095 86)",
  berry: "oklch(0.760 0.170 68)",
  berryGlow: "oklch(0.880 0.150 82 / 0.55)",
  stone: "oklch(0.300 0.020 150)",
  danger: "oklch(0.690 0.180 28)",
  shadow: "oklch(0 0 0 / 0.30)",
  white: "oklch(0.980 0.006 120)",
} as const;

export const STORAGE_KEYS = {
  best: "canopyFlapBest",
  muted: "canopyFlapMuted",
} as const;