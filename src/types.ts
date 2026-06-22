export type GameMode = "ready" | "playing" | "gameover";

export type ParticleKind = "leaf" | "spark" | "berry";

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  size: number;
  spin: number;
  color: string;
}

export interface Floater {
  kind: "score" | "level" | "bonus" | "streak";
  text: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  age: number;
}

export interface Berry {
  y: number;
  collected: boolean;
}

export interface Pipe {
  id: number;
  x: number;
  gapY: number;
  gap: number;
  passed: boolean;
  berry?: Berry;
}

export interface Bird {
  x: number;
  y: number;
  vy: number;
  rotation: number;
}

export interface ButtonRect {
  x: number;
  y: number;
  w: number;
  h: number;
  action: "start" | "retry";
}