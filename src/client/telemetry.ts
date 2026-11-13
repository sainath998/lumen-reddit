// Devvit Journeys: one journey per play session.
//   start  -> first committed tap on the board (never on page load)
//   progress -> share of crystals lit after each tap
//   end    -> solved (win, score = taps)
//   interaction -> share / leaderboard
// The offline preview build has no server, so everything is a no-op there.
import { telemetry } from '@devvit/analytics/client/reddit';

const OFFLINE = import.meta.env.MODE === 'offline';
let started = false;

const safe = (p: Promise<unknown> | undefined) => {
  p?.catch(() => {});
};

export function appReady() {
  if (!OFFLINE) safe(telemetry.appReady());
}

export function firstMove() {
  if (OFFLINE || started) return;
  started = true;
  safe(telemetry.startJourney());
}

export function progress(fraction: number) {
  if (OFFLINE || !started) return;
  safe(telemetry.progress({ progress: Math.max(0, Math.min(1, fraction)), action: 'flip_mirror' }));
}

export function solved(taps: number) {
  if (OFFLINE || !started) return;
  safe(telemetry.endJourney({ complete: true, game: { win: true, score: taps } }));
}

export function interaction(action: 'share' | 'leaderboard' | 'help') {
  if (OFFLINE) return;
  safe(telemetry.interaction({ action }));
}

// Kept for older call sites: maps simple names onto the journey calls above.
export function track(event: 'start' | 'solve' | 'share', props: Record<string, string | number>) {
  if (event === 'share') interaction('share');
  if (event === 'solve' && typeof props.taps === 'number') solved(props.taps);
}
