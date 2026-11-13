// Server-side game state: verification, streaks, stats and leaderboards.
// The client never reports a score directly: it sends the list of taps, and the
// server replays them on the day's puzzle.
import { redis } from '@devvit/web/server';
import { generate, todayId, verify, type Puzzle } from '../../shared/lumen';

export type Board = { key: string; puzzle: Puzzle; isToday: boolean; author?: string };
import type { Me, MyResult, Stats } from '../../shared/api';

const k = {
  solve: (day: string) => `solve:${day}`, // hash userId -> MyResult JSON
  dist: (day: string) => `dist:${day}`, // hash taps -> count
  board: (day: string) => `lb:${day}`, // zset username -> taps * 1e7 + ms
  user: (id: string) => `user:${id}`, // hash streak, best, last, total
};

const puzzles = new Map<string, Puzzle>();
export function puzzleFor(day: string): Puzzle {
  let p = puzzles.get(day);
  if (!p) {
    p = generate(day);
    puzzles.set(day, p);
    if (puzzles.size > 32) puzzles.delete(puzzles.keys().next().value!);
  }
  return p;
}

export function dayFromPostData(postData: unknown): string {
  if (postData && typeof postData === 'object' && 'day' in postData) {
    const d = (postData as { day: unknown }).day;
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  }
  return todayId();
}

/** Which puzzle a post shows: the daily puzzle for its date, or a community puzzle. */
export async function resolveBoard(postData: unknown): Promise<Board> {
  if (postData && typeof postData === 'object' && 'kind' in postData && (postData as { kind: unknown }).kind === 'custom') {
    const id = String((postData as { id?: unknown }).id ?? '');
    const raw = id ? await redis.get(`custom:${id}`) : undefined;
    if (raw) {
      const saved = JSON.parse(raw) as { puzzle: Puzzle; author: string };
      return { key: `c-${id}`, puzzle: saved.puzzle, isToday: false, author: saved.author };
    }
  }
  const day = dayFromPostData(postData);
  return { key: day, puzzle: puzzleFor(day), isToday: day === todayId() };
}

function yesterdayOf(day: string): string {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function getMe(userId: string | undefined, username: string | undefined, day: string): Promise<Me> {
  if (!userId) return { username: null, streak: 0, bestStreak: 0, totalSolved: 0, today: null };
  const [u, raw] = await Promise.all([redis.hGetAll(k.user(userId)), redis.hGet(k.solve(day), userId)]);
  // A streak only survives if the last solve was today or yesterday.
  const last = u.last ?? '';
  const alive = last === todayId() || last === yesterdayOf(todayId());
  return {
    username: username ?? null,
    streak: alive ? Number(u.streak ?? 0) : 0,
    bestStreak: Number(u.best ?? 0),
    totalSolved: Number(u.total ?? 0),
    today: raw ? (JSON.parse(raw) as MyResult) : null,
  };
}

export async function getStats(day: string, mine: number | null): Promise<Stats> {
  const raw = await redis.hGetAll(k.dist(day));
  const distribution: Record<string, number> = {};
  let solvers = 0;
  for (const [t, n] of Object.entries(raw)) {
    distribution[t] = Number(n);
    solvers += Number(n);
  }
  if (mine === null || solvers <= 1) return { solvers, distribution };
  let worse = 0;
  for (const [t, n] of Object.entries(distribution)) if (Number(t) > mine) worse += n;
  return { solvers, distribution, beat: worse / (solvers - 1) };
}

export type SolveOutcome = { ok: boolean; message?: string; result?: MyResult };

/** Verify and record a solve. Only the first solve per user per day counts. */
export async function recordSolve(userId: string, username: string, board: Board, taps: number[], ms: number, hints = 0): Promise<SolveOutcome> {
  const day = board.key;
  if (!Array.isArray(taps) || taps.length > 400 || !taps.every((t) => Number.isInteger(t) && t >= 0 && t < 400)) {
    return { ok: false, message: 'Invalid move list' };
  }
  const v = verify(board.puzzle, taps);
  if (!v.solved) return { ok: false, message: 'That board is not solved yet' };

  const result: MyResult = { solved: true, taps: v.taps, ms: Math.max(0, Math.min(Math.round(ms), 86_400_000)), shared: false, tapList: taps, ...(hints > 0 ? { hints: Math.min(99, Math.floor(hints)) } : {}) };
  // hSetNX makes the first solve stick even if two requests race.
  const fresh = await redis.hSetNX(k.solve(day), userId, JSON.stringify(result));
  if (!fresh) {
    const existing = await redis.hGet(k.solve(day), userId);
    return { ok: true, result: existing ? (JSON.parse(existing) as MyResult) : result };
  }

  await Promise.all([
    redis.hIncrBy(k.dist(day), String(v.taps), 1),
    // Hinted solves still count for stats and streaks, but not for the leaderboard.
    result.hints ? Promise.resolve() : redis.zAdd(k.board(day), { member: username, score: v.taps * 1e7 + Math.min(result.ms, 9_999_999) }),
    redis.hIncrBy(k.user(userId), 'total', 1),
  ]);

  // Streaks count today's daily puzzle only (archive and community posts are just for fun).
  if (board.isToday) {
    const u = await redis.hGetAll(k.user(userId));
    const streak = u.last === yesterdayOf(day) ? Number(u.streak ?? 0) + 1 : u.last === day ? Number(u.streak ?? 1) : 1;
    await redis.hSet(k.user(userId), { streak: String(streak), best: String(Math.max(streak, Number(u.best ?? 0))), last: day, name: username });
  }
  return { ok: true, result };
}

export async function markShared(userId: string, day: string): Promise<MyResult | null> {
  const raw = await redis.hGet(k.solve(day), userId);
  if (!raw) return null;
  const r = JSON.parse(raw) as MyResult;
  if (r.shared) return r;
  r.shared = true;
  await redis.hSet(k.solve(day), { [userId]: JSON.stringify(r) });
  return { ...r, shared: false }; // caller posts the comment only when it was not shared before
}

export async function leaderboard(day: string) {
  const rows = await redis.zRange(k.board(day), 0, 9, { by: 'rank' });
  return rows.map((r) => ({ username: r.member, taps: Math.floor(r.score / 1e7), ms: Math.round(r.score % 1e7) }));
}

