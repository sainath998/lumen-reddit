# Lumen: a daily light puzzle for Reddit

**Play it:** [r/lumen_mirrors_dev](https://www.reddit.com/r/lumen_mirrors_dev/) · **App:** [developers.reddit.com/apps/lumen-mirrors](https://developers.reddit.com/apps/lumen-mirrors)

Every day there's a new Lumen board. A beam of light starts at a lamp. Tap mirrors to flip them, bend the light, and light up every crystal in as few taps as you can. Each board has a **par**, the fewest taps that solve it, so you can always tell how well you did.

- **New puzzle every day at 00:00 UTC.** Difficulty follows the week: gentle on Monday, hard on Sunday.
- **Later in the week, the light gets coloured.** Filters recolour the beam, and crystals only light for a beam of their own colour. Some days have two lamps.
- **Everyone gets the same board.** After solving, you see how the community did: a chart of tap counts, the share of players you beat, a leaderboard, and your streak.
- **Stuck? Tap 💡 Hint** and the next mirror to flip glows. Hinted solves still count for your streak but stay off the leaderboard.
- **Share your result in the comments** with one tap, as a spoiler-free line like `Lumen #12 🌟🌟🌟 4 taps (on par) · 🔥5`.
- **Make your own puzzle.** Design a solved board in the editor and Lumen checks it, scrambles the mirrors, works out par, and posts it as a new "Community Lumen" for the subreddit to play.

## How to play
1. Open the post and tap **Play**.
2. Tap a mirror to flip it between `/` and `\`. Mirrors with a rivet are fixed.
3. Light every crystal. Stone blocks light, and filters change the beam's colour.
4. Try to match par. Every tap counts, including tapping a mirror back.

The first time you play, a pulsing ring points at a mirror the beam is already hitting. The **?** button shows a four-item legend.

## For moderators
- Installing the app posts today's puzzle immediately. After that, a new post goes up every day at 00:00 UTC.
- The subreddit menu has **Post today's Lumen**, which creates or opens today's post.
- Anyone can publish up to 3 community puzzles a day.
- Older daily posts stay playable as an archive; they don't count toward streaks.

## Fair play
The game never trusts a score sent from the browser. It sends the list of taps, and the server replays them on that day's board before recording a result. Only your first solve of a puzzle counts.

## Privacy
Lumen stores your Reddit user id with your result for each puzzle (tap count and time), plus your streak, so it can show stats and the leaderboard. It never posts for you unless you press **Share** or **Publish**.

## Technical notes
- Built on Devvit Web: a React client (`src/client`) and a Hono server (`src/server`) using Devvit Redis, the scheduler, the Reddit API and Journeys.
- The puzzle engine (`src/shared/lumen.ts`) has no dependencies and is shared by client and server:
  - Puzzles are generated from the date with a seeded random number generator.
  - Every daily board is checked to start unsolved.
  - Par is found by trying every mirror configuration, which proves the puzzle is solvable in exactly par taps.
- Tests: `npm run test:unit`. They generate 60 days of puzzles and check each one is deterministic, starts unsolved and is solvable in exactly par. They also check move verification, that following hints always solves the board in par, and validation of community puzzles.
- Offline preview with a mocked backend: `npm run preview:local`, then open `/game.html` (add `?day=YYYY-MM-DD` to load another day's puzzle).
- Development: `npm run dev` (Devvit playtest). Release: `npm run deploy`.

## Built for
Reddit's Game of the Day Hackathon (2026). Code written during the hackathon.

## License
MIT
