import { Hono } from 'hono';
import { context, reddit, redis } from '@devvit/web/server';
import type { CreateRequest, CreateResponse, JoinResponse, LeaderboardResponse, ShareResponse, SolveRequest, SolveResponse, StateResponse } from '../../shared/api';
import { buildCustom, shareText, todayId } from '../../shared/lumen';
import { getMe, getStats, leaderboard, markShared, recordSolve, resolveBoard } from '../core/game';

export const api = new Hono();

const nextMidnight = () => {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
};

api.get('/state', async (c) => {
  const board = await resolveBoard(context.postData);
  const me = await getMe(context.userId, context.username, board.key);
  const stats = await getStats(board.key, me.today?.taps ?? null);
  return c.json<StateResponse>({
    type: 'state',
    puzzle: board.puzzle,
    isToday: board.isToday,
    ...(board.author ? { author: board.author } : {}),
    me,
    stats,
    nextPuzzleAt: nextMidnight(),
    ...(context.subredditName ? { subreddit: context.subredditName } : {}),
  });
});

api.post('/solve', async (c) => {
  const board = await resolveBoard(context.postData);
  const body = await c.req.json<SolveRequest>().catch(() => null);
  if (!body) return c.json({ status: 'error', message: 'bad request' }, 400);
  const { userId, username } = context;
  if (!userId || !username) {
    // Logged-out players can play; their result just isn't stored or ranked.
    const stats = await getStats(board.key, null);
    return c.json<SolveResponse>({ type: 'solve', ok: true, message: 'Log in to keep your streak', me: await getMe(undefined, undefined, board.key), stats });
  }
  const hints = typeof body.hints === 'number' && body.hints > 0 ? body.hints : 0;
  const out = await recordSolve(userId, username, board, body.taps, body.ms, hints);
  const me = await getMe(userId, username, board.key);
  const stats = await getStats(board.key, me.today?.taps ?? null);
  return c.json<SolveResponse>({ type: 'solve', ok: out.ok, ...(out.message ? { message: out.message } : {}), me, stats });
});

api.post('/share', async (c) => {
  const board = await resolveBoard(context.postData);
  const { userId, postId } = context;
  if (!userId || !postId) return c.json<ShareResponse>({ type: 'share', ok: false, message: 'Log in to share' });
  const before = await markShared(userId, board.key);
  if (!before) return c.json<ShareResponse>({ type: 'share', ok: false, message: 'Solve the puzzle first' });
  if (before.shared) return c.json<ShareResponse>({ type: 'share', ok: true, message: 'Already shared' });
  const me = await getMe(userId, context.username, board.key);
  const text = `${shareText(board.puzzle, before.taps, board.isToday ? me.streak : 0, before.hints ?? 0)}\n\n^(played with Lumen, the daily light puzzle)`;
  try {
    // Posted as the player, only when they press Share.
    await reddit.submitComment({ id: postId, text, runAs: 'USER' });
  } catch {
    // Until the app is approved for user actions, fall back to the app account with attribution.
    await reddit.submitComment({ id: postId, text: `u/${context.username} ${text}` });
  }
  return c.json<ShareResponse>({ type: 'share', ok: true });
});

// Result screen: join the subreddit so tomorrow's puzzle shows up in the player's feed.
api.post('/join', async (c) => {
  if (!context.userId) return c.json<JoinResponse>({ type: 'join', ok: false });
  try {
    await reddit.subscribeToCurrentSubreddit();
    return c.json<JoinResponse>({ type: 'join', ok: true });
  } catch (error) {
    console.error(`join: ${error}`);
    return c.json<JoinResponse>({ type: 'join', ok: false });
  }
});

api.get('/leaderboard', async (c) => {
  const board = await resolveBoard(context.postData);
  return c.json<LeaderboardResponse>({ type: 'leaderboard', rows: await leaderboard(board.key) });
});

// Community puzzles: validate a designed board and publish it as a new post.
const MAX_PER_DAY = 3;
api.post('/create', async (c) => {
  const { userId, username, subredditName } = context;
  if (!userId || !username) return c.json<CreateResponse>({ type: 'create', ok: false, message: 'Log in to publish a puzzle' });
  const body = await c.req.json<CreateRequest>().catch(() => null);
  if (!body || typeof body.design !== 'string' || typeof body.size !== 'number') return c.json<CreateResponse>({ type: 'create', ok: false, message: 'Bad request' });

  const quotaKey = `quota:${todayId()}`;
  const used = Number((await redis.hGet(quotaKey, userId)) ?? 0);
  if (used >= MAX_PER_DAY) return c.json<CreateResponse>({ type: 'create', ok: false, message: `You can publish ${MAX_PER_DAY} puzzles a day` });

  const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const count = await redis.incrBy('custom:count', 1);
  const built = buildCustom(body.size, body.design, id, count);
  if (!built.ok) return c.json<CreateResponse>({ type: 'create', ok: false, message: built.reason });

  await redis.set(`custom:${id}`, JSON.stringify({ puzzle: built.puzzle, author: username }));
  await redis.hIncrBy(quotaKey, userId, 1);
  await redis.expire(quotaKey, 3 * 86400);

  const title = `Community Lumen #${count} by u/${username} · par ${built.puzzle.par}`;
  const opts = {
    title,
    entry: 'default',
    postData: { kind: 'custom', id },
    textFallback: { text: `A Lumen puzzle made by u/${username}. Open in the Reddit app or on new Reddit to play.` },
  };
  let post;
  try {
    post = await reddit.submitCustomPost({ ...opts, runAs: 'USER' });
  } catch {
    post = await reddit.submitCustomPost(opts);
  }
  return c.json<CreateResponse>({ type: 'create', ok: true, url: `https://reddit.com/r/${subredditName}/comments/${post.id}`, par: built.puzzle.par });
});
