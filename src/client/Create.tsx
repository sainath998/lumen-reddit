import { useMemo, useState } from 'react';
import { Board } from './Board';
import { api, isLocal } from './api';
import { encodeCells, trace, type Cell, type Dir } from '../shared/lumen';
import { navigate } from './nav';

type Tool = 'light' | 'mirror' | 'crystal' | 'stone' | 'erase';

const TOOLS: { id: Tool; label: string; tip: string }[] = [
  { id: 'light', label: 'Light', tip: 'Tap again to turn it' },
  { id: 'mirror', label: 'Mirror', tip: 'Tap again to flip it' },
  { id: 'crystal', label: 'Crystal', tip: 'Light must reach it' },
  { id: 'stone', label: 'Stone', tip: 'Blocks light' },
  { id: 'erase', label: 'Erase', tip: 'Clear a cell' },
];

const blank = (n: number): Cell[] => Array.from({ length: n * n }, () => ({ t: 'empty' }));

// Players design the *solved* board. On publish the server scrambles the
// mirrors, checks it takes at least two flips and works out par.
export function Create({ onClose }: { onClose: () => void }) {
  const [size, setSize] = useState(6);
  const [cells, setCells] = useState<Cell[]>(() => blank(6));
  const [tool, setTool] = useState<Tool>('light');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const beam = useMemo(() => trace(size, cells), [size, cells]);
  const count = (t: Cell['t']) => cells.filter((c) => c.t === t).length;
  const crystals = count('crystal');
  const lights = count('emitter');
  const mirrors = count('mirror');

  const problems: string[] = [];
  if (lights < 1) problems.push('add a light');
  if (lights > 2) problems.push('use at most 2 lights');
  if (crystals < 2) problems.push('add 2+ crystals');
  if (mirrors < 2) problems.push('add 2+ mirrors');
  if (mirrors > 14) problems.push('use at most 14 mirrors');
  if (crystals >= 2 && beam.lit.size < crystals) problems.push(`light every crystal (${beam.lit.size}/${crystals})`);

  const tap = (i: number) => {
    setMsg(null);
    setCells((prev) => {
      const next = prev.slice();
      const cur = prev[i]!;
      if (tool === 'erase') next[i] = { t: 'empty' };
      else if (tool === 'stone') next[i] = cur.t === 'wall' ? { t: 'empty' } : { t: 'wall' };
      else if (tool === 'crystal') next[i] = cur.t === 'crystal' ? { t: 'empty' } : { t: 'crystal', c: 'white' };
      else if (tool === 'mirror') next[i] = cur.t === 'mirror' ? { ...cur, s: cur.s === '/' ? '\\' : '/' } : { t: 'mirror', s: '/', locked: false };
      else next[i] = cur.t === 'emitter' ? { ...cur, d: ((cur.d + 1) % 4) as Dir } : { t: 'emitter', d: 1, c: 'white' };
      return next;
    });
  };

  const resize = (n: number) => {
    setSize(n);
    setCells(blank(n));
    setMsg(null);
  };

  const publish = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.create({ size, design: encodeCells(cells) });
      if (!r.ok) setMsg(r.message ?? 'Could not publish');
      else if (r.url && !isLocal) navigate(r.url);
      else setMsg(`Published! Par ${r.par}. (In the app this opens your new post.)`);
    } catch {
      setMsg('Could not publish right now');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet create" onClick={(e) => e.stopPropagation()}>
        <div className="create-head">
          <h2>Make a Lumen</h2>
          <div className="sizes">
            {[5, 6, 7].map((n) => (
              <button key={n} className={n === size ? 'on' : ''} onClick={() => resize(n)}>{n}×{n}</button>
            ))}
          </div>
        </div>
        <p className="muted small">Build the <b>solved</b> board: every crystal lit. We scramble the mirrors for players and work out par.</p>
        <div className="tools">
          {TOOLS.map((t) => (
            <button key={t.id} className={tool === t.id ? 'on' : ''} onClick={() => setTool(t.id)} title={t.tip}>
              <i className={`lg ${t.id === 'light' ? 'light' : t.id === 'stone' ? 'wall' : t.id}`} />
              {t.label}
            </button>
          ))}
        </div>
        <Board size={size} cells={cells} beam={beam} turns={{}} onCell={tap} />
        <p className={`small ${problems.length ? 'muted' : 'ready'}`}>
          {problems.length ? `To publish: ${problems.join(' · ')}` : `Ready: ${crystals} crystals lit with ${mirrors} mirrors`}
        </p>
        {msg && <p className="small notice">{msg}</p>}
        <div className="actions">
          <button className="primary" disabled={problems.length > 0 || busy} onClick={publish}>{busy ? 'Publishing…' : 'Publish as a new post'}</button>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
