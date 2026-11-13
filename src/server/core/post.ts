import { EntrypointHeight, reddit, redis } from '@devvit/web/server';
import { todayId } from '../../shared/lumen';
import { puzzleFor } from './game';

const POSTS = 'posts'; // hash day -> postId

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LABEL = { gentle: 'Gentle', easy: 'Easy', medium: 'Medium', tricky: 'Tricky', hard: 'Hard' } as const;

/** Create the post for a day (once). Returns the existing post if already created. */
export async function ensureDailyPost(day = todayId()) {
  const existing = await redis.hGet(POSTS, day);
  if (existing) return { id: existing, created: false };

  const p = puzzleFor(day);
  const weekday = WEEKDAY[new Date(day + 'T00:00:00Z').getUTCDay()];
  const post = await reddit.submitCustomPost({
    title: `Lumen #${p.number} · ${weekday} · ${LABEL[p.difficulty]} (par ${p.par})`,
    entry: 'default',
    postData: { day },
    textFallback: { text: `Lumen #${p.number}: today's light puzzle. Flip mirrors to light every crystal in as few taps as you can. Open this post in the Reddit app or on new Reddit to play.` },
    styles: { backgroundColor: '#120F24FF', backgroundColorDark: '#120F24FF', height: EntrypointHeight.TALL },
  });
  // Only the first writer keeps the key, so a retried job can't double-post.
  const won = await redis.hSetNX(POSTS, day, post.id);
  if (!won) {
    await post.delete().catch(() => {});
    return { id: (await redis.hGet(POSTS, day)) ?? post.id, created: false };
  }
  await post.setSuggestedCommentSort('NEW').catch(() => {});
  return { id: post.id, created: true };
}
