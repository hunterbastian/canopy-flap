import * as THREE from "three";
import { config, floorY, palette } from "./config.ts";
import { birdWorldX, gameToWorld, gameWidthToWorld } from "./coords.ts";
import type { GameSnapshot } from "./game-engine.ts";
import type { Particle, Pipe } from "./types.ts";

const PIPE_RADIUS = gameWidthToWorld(config.pipeWidth) * 0.42;
const CAP_HEIGHT = 0.28;
const BERRY_RADIUS = gameWidthToWorld(config.berryRadius);

function oklchToHex(oklch: string): number {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0x88aa66;
  ctx.fillStyle = oklch;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return (r << 16) | (g << 8) | b;
}

const COLORS = {
  skyTop: oklchToHex(palette.skyTop),
  skyLow: oklchToHex(palette.skyLow),
  primary: oklchToHex(palette.primary),
  primaryDark: oklchToHex(palette.primaryDark),
  primaryDeep: oklchToHex(palette.primaryDeep),
  moss: oklchToHex("oklch(0.700 0.115 140)"),
  bronto: oklchToHex(palette.bronto),
  brontoDark: oklchToHex(palette.brontoDark),
  brontoBelly: oklchToHex(palette.brontoBelly),
  wing: oklchToHex(palette.wing),
  wingShade: oklchToHex(palette.wingShade),
  berry: oklchToHex(palette.berry),
  berryGlow: oklchToHex(palette.berryGlow),
  ground: oklchToHex("oklch(0.430 0.070 112)"),
  groundDark: oklchToHex("oklch(0.210 0.035 125)"),
  hillFar: oklchToHex(palette.primaryDeep),
  hillMid: oklchToHex("oklch(0.270 0.070 148)"),
  hillNear: oklchToHex("oklch(0.320 0.085 146)"),
};

function createWingMesh(color: number, shade: number) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(-0.14, -0.2, -0.3, -0.11);
  shape.quadraticCurveTo(-0.23, 0.04, -0.07, 0.13);
  shape.quadraticCurveTo(-0.09, 0.05, 0, 0);
  const geometry = new THREE.ShapeGeometry(shape);
  const material = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: shade }),
  );
  mesh.add(edge);
  return mesh;
}

function createBirdGroup() {
  const group = new THREE.Group();

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.27, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, -0.35, 0.02);
  group.add(shadow);

  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.28, 4),
    new THREE.MeshLambertMaterial({ color: COLORS.brontoDark }),
  );
  tail.position.set(-0.28, -0.02, 0);
  tail.rotation.z = Math.PI / 2;
  group.add(tail);

  const backWing = createWingMesh(COLORS.wingShade, COLORS.brontoDark);
  backWing.position.set(-0.08, 0.06, -0.08);
  backWing.name = "backWing";
  group.add(backWing);

  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.06, -0.05, 0),
    new THREE.Vector3(0.16, 0.18, 0),
    new THREE.Vector3(0.31, 0.19, 0),
  ]);
  const neck = new THREE.Mesh(
    new THREE.TubeGeometry(neckCurve, 12, 0.05, 8, false),
    new THREE.MeshLambertMaterial({ color: COLORS.bronto }),
  );
  group.add(neck);

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 10, 8),
    new THREE.MeshLambertMaterial({ color: COLORS.bronto }),
  );
  body.scale.set(1, 0.68, 0.72);
  body.position.set(-0.03, 0.04, 0);
  group.add(body);

  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 8, 6),
    new THREE.MeshLambertMaterial({ color: COLORS.brontoBelly }),
  );
  belly.position.set(0, -0.02, 0.06);
  group.add(belly);

  for (const x of [-0.15, 0.05]) {
    const foot = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.05, 0.08, 4, 6),
      new THREE.MeshLambertMaterial({ color: COLORS.brontoDark }),
    );
    foot.position.set(x, -0.18, 0.04);
    group.add(foot);
  }

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 10, 8),
    new THREE.MeshLambertMaterial({ color: COLORS.bronto }),
  );
  head.position.set(0.34, 0.19, 0);
  group.add(head);

  const snout = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 6),
    new THREE.MeshLambertMaterial({ color: COLORS.brontoBelly }),
  );
  snout.position.set(0.43, 0.17, 0.02);
  group.add(snout);

  const eyeWhite = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xfafafa }),
  );
  eyeWhite.position.set(0.36, 0.23, 0.08);
  group.add(eyeWhite);

  const eyePupil = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 6, 4),
    new THREE.MeshLambertMaterial({ color: 0x111111 }),
  );
  eyePupil.position.set(0.38, 0.235, 0.11);
  group.add(eyePupil);

  const frontWing = createWingMesh(COLORS.wing, COLORS.brontoDark);
  frontWing.position.set(-0.06, 0.05, 0.08);
  frontWing.name = "frontWing";
  group.add(frontWing);

  return group;
}

