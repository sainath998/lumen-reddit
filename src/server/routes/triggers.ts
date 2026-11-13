import { Hono } from 'hono';
import type { OnAppInstallRequest } from '@devvit/web/shared';
import type { TaskRequest } from '@devvit/web/server';
import { ensureDailyPost } from '../core/post';

export const triggers = new Hono();
export const scheduler = new Hono();

// Installing the app posts today's puzzle right away.
triggers.post('/on-app-install', async (c) => {
  await c.req.json<OnAppInstallRequest>().catch(() => null);
  try {
    await ensureDailyPost();
  } catch (error) {
    console.error(`on-app-install: ${error}`);
  }
  return c.json({}, 200);
});

// Every day at 00:00 UTC: post the new puzzle.
scheduler.post('/daily-puzzle', async (c) => {
  await c.req.json<TaskRequest>().catch(() => null);
  try {
    await ensureDailyPost();
  } catch (error) {
    console.error(`daily-puzzle: ${error}`);
  }
  return c.json({}, 200);
});
