// Lumen: a daily light-routing puzzle.
//
// The board is a grid. Emitters shoot a beam of light in a fixed direction.
// Mirrors ("/" or "\") bend the beam 90 degrees; the player taps a mirror to
// flip it. Filters recolour the beam as it passes. Crystals light up when a
// beam of their colour passes through them. Walls stop the beam.
// The puzzle is solved when every crystal is lit. Fewer taps = better score.
//
// Everything here is deterministic and dependency-free so the same code runs
// in the browser (play) and on the server (generate + verify solutions).

export type Dir = 0 | 1 | 2 | 3; // 0 = up, 1 = right, 2 = down, 3 = left
export type Color = 'white' | 'red' | 'blue' | 'gold';
export type Slant = '/' | '\\';

export type Cell =
  | { t: 'empty' }
  | { t: 'wall' }
  | { t: 'mirror'; s: Slant; locked: boolean }
  | { t: 'crystal'; c: Color }
  | { t: 'emitter'; d: Dir; c: Color }
  | { t: 'filter'; c: Color };

export type Puzzle = {
  id: string; // e.g. "2026-11-15"
  number: number; // Lumen #N
  size: number;
  cells: Cell[]; // row-major, size*size
  par: number; // minimum taps from the starting position
  difficulty: Difficulty;
};

export type Difficulty = 'gentle' | 'easy' | 'medium' | 'tricky' | 'hard';

export type Segment = { x1: number; y1: number; x2: number; y2: number; c: Color };

export type BeamResult = {
  segments: Segment[]; // in cell coordinates, centre-to-centre
  lit: Set<number>; // indices of lit crystals
  solved: boolean;
};

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

/** Direction after hitting a mirror. y grows downwards. */
export function reflect(d: Dir, s: Slant): Dir {
  // "/": right->up, up->right, left->down, down->left
  // "\": right->down, down->right, left->up, up->left
  if (s === '/') return ([1, 0, 3, 2] as const)[d];
  return ([3, 2, 1, 0] as const)[d];
}

/** Trace every emitter's beam. Beams pass through each other. */
export function trace(size: number, cells: Cell[]): BeamResult {
  const segments: Segment[] = [];
  const lit = new Set<number>();
  for (let i = 0; i < cells.length; i++) {
    const e = cells[i]!;
    if (e.t !== 'emitter') continue;
    let x = i % size;
    let y = Math.floor(i / size);
    let d: Dir = e.d;
    let c: Color = e.c;
    const seen = new Set<number>();
    let sx = x;
    let sy = y;
    for (let steps = 0; steps < size * size * 4 + 4; steps++) {
      const nx = x + DX[d]!;
      const ny = y + DY[d]!;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) {
        // leave the board: draw to the edge
        segments.push({ x1: sx, y1: sy, x2: x + DX[d]! * 0.5, y2: y + DY[d]! * 0.5, c });
        break;
      }
      const ni = ny * size + nx;
      const cell = cells[ni]!;
      const key = ni * 4 + d;
      if (seen.has(key)) {
        segments.push({ x1: sx, y1: sy, x2: nx, y2: ny, c });
        break; // loop
      }
      seen.add(key);
      x = nx;
      y = ny;
      if (cell.t === 'wall' || cell.t === 'emitter') {
        segments.push({ x1: sx, y1: sy, x2: x - DX[d]! * 0.5, y2: y - DY[d]! * 0.5, c });
        break;
      }
      if (cell.t === 'crystal' && cell.c === c) lit.add(ni);
      if (cell.t === 'mirror') {
        segments.push({ x1: sx, y1: sy, x2: x, y2: y, c });
        sx = x;
        sy = y;
        d = reflect(d, cell.s);
      } else if (cell.t === 'filter' && cell.c !== c) {
        segments.push({ x1: sx, y1: sy, x2: x, y2: y, c });
        sx = x;
        sy = y;
        c = cell.c;
      }
    }
  }
  let total = 0;
  for (const cell of cells) if (cell.t === 'crystal') total++;
  return { segments, lit, solved: total > 0 && lit.size === total };
}