function createPipeSegment(height: number, upsideDown: boolean) {
  const group = new THREE.Group();
  if (height <= 0.01) return group;

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(PIPE_RADIUS, PIPE_RADIUS * 1.05, height, 10),
    new THREE.MeshLambertMaterial({ color: COLORS.primary }),
  );
  trunk.position.y = upsideDown ? -height / 2 : height / 2;
  group.add(trunk);

  const bark = new THREE.Mesh(
    new THREE.CylinderGeometry(PIPE_RADIUS * 0.88, PIPE_RADIUS * 0.88, height * 0.7, 8),
    new THREE.MeshLambertMaterial({ color: COLORS.primaryDark, transparent: true, opacity: 0.35 }),
  );
  bark.position.set(PIPE_RADIUS * 0.15, trunk.position.y, PIPE_RADIUS * 0.1);
  group.add(bark);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(PIPE_RADIUS * 1.18, PIPE_RADIUS * 1.22, CAP_HEIGHT, 10),
    new THREE.MeshLambertMaterial({ color: COLORS.moss }),
  );
  cap.position.y = upsideDown ? -height + CAP_HEIGHT / 2 : CAP_HEIGHT / 2;
  group.add(cap);

  return group;
}

function createPipeGroup(pipe: Pipe) {
  const group = new THREE.Group();
  const gapTop = pipe.gapY - pipe.gap / 2;
  const gapBottom = pipe.gapY + pipe.gap / 2;

  const topHeight = gameToWorld(0, 0).y - gameToWorld(0, gapTop).y;
  const bottomHeight = gameToWorld(0, gapBottom).y - gameToWorld(0, floorY).y;

  const top = createPipeSegment(topHeight, true);
  top.position.y = gameToWorld(0, gapTop).y;
  group.add(top);

  const bottom = createPipeSegment(bottomHeight, false);
  bottom.position.y = gameToWorld(0, floorY).y;
  group.add(bottom);

  if (pipe.berry && !pipe.berry.collected) {
    const berryGroup = new THREE.Group();
    berryGroup.name = "berry";

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(BERRY_RADIUS * 2.2, 10, 8),
      new THREE.MeshBasicMaterial({ color: COLORS.berryGlow, transparent: true, opacity: 0.45 }),
    );
    berryGroup.add(glow);

    const berry = new THREE.Mesh(
      new THREE.SphereGeometry(BERRY_RADIUS, 10, 8),
      new THREE.MeshLambertMaterial({ color: COLORS.berry, emissive: COLORS.berry, emissiveIntensity: 0.35 }),
    );
    berryGroup.add(berry);

    const world = gameToWorld(pipe.x + config.pipeWidth / 2, pipe.berry.y);
    berryGroup.position.set(world.x, world.y, 0.15);
    group.add(berryGroup);
  }

  const worldX = gameToWorld(pipe.x + config.pipeWidth / 2, 0).x;
  group.position.x = worldX;
  return group;
}

function createHillLayer(color: number, z: number, amplitude: number, segments: number) {
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const x = (t - 0.5) * 14;
    const y = Math.sin(t * Math.PI * 3.2) * amplitude + Math.cos(t * 8) * amplitude * 0.35 - 0.6;
    points.push(new THREE.Vector2(x, y));
  }
  points.push(new THREE.Vector2(7, -3));
  points.push(new THREE.Vector2(-7, -3));

  const geometry = new THREE.LatheGeometry(points, 1);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color }));
  mesh.position.set(0, 1.2, z);
  mesh.rotation.x = -0.08;
  return mesh;
}

