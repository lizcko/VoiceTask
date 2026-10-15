import { Entry, Recurrence, addDays, dateKey, fromKey, validEntry } from './calendar.js';
import { displayEntry, toInstant } from './model.js';
export const shiftDay = (day: string, count: number) => dateKey(addDays(fromKey(day), count));
export const validDay = (day: unknown): day is string => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(+fromKey(day)) && dateKey(fromKey(day)) === day;
export function validRecurrence(r: unknown): r is Recurrence {
  if (!r || typeof r !== 'object') return false;
  const v = r as Recurrence;
  return Object.keys(v).every(k=>['frequency','weekdays','until','ordinal','exceptions'].includes(k)) && ['daily','weekly','monthly'].includes(v.frequency) && (v.until === undefined || validDay(v.until)) && (v.weekdays === undefined || Array.isArray(v.weekdays) && v.weekdays.length > 0 && v.weekdays.length <= 7 && v.weekdays.every(d=>Number.isInteger(d)&&d>=0&&d<=6)) && (v.ordinal === undefined || v.frequency==='monthly' && Number.isInteger(v.ordinal) && v.ordinal>=1 && v.ordinal<=5 && v.weekdays?.length===1) && (v.exceptions===undefined || Array.isArray(v.exceptions)&&v.exceptions.every(validDay));
}
export function occurs(e: Entry, day: string) {
  const r=e.recurrence;
  if (!r || !validRecurrence(r) || day<e.date || r.until && day>r.until || r.exceptions?.includes(day)) return false;
  const d=fromKey(day), start=fromKey(e.date);
  return r.frequency==='daily' || r.frequency==='weekly' && (r.weekdays || [start.getDay()]).includes(d.getDay()) || r.frequency==='monthly' && (r.ordinal ? r.weekdays!.includes(d.getDay()) && Math.ceil(d.getDate()/7)===r.ordinal : d.getDate()===start.getDate());
}
export function occurrence(e: Entry, day: string, zone: string): Entry {
  const base=displayEntry(e,zone);
  const next:Entry={...base,id:`${e.id}@${day}`,sourceId:e.id,occurrenceDate:day,date:day};
  if(e.startAt) { next.startAt=toInstant(day,base.time,zone); next.endAt=new Date(Date.parse(next.startAt)+e.duration*60000).toISOString(); }
  return next;
}
export function nextOccurrence(e:Entry,start:string,zone:string) {
  let day=start>e.date?start:e.date;
  for(let i=0;i<3660;i++,day=shiftDay(day,1)) {
    if(e.recurrence?.until&&day>e.recurrence.until)return;
    if(occurs(e,day)){try{return occurrence(e,day,zone);}catch{/* Skip impossible local times. */}}
  }
}
// Only materialize the requested window. Stored records remain the single source of truth.
export function expandEntries(entries: Entry[], start: string, end: string, zone: string): Entry[] {
  const output:Entry[]=[];
  for(const e of entries) {
    if(!e.recurrence) {output.push(e);continue;}
    if(!validRecurrence(e.recurrence)) {output.push(e);continue;}
    const lookback=Math.min(3660,Math.ceil(e.duration/1440));
    const first=shiftDay(start,-lookback);
    let day=first>e.date?first:e.date;
    for(let i=0;day<=end&&i<4400;i++,day=shiftDay(day,1)) if(occurs(e,day)) {try{output.push(occurrence(e,day,zone));}catch{/* DST gap: no silent shift. */}}
  }
  return output;
}
export type Scope = 'one' | 'future' | 'all';
export function changeOccurrence(records: unknown[], selected: Entry, patch: Partial<Entry> | null, scope: Scope, zone: string): unknown[] {
  const id=selected.sourceId || selected.id, base=records.find(e=>validEntry(e)&&e.id===id) as Entry | undefined;
  if(!base) throw Error('Запись больше не существует.');
  if(!base.recurrence) return patch===null?records.filter(e=>e!==base):records.map(e=>e===base?{...base,...patch}:e);
  if(!selected.occurrenceDate && scope!=='all') throw Error('Сначала выберите конкретное повторение.');
  if(scope==='all') {
    if(patch===null) return records.filter(e=>e!==base);
    // Series date/time edits are anchored to the selected occurrence; preserve series start for time-only edits.
    const p={...patch};
    if(p.date===selected.date) p.date=base.date;
    const next={...base,...p};
    if(next.startAt) {next.startAt=toInstant(next.date,next.time,zone);next.endAt=new Date(Date.parse(next.startAt)+next.duration*60000).toISOString();}
    return records.map(e=>e===base?next:e);
  }
  const day=selected.occurrenceDate!;
  if(scope==='one') {
    const updated={...base,recurrence:{...base.recurrence,exceptions:[...new Set([...(base.recurrence.exceptions||[]),day])]}};
    const next=records.map(e=>e===base?updated:e);
    if(patch!==null) {const {recurrence: _r,sourceId: _s,occurrenceDate: _d,...single}=occurrence(base,day,zone);next.push({...single,...patch,id:crypto.randomUUID(),recurrence:undefined,sourceId:undefined,occurrenceDate:undefined});}
    return next;
  }
  const truncated={...base,recurrence:{...base.recurrence,until:shiftDay(day,-1)}};
  const next=records.map(e=>e===base?truncated:e);
  if(patch!==null) {const split={...occurrence(base,day,zone),...patch,id:crypto.randomUUID(),sourceId:undefined,occurrenceDate:undefined,recurrence:{...base.recurrence,exceptions:base.recurrence.exceptions?.filter(d=>d>=day)}}; next.push(split);}
  return next;
}