/** Apply a list of taps (cell indices) to a board. Locked or non-mirror taps are ignored. */
export function applyTaps(cells: Cell[], taps: number[]): Cell[] {
  const out = cells.map((c) => ({ ...c })) as Cell[];
  for (const i of taps) {
    const c = out[i];
    if (c && c.t === 'mirror' && !c.locked) out[i] = { ...c, s: c.s === '/' ? '\\' : '/' };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Seeded randomness

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Daily schedule

export const EPOCH = '2026-11-13'; // Lumen #1

export function dayNumber(dateId: string): number {
  const a = Date.UTC(+EPOCH.slice(0, 4), +EPOCH.slice(5, 7) - 1, +EPOCH.slice(8, 10));
  const b = Date.UTC(+dateId.slice(0, 4), +dateId.slice(5, 7) - 1, +dateId.slice(8, 10));
  return Math.round((b - a) / 86400000) + 1;
}

export function todayId(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Monday gentle ... Sunday hard, like a newspaper puzzle week. */
export function difficultyFor(dateId: string): Difficulty {
  const dow = new Date(dateId + 'T00:00:00Z').getUTCDay(); // 0 = Sunday
  return (['hard', 'gentle', 'easy', 'easy', 'medium', 'tricky', 'medium'] as const)[dow] ?? 'medium';
}

type Spec = {
  size: number;
  turns: [number, number]; // mirrors on the solution path
  crystals: [number, number];
  decoys: [number, number]; // extra rotatable mirrors off the path
  walls: [number, number];
  colors: boolean; // use filters + coloured crystals
  emitters: 1 | 2;
  lockedShare: number; // fraction of path mirrors that are locked
};

const SPECS: Record<Difficulty, Spec> = {
  gentle: { size: 6, turns: [3, 4], crystals: [2, 3], decoys: [1, 2], walls: [1, 2], colors: false, emitters: 1, lockedShare: 0.25 },
  easy: { size: 6, turns: [4, 5], crystals: [3, 3], decoys: [2, 3], walls: [2, 3], colors: false, emitters: 1, lockedShare: 0.2 },
  medium: { size: 7, turns: [5, 6], crystals: [3, 4], decoys: [3, 4], walls: [2, 4], colors: true, emitters: 1, lockedShare: 0.15 },
  tricky: { size: 7, turns: [4, 5], crystals: [4, 5], decoys: [3, 4], walls: [3, 4], colors: true, emitters: 2, lockedShare: 0.15 },
  hard: { size: 8, turns: [5, 6], crystals: [5, 6], decoys: [4, 5], walls: [3, 5], colors: true, emitters: 2, lockedShare: 0.1 },
};

const between = (r: () => number, [a, b]: [number, number]) => a + Math.floor(r() * (b - a + 1));

/** Build one beam path from a border emitter, placing mirrors at turns. */
function carvePath(size: number, cells: Cell[], r: () => number, turns: number, color: Color, used: Set<number>): number[] | null {
  // pick a border start, facing inward
  const side = Math.floor(r() * 4);
  const k = 1 + Math.floor(r() * (size - 2));
  const start = [
    [k, 0, 2],
    [size - 1, k, 3],
    [k, size - 1, 0],
    [0, k, 1],
  ][side]! as [number, number, Dir];
  let [x, y, d] = start;
  const si = y * size + x;
  if (cells[si]!.t !== 'empty') return null;
  cells[si] = { t: 'emitter', d, c: color };
  used.add(si);
  const pathCells: number[] = [];
  let mirrorsPlaced = 0;
  for (let guard = 0; guard < 200 && mirrorsPlaced <= turns; guard++) {
    const run = 1 + Math.floor(r() * 3);
    for (let s = 0; s < run; s++) {
      const nx = x + DX[d]!;
      const ny = y + DY[d]!;
      if (nx < 1 || ny < 1 || nx >= size - 1 || ny >= size - 1) break;
      const ni = ny * size + nx;
      const t = cells[ni]!.t;
      if (t !== 'empty' && !(t === 'crystal' || t === 'filter')) return null;
      x = nx;
      y = ny;
      if (!used.has(ni)) pathCells.push(ni);
      used.add(ni);
    }
    if (mirrorsPlaced === turns) break;
    // turn here with a mirror
    const i = y * size + x;
    if (cells[i]!.t !== 'empty') return null;
    const left = ((d + 3) % 4) as Dir;
    const right = ((d + 1) % 4) as Dir;
    const nd = r() < 0.5 ? left : right;
    // which slant turns d into nd?
    const s: Slant = reflect(d, '/') === nd ? '/' : '\\';
    cells[i] = { t: 'mirror', s, locked: false };
    pathCells.splice(pathCells.indexOf(i), 1);
    mirrorsPlaced++;
    d = nd;
  }
  // finish: run straight to the edge so the beam leaves cleanly
  return pathCells;
}

export function generate(dateId: string, difficulty: Difficulty = difficultyFor(dateId), salt = ''): Puzzle {
  // Deterministic re-seeding keeps every date playable; a gentler spec is the last resort.
  for (let k = 0; k < 24; k++) {
    const p = tryGenerate(dateId, difficulty, salt + (k ? `#${k}` : ''));
    if (p) return p;
  }
  const order: Difficulty[] = ['hard', 'tricky', 'medium', 'easy', 'gentle'];
  const softer = order[order.indexOf(difficulty) + 1];
  if (softer) return { ...generate(dateId, softer, salt), difficulty };
  throw new Error(`could not generate puzzle for ${dateId}`);
}

function tryGenerate(dateId: string, difficulty: Difficulty, salt: string): Puzzle | null {
  const spec = SPECS[difficulty];
  const base = hashString(`lumen:${dateId}:${difficulty}:${salt}`);
  for (let attempt = 0; attempt < 120; attempt++) {
    const r = rng(base + attempt * 7919);
    const size = spec.size;
    const cells: Cell[] = Array.from({ length: size * size }, () => ({ t: 'empty' }));
    const used = new Set<number>();
    const palette: Color[] = spec.colors ? (r() < 0.5 ? ['red', 'blue'] : ['gold', 'blue']) : ['white', 'white'];
    const paths: number[][] = [];
    let ok = true;
    for (let e = 0; e < spec.emitters; e++) {
      const color: Color = spec.colors && spec.emitters === 1 ? 'white' : palette[e]!;
      const p = carvePath(size, cells, r, between(r, spec.turns), color, used);
      if (!p || p.length < 3) { ok = false; break; }
      paths.push(p);
    }
    if (!ok) continue;

    // Solution state of the carved mirrors
    const solution = cells.map((c) => ({ ...c })) as Cell[];
    // Trace the solution beams to know which cells actually carry which colour
    const want = between(r, spec.crystals);
    let placed = 0;
    // Optionally place a filter early on a path (colour days with one emitter)
    if (spec.colors && spec.emitters === 1) {
      const p = paths[0]!;
      const fi = p[Math.min(1, p.length - 1)]!;
      solution[fi] = { t: 'filter', c: palette[0]! };
      cells[fi] = solution[fi]!;
    }
    // Place crystals on lit cells of the solution, using the colour the beam has there
    for (let tries = 0; tries < 60 && placed < want; tries++) {
      const probe = traceColors(size, solution);
      const candidates = [...probe.entries()].filter(([i]) => solution[i]!.t === 'empty');
      if (!candidates.length) break;
      const [ci, col] = candidates[Math.floor(r() * candidates.length)]!;
      solution[ci] = { t: 'crystal', c: col };
      cells[ci] = solution[ci]!;
      placed++;
    }
    if (placed < spec.crystals[0]) continue;
    if (!trace(size, solution).solved) continue;

    // Walls and decoy mirrors on cells the solution beam never touches
    const beamCells = new Set(traceColors(size, solution).keys());
    const free = () => {
      const f: number[] = [];
      for (let i = 0; i < cells.length; i++) if (solution[i]!.t === 'empty' && !beamCells.has(i)) f.push(i);
      return f;
    };
    for (let w = between(r, spec.walls); w > 0; w--) {
      const f = free();
      if (!f.length) break;
      const i = f[Math.floor(r() * f.length)]!;
      solution[i] = { t: 'wall' };
    }
    for (let m = between(r, spec.decoys); m > 0; m--) {
      const f = free();
      if (!f.length) break;
      const i = f[Math.floor(r() * f.length)]!;
      solution[i] = { t: 'mirror', s: r() < 0.5 ? '/' : '\\', locked: false };
    }
    // Lock a share of the path mirrors (they are already correct)
    const pathMirrors = solution.map((c, i) => (c.t === 'mirror' && beamCells.has(i) ? i : -1)).filter((i) => i >= 0);
    for (const i of pathMirrors) if (r() < spec.lockedShare) (solution[i] as { locked: boolean }).locked = true;
    if (!trace(size, solution).solved) continue;

    // Scramble: flip unlocked mirrors at random, ensure the start is unsolved
    const start = solution.map((c) => ({ ...c })) as Cell[];
    const movable = start.map((c, i) => (c.t === 'mirror' && !c.locked ? i : -1)).filter((i) => i >= 0);
    if (movable.length > 16) continue;
    for (const i of movable) if (r() < 0.6) (start[i] as { s: Slant }).s = (start[i] as { s: Slant }).s === '/' ? '\\' : '/';
    if (trace(size, start).solved) continue;
    const par = minTaps(size, start);
    const minPar = { gentle: 2, easy: 3, medium: 3, tricky: 4, hard: 5 }[difficulty];
    if (par === null || par < minPar) continue;
    return { id: dateId, number: dayNumber(dateId), size, cells: start, par, difficulty };
  }
  return null;
}

/** Which colour of beam reaches each cell (last colour wins if several). */
function traceColors(size: number, cells: Cell[]): Map<number, Color> {
  const out = new Map<number, Color>();
  for (let i = 0; i < cells.length; i++) {
    const e = cells[i]!;
    if (e.t !== 'emitter') continue;
    let x = i % size;
    let y = Math.floor(i / size);
    let d: Dir = e.d;
    let c: Color = e.c;
    const seen = new Set<number>();
    for (let steps = 0; steps < size * size * 4; steps++) {
      const nx = x + DX[d]!;
      const ny = y + DY[d]!;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) break;
      const ni = ny * size + nx;
      if (seen.has(ni * 4 + d)) break;
      seen.add(ni * 4 + d);
      x = nx;
      y = ny;
      const cell = cells[ni]!;
      if (cell.t === 'wall' || cell.t === 'emitter') break;
      if (cell.t === 'mirror') d = reflect(d, cell.s);
      else if (cell.t === 'filter') c = cell.c;
      if (cell.t !== 'mirror') out.set(ni, c);
    }
  }
  return out;
}

/** Fewest flips (from this position) that solve the board, by exhaustive search. */
export function minTaps(size: number, cells: Cell[]): number | null {
  const movable = cells.map((c, i) => (c.t === 'mirror' && !c.locked ? i : -1)).filter((i) => i >= 0);
  const n = movable.length;
  let best: number | null = null;
  const work = cells.map((c) => ({ ...c })) as Cell[];
  const original = movable.map((i) => (cells[i] as { s: Slant }).s);
  for (let mask = 0; mask < 1 << n; mask++) {
    const flips = popcount(mask);
    if (best !== null && flips >= best) continue;
    for (let b = 0; b < n; b++) {
      const s = original[b]!;
      (work[movable[b]!] as { s: Slant }).s = mask & (1 << b) ? (s === '/' ? '\\' : '/') : s;
    }
    if (trace(size, work).solved) best = flips;
  }
  return best;
}

function popcount(n: number): number {
  let c = 0;
  while (n) {
    n &= n - 1;
    c++;
  }
  return c;
}

/** Verify a submitted solve: replay the taps on the day's puzzle. */
export function verify(p: Puzzle, taps: number[]): { solved: boolean; taps: number } {
  const valid = taps.filter((i) => {
    const c = p.cells[i];
    return c && c.t === 'mirror' && !c.locked;
  });
  return { solved: trace(p.size, applyTaps(p.cells, valid)).solved, taps: valid.length };
}

/** Compact emoji summary for sharing in comments. */
export function shareText(p: Puzzle, taps: number, streak: number, hints = 0): string {
  const diff = taps - p.par;
  const stars = diff <= 0 ? '🌟🌟🌟' : diff <= 2 ? '🌟🌟' : '🌟';
  const label = diff <= 0 ? (diff < 0 ? 'under par!' : 'on par') : `par +${diff}`;
  return `Lumen #${p.number} ${stars} ${taps} taps (${label})${hints ? ` · 💡${hints}` : ''}${streak > 1 ? ` · 🔥${streak}` : ''}`;
}

/**
 * Hint: find the solved arrangement closest to the current board (fewest
 * mirrors to change) and return one mirror that still has to flip. Prefers a
 * mirror the beam already touches, so the hint visibly moves the light.
 */
export function hintMirror(size: number, cells: Cell[]): number | null {
  const movable = cells.map((c, i) => (c.t === 'mirror' && !c.locked ? i : -1)).filter((i) => i >= 0);
  const n = movable.length;
  if (n > 16 || trace(size, cells).solved) return null;
  const work = cells.map((c) => ({ ...c })) as Cell[];
  const original = movable.map((i) => (cells[i] as { s: Slant }).s);
  let best = -1;
  let bestFlips = Infinity;
  for (let mask = 1; mask < 1 << n; mask++) {
    const flips = popcount(mask);
    if (flips >= bestFlips) continue;
    for (let b = 0; b < n; b++) {
      const s = original[b]!;
      (work[movable[b]!] as { s: Slant }).s = mask & (1 << b) ? (s === '/' ? '\\' : '/') : s;
    }
    if (trace(size, work).solved) {
      best = mask;
      bestFlips = flips;
    }
  }
  if (best < 0) return null;
  const todo = movable.filter((_, b) => best & (1 << b));
  const hit = new Set<number>();
  for (const seg of trace(size, cells).segments) {
    if (Number.isInteger(seg.x2) && Number.isInteger(seg.y2)) hit.add(seg.y2 * size + seg.x2);
  }
  return todo.find((i) => hit.has(i)) ?? todo[0] ?? null;
}

// ---------------------------------------------------------------------------
// Community puzzles: a player designs a board in its *solved* state; the
// server scrambles the mirrors deterministically and computes par.

const CODE: Record<string, Cell> = {
  '.': { t: 'empty' },
  '#': { t: 'wall' },
  '/': { t: 'mirror', s: '/', locked: false },
  '\\': { t: 'mirror', s: '\\', locked: false },
  o: { t: 'crystal', c: 'white' },
  '^': { t: 'emitter', d: 0, c: 'white' },
  '>': { t: 'emitter', d: 1, c: 'white' },
  v: { t: 'emitter', d: 2, c: 'white' },
  '<': { t: 'emitter', d: 3, c: 'white' },
};

export function encodeCells(cells: Cell[]): string {
  return cells
    .map((c) => {
      if (c.t === 'wall') return '#';
      if (c.t === 'mirror') return c.s;
      if (c.t === 'crystal') return 'o';
      if (c.t === 'emitter') return '^>v<'[c.d]!;
      return '.';
    })
    .join('');
}

export function decodeCells(s: string): Cell[] | null {
  const out: Cell[] = [];
  for (const ch of s) {
    const c = CODE[ch];
    if (!c) return null;
    out.push({ ...c });
  }
  return out;
}

export type CustomCheck = { ok: true; puzzle: Puzzle } | { ok: false; reason: string };

/** Validate a designed (solved) board and turn it into a playable puzzle. */
export function buildCustom(size: number, design: string, seed: string, number = 0): CustomCheck {
  if (![5, 6, 7].includes(size)) return { ok: false, reason: 'Board must be 5×5, 6×6 or 7×7' };
  const cells = decodeCells(design);
  if (!cells || cells.length !== size * size) return { ok: false, reason: 'Board data is malformed' };
  const emitters = cells.filter((c) => c.t === 'emitter').length;
  const crystals = cells.filter((c) => c.t === 'crystal').length;
  const mirrors = cells.filter((c) => c.t === 'mirror').length;
  if (emitters < 1 || emitters > 2) return { ok: false, reason: 'Place one or two light sources' };
  if (crystals < 2) return { ok: false, reason: 'Place at least two crystals' };
  if (mirrors < 2) return { ok: false, reason: 'Place at least two mirrors' };
  if (mirrors > 14) return { ok: false, reason: 'Use at most 14 mirrors' };
  if (!trace(size, cells).solved) return { ok: false, reason: 'Every crystal must be lit in your design' };
  const r = rng(hashString(`custom:${seed}`));
  const movable = cells.map((c, i) => (c.t === 'mirror' ? i : -1)).filter((i) => i >= 0);
  for (let attempt = 0; attempt < 60; attempt++) {
    const start = cells.map((c) => ({ ...c })) as Cell[];
    for (const i of movable) if (r() < 0.55) (start[i] as { s: Slant }).s = (start[i] as { s: Slant }).s === '/' ? '\\' : '/';
    if (trace(size, start).solved) continue;
    const par = minTaps(size, start);
    if (par === null || par < 2) continue;
    return { ok: true, puzzle: { id: `custom-${seed}`, number, size, cells: start, par, difficulty: par >= 6 ? 'hard' : par >= 4 ? 'medium' : 'easy' } };
  }
  return { ok: false, reason: 'Too easy: add mirrors so it takes at least two flips' };
}
