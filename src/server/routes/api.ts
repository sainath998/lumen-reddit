import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type { LeaderboardResponse, ShareResponse, SolveRequest, SolveResponse, StateResponse } from '../../shared/api';
import { shareText, todayId } from '../../shared/lumen';
import { dayFromPostData, getMe, getStats, leaderboard, markShared, puzzleFor, recordSolve } from '../core/game';

export const api = new Hono();

const nextMidnight = () => {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
};

api.get('/state', async (c) => {
  const day = dayFromPostData(context.postData);
  const puzzle = puzzleFor(day);
  const me = await getMe(context.userId, context.username, day);
  const stats = await getStats(day, me.today?.taps ?? null);
  return c.json<StateResponse>({ type: 'state', puzzle, isToday: day === todayId(), me, stats, nextPuzzleAt: nextMidnight() });
});

api.post('/solve', async (c) => {
  const day = dayFromPostData(context.postData);
  const body = await c.req.json<SolveRequest>().catch(() => null);
  if (!body) return c.json({ status: 'error', message: 'bad request' }, 400);
  const { userId, username } = context;
  if (!userId || !username) {
    // Logged-out players can play; their result just isn't stored or ranked.
    const stats = await getStats(day, null);
    return c.json<SolveResponse>({ type: 'solve', ok: true, message: 'Log in to keep your streak', me: await getMe(undefined, undefined, day), stats });
  }
  const out = await recordSolve(userId, username, day, body.taps, body.ms);
  const me = await getMe(userId, username, day);
  const stats = await getStats(day, me.today?.taps ?? null);
  return c.json<SolveResponse>({ type: 'solve', ok: out.ok, ...(out.message ? { message: out.message } : {}), me, stats });
});

api.post('/share', async (c) => {
  const day = dayFromPostData(context.postData);
  const { userId, postId } = context;
  if (!userId || !postId) return c.json<ShareResponse>({ type: 'share', ok: false, message: 'Log in to share' });
  const before = await markShared(userId, day);
  if (!before) return c.json<ShareResponse>({ type: 'share', ok: false, message: 'Solve the puzzle first' });
  if (before.shared) return c.json<ShareResponse>({ type: 'share', ok: true, message: 'Already shared' });
  const me = await getMe(userId, context.username, day);
  const text = `${shareText(puzzleFor(day), before.taps, me.streak)}\n\n^(played with Lumen, the daily light puzzle)`;
  try {
    // Posted as the player, only when they press Share.
    await reddit.submitComment({ id: postId, text, runAs: 'USER' });
  } catch {
    // Until the app is approved for user actions, fall back to the app account with attribution.
    await reddit.submitComment({ id: postId, text: `u/${context.username} ${text}` });
  }
  return c.json<ShareResponse>({ type: 'share', ok: true });
});

api.get('/leaderboard', async (c) => {
  const day = dayFromPostData(context.postData);
  return c.json<LeaderboardResponse>({ type: 'leaderboard', rows: await leaderboard(day) });
});
