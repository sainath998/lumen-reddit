import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { ensureDailyPost } from '../core/post';

export const menu = new Hono();

// Moderator menu: post (or jump to) today's puzzle.
menu.post('/post-create', async (c) => {
  try {
    const post = await ensureDailyPost();
    return c.json<UiResponse>({ navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}` }, 200);
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>({ showToast: 'Failed to create the Lumen post' }, 400);
  }
});
