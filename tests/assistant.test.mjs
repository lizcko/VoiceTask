import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../.tools/test-build/model.js';
import { interpretLocal } from '../.tools/test-build/localInterpreter.js';
import { executeCommand, processRequest } from '../.tools/test-build/assistantEngine.js';
import { validateCommand, loadChat, restoreContext } from '../.tools/test-build/assistantTypes.js';
import { expandEntries, changeOccurrence } from '../.tools/test-build/recurrence.js';
import { createBackendInterpreter } from '../.tools/test-build/backendInterpreter.js';
const p={...defaults,zone:'Europe/Moscow',hourStart:9,hourEnd:18};
const now=new Date('2026-10-15T06:00:00Z');
const entry=(patch={})=>({id:crypto.randomUUID(),title:'Презентация',type:'task',date:'2026-10-15',time:'10:00',duration:60,color:'#123abc',important:true,description:'Договор с Иваном',completed:false,...patch});
function session(initial=[]) {
  let records=initial,context={};
  return {get records(){return records;},get context(){return context;},run(text,id=crypto.randomUUID()){const command=interpretLocal(text,context,p,now);const result=executeCommand(command,records,context,p,id,text,now);records=result.records||records;context=result.context;return result;}};
}
test('natural task, persistence marker, no fabricated time and technical duplicate',()=>{
  const s=session([{id:'unknown',future:true}]);let r=s.run('Напомни мне завтра в 10 утра позвонить Ивану','same');
  assert.equal(s.records[1].title,'позвонить ивану');assert.equal(s.records[1].date,'2026-10-16');assert.equal(s.records[1].time,'10:00');assert.ok(r.reply.includes('Сохранено'));
  s.run('Напомни мне завтра в 10 утра позвонить Ивану','same');assert.equal(s.records.length,2);assert.deepEqual(s.records[0],{id:'unknown',future:true});
  s.run('В пятницу нужно отправить отчёт');const e=s.records[2];assert.equal(e.date,'2026-10-16');assert.equal(e.allDay,true);assert.equal(e.title,'отправить отчет');
});
test('meeting clarification merges time and preserves title/date',()=>{
  const s=session();assert.match(s.run('Поставь встречу с Иваном завтра').reply,/время/);assert.equal(s.records.length,0);
  s.run('На 15:00');assert.equal(s.records[0].time,'15:00');assert.equal(s.records[0].date,'2026-10-16');assert.equal(s.records[0].title,'с иваном');
});
test('missing title then date, cancellation and unknown request',()=>{
  const s=session();s.run('Запланируй встречу завтра');assert.equal(s.records.length,0);s.run('С командой');s.run('В 14:00');assert.equal(s.records.length,1);
  s.run('Создай задачу подготовить презентацию');assert.match(s.run('Отмена').reply,/отменено/);assert.equal(s.records.length,1);assert.match(s.run('расскажи анекдот').reply,/Не удалось/);
});
test('schedule today, next week, old search/comments and open second',()=>{
  const a=entry(),b=entry({title:'План',date:'2026-10-20'}),c=entry({date:'2025-01-01',title:'Архив'}),s=session([a,b,c]);
  assert.equal(s.run('Что у меня сегодня?').entries.length,1);assert.equal(s.run('Какие задачи у меня на следующей неделе?').entries[0].id,b.id);
  assert.equal(s.run('Найди задачу про архив').entries[0].id,c.id);assert.equal(s.run('Найди задачи по договору').entries.length,3);assert.equal(s.run('Открой вторую').openId,a.id);
});
test('edits use context, preserve unrelated fields, completion/reopen',()=>{
  const a=entry(),s=session([a,entry({title:'Другая задача'})]);s.run('Найди задачу про презентацию');s.run('А перенеси её на завтра');assert.equal(s.records[0].date,'2026-10-16');assert.equal(s.records[0].color,a.color);assert.equal(s.records[0].description,a.description);
  s.run('Измени время презентации на 14:00');assert.equal(s.records[0].time,'14:00');s.run('Я закончила презентацию');assert.equal(s.records[0].completed,true);s.run('Верни задачу в невыполненные');assert.equal(s.records[0].completed,false);
});
test('ambiguity requires selection then operation continues',()=>{
  const a=entry(),b=entry({date:'2026-10-16'}),s=session([a,b]);assert.match(s.run('Перенеси презентацию на завтра').reply,/несколько/);assert.equal(s.records[0].date,a.date);
  s.run('Вторую');assert.equal(s.records[0].date,a.date);assert.equal(s.records[1].date,'2026-10-16');
});
test('comment clarification preserves the selected task and unrelated fields',()=>{
  const a=entry(),s=session([a,entry({title:'Другая'})]);assert.match(s.run('Добавь комментарий к задаче про презентацию').reply,/Какой комментарий/);s.run('Проверить документы перед звонком');assert.equal(s.records[0].comment,'Проверить документы перед звонком');assert.equal(s.records[0].color,a.color);
});
test('delete confirmation cancel, context reset, stale record protection',()=>{
  const a=entry({type:'meeting',title:'Встреча с Иваном'}),s=session([a]);s.run('Удали встречу с Иваном');assert.equal(s.records.length,1);s.run('Нет');assert.equal(s.records.length,1);s.run('Удали встречу с Иваном');s.run('Да');assert.equal(s.records.length,0);
  const t=session([a]);t.run('Удали встречу с Иваном');t.run('Что у меня сегодня?');t.run('Да');assert.equal(t.records.length,1);
  const result=executeCommand({intent:'delete_event',id:a.id},[a],{},p,'a','удали',now);const changed={...a,title:'Изменено'};const confirm=executeCommand({intent:'confirm_action'},[changed],result.context,p,'b','Да',now);assert.equal(confirm.records,undefined);assert.match(confirm.reply,/изменилась/);
});
test('multiday meeting and relative hours in selected zone',()=>{
  const s=session();s.run('Запланируй встречу с командой завтра с 23:00 до 02:00 следующего дня');assert.equal(s.records[0].duration,180);assert.equal(s.records[0].endAt,'2026-10-16T23:00:00.000Z');
  s.run('Через два часа напомни проверить документы');assert.equal(s.records[1].time,'11:00');
});
test('recurrence is one rule, weekly days, monthly day skips nonexistent, scopes',()=>{
  const s=session();s.run('Каждый понедельник в 9:00 планёрка');assert.equal(s.records.length,1);assert.equal(s.records[0].recurrence.frequency,'weekly');
  const list=expandEntries(s.records,'2026-10-01','2026-11-01',p.zone);assert.equal(list.length,2);assert.equal(new Set(list.map(e=>e.id)).size,2);
  const one=changeOccurrence(s.records,list[0],{title:'Особая'},'one',p.zone);assert.equal(one.length,2);assert.equal(expandEntries(one,'2026-10-01','2026-11-01',p.zone).filter(e=>e.title==='Особая').length,1);
  const future=changeOccurrence(s.records,list[1],null,'future',p.zone);assert.equal(expandEntries(future,'2026-10-01','2026-12-01',p.zone).length,1);
  const m=entry({date:'2026-01-31',recurrence:{frequency:'monthly'}});assert.deepEqual(expandEntries([m],'2026-01-01','2026-03-31',p.zone).map(e=>e.date),['2026-01-31','2026-03-31']);
});
test('recurring chat deletion requires scope then yes',()=>{
  const s=session();s.run('Напоминай пить воду каждый день в 12');s.run('Удали пить воду');assert.match(s.run('Только это повторение').reply,/Ответьте/);s.run('Да');assert.equal(s.records.length,1);assert.equal(s.records[0].recurrence.exceptions.length,1);
});
test('free time ignores tasks and includes crossing-midnight meeting',()=>{
  const s=session([entry({allDay:true}),entry({type:'meeting',time:'10:00',duration:120})]);const r=s.run('Есть ли у меня свободное время сегодня?');assert.match(r.reply,/09:00–10:00, 12:00–18:00/);
});
test('mock model uses same validation, invalid data never runs, API rejection propagates',async()=>{
  const mocked=async()=>({intent:'create_task',fields:{title:'Из модели',date:'2026-10-16'}});assert.equal((await processRequest(mocked,'текст',[],{},p,'mock',now)).records.length,1);
  for(const raw of [{intent:'eval',code:'bad'},{intent:'update_event',fields:{completed:true}},{intent:'create_task',fields:{date:'2026-02-30'}},{intent:'create_task',fields:{time:'25:00'}},{intent:'create_task',fields:{recurrence:{frequency:'weekly',weekdays:[]}}}])assert.throws(()=>validateCommand(raw));
  await assert.rejects(()=>processRequest(async()=>{throw Error('API unavailable');},'текст',[],{},p,'mock',now),/API unavailable/);
});
test('history bounded and legacy retained, confirmations do not survive reload',()=>{
  const e=entry();assert.equal(loadChat([{role:'assistant',text:'Старая история'}],[])[0].text,'Старая история');assert.equal(loadChat(Array.from({length:400},()=>({role:'user',text:'a'})),[]).length,300);
  const context=restoreContext({updatedAt:+now,lastId:e.id,confirmation:{id:e.id}},[e],+now);assert.equal(context.lastId,e.id);assert.equal(context.confirmation,undefined);assert.deepEqual(restoreContext({updatedAt:+now,lastId:'missing'},[],+now),{updatedAt:+now});
});
test('dormant backend adapter: minimal context, validation, auth and API failures',async()=>{
  let payload;
  const provider=createBackendInterpreter('https://example.invalid/intent',async(url,options)=>{payload=JSON.parse(options.body);assert.equal(options.credentials,'include');assert.equal(options.redirect,'error');return new Response(JSON.stringify({intent:'search_events',query:'архив'}));});
  const r=await provider('найди архив',{lastId:'one',confirmation:{snapshot:'private record'},resultIds:['one']},p,now);assert.equal(r.intent,'search_events');assert.equal(payload.zone,p.zone);assert.equal(payload.context.confirmation,undefined);assert.equal(payload.records,undefined);
  assert.throws(()=>createBackendInterpreter('http://example.invalid'),/HTTPS/);
  await assert.rejects(()=>createBackendInterpreter('https://example.invalid',async()=>new Response('{}',{status:429}))('test',{},p,now),/Слишком много/);
  await assert.rejects(()=>createBackendInterpreter('https://example.invalid',async()=>new Response('{bad'))('test',{},p,now));
  await assert.rejects(()=>createBackendInterpreter('https://example.invalid',async()=>new Response(JSON.stringify({intent:'delete_everything'})))('test',{},p,now),/Недопустимая/);
});
test('recurrence ordinal, end boundaries, past context expiry and date-specific deletion',()=>{
  const s=session();s.run('В первый понедельник месяца проверять отчёты');assert.equal(s.records[0].recurrence.ordinal,1);assert.equal(expandEntries(s.records,'2026-11-01','2026-11-30',p.zone)[0].date,'2026-11-02');
  const daily=session();daily.run('Напоминай пить воду каждый день в 12 до конца месяца');assert.equal(daily.records[0].recurrence.until,'2026-10-31');assert.equal(daily.records[0].date,'2026-10-15');
  const a=entry({type:'meeting',title:'Созвон с Иваном'}),b=entry({type:'meeting',title:a.title,date:'2026-10-16'}),t=session([a,b]);assert.match(t.run('Удали встречу с Иваном завтра').reply,/Ответьте/);t.run('Да');assert.equal(t.records[0].id,a.id);
  const result=executeCommand({intent:'update_event',fields:{time:'14:00'}},[a],{lastId:a.id,updatedAt:+now-31*60000},p,'stale','перенеси',now);assert.equal(result.records,undefined);
});
