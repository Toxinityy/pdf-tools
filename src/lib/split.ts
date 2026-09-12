// Pure split logic. Users type 1-based page numbers; everything internal is 0-based.

export type Parsed = { ok: true; ranges: number[][] } | { ok: false; error: string };

const span = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// "1-3, 5, 8-" → [[0,1,2],[4],[7..last]]
export function parseRanges(text: string, pageCount: number): Parsed {
  const parts = text.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return { ok: false, error: 'Type at least one page or range, like 1-3, 5.' };
  const ranges: number[][] = [];
  for (const part of parts) {
    const m = /^(\d+)\s*(?:-\s*(\d*))?$/.exec(part);
    if (!m) return { ok: false, error: `"${part}" isn't a page or range. Use numbers like 4 or 2-6.` };
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : m[2] === '' ? pageCount : Number(m[2]);
    if (a < 1 || b < 1) return { ok: false, error: 'Page numbers start at 1.' };
    if (a > b) return { ok: false, error: `"${part}" goes backwards. Write it as ${b}-${a}.` };
    if (b > pageCount) {
      return { ok: false, error: `Page ${b} doesn't exist. This PDF has ${pageCount} page${pageCount === 1 ? '' : 's'}.` };
    }
    ranges.push(span(a - 1, b - 1));
  }
  return { ok: true, ranges };
}

export function everyN(pageCount: number, n: number): number[][] {
  const size = Math.max(1, Math.floor(n) || 1);
  const out: number[][] = [];
  for (let i = 0; i < pageCount; i += size) out.push(span(i, Math.min(i + size, pageCount) - 1));
  return out;
}

// One output file per group, named after its pages: Report-p1-3.pdf, Report-p5.pdf
export function outputFiles(base: string, groups: number[][]): { name: string; pages: number[] }[] {
  const seen = new Map<string, number>();
  return groups.map((pages) => {
    const first = pages[0] + 1;
    const last = pages[pages.length - 1] + 1;
    const stem = `${base}-p${first}${last !== first ? `-${last}` : ''}`;
    const n = (seen.get(stem) ?? 0) + 1;
    seen.set(stem, n);
    return { name: n === 1 ? `${stem}.pdf` : `${stem} (${n}).pdf`, pages };
  });
}
