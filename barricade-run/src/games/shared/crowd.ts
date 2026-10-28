import { BANNERS, PLACARDS } from "./constants";
import { pick, rand, weighted } from "./random";
import { boardLabel, type Ctx, figure, type FigureStyle, project, type Sprite, tricolour, type View } from "./scene";

/** The protest on both sides of the road: marchers with placards, flags and banners, and flying exam papers. */

export type ProtesterKind = "student" | "woman" | "elder" | "flag";

export interface Protester {
  kind: ProtesterKind;
  side: -1 | 1;
  x: number;
  z: number;
  shirt: string;
  pants: string;
  skin: string;
  hair: string;
  dupatta: string | null;
  backpack: boolean;
  sign: string | null;
  /** [board, ink] */
  signColors: [string, string];
  phase: number;
  height: number;
}

/** A cloth banner carried across the sidewalk by two marchers. */
export interface StreetBanner {
  side: -1 | 1;
  z: number;
  text: string;
  cloth: string;
  ink: string;
}

/** A leaked exam sheet blowing across the road (decoration). */
export interface Paper {
  x: number;
  y: number;
  z: number;
  spin: number;
  drift: number;
}

export interface CrowdLayout {
  /** x where the sidewalk (or platform) starts. */
  edge: number;
  /** People stand between edge + 1.3 and edge + depth. */
  depth: number;
  /** Height of the sidewalk surface. */
  floor: number;
  /** Gap between neighbours along the road, in metres. Defaults to a packed march. */
  spacing?: [number, number];
  /** Cloth banners carried by pairs of marchers. Defaults to true. */
  banners?: boolean;
}

const TEES = ["#e63946", "#2a9d8f", "#e9c46a", "#3a86ff", "#f1f1f1", "#264653", "#6c757d", "#ff006e", "#111111"];
const KURTAS = ["#d62828", "#f77f00", "#fcbf49", "#e63995", "#7b2cbf", "#2a9d8f", "#06d6a0", "#ffafcc", "#0077b6"];
const DUPATTAS = ["#ffd60a", "#ff70a6", "#ffffff", "#80ed99", "#ff9f1c"];
const PANTS = ["#2b4c7e", "#1d3557", "#3d405b", "#2b2d42", "#5c4d3c"];
const SKINS = ["#f1c27d", "#e0ac69", "#c68642", "#a5694f", "#8d5524"];
const HAIR = ["#111111", "#1f140f", "#2b1d14", "#3b2a20"];
const SIGN_COLORS: [string, string][] = [
  ["#ffffff", "#c1121f"],
  ["#ffe066", "#111111"],
  ["#111111", "#ffd60a"],
  ["#fffbe6", "#1d3557"],
  ["#ff006e", "#ffffff"],
  ["#f1f1f1", "#111111"],
];
const CLOTHS: [string, string][] = [
  ["#ffffff", "#c1121f"],
  ["#c1121f", "#ffffff"],
  ["#111111", "#ffd60a"],
  ["#ffd60a", "#111111"],
  ["#1d3557", "#ffffff"],
];
const PROTESTER_SPAN = 150;
const BANNER_GAP = 24;
const PAPER_SPAN = 110;

export class Crowd {
  protesters: Protester[] = [];
  banners: StreetBanner[] = [];
  papers: Paper[] = [];

  constructor(readonly layout: CrowdLayout) {
    for (const side of [-1, 1] as const) {
      const [gapMin, gapMax] = layout.spacing ?? [0.9, 2.0];
      for (let z = -4; z < PROTESTER_SPAN - 4; z += rand(gapMin, gapMax)) {
        this.protesters.push(this.makeProtester(side, z));
      }
    }
    for (let i = 0; layout.banners !== false && i * BANNER_GAP < PROTESTER_SPAN; i++) {
      this.banners.push(this.makeBanner(i % 2 ? 1 : -1, 12 + i * BANNER_GAP));
    }
    for (let i = 0; i < 18; i++) this.papers.push(this.makePaper(rand(-4, PAPER_SPAN)));
  }

  update(dz: number, dt: number) {
    for (const pr of this.protesters) {
      pr.z -= dz;
      if (pr.z < -8) Object.assign(pr, this.makeProtester(pr.side, pr.z + PROTESTER_SPAN));
    }
    const bannerSpan = this.banners.length * BANNER_GAP;
    for (const b of this.banners) {
      b.z -= dz;
      if (b.z < -8) Object.assign(b, this.makeBanner(b.side, b.z + bannerSpan));
    }
    const edge = this.layout.edge;
    for (const p of this.papers) {
      p.z -= dz * 0.85;
      p.x += p.drift * dt;
      if (p.z < -5 || Math.abs(p.x) > edge + 3) Object.assign(p, this.makePaper(p.z < -5 ? p.z + PAPER_SPAN : p.z));
    }
  }

