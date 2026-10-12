import { Entry, dateKey, validEntry } from './calendar.js';
export type Preferences = {
  theme: 'light' | 'dark' | 'system'; accent: string; text: 'small' | 'medium' | 'large'; density: 'standard' | 'brief' | 'full';
  zone: string; defaultPeriod: 'День' | 'Неделя' | 'Месяц' | 'Год'; hourStart: number; hourEnd: number; dateFormat: string;
  taskColor: string; meetingColor: string; highlight: boolean; weekNumbers: boolean;
  enabled: boolean; lead: number; tasks: boolean; meetings: boolean; important: boolean; sound: boolean; popup: boolean; daily: boolean;
};
export const defaults: Preferences = { theme: 'light', accent: '#514b91', text: 'medium', density: 'standard', zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow', defaultPeriod: 'Неделя', hourStart: 0, hourEnd: 24, dateFormat: 'DD.MM.YYYY', taskColor: '#ddd8f5', meetingColor: '#d8eae2', highlight: true, weekNumbers: false, enabled: true, lead: 15, tasks: true, meetings: true, important: true, sound: false, popup: true, daily: false };
export const ENTRY_KEY = 'voicetask.entries.v1';
export function readJSON<T>(key: string, fallback: T): T { try { const raw = localStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw); } catch { return fallback; } }
export function writeJSON(key: string, value: unknown) { localStorage.setItem(key, JSON.stringify(value)); }
export function loadPreferences(): Preferences {
  const raw = readJSON<Partial<Preferences>>('voicetask.preferences.v2', {});
  const p = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof Preferences)[]) if (typeof raw?.[key] === typeof defaults[key]) Object.assign(p, { [key]: raw[key] });
  if (!['light', 'dark', 'system'].includes(p.theme)) p.theme = defaults.theme;
  if (!['small', 'medium', 'large'].includes(p.text)) p.text = defaults.text;
  if (!['standard', 'brief', 'full'].includes(p.density)) p.density = defaults.density;
  if (!['День', 'Неделя', 'Месяц', 'Год'].includes(p.defaultPeriod)) p.defaultPeriod = defaults.defaultPeriod;
  for (const k of ['accent', 'taskColor', 'meetingColor'] as const) if (!/^#[\da-f]{6}$/i.test(p[k])) p[k] = defaults[k];
  try { new Intl.DateTimeFormat('ru', { timeZone: p.zone }); } catch { p.zone = defaults.zone; }
  if (!(Number.isInteger(p.hourStart) && Number.isInteger(p.hourEnd) && p.hourStart >= 0 && p.hourEnd <= 24 && p.hourEnd > p.hourStart)) { p.hourStart = 0; p.hourEnd = 24; }
  if (![5, 15, 30, 60, 1440].includes(p.lead)) p.lead = 15;
  return p;
}
// Keep unknown records in storage; rendering only uses understood records. Never seed over existing data.
export function loadRecords(): unknown[] { const raw = localStorage.getItem(ENTRY_KEY); if (raw === null) return []; const parsed: unknown = JSON.parse(raw); if (!Array.isArray(parsed)) throw Error('Неверный формат сохранённых записей'); return parsed; }
export const commentOf = (e: Entry) => e.comment ?? e.description ?? '';
export function wallParts(instant: string | Date, zone: string) {
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}
const wallNumber = (day: string, time: string) => Date.parse(`${day}T${time}:00Z`);
// Resolve a wall-clock time in the chosen zone, rejecting DST gaps rather than moving silently.
export function toInstant(day: string, time: string, zone: string) {
  const wanted = wallNumber(day, time); if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !Number.isFinite(wanted) || new Date(wanted).toISOString().slice(0,10)!==day) throw Error('Некорректная дата или время');
  let candidate = wanted;
  for (let i = 0; i < 5; i++) { const p = wallParts(new Date(candidate), zone); const difference = wanted - wallNumber(p.date, p.time); if (!difference) return new Date(candidate).toISOString(); candidate += difference; }
  throw Error('Такого местного времени нет в выбранном часовом поясе');
}
const displayedEnds = new WeakMap<Entry,{date:string;time:string}>();
export function displayEntry(e: Entry, zone: string): Entry {
  if (!e.startAt) return e;
  const start = wallParts(e.startAt, zone), end = wallParts(e.endAt!, zone);
  // A repeated DST hour occupies one grid row. Keep a visible segment and exact end in details.
  const civilDuration = (wallNumber(end.date, end.time) - wallNumber(start.date, start.time)) / 60000;
  const displayed = { ...e, ...start, duration: Math.max(1,civilDuration) };
  displayedEnds.set(displayed,end); return displayed;
}
export function endParts(e: Entry) { const exact=displayedEnds.get(e); if(exact)return exact; const d = new Date(wallNumber(e.date, e.time) + e.duration * 60000); if(!Number.isFinite(+d)) return {date:'',time:''}; return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) }; }
export function segment(e: Entry, day: string): Entry | null {
  const start = wallNumber(e.date, e.time), end = start + e.duration * 60000, midnight = wallNumber(day, '00:00');
  const a = Math.max(start, midnight), b = Math.min(end, midnight + 86400000);
  if (b <= a) return null;
  return { ...e, date: day, time: new Date(a).toISOString().slice(11, 16), duration: (b - a) / 60000 };
}
export function searchEntries(entries: Entry[], query: string) { const q = query.trim().toLocaleLowerCase('ru'); return q ? entries.filter(e => `${e.title} ${commentOf(e)}`.toLocaleLowerCase('ru').includes(q)).sort((a,b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)) : []; }
export function dateLabel(day: string, format: string) { const [y,m,d] = day.split('-'); return format === 'YYYY-MM-DD' ? day : format === 'MM/DD/YYYY' ? `${m}/${d}/${y}` : `${d}.${m}.${y}`; }
export function weekNumber(day: Date) { const d = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); return Math.ceil((((+d - Date.UTC(d.getUTCFullYear(),0,1))/86400000)+1)/7); }
export type Reminder = { key: string; entryId?: string; text: string };
export function dueReminders(entries: Entry[], p: Preferences, now: number, seen: string[]) {
  if (!p.enabled) return [];
  const reminders: Reminder[] = [];
  for (const e of entries) {
    if (e.completed || !(e.important && p.important || e.type === 'task' && p.tasks || e.type === 'meeting' && p.meetings)) continue;
    let start: number; try { start = e.startAt ? Date.parse(e.startAt) : Date.parse(toInstant(e.date, e.time, p.zone)); } catch { continue; }
    const delta = start - now; const overdue = delta < 0;
    if (overdue && e.type !== 'task' || delta > p.lead * 60000) continue;
    const key = `${e.id}:${e.startAt || e.date + 'T' + e.time}:${overdue ? 'overdue' : 'soon'}`;
    if (!seen.includes(key)) reminders.push({ key, entryId: e.id, text: `${e.important ? '! ' : ''}${overdue ? 'Просроченная задача' : e.type === 'task' ? 'Скоро задача' : 'Скоро встреча'}: ${e.title}` });
  }
  if (p.daily) { const day = wallParts(new Date(now), p.zone).date, key = `daily:${day}`; if (!seen.includes(key)) reminders.push({ key, text: `Обзор дня: ${entries.filter(e => segment(displayEntry(e,p.zone), day)).length} записей на ${dateLabel(day,p.dateFormat)}` }); }
  return reminders;
}
export { validEntry, dateKey };
