import { Entry, validEntry } from './calendar.js';
import { Preferences, commentOf, displayEntry, segment, toInstant, wallParts } from './model.js';
import { Command, Context, Fields, validateCommand } from './assistantTypes.js';
import { changeOccurrence, expandEntries, occurrence, nextOccurrence, validRecurrence } from './recurrence.js';
export type Outcome = { reply:string; context:Context; records?:unknown[]; entries?:Entry[]; openId?:string };
export type Interpreter = (text:string,context:Context,prefs:Preferences,now:Date)=>Command|Promise<Command>;
const norm=(s:string)=>s.toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(w=>w.length>1&&!['про','по','на','задачу','задача','встречу','встреча','мне','задаче','к','с','у'].includes(w)).map(w=>w.replace(/(?:иями|ами|ого|ему|ию|ия|ую|ой|ом|а|у|е|ы|и)$/u,''));
export function matches(e:Entry,query:string) {const hay=norm(`${e.title} ${commentOf(e)}`);return norm(query).every(q=>hay.some(w=>w.startsWith(q)||q.startsWith(w)));}
export const describe=(e:Entry)=>`${e.type==='task'?'Задача':'Встреча'} «${e.title}» · ${e.date}${e.allDay?' · без времени':` · ${e.time}`}${e.type==='task'?(e.completed?' · выполнено':' · не выполнено'):''}${e.recurrence?' · повторяется':''}`;
function resolve(entries:Entry[],id:string|undefined,zone:string):Entry|undefined {
  if(!id)return;
  const direct=entries.find(e=>e.id===id);if(direct)return displayEntry(direct,zone);
  const base=entries.find(e=>id.startsWith(`${e.id}@`));const day=base&&id.slice(base.id.length+1);
  if(base?.recurrence&&day){const list=expandEntries([base],day,day,zone);return list.find(e=>e.id===id)&&displayEntry(occurrence(base,day,zone),zone);}
}
function applyFields(base:Entry,f:Fields,p:Preferences,creating=false):Entry {
  const next={...base};
  for(const key of ['title','date','time','duration','important','color','allDay','recurrence'] as const)if(f[key]!==undefined)Object.assign(next,{[key]:f[key]});
  if(base.allDay&&f.time&&!f.duration)next.duration=60;
  if(f.comment!==undefined){next.comment=f.comment;next.description=f.comment;}
  if(next.allDay){next.time='00:00';next.duration=1440;delete next.startAt;delete next.endAt;}
  else if(creating||base.startAt) {
    next.startAt=toInstant(next.date,next.time,p.zone);
    next.endAt=f.endTime?toInstant(f.endDate||next.date,f.endTime,p.zone):new Date(Date.parse(next.startAt)+next.duration*60000).toISOString();
    next.duration=(Date.parse(next.endAt)-Date.parse(next.startAt))/60000;
  } else if(f.endTime)next.duration=(Date.parse(`${f.endDate||next.date}T${f.endTime}:00Z`)-Date.parse(`${next.date}T${next.time}:00Z`))/60000;
  if(!validEntry(next))throw Error('Проверьте дату, время и продолжительность записи.');
  if(next.type==='meeting'&&next.allDay)throw Error('Для встречи укажите точное время.');
  if(next.recurrence&&(!validRecurrence(next.recurrence)||next.recurrence.until&&next.recurrence.until<next.date))throw Error('Проверьте правило и окончание повторения.');
  return next;
}
export function executeCommand(raw:unknown,records:unknown[],previous:Context,p:Preferences,requestId:string,userText:string,now=new Date()):Outcome {
  if(previous.updatedAt&&+now-previous.updatedAt>30*60000)previous={};
  const command=validateCommand(raw), entries=records.filter(validEntry);
  const context:Context={...previous,updatedAt:+now};
  const reply=(text:string,extra:Partial<Outcome>={}):Outcome=>({reply:text,context,...extra});
  if(command.intent==='cancel_action'){return {reply:'Действие отменено. Записи не изменены.',context:{updatedAt:+now}};}
  if(command.intent==='answer_question')return {reply:command.answer||'Уточните, что нужно сделать.',context:{updatedAt:+now}};
  if(command.intent==='confirm_action') {
    if(!/^(да|подтверждаю|удалить)[.!]?$/iu.test(userText.trim()))return reply('Подтвердите удаление словом «Да» или отмените словом «Нет».');
    const pending=context.confirmation;
    if(!pending)return reply('Нет действия, ожидающего подтверждения.');
    const selected=resolve(entries,pending.id,p.zone),base=selected&&entries.find(e=>e.id===(selected.sourceId||selected.id));
    context.confirmation=undefined;
    if(!selected||JSON.stringify(base)!==pending.snapshot)return reply('Запись изменилась или удалена. Повторите запрос на удаление.');
    const next=changeOccurrence(records,selected,null,pending.command.scope||'all',p.zone);
    context.lastId=undefined;context.resultIds=undefined;context.pending=undefined;
    return reply('Запись удалена.',{records:next});
  }
  // Every independent request invalidates an earlier destructive confirmation.
  context.confirmation=undefined;context.pending=undefined;context.candidates=undefined;context.awaitingScope=undefined;
  if(['create_task','create_meeting','create_recurrence'].includes(command.intent)) {
    context.resultIds=undefined;context.lastId=undefined;
    const exists=entries.find(e=>e.operationId===requestId);if(exists)return reply('Этот запрос уже сохранён.',{entries:[exists]});
    const f=command.fields||{},type=command.intent==='create_meeting'||command.type==='meeting'?'meeting':'task';
    const ask=(question:string)=>{context.pending=command;return reply(question);};
    if(!f.title?.trim()||/^(встреча|встречу|задача|задачу)$/iu.test(f.title))return ask(type==='meeting'?'С кем или по какому поводу встреча?':'Как называется задача?');
    if(!f.date)return ask('На какую дату запланировать запись?');
    if(type==='meeting'&&!f.time)return ask('На какое время назначить встречу?');
    if(command.intent==='create_recurrence'&&!f.recurrence)return ask('Как повторять запись: ежедневно, еженедельно или ежемесячно?');
    const allDay=type==='task'&&!f.time;
    const e=applyFields({id:`ai-${requestId}`,title:f.title,type,date:f.date,time:f.time||'00:00',duration:f.duration||60,description:'',color:type==='task'?p.taskColor:p.meetingColor,important:false,completed:false,allDay,operationId:requestId},f,p,true);
    const created=e.recurrence?(nextOccurrence(e,e.date,p.zone)||e):e;
    context.lastId=created.id;
    return reply(`Сохранено: ${describe(created)}${type==='meeting'&&!f.duration&&!f.endTime?' · продолжительность 60 минут (по умолчанию)':''}.`,{records:[...records,e],entries:[created]});
  }
  if(command.intent==='list_events'||command.intent==='search_events') {
    const today=wallParts(now,p.zone).date;
    let pool:Entry[];
    if(command.start)pool=expandEntries(entries,command.start,command.end||command.start,p.zone).map(e=>displayEntry(e,p.zone)).filter(e=>segment(e,command.start!)||e.date>=command.start!&&e.date<=(command.end||command.start!));
    else pool=entries.map(e=>displayEntry(e,p.zone));
    pool=pool.filter(e=>(!command.type||e.type===command.type)&&(!command.incomplete||e.type==='task'&&!e.completed)&&(!command.query||matches(e,command.query)));
    pool.sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    if(command.free) {
      const day=command.start||today;if(command.end&&command.end!==day)return reply('Для поиска свободного времени выберите один день.');
      const busy=pool.filter(e=>e.type==='meeting'&&!e.allDay).map(e=>segment(e,day)).filter((e):e is Entry=>!!e).map(e=>{const [h,m]=e.time.split(':').map(Number);return [h*60+m,h*60+m+e.duration];}).sort((a,b)=>a[0]-b[0]);
      let cursor=p.hourStart*60;const slots:string[]=[];const clock=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
      for(const [a,b]of busy){if(a>cursor)slots.push(`${clock(cursor)}–${clock(Math.min(a,p.hourEnd*60))}`);cursor=Math.max(cursor,b);if(cursor>=p.hourEnd*60)break;}
      if(cursor<p.hourEnd*60)slots.push(`${clock(cursor)}–${clock(p.hourEnd*60)}`);
      return reply(`Свободное время ${day} (${p.zone}): ${slots.join(', ')||'в рабочем интервале нет'}.`);
    }
    context.resultIds=pool.slice(0,100).map(e=>e.id);context.lastId=pool.length===1?pool[0].id:undefined;
    return reply(pool.length?pool.slice(0,100).map((e,i)=>`${i+1}. ${describe(e)}`).join('\n')+(pool.length>100?'\nПоказаны первые 100 записей; уточните период.':''):'На выбранный период или по этому запросу записей нет.',{entries:pool.slice(0,100)});
  }
  let selected=resolve(entries,command.id,p.zone);
  if(command.index)selected=resolve(entries,(previous.candidates||previous.resultIds)?.[command.index-1],p.zone);
  if(!selected&&!command.index&&!command.id&&command.query) {
    const source=command.start?expandEntries(entries,command.start,command.end||command.start,p.zone):entries;
    const pool=source.map(e=>displayEntry(e,p.zone)).filter(e=>(!command.type||e.type===command.type)&&matches(e,command.query!)&&(!command.start||!!segment(e,command.start)||e.date>=command.start&&e.date<=(command.end||command.start)));
    if(pool.length>1){context.pending=command;context.candidates=pool.map(e=>e.id);context.resultIds=context.candidates;return reply('Найдено несколько записей. Укажите номер:\n'+pool.map((e,i)=>`${i+1}. ${describe(e)}`).join('\n'),{entries:pool});}
    selected=pool[0];
  }
  if(!selected&&!command.query&&!command.index&&!command.id)selected=resolve(entries,previous.lastId,p.zone);
  if(!selected){context.pending=command;return reply('Какую именно запись выбрать? Укажите название или номер из последнего списка.');}
  if(selected.recurrence&&!selected.occurrenceDate) {
    // Querying a series by title cannot silently choose one occurrence.
    const day=command.fields?.date||wallParts(now,p.zone).date;
    const next=nextOccurrence(entries.find(e=>e.id===selected!.id)!,day,p.zone);
    if(next)selected=displayEntry(next,p.zone);
  }
  context.lastId=selected.id;
  if(command.intent==='open_event')return reply(describe(selected),{openId:selected.id,entries:[selected]});
  if(['complete_task','reopen_task'].includes(command.intent)&&selected.type!=='task')return reply('Статус выполнения предусмотрен только для задач.');
  const base=entries.find(e=>e.id===(selected!.sourceId||selected!.id))!;
  if(base.recurrence&&!command.scope) {context.awaitingScope={...command,id:selected.id};return reply('Изменить только это повторение, это и последующие или всю серию?');}
  if(command.intent==='delete_event') {
    context.confirmation={command:{...command,id:selected.id},id:selected.id,snapshot:JSON.stringify(base)};
    return reply(`Удалить ${describe(selected)}${base.recurrence?` (${command.scope==='one'?'только это повторение':command.scope==='future'?'это и последующие':'всю серию'})`:''}? Ответьте «Да» или «Нет».`);
  }
  let f=command.fields||{};
  if(command.intent==='update_event'&&command.answer==='comment'&&f.comment===undefined){context.pending={...command,id:selected.id};return reply('Какой комментарий добавить?');}
  if(command.intent==='complete_task'||command.intent==='reopen_task') {
    const next=changeOccurrence(records,selected,{completed:command.intent==='complete_task'},command.scope||'all',p.zone);
    const detached=next.find(e=>validEntry(e)&&!records.some(old=>validEntry(old)&&old.id===e.id)) as Entry|undefined;
    const saved=detached||{...selected,completed:command.intent==='complete_task'};context.lastId=saved.id;
    return reply(command.intent==='complete_task'?'Задача отмечена выполненной.':'Задача возвращена в невыполненные.',{records:next,entries:[saved]});
  }
  if(command.intent!=='update_event')throw Error('Действие не поддерживается.');
  if(!Object.keys(f).length){context.pending={...command,id:selected.id};return reply('Что изменить: дату, время, комментарий, цвет или важность?');}
  if(command.answer==='extend'&&f.duration)f={...f,duration:selected.duration+f.duration};
  const updated=applyFields(selected,f,p);
  const patch:Partial<Entry>={};
  // Copy only changed data fields, never transient occurrence metadata.
  for(const k of ['title','date','time','duration','color','important','description','comment','allDay','startAt','endAt','recurrence'] as const)if(updated[k]!==selected[k])Object.assign(patch,{[k]:updated[k]});
  const next=changeOccurrence(records,selected,patch,command.scope||'all',p.zone);
  const detached=next.find(e=>validEntry(e)&&!records.some(old=>validEntry(old)&&old.id===e.id)) as Entry|undefined;
  const saved=detached||updated;context.lastId=saved.id;
  return reply(`Запись обновлена: ${describe(saved)}.`,{records:next,entries:[saved]});
}
export async function processRequest(interpreter:Interpreter,text:string,records:unknown[],context:Context,p:Preferences,id:string,now=new Date()) {
  return executeCommand(await interpreter(text,context,p,now),records,context,p,id,text,now);
}
