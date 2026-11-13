// Hono adapter for Devvit Journeys (the packaged router is Express-only).
import { Hono } from 'hono';
import { telemetry } from '@devvit/analytics/server/reddit';

export const journeys = new Hono();

type Body = { journeyId?: string; progress?: number; action?: string; actionDetails?: string; complete?: boolean; game?: { win: boolean; score: number } };
const body = async (c: { req: { json: <T>() => Promise<T> } }) => (await c.req.json<Body>().catch(() => ({}))) as Body;

journeys.post('/journey/start', async (c) => c.json(await telemetry.startJourney()));
journeys.post('/journey/app-ready', async (c) => c.json(await telemetry.appReady()));
journeys.post('/journey/progress', async (c) => {
  const b = await body(c);
  return c.json(await telemetry.journeyProgress({ journeyId: b.journeyId ?? '', progress: b.progress ?? 0, action: b.action ?? '', actionDetails: b.actionDetails ?? '' }));
});
journeys.post('/journey/interaction', async (c) => {
  const b = await body(c);
  return c.json(await telemetry.journeyInteraction({ journeyId: b.journeyId ?? '', action: b.action ?? '', actionDetails: b.actionDetails ?? '' }));
});
journeys.post('/journey/end', async (c) => {
  const b = await body(c);
  return c.json(await telemetry.endJourney({ journeyId: b.journeyId ?? '', complete: b.complete ?? false, ...(b.game ? { game: b.game } : {}) }));
});
