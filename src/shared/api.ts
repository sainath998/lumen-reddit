import type { Puzzle } from './lumen';

export type MyResult = {
  solved: boolean;
  taps: number;
  ms: number;
  shared: boolean;
  tapList: number[]; // to restore the solved board
};

export type Stats = {
  solvers: number;
  // taps -> number of players who solved with that many taps
  distribution: Record<string, number>;
  // fraction of solvers you beat (0..1), only when solved
  beat?: number;
};

export type Me = {
  username: string | null;
  streak: number;
  bestStreak: number;
  totalSolved: number;
  today: MyResult | null;
};

export type StateResponse = {
  type: 'state';
  puzzle: Puzzle;
  isToday: boolean;
  author?: string; // community puzzles
  me: Me;
  stats: Stats;
  nextPuzzleAt: number; // ms epoch of next UTC midnight
};

export type SolveRequest = { taps: number[]; ms: number };

export type SolveResponse = {
  type: 'solve';
  ok: boolean;
  message?: string;
  me: Me;
  stats: Stats;
};

export type ShareResponse = { type: 'share'; ok: boolean; message?: string; commentUrl?: string };

export type LeaderRow = { username: string; taps: number; ms: number };
export type LeaderboardResponse = { type: 'leaderboard'; rows: LeaderRow[] };

export type CreateRequest = { size: number; design: string };
export type CreateResponse = { type: 'create'; ok: boolean; message?: string; url?: string; par?: number };