function createParticleMesh(particle: Particle) {
  const t = particle.age / particle.life;
  const alpha = Math.max(0, 1 - t);
  const world = gameToWorld(particle.x, particle.y, -0.2 + particle.kind === "spark" ? 0.1 : 0);

  if (particle.kind === "spark" || particle.kind === "berry") {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(particle.size * 0.01, 6, 4),
      new THREE.MeshBasicMaterial({ color: oklchToHex(particle.color), transparent: true, opacity: alpha }),
    );
    mesh.position.set(world.x, world.y, world.z);
    return mesh;
  }

  const geometry = new THREE.PlaneGeometry(particle.size * 0.018, particle.size * 0.009);
  const material = new THREE.MeshBasicMaterial({
    color: oklchToHex(particle.color),
    transparent: true,
    opacity: alpha,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(world.x, world.y, world.z);
  mesh.rotation.z = particle.spin;
  return mesh;
}

export class CanopyScene3D {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly bird: THREE.Group;
  private readonly pipeGroups = new Map<number, THREE.Group>();
  private readonly hills: THREE.Mesh[] = [];
  private readonly ground: THREE.Mesh;
  private readonly groundMaterial: THREE.MeshLambertMaterial;
  private readonly particleGroup: THREE.Group;
  private readonly baseCameraPos = new THREE.Vector3(birdWorldX(), 3.4, 5.8);
  private readonly lookTarget = new THREE.Vector3(birdWorldX(), 2.8, 0);

  constructor(container: HTMLElement) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.skyTop);
    this.scene.fog = new THREE.Fog(COLORS.skyLow, 4, 14);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 40);
    this.camera.position.copy(this.baseCameraPos);
    this.camera.lookAt(this.lookTarget);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.classList.add("scene-canvas");
    this.container.appendChild(this.renderer.domElement);

    const hemi = new THREE.HemisphereLight(COLORS.skyLow, COLORS.groundDark, 1.1);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2d6, 1.35);
    sun.position.set(3, 8, 4);
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0xb8d4c8, 0.45);
    fill.position.set(-4, 2, 2);
    this.scene.add(fill);

    this.hills.push(createHillLayer(COLORS.hillFar, -5.5, 0.55, 16));
    this.hills.push(createHillLayer(COLORS.hillMid, -4.2, 0.72, 18));
    this.hills.push(createHillLayer(COLORS.hillNear, -2.8, 0.95, 20));
    for (const hill of this.hills) this.scene.add(hill);

    const groundGeo = new THREE.PlaneGeometry(24, 8, 1, 1);
    this.groundMaterial = new THREE.MeshLambertMaterial({ color: COLORS.ground });
    this.ground = new THREE.Mesh(groundGeo, this.groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(0, gameToWorld(0, floorY).y, -1);
    this.scene.add(this.ground);

    const groundStripe = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 0.5),
      new THREE.MeshLambertMaterial({ color: COLORS.groundDark }),
    );
    groundStripe.rotation.x = -Math.PI / 2;
    groundStripe.position.set(0, gameToWorld(0, floorY).y - 0.01, 0.2);
    this.scene.add(groundStripe);

    this.bird = createBirdGroup();
    this.scene.add(this.bird);

    this.particleGroup = new THREE.Group();
    this.scene.add(this.particleGroup);

    this.resize();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private syncPipes(pipes: Pipe[]) {
    const liveIds = new Set(pipes.map((p) => p.id));

    for (const pipe of pipes) {
      let group = this.pipeGroups.get(pipe.id);
      if (!group) {
        group = createPipeGroup(pipe);
        this.pipeGroups.set(pipe.id, group);
        this.scene.add(group);
      }

      const worldX = gameToWorld(pipe.x + config.pipeWidth / 2, 0).x;
      group.position.x = worldX;

      const berryNode = group.getObjectByName("berry");
      if (berryNode) {
        berryNode.visible = Boolean(pipe.berry && !pipe.berry.collected);
        if (pipe.berry) {
          const world = gameToWorld(pipe.x + config.pipeWidth / 2, pipe.berry.y);
          berryNode.position.set(0, world.y - group.position.y, 0.15);
        }
      }
    }

    for (const [id, group] of this.pipeGroups) {
      if (!liveIds.has(id)) {
        this.scene.remove(group);
        this.pipeGroups.delete(id);
        group.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else obj.material.dispose();
          }
        });
      }
    }
  }

  private syncParticles(particles: Particle[]) {
    while (this.particleGroup.children.length) {
      const child = this.particleGroup.children[0];
      this.particleGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    }
    for (const particle of particles) {
      this.particleGroup.add(createParticleMesh(particle));
    }
  }

  private updateBird(snapshot: GameSnapshot) {
    const world = gameToWorld(snapshot.bird.x, snapshot.bird.y);
    this.bird.position.set(world.x, world.y, 0);
    this.bird.rotation.z = snapshot.bird.rotation;

    const flap =
      snapshot.mode === "playing"
        ? Math.sin(snapshot.time * 24) * 0.56
        : Math.sin(snapshot.time * 5) * 0.24;

    const backWing = this.bird.getObjectByName("backWing");
    const frontWing = this.bird.getObjectByName("frontWing");
    if (backWing) backWing.rotation.z = -0.64 - flap * 0.55;
    if (frontWing) frontWing.rotation.z = -0.18 + flap;
  }

  render(snapshot: GameSnapshot, _dt: number) {
    const scroll = (snapshot.time * snapshot.difficulty.pipeSpeed * 0.01) % 1;
    this.ground.position.x = -scroll * 2 + 1;
    for (let i = 0; i < this.hills.length; i += 1) {
      const speed = 0.18 + i * 0.16;
      this.hills[i].position.x = -((snapshot.time * snapshot.difficulty.pipeSpeed * speed * 0.01) % 4) + 1;
    }

    this.syncPipes(snapshot.pipes);
    this.syncParticles(snapshot.particles);
    this.updateBird(snapshot);

    const shake = snapshot.shake;
    if (shake > 0) {
      const shakeX = Math.sin(snapshot.time * 92) * shake * 0.12;
      const shakeY = Math.cos(snapshot.time * 75) * shake * 0.09;
      this.camera.position.set(
        this.baseCameraPos.x + shakeX,
        this.baseCameraPos.y + shakeY,
        this.baseCameraPos.z,
      );
    } else {
      this.camera.position.copy(this.baseCameraPos);
    }
    this.camera.lookAt(this.lookTarget);

    for (const [, group] of this.pipeGroups) {
      const berry = group.getObjectByName("berry");
      if (berry) {
        berry.rotation.y = snapshot.time * 2;
        const glow = berry.children[0];
        if (glow) glow.scale.setScalar(1 + Math.sin(snapshot.time * 5) * 0.08);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
    this.renderer.domElement.remove();
    for (const [, group] of this.pipeGroups) {
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
    }
    this.pipeGroups.clear();
  }
}