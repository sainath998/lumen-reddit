// Offline stand-in for the Devvit server, used only by `npm run preview:local`.
// It mirrors the server's rules (same generator, same verification) and keeps
// results in localStorage. A few simulated community results make the stats
// and leaderboard look like they would with other players.
import type {
  CreateRequest,
  CreateResponse,
  LeaderboardResponse,
  Me,
  ShareResponse,
  SolveRequest,
  SolveResponse,
  StateResponse,
  Stats,
} from '../shared/api';
import { buildCustom, generate, todayId, verify } from '../shared/lumen';

const KEY = 'lumen.local.v1';
type Store = { solves: Record<string, { taps: number[]; count: number; ms: number; shared: boolean }>; streak: number; best: number; last: string | null };

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {
    /* ignore */
  }
  return { solves: {}, streak: 0, best: 0, last: null };
}
function save(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function dayParam(): string {
  const d = new URLSearchParams(location.search).get('day');
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayId();
}

function community(par: number): Record<string, number> {
  // deterministic, plausible spread around par
  return { [par]: 41, [par + 1]: 63, [par + 2]: 38, [par + 3]: 17, [par + 5]: 9 };
}

function stats(par: number, mine: number | null): Stats {
  const distribution = community(par);
  if (mine !== null) distribution[mine] = (distribution[mine] ?? 0) + 1;
  const solvers = Object.values(distribution).reduce((a, b) => a + b, 0);
  let beat: number | undefined;
  if (mine !== null) {
    const worse = Object.entries(distribution).filter(([t]) => Number(t) > mine).reduce((a, [, n]) => a + n, 0);
    beat = worse / Math.max(1, solvers - 1);
  }
  return { solvers, distribution, ...(beat !== undefined ? { beat } : {}) };
}

function me(s: Store, day: string): Me {
  const t = s.solves[day];
  return {
    username: 'you',
    streak: s.streak,
    bestStreak: s.best,
    totalSolved: Object.keys(s.solves).length,
    today: t ? { solved: true, taps: t.count, ms: t.ms, shared: t.shared, tapList: t.taps } : null,
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function state(): Promise<StateResponse> {
  await wait(120);
  const day = dayParam();
  const puzzle = generate(day);
  const s = load();
  const mine = s.solves[day]?.count ?? null;
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  return { type: 'state', puzzle, isToday: day === todayId(), me: me(s, day), stats: stats(puzzle.par, mine), nextPuzzleAt: next.getTime() };
}

export async function solve(body: SolveRequest): Promise<SolveResponse> {
  await wait(200);
  const day = dayParam();
  const puzzle = generate(day);
  const v = verify(puzzle, body.taps);
  const s = load();
  if (!v.solved) return { type: 'solve', ok: false, message: 'Not solved yet', me: me(s, day), stats: stats(puzzle.par, null) };
  if (!s.solves[day]) {
    s.solves[day] = { taps: body.taps, count: v.taps, ms: body.ms, shared: false };
    if (day === todayId()) {
      const y = new Date(day + 'T00:00:00Z');
      y.setUTCDate(y.getUTCDate() - 1);
      s.streak = s.last === y.toISOString().slice(0, 10) ? s.streak + 1 : 1;
      s.best = Math.max(s.best, s.streak);
      s.last = day;
    }
    save(s);
  }
  return { type: 'solve', ok: true, me: me(s, day), stats: stats(puzzle.par, s.solves[day]!.count) };
}

export async function share(): Promise<ShareResponse> {
  await wait(300);
  const s = load();
  const day = dayParam();
  if (s.solves[day]) {
    s.solves[day]!.shared = true;
    save(s);
  }
  return { type: 'share', ok: true, message: 'Posted to the comments (local preview)' };
}

export async function leaderboard(): Promise<LeaderboardResponse> {
  await wait(150);
  const p = generate(dayParam());
  return {
    type: 'leaderboard',
    rows: [
      { username: 'prism_pilot', taps: p.par, ms: 41_000 },
      { username: 'quietlantern', taps: p.par, ms: 58_500 },
      { username: 'u_mirrorball', taps: p.par, ms: 73_200 },
      { username: 'beam_me_up', taps: p.par + 1, ms: 39_900 },
      { username: 'halcyonhex', taps: p.par + 1, ms: 66_000 },
    ],
  };
}

export async function create(body: CreateRequest): Promise<CreateResponse> {
  await wait(250);
  const built = buildCustom(body.size, body.design, String(Date.now()), 1);
  if (!built.ok) return { type: 'create', ok: false, message: built.reason };
  return { type: 'create', ok: true, par: built.puzzle.par };
}
