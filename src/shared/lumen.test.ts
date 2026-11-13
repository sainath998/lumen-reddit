import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, trace, applyTaps, minTaps, verify, reflect, difficultyFor, dayNumber, type Cell } from './lumen.ts';

const days = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 10, 15 + i)).toISOString().slice(0, 10));

test('reflect is an involution per slant and turns 90 degrees', () => {
  for (const s of ['/', '\\'] as const) for (const d of [0, 1, 2, 3] as const) {
    const r = reflect(d, s);
    assert.notEqual(r % 2, d % 2);
    assert.equal(reflect(((r + 2) % 4) as 0 | 1 | 2 | 3, s), (d + 2) % 4);
  }
});

test('dayNumber and weekly difficulty', () => {
  assert.equal(dayNumber('2026-11-15'), 1);
  assert.equal(dayNumber('2026-11-16'), 2);
  assert.equal(difficultyFor('2026-11-16'), 'gentle'); // Monday
  assert.equal(difficultyFor('2026-11-15'), 'hard'); // Sunday
});

test('60 days generate, are deterministic, start unsolved and are solvable in exactly par taps', () => {
  const stats: Record<string, number[]> = {};
  for (const day of days) {
    const t0 = performance.now();
    const p = generate(day);
    const ms = performance.now() - t0;
    const again = generate(day);
    assert.deepEqual(again.cells, p.cells, 'deterministic');
    assert.equal(trace(p.size, p.cells).solved, false, 'starts unsolved');
    assert.equal(minTaps(p.size, p.cells), p.par);
    (stats[p.difficulty] ??= []).push(p.par);
    assert.ok(ms < 3000, `${day} generated in ${ms.toFixed(0)}ms`);
  }
  console.log(Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, `par ${Math.min(...v)}-${Math.max(...v)} (n=${v.length})`])));
});

test('verify replays taps and ignores locked / non-mirror cells', () => {
  const p = generate('2026-11-16');
  const movable = p.cells.map((c, i) => (c.t === 'mirror' && !c.locked ? i : -1)).filter((i) => i >= 0);
  // brute force to find a solving tap set
  let solution: number[] | null = null;
  for (let mask = 0; mask < 1 << movable.length && !solution; mask++) {
    const taps = movable.filter((_, b) => mask & (1 << b));
    if (taps.length === p.par && trace(p.size, applyTaps(p.cells, taps)).solved) solution = taps;
  }
  assert.ok(solution);
  assert.deepEqual(verify(p, solution!), { solved: true, taps: p.par });
  const wall = p.cells.findIndex((c: Cell) => c.t === 'wall' || c.t === 'empty');
  assert.equal(verify(p, [...solution!, wall]).taps, p.par, 'non-mirror taps ignored');
  assert.equal(verify(p, [...solution!, solution![0]!, solution![0]!]).solved, true, 'double tap returns mirror');
  assert.equal(verify(p, []).solved, false);
});
