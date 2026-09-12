import { describe, expect, it } from 'vitest';
import { everyN, outputFiles, parseRanges } from './split';

describe('parseRanges', () => {
  const ok = (text: string, count = 10) => {
    const r = parseRanges(text, count);
    if (!r.ok) throw new Error(r.error);
    return r.ranges;
  };
  const error = (text: string, count = 10) => {
    const r = parseRanges(text, count);
    return r.ok ? null : r.error;
  };

  it('reads single pages, ranges and open-ended ranges (1-based in, 0-based out)', () => {
    expect(ok('1-3, 5, 8-10')).toEqual([[0, 1, 2], [4], [7, 8, 9]]);
    expect(ok(' 2 ;4 - 5 ')).toEqual([[1], [3, 4]]);
    expect(ok('8-')).toEqual([[7, 8, 9]]);
  });

  it('explains what is wrong', () => {
    expect(error('')).toMatch(/at least one/);
    expect(error('1-3, abc')).toMatch(/"abc"/);
    expect(error('5-3')).toMatch(/3-5/);
    expect(error('4-12')).toMatch(/Page 12 doesn't exist.*10 pages/);
    expect(error('0')).toMatch(/start at 1/);
  });
});

describe('everyN', () => {
  it('chunks pages, last chunk may be short', () => {
    expect(everyN(5, 2)).toEqual([[0, 1], [2, 3], [4]]);
    expect(everyN(3, 1)).toEqual([[0], [1], [2]]);
    expect(everyN(3, 0)).toEqual([[0], [1], [2]]); // bad input falls back to 1
  });
});

describe('outputFiles', () => {
  it('names files after their pages and never repeats a name', () => {
    expect(outputFiles('Report', [[0, 1, 2], [4], [0, 1, 2]]).map((f) => f.name))
      .toEqual(['Report-p1-3.pdf', 'Report-p5.pdf', 'Report-p1-3 (2).pdf']);
  });
});
