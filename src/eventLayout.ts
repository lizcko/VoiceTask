import { Entry, minutes } from './calendar.js';

// Partition visual intervals, including the extra space needed by short cards.
// Real entry dates/durations are never modified. The grid has a bottom gutter.
export function layoutEvents(entries: Entry[], start: number, end: number, minimumHeight = 88) {
  const scale = 1.5;
  const placed = entries.map(e => {
    const a = Math.max(minutes(e.time), start), b = Math.min(minutes(e.time) + e.duration, end);
    return { e, a, b, top: (a - start) * scale, height: Math.max(minimumHeight, (b - a) * scale), lane: 0, lanes: 1, group: 0 };
  }).filter(v => v.b > v.a).sort((a, b) => a.a - b.a || b.b - a.b || a.e.id.localeCompare(b.e.id));
  let group = -1, groupEnd = -1;
  const laneEnds: number[] = [];
  for (const v of placed) {
    if (v.top >= groupEnd) { group++; laneEnds.length = 0; groupEnd = -1; }
    let lane = laneEnds.findIndex(end => end <= v.top);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = v.top + v.height;
    groupEnd = Math.max(groupEnd, laneEnds[lane]);
    v.lane = lane; v.group = group;
  }
  const counts = new Map<number, number>();
  for (const v of placed) counts.set(v.group, Math.max(counts.get(v.group) || 0, v.lane + 1));
  for (const v of placed) v.lanes = counts.get(v.group)!;
  return placed;
}

export function selectMonth(date: Date, year: number, month: number) {
  return new Date(year, month, Math.min(date.getDate(), new Date(year, month + 1, 0).getDate()), 12);
}
