import { useMemo } from 'react';
import type { BeamResult, Cell, Color, Dir } from '../shared/lumen';

const U = 100; // svg units per cell

export const BEAM: Record<Color, string> = {
  white: '#fff6d6',
  red: '#ff5d73',
  blue: '#5cc8ff',
  gold: '#ffc94a',
};

type Props = {
  size: number;
  cells: Cell[];
  beam: BeamResult;
  turns: Record<number, number>; // quarter-turns applied per mirror (for animation)
  onTap?: (i: number) => void;
  hintCell?: number | null;
  solved?: boolean;
  compact?: boolean; // splash preview: no interaction, lighter effects
};

export function Board({ size, cells, beam, turns, onTap, hintCell, solved, compact }: Props) {
  const vb = size * U;
  const segs = useMemo(
    () =>
      beam.segments.map((s, k) => ({
        k,
        d: `M${(s.x1 + 0.5) * U} ${(s.y1 + 0.5) * U}L${(s.x2 + 0.5) * U} ${(s.y2 + 0.5) * U}`,
        c: BEAM[s.c],
      })),
    [beam]
  );

  return (
    <svg
      className={`board ${solved ? 'solved' : ''} ${compact ? 'compact' : ''}`}
      viewBox={`-10 -10 ${vb + 20} ${vb + 20}`}
      role="img"
      aria-label={`Lumen board, ${beam.lit.size} crystals lit`}
    >
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="9" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <linearGradient id="silver" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3f6ff" />
          <stop offset="0.5" stopColor="#9fb0d6" />
          <stop offset="1" stopColor="#e8ecff" />
        </linearGradient>
      </defs>

      <rect x={-10} y={-10} width={vb + 20} height={vb + 20} rx={28} className="board-bg" />

      {/* grid dots */}
      {cells.map((_, i) => {
        const x = (i % size) * U + U / 2;
        const y = Math.floor(i / size) * U + U / 2;
        return <circle key={`g${i}`} cx={x} cy={y} r={2.2} className="grid-dot" />;
      })}

      {/* static pieces under the beam */}
      {cells.map((c, i) => {
        const x = (i % size) * U;
        const y = Math.floor(i / size) * U;
        if (c.t === 'wall') return <rect key={i} x={x + 8} y={y + 8} width={U - 16} height={U - 16} rx={14} className="wall" />;
        if (c.t === 'filter')
          return (
            <g key={i}>
              <rect x={x + 14} y={y + 14} width={U - 28} height={U - 28} rx={10} fill={BEAM[c.c]} opacity={0.22} />
              <rect x={x + 14} y={y + 14} width={U - 28} height={U - 28} rx={10} fill="none" stroke={BEAM[c.c]} strokeWidth={3} strokeDasharray="6 6" />
            </g>
          );
        return null;
      })}

      {/* beam: soft halo + bright core */}
      <g className="beam" key={beam.segments.length + ':' + beam.lit.size}>
        {!compact && segs.map((s) => <path key={`h${s.k}`} d={s.d} stroke={s.c} strokeWidth={22} strokeLinecap="round" opacity={0.28} filter="url(#soft)" />)}
        {segs.map((s) => <path key={`c${s.k}`} d={s.d} stroke={s.c} strokeWidth={compact ? 9 : 7} strokeLinecap="round" className="beam-core" />)}
      </g>

      {/* pieces over the beam */}
      {cells.map((c, i) => {
        const x = (i % size) * U;
        const y = Math.floor(i / size) * U;
        const cx = x + U / 2;
        const cy = y + U / 2;
        if (c.t === 'emitter') return <Emitter key={i} cx={cx} cy={cy} d={c.d} color={BEAM[c.c]} />;
        if (c.t === 'crystal') return <Crystal key={i} cx={cx} cy={cy} color={c.c} lit={beam.lit.has(i)} />;
        if (c.t === 'mirror') {
          // Mirrors are drawn as "\" and rotated, so every tap animates as a quarter turn.
          const base = c.s === '/' ? 1 : 0;
          const quarter = turns[i] ?? base;
          return (
            <g key={i} className={`mirror ${c.locked ? 'locked' : ''}`}>
              {hintCell === i && <circle cx={cx} cy={cy} r={44} className="hint-ring" />}
              <g style={{ transform: `rotate(${quarter * 90}deg)`, transformOrigin: `${cx}px ${cy}px` }} className="mirror-rot">
                <line x1={x + 18} y1={y + 18} x2={x + U - 18} y2={y + U - 18} stroke="url(#silver)" strokeWidth={11} strokeLinecap="round" />
                <line x1={x + 22} y1={y + 22} x2={x + U - 22} y2={y + U - 22} stroke="#ffffff" strokeWidth={2.5} strokeLinecap="round" opacity={0.8} />
              </g>
              {c.locked && <circle cx={cx} cy={cy} r={7} className="rivet" />}
              {!c.locked && onTap && (
                <rect
                  x={x}
                  y={y}
                  width={U}
                  height={U}
                  fill="transparent"
                  className="tap"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onTap(i);
                  }}
                />
              )}
            </g>
          );
        }
        return null;
      })}
    </svg>
  );
}

function Emitter({ cx, cy, d, color }: { cx: number; cy: number; d: Dir; color: string }) {
  const rot = d * 90;
  return (
    <g>
      <circle cx={cx} cy={cy} r={30} fill={color} opacity={0.18} filter="url(#soft)" />
      <circle cx={cx} cy={cy} r={22} className="emitter" stroke={color} />
      <g style={{ transform: `rotate(${rot}deg)`, transformOrigin: `${cx}px ${cy}px` }}>
        <path d={`M${cx - 9} ${cy + 4} L${cx} ${cy - 10} L${cx + 9} ${cy + 4} Z`} fill={color} />
      </g>
    </g>
  );
}

// Each crystal colour also has its own inner mark, so colour is never the only cue.
function Crystal({ cx, cy, color, lit }: { cx: number; cy: number; color: Color; lit: boolean }) {
  const c = BEAM[color];
  const r = 30;
  const gem = `M${cx} ${cy - r} L${cx + r * 0.82} ${cy} L${cx} ${cy + r} L${cx - r * 0.82} ${cy} Z`;
  const mark =
    color === 'red' ? <path d={`M${cx} ${cy - 9} L${cx + 8} ${cy + 6} L${cx - 8} ${cy + 6} Z`} /> :
    color === 'blue' ? <rect x={cx - 7} y={cy - 7} width={14} height={14} rx={2} /> :
    color === 'gold' ? <path d={`M${cx} ${cy - 10} L${cx + 3} ${cy - 3} L${cx + 10} ${cy} L${cx + 3} ${cy + 3} L${cx} ${cy + 10} L${cx - 3} ${cy + 3} L${cx - 10} ${cy} L${cx - 3} ${cy - 3} Z`} /> :
    <circle cx={cx} cy={cy} r={7} />;
  return (
    <g className={`crystal ${lit ? 'lit' : ''}`}>
      {lit && <circle cx={cx} cy={cy} r={42} fill={c} opacity={0.35} filter="url(#soft)" className="crystal-halo" />}
      <path d={gem} fill={lit ? c : 'rgba(255,255,255,0.04)'} stroke={c} strokeWidth={4} strokeLinejoin="round" />
      <path d={`M${cx} ${cy - r} L${cx + r * 0.82} ${cy} L${cx} ${cy}`} fill="#fff" opacity={lit ? 0.35 : 0.08} />
      <g fill={lit ? '#1b1530' : c} opacity={lit ? 0.75 : 0.9}>{mark}</g>
    </g>
  );
}