  sprites(ctx: Ctx, v: View, clock: number, far: number, out: Sprite[]) {
    for (const pr of this.protesters) {
      if (pr.z > v.near && pr.z < far * 0.8) out.push({ z: pr.z, draw: () => this.drawProtester(ctx, v, pr, clock) });
    }
    for (const b of this.banners) {
      if (b.z > v.near + 1 && b.z < far * 0.7) out.push({ z: b.z, draw: () => this.drawBanner(ctx, v, b, clock) });
    }
    for (const p of this.papers) {
      if (p.z > 4 && p.z < 60) out.push({ z: p.z, draw: () => drawPaper(ctx, v, p, clock) });
    }
  }

  private makeProtester(side: -1 | 1, z: number): Protester {
    const kind = weighted<ProtesterKind>({ student: 4, woman: 3, elder: 1.5, flag: 1 });
    const woman = kind === "woman";
    return {
      kind,
      side,
      x: side * (this.layout.edge + rand(1.3, this.layout.depth)),
      z,
      shirt: kind === "elder" ? "#f1efe6" : woman ? pick(KURTAS) : pick(TEES),
      pants: kind === "elder" ? "#e9e5d6" : woman ? pick(KURTAS) : pick(PANTS),
      skin: pick(SKINS),
      hair: kind === "elder" ? pick(["#d9d9d9", "#9a9a9a"]) : pick(HAIR),
      dupatta: woman && Math.random() < 0.7 ? pick(DUPATTAS) : null,
      backpack: kind === "student" && Math.random() < 0.6,
      sign: kind !== "flag" && Math.random() < 0.55 ? pick(PLACARDS) : null,
      signColors: pick(SIGN_COLORS),
      phase: rand(0, Math.PI * 2),
      height: woman ? rand(1.5, 1.68) : rand(1.6, 1.85),
    };
  }

  private makeBanner(side: -1 | 1, z: number): StreetBanner {
    const [cloth, ink] = pick(CLOTHS);
    return { side, z, text: pick(BANNERS), cloth, ink };
  }

  private makePaper(z: number): Paper {
    const edge = this.layout.edge;
    return { x: rand(-edge - 2, edge + 2), y: rand(0.3, 3), z, spin: rand(-4, 4), drift: rand(-1.2, 1.2) };
  }

  private drawProtester(ctx: Ctx, v: View, pr: Protester, clock: number) {
    const p = project(v, pr.x, this.layout.floor, pr.z);
    if (p.s * pr.height < 3) return;
    const bob = Math.abs(Math.sin(clock * 4 + pr.phase)) * 0.1;
    const gy = p.y - bob * p.s;
    const hasSign = pr.sign !== null;
    const lod = p.s * (pr.height / 1.75);
    if (lod < 8) {
      // Far away the person is only a few pixels tall: a silhouette is enough.
      ctx.fillStyle = pr.pants;
      ctx.fillRect(p.x - 0.15 * lod, gy - 0.9 * lod, 0.3 * lod, 0.9 * lod);
      ctx.fillStyle = pr.shirt;
      ctx.fillRect(p.x - 0.23 * lod, gy - 1.48 * lod, 0.46 * lod, 0.62 * lod);
      ctx.fillStyle = pr.skin;
      ctx.fillRect(p.x - 0.1 * lod, gy - 1.75 * lod, 0.2 * lod, 0.24 * lod);
      if (pr.sign) {
        ctx.fillStyle = pr.signColors[0];
        ctx.fillRect(p.x - 0.52 * lod, gy - 2.62 * lod, 1.05 * lod, 0.58 * lod);
      } else if (pr.kind === "flag") {
        const fx = p.x + 0.32 * lod;
        const band = 0.17 * lod;
        ctx.fillStyle = "#ff9933";
        ctx.fillRect(fx, gy - 3.1 * lod, 0.75 * lod * -pr.side, band);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(fx, gy - 3.1 * lod + band, 0.75 * lod * -pr.side, band);
        ctx.fillStyle = "#138808";
        ctx.fillRect(fx, gy - 3.1 * lod + band * 2, 0.75 * lod * -pr.side, band);
      }
      return;
    }
    const style: FigureStyle = {
      shirt: pr.shirt,
      pants: pr.pants,
      skin: pr.skin,
      hair: pr.hair,
      kurta: pr.kind === "woman" || pr.kind === "elder",
      dupatta: pr.dupatta,
      longHair: pr.kind === "woman",
      topi: pr.kind === "elder",
      backpack: pr.backpack ? "#3a3a3a" : undefined,
      shoes: pr.kind === "student" ? "#e9e9e9" : "#3b2a20",
    };
    const fig = figure(ctx, p.x, gy, p.s, style, {
      phase: clock * 4 + pr.phase,
      height: pr.height,
      armsUp: hasSign,
      flag: pr.kind === "flag",
      fist: !hasSign && pr.kind !== "flag",
    });
    const { k, X, Y } = fig;

    if (pr.kind === "flag") {
      const [hx, hy] = fig.hands[1];
      ctx.strokeStyle = "#8b5a2b";
      ctx.lineWidth = Math.max(1, 0.04 * k);
      ctx.beginPath();
      ctx.moveTo(X(hx), Y(hy - 0.3));
      ctx.lineTo(X(hx), Y(hy + 1.2));
      ctx.stroke();
      tricolour(ctx, X(hx), Y(hy + 1.2), k, clock * 5 + pr.phase, -pr.side);
      return;
    }
    if (!pr.sign) return;
    const sway = Math.sin(clock * 2 + pr.phase) * 0.06 * k;
    const w = 1.05 * k;
    const h = 0.58 * k;
    const top = gy - 2.62 * k;
    const [board, ink] = pr.signColors;
    ctx.fillStyle = "#6b4f2a";
    ctx.fillRect(p.x - 0.03 * k + sway, top + h, 0.06 * k, 0.12 * k);
    ctx.drawImage(boardLabel(pr.sign, board, ink, 168, 92), p.x - w / 2 + sway, top, w, h);
  }

