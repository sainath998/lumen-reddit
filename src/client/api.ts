import type {
  CreateRequest,
  CreateResponse,
  LeaderboardResponse,
  ShareResponse,
  SolveRequest,
  SolveResponse,
  StateResponse,
} from '../shared/api';
import * as mock from './mock';

// `npm run preview:local` builds with mode "offline": no Reddit backend, results
// are kept in this browser so the game can be played and recorded offline.
const LOCAL = import.meta.env.MODE === 'offline';

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  state: (): Promise<StateResponse> => (LOCAL ? mock.state() : getJson('/api/state')),
  solve: (body: SolveRequest): Promise<SolveResponse> =>
    LOCAL ? mock.solve(body) : getJson('/api/solve', { method: 'POST', body: JSON.stringify(body) }),
  share: (): Promise<ShareResponse> => (LOCAL ? mock.share() : getJson('/api/share', { method: 'POST', body: '{}' })),
  leaderboard: (): Promise<LeaderboardResponse> => (LOCAL ? mock.leaderboard() : getJson('/api/leaderboard')),
  create: (body: CreateRequest): Promise<CreateResponse> =>
    LOCAL ? mock.create(body) : getJson('/api/create', { method: 'POST', body: JSON.stringify(body) }),
};

export const isLocal = LOCAL;
