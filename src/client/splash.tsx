import './index.css';

import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { requestExpandedMode } from '@devvit/web/client';
import { Board } from './Board';
import { api } from './api';
import { trace } from '../shared/lumen';
import type { StateResponse } from '../shared/api';

// Inline view shown in the feed: a quiet preview of today's board and one
// button. Kept light; the game itself lives in the expanded view.
export const Splash = () => {
  const [data, setData] = useState<StateResponse | null>(null);
  useEffect(() => {
    api.state().then(setData).catch(() => {});
  }, []);
  const beam = useMemo(() => (data ? trace(data.puzzle.size, data.puzzle.cells) : null), [data]);
  const p = data?.puzzle;
  const done = data?.me.today?.solved;

  return (
    <div className="splash">
      <div>{p && beam ? <Board size={p.size} cells={p.cells} beam={beam} turns={{}} compact /> : <div className="loader" />}</div>
      <div>
        <h1>LUMEN{p && <span> #{p.number}</span>}</h1>
        <p className="muted tagline">Bend the light. Light every crystal in as few taps as you can.</p>
        {p && (
          <p className="small">
            <span className={`pill ${p.difficulty}`}>{p.difficulty}</span> <span className="muted">· par {p.par}</span>
            {data && data.stats.solvers > 0 && <span className="muted"> · {data.stats.solvers.toLocaleString()} solved</span>}
          </p>
        )}
        <button className="primary play" onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}>
          {done ? `Solved in ${data?.me.today?.taps} taps · see results` : data && !data.isToday ? `Play Lumen #${p?.number}` : 'Play today’s Lumen'}
        </button>
        {data && data.me.streak > 0 && <p className="small muted">🔥 {data.me.streak}-day streak</p>}
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