  private drawBanner(ctx: Ctx, v: View, b: StreetBanner, clock: number) {
    const { edge, floor } = this.layout;
    const xa = b.side * (edge + 1.0);
    const xb = b.side * (edge + 5.2);
    const pa = project(v, xa, floor, b.z);
    const pb = project(v, xb, floor, b.z);
    if (pa.s < 2) return;
    const bob = Math.abs(Math.sin(clock * 3 + b.z)) * 0.06 * pa.s;
    const holder: FigureStyle = { shirt: "#f1f1f1", pants: "#2b4c7e", skin: "#c68642", hair: "#111" };
    figure(ctx, pa.x, pa.y - bob, pa.s, { ...holder, shirt: "#e9c46a" }, { phase: clock * 4 + b.z, carry: true });
    figure(ctx, pb.x, pb.y - bob, pb.s, { ...holder, shirt: "#2a9d8f" }, { phase: clock * 4 + b.z + 1, carry: true });
    const top = project(v, xa, floor + 1.95, b.z).y - bob;
    const bottom = project(v, xa, floor + 1.05, b.z).y - bob;
    const l = Math.min(pa.x, pb.x);
    const r = Math.max(pa.x, pb.x);
    ctx.fillStyle = "#6b4f2a";
    ctx.fillRect(l - 0.03 * pa.s, top - 0.1 * pa.s, 0.06 * pa.s, bottom - top + 0.4 * pa.s);
    ctx.fillRect(r - 0.03 * pa.s, top - 0.1 * pa.s, 0.06 * pa.s, bottom - top + 0.4 * pa.s);
    const sag = 0.05 * pa.s * (1 + Math.sin(clock * 2 + b.z));
    ctx.drawImage(boardLabel(b.text, b.cloth, b.ink, 512, 110, b.ink), l, top + sag, r - l, bottom - top);
  }
}

/** A leaked exam sheet tumbling through the air. */
function drawPaper(ctx: Ctx, v: View, p: Paper, clock: number) {
  const y = p.y + Math.sin(clock * 2 + p.z) * 0.3;
  const pr = project(v, p.x, y, p.z);
  const size = 0.32 * pr.s;
  if (size < 2) return;
  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.rotate(clock * p.spin);
  ctx.scale(1, 0.4 + Math.abs(Math.cos(clock * p.spin * 0.7)) * 0.6);
  ctx.fillStyle = "#fbfbf6";
  ctx.fillRect(-size / 2, -size * 0.65, size, size * 1.3);
  if (size > 10) {
    ctx.fillStyle = "#c1121f";
    ctx.fillRect(-size * 0.4, -size * 0.55, size * 0.5, size * 0.1);
    ctx.fillStyle = "#9a9a9a";
    for (let i = 0; i < 4; i++) ctx.fillRect(-size * 0.4, -size * 0.3 + i * size * 0.2, size * 0.8, size * 0.05);
  }
  ctx.restore();
}
