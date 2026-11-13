import './index.css';

import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Board } from './Board';
import { Create } from './Create';
import { api, isLocal } from './api';
import { applyTaps, hintMirror, shareText, trace, type Cell, type Puzzle } from '../shared/lumen';
import type { LeaderRow, Me, StateResponse, Stats } from '../shared/api';
import { appReady, firstMove, interaction, progress, track } from './telemetry';

const DIFF_LABEL: Record<Puzzle['difficulty'], string> = {
  gentle: 'Gentle',
  easy: 'Easy',
  medium: 'Medium',
  tricky: 'Tricky',
  hard: 'Hard',
};

function useCountdown(target: number) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  if (now === null) return '…';
  const s = Math.max(0, Math.floor((target - now) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

const seenHint = () => {
  try {
    return localStorage.getItem('lumen.hinted') === '1';
  } catch {
    return false;
  }
};
const markHint = () => {
  try {
    localStorage.setItem('lumen.hinted', '1');
  } catch {
    /* ignore */
  }
};

export const App = () => {
  const [data, setData] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taps, setTaps] = useState<number[]>([]);
  const [turns, setTurns] = useState<Record<number, number>>({});
  const [me, setMe] = useState<Me | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [hint, setHint] = useState(!seenHint());
  const [hints, setHints] = useState(0);
  const [hintTarget, setHintTarget] = useState<number | null>(null);
  const startedAt = useRef<number | null>(null);
  const submitted = useRef(false);

  useEffect(() => {
    api
      .state()
      .then((s) => {
        setData(s);
        setMe(s.me);
        setStats(s.stats);
        if (s.me.today?.solved) {
          // restore the solved board
          setTaps(s.me.today.tapList);
          submitted.current = true;
          setShowResult(true);
        }
        appReady();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const puzzle = data?.puzzle;
  const cells: Cell[] = useMemo(() => (puzzle ? applyTaps(puzzle.cells, taps) : []), [puzzle, taps]);
  const beam = useMemo(() => (puzzle ? trace(puzzle.size, cells) : null), [puzzle, cells]);
  const crystals = useMemo(() => cells.filter((c) => c.t === 'crystal').length, [cells]);
  const solved = Boolean(beam?.solved);

  // The coach mark points at a mirror the beam actually hits, so the first tap
  // visibly changes the light.
  const firstMovable = useMemo(() => {
    if (!puzzle) return null;
    const start = trace(puzzle.size, puzzle.cells);
    for (const s of start.segments) {
      if (!Number.isInteger(s.x2) || !Number.isInteger(s.y2)) continue;
      const i = s.y2 * puzzle.size + s.x2;
      const c = puzzle.cells[i];
      if (c && c.t === 'mirror' && !c.locked) return i;
    }
    const i = puzzle.cells.findIndex((c) => c.t === 'mirror' && !c.locked);
    return i >= 0 ? i : null;
  }, [puzzle]);

  const onTap = useCallback(
    (i: number) => {
      if (!puzzle || solved) return;
      if (startedAt.current === null) startedAt.current = performance.now();
      if (hint) {
        setHint(false);
        markHint();
      }
      setHintTarget(null);
      const current = applyTaps(puzzle.cells, taps);
      const c = current[i];
      const base = c && c.t === 'mirror' && c.s === '/' ? 1 : 0;
      setTurns((t) => ({ ...t, [i]: (t[i] ?? base) + 1 }));
      setTaps((t) => [...t, i]);
      firstMove();
      const next = trace(puzzle.size, applyTaps(puzzle.cells, [...taps, i]));
      const total = current.filter((x) => x.t === 'crystal').length;
      progress(total ? next.lit.size / total : 0);
      if (navigator.vibrate) navigator.vibrate(8);
    },
    [puzzle, taps, solved, hint]
  );

  const askHint = () => {
    if (!puzzle || solved) return;
    if (hint) {
      setHint(false);
      markHint();
    }
    const i = hintMirror(puzzle.size, cells);
    if (i === null) return;
    setHintTarget(i);
    setHints((h) => h + 1);
    interaction('hint');
  };

  // submit once when solved
  useEffect(() => {
    if (!solved || submitted.current || !puzzle) return;
    submitted.current = true;
    const ms = startedAt.current === null ? 0 : Math.round(performance.now() - startedAt.current);
    track('solve', { puzzle: puzzle.number, taps: taps.length, par: puzzle.par });
    api
      .solve({ taps, ms, ...(hints ? { hints } : {}) })
      .then((r) => {
        setMe(r.me);
        setStats(r.stats);
        setTimeout(() => setShowResult(true), 900);
      })
      .catch(() => setTimeout(() => setShowResult(true), 900));
  }, [solved, puzzle, taps, hints]);

  if (error) return <div className="screen center"><p className="muted">Couldn’t load today’s puzzle. Pull to refresh.</p></div>;
  if (!data || !puzzle || !beam) return <div className="screen center"><div className="loader" /></div>;

  const count = me?.today?.taps ?? taps.length;
  const delta = count - puzzle.par;

  return (
    <div className="screen">
      <header className="hud">
        <div>
          <div className="title">LUMEN <span>{data.author ? 'by u/' + data.author : '#' + puzzle.number}</span></div>
          <div className="sub">
            {new Date(puzzle.id + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}
            <span className={`pill ${puzzle.difficulty}`}>{DIFF_LABEL[puzzle.difficulty]}</span>
            {!data.isToday && <span className="pill archive">{data.author ? 'Community' : 'Archive'}</span>}
          </div>
        </div>
        <div className="score" aria-live="polite">
          <b className={solved ? (delta <= 0 ? 'good' : '') : ''}>{taps.length}</b>
          <span>taps · par {puzzle.par}</span>
        </div>
      </header>

      <main className="stage">
        <Board size={puzzle.size} cells={cells} beam={beam} turns={turns} onTap={onTap} hintCell={hint ? firstMovable : hintTarget} solved={solved} />
        <div className="status">
          {solved ? (
            <span className="win-line">All {crystals} crystals lit ✦</span>
          ) : hint ? (
            <span className="coach">Tap a mirror to flip it and bend the light</span>
          ) : hintTarget !== null ? (
            <span className="coach">Flip the glowing mirror</span>
          ) : (
            <span>
              <b>{beam.lit.size}</b> of {crystals} crystals lit
            </span>
          )}
        </div>
      </main>

      <footer className="bar">
        <button className="ghost" onClick={() => { setShowHelp(true); interaction('help'); }} aria-label="How to play">?</button>
        <span className="muted small">
          {stats ? `${stats.solvers.toLocaleString()} solved today` : ''}
          {me && me.streak > 0 ? ` · 🔥 ${me.streak}` : ''}
        </span>
        <span className="bar-right">
          {solved ? (
            <button className="ghost" onClick={() => setShowResult(true)}>Results</button>
          ) : (
            <button className="ghost" onClick={askHint} aria-label="Show me a mirror to flip">💡 Hint</button>
          )}
        </span>
      </footer>

      {showHelp && <Help onClose={() => setShowHelp(false)} />}
      {showCreate && <Create onClose={() => setShowCreate(false)} />}
      {showResult && me && stats && (
        <Result
          puzzle={puzzle}
          me={me}
          stats={stats}
          nextAt={data.nextPuzzleAt}
          isToday={data.isToday}
          subreddit={data.subreddit}
          onClose={() => setShowResult(false)}
          onShared={(m) => setMe(m)}
          onMake={() => {
            setShowResult(false);
            setShowCreate(true);
          }}
        />
      )}
      {isLocal && <div className="local-badge">local preview</div>}
    </div>
  );
};

function Help({ onClose }: { onClose: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>How to play</h2>
        <ul className="legend">
          <li><i className="lg mirror" /> Tap a <b>mirror</b> to flip it. Mirrors with a rivet are fixed.</li>
          <li><i className="lg crystal" /> Light every <b>crystal</b> with a beam of its colour.</li>
          <li><i className="lg filter" /> <b>Filters</b> recolour the beam passing through.</li>
          <li><i className="lg wall" /> <b>Stone</b> blocks light.</li>
        </ul>
        <p className="muted small">Fewer taps is better. Par is the fewest taps possible. A new puzzle every day, gentle on Monday, hard on Sunday.</p>
        <button className="primary" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

type ResultProps = {
  puzzle: Puzzle;
  me: Me;
  stats: Stats;
  nextAt: number;
  isToday: boolean;
  subreddit: string | undefined;
  onClose: () => void;
  onShared: (m: Me) => void;
  onMake: () => void;
};

function Result({ puzzle, me, stats, nextAt, isToday, subreddit, onClose, onShared, onMake }: ResultProps) {
  const t = me.today;
  const taps = t?.taps ?? 0;
  const delta = taps - puzzle.par;
  const countdown = useCountdown(nextAt);
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(Boolean(t?.shared));
  const [board, setBoard] = useState<LeaderRow[] | null>(null);
  const [joined, setJoined] = useState<'no' | 'busy' | 'yes' | 'failed'>('no');
  const usedHints = t?.hints ?? 0;
  // contiguous rows from par to the worst score, so gaps read as zero
  const counts = new Map(Object.entries(stats.distribution).map(([k, v]) => [Number(k), v]));
  const hi = Math.max(puzzle.par, taps, ...counts.keys());
  const lo = Math.min(puzzle.par, ...(counts.size ? counts.keys() : [puzzle.par]));
  const dist = Array.from({ length: Math.min(12, hi - lo + 1) }, (_, k) => [lo + k, counts.get(lo + k) ?? 0] as const);
  const max = Math.max(1, ...dist.map(([, v]) => v));
  const stars = delta <= 0 ? 3 : delta <= 2 ? 2 : 1;

  const share = async () => {
    setSharing(true);
    try {
      const r = await api.share();
      if (r.ok) {
        setShared(true);
        if (t) onShared({ ...me, today: { ...t, shared: true } });
        track('share', { puzzle: puzzle.number });
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet result" onClick={(e) => e.stopPropagation()}>
        <div className="stars" aria-label={`${stars} of 3 stars`}>
          {[0, 1, 2].map((k) => <span key={k} className={k < stars ? 'on' : ''}>✦</span>)}
        </div>
        <h2>{delta < 0 ? 'Under par!' : delta === 0 ? 'Perfect — on par' : 'Lit!'}</h2>
        <p className="big">
          <b>{taps}</b> taps <span className="muted">· par {puzzle.par}</span>
        </p>
        {usedHints > 0 && <p className="muted small">💡 {usedHints} hint{usedHints > 1 ? 's' : ''} used · not ranked on the leaderboard</p>}
        {stats.beat !== undefined && stats.solvers > 1 && (
          <p className="muted">Fewer taps than {Math.round(stats.beat * 100)}% of today’s solvers</p>
        )}

        <div className="dist" aria-label="How everyone did">
          {dist.map(([k, v]) => (
            <div key={k} className={`row ${k === taps ? 'me' : ''}`}>
              <span className="k">{k === puzzle.par ? `${k} ★` : k}</span>
              <span className="bar"><i style={{ width: `${(v / max) * 100}%` }} /></span>
              <span className="v">{v}</span>
            </div>
          ))}
        </div>

        <div className="streaks">
          <div><b>{me.streak}</b><span>streak</span></div>
          <div><b>{me.bestStreak}</b><span>best</span></div>
          <div><b>{me.totalSolved}</b><span>solved</span></div>
        </div>

        <div className="actions">
          <button className="primary" disabled={shared || sharing} onClick={share}>
            {shared ? 'Shared in comments ✓' : sharing ? 'Posting…' : 'Share result in comments'}
          </button>
          <button className="ghost" onClick={() => { interaction('leaderboard'); void api.leaderboard().then((r) => setBoard(r.rows)); }}>Leaderboard</button>
        </div>
        {shared && <p className="muted small mono">{shareText(puzzle, taps, me.streak, usedHints)}</p>}

        {board && (
          <ol className="leaders">
            {board.map((r, k) => (
              <li key={r.username}><span>{k + 1}. u/{r.username}</span><span>{r.taps} taps · {(r.ms / 1000).toFixed(0)}s</span></li>
            ))}
          </ol>
        )}

        <p className="muted small next">{isToday ? `Next Lumen in ${countdown}` : 'This is an archive puzzle — it doesn’t count toward your streak.'}</p>
        <div className="actions secondary">
          {subreddit && joined !== 'failed' && (
            <button
              className="ghost"
              disabled={joined !== 'no'}
              onClick={() => {
                setJoined('busy');
                interaction('join');
                api.join().then((r) => setJoined(r.ok ? 'yes' : 'failed')).catch(() => setJoined('failed'));
              }}
            >
              {joined === 'yes' ? `Joined r/${subreddit} ✓` : `Join r/${subreddit} for tomorrow’s puzzle`}
            </button>
          )}
          <button className="ghost" onClick={onMake}>Make your own Lumen</button>
        </div>
        <button className="link" onClick={onClose}>View board</button>
      </div>
    </div>
  );
}

document.body.classList.add('game');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
