import { parseCommand, weekStart, dateKey, fromKey, Recurrence } from './calendar.js';
import { Preferences, wallParts } from './model.js';
import { Command, Context, Fields } from './assistantTypes.js';
import { shiftDay } from './recurrence.js';
const weekdays=['воскресень','понедельник','вторник','сред','четверг','пятниц','суббот'];
const numberWords:Record<string,number>={'один':1,'одну':1,'одна':1,'два':2,'две':2,'три':3,'четыре':4,'пять':5,'шесть':6,'семь':7,'восемь':8,'девять':9,'десять':10,'двенадцать':12,'пятнадцать':15,'тридцать':30};
const numeric=(s:string)=>s.replace(/один|одну|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять|двенадцать|пятнадцать|тридцать/gu,w=>String(numberWords[w]));
export function temporal(text:string,prefs:Preferences,now:Date) {
  let rest=text.toLowerCase().replace(/ё/g,'е'); const today=wallParts(now,prefs.zone).date; const f:Fields={};
  let start:string|undefined,end:string|undefined,boundary:string|undefined;
  const consume=(re:RegExp,fn:(m:RegExpMatchArray)=>void)=>{const m=rest.match(re);if(m){fn(m);rest=rest.replace(m[0],' ');return true;}return false;};
  consume(/(\d{4}-\d{2}-\d{2})/u,m=>{f.date=m[1];});
  if(!f.date)consume(/послезавтра|завтра[а-я]*|сегодня[а-я]*|вчера[а-я]*/u,m=>{f.date=shiftDay(today,m[0]==='послезавтра'?2:m[0].startsWith('завтра')?1:m[0].startsWith('вчера')?-1:0);});
  consume(/(следующ[а-я]*|прошл[а-я]*|эт[а-я]*)\s+недел[а-я]*/u,m=>{start=shiftDay(dateKey(weekStart(fromKey(today))),m[1].startsWith('след')?7:m[1].startsWith('прош')?-7:0);end=shiftDay(start,6);});
  consume(/до конца (недели|месяца)/u,m=>{boundary=m[1]==='недели'?shiftDay(dateKey(weekStart(fromKey(today))),6):dateKey(new Date(fromKey(today).getFullYear(),fromKey(today).getMonth()+1,0));if(!f.date)f.date=boundary;});
  const relative=rest.match(/через\s+([а-я]+|\d+)\s+(час[а-я]*|минут[а-я]*|д[а-я]*)/u);
  if(relative) {const count=Number(numeric(relative[1]));if(Number.isFinite(count)){if(relative[2].startsWith('д'))f.date=shiftDay(today,count);else Object.assign(f,wallParts(new Date(+now+count*(relative[2].startsWith('час')?60:1)*60000),prefs.zone));rest=rest.replace(relative[0],' ');}}
  let recurrence:Recurrence|undefined;
  if(/кажд[а-я]*\s+день|ежедневно/u.test(rest)){recurrence={frequency:'daily'};rest=rest.replace(/кажд[а-я]*\s+день|ежедневно/u,' ');}
  if(/ежемесячно|кажд[а-я]*\s+месяц/u.test(rest)){recurrence={frequency:'monthly'};rest=rest.replace(/ежемесячно|кажд[а-я]*\s+месяц/u,' ');}
  const days=weekdays.flatMap((stem,i)=>rest.includes(stem)?[i]:[]);
  if(days.length) {
    const repeating=/кажд[а-я]*|еженедельно/u.test(rest);
    if(repeating)recurrence={frequency:'weekly',weekdays:days};
    if(/перв[а-я]*.*месяц/u.test(rest))recurrence={frequency:'monthly',weekdays:[days[0]],ordinal:1};
    if(!f.date){const dow=fromKey(today).getDay();let delta=(days[0]-dow+7)%7;if(/следующ[а-я]*/u.test(rest))delta=(days[0]+6)%7+7-(dow+6)%7;f.date=shiftDay(today,delta);}
    for(const stem of weekdays)rest=rest.replace(new RegExp(`(?:в |к |по |кажд[а-я]* |следующ[а-я]* |перв[а-я]* )?${stem}[а-я]*`,'gu'),' ');
    rest=rest.replace(/месяца|еженедельно/gu,' ');
  }
  if(/еженедельно/u.test(rest)){recurrence={frequency:'weekly'};rest=rest.replace(/еженедельно/u,' ');}
  if(recurrence){f.recurrence=recurrence;if(boundary){recurrence.until=boundary;if(f.date===boundary)f.date=today;}if(!f.date)f.date=today;}
  if(recurrence)consume(/до конца (января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/u,m=>{const month=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'].indexOf(m[1]);let year=fromKey(today).getFullYear();if(month<fromKey(today).getMonth())year++;recurrence!.until=dateKey(new Date(year,month+1,0));});
  consume(/(?:с |в |на |^)(\d{1,2})[:.](\d{2})(?:\s*(утра|вечера|дня|ночи))?/u,m=>{let h=Number(m[1]);if((m[3]==='вечера'||m[3]==='дня')&&h<12)h+=12;f.time=`${String(h).padStart(2,'0')}:${m[2]}`;});
  if(!f.time)consume(/(?:в |на |^)(\d{1,2})(?:\s*(утра|вечера|дня|ночи))?(?=\s|$|[?.,])/u,m=>{let h=Number(m[1]);if((m[2]==='вечера'||m[2]==='дня')&&h<12)h+=12;f.time=`${String(h).padStart(2,'0')}:00`;});
  consume(/до\s+(\d{1,2}):(\d{2})(?:\s*(следующего дня))?/u,m=>{f.endTime=`${m[1].padStart(2,'0')}:${m[2]}`;f.endDate=f.date;if(f.date&&(m[3]||f.time&&f.endTime<=f.time))f.endDate=shiftDay(f.date,1);});
  consume(/на\s+полчаса/u,()=>{f.duration=30;});
  consume(/(?:на |продолжительностью )([а-я]+|\d+)\s+(час[а-я]*|минут[а-я]*)/u,m=>{const n=Number(numeric(m[1]));if(Number.isFinite(n))f.duration=n*(m[2].startsWith('час')?60:1);});
  if(/важн[а-я]*|важно/u.test(rest)){f.important=true;rest=rest.replace(/важн[а-я]*|важно/gu,' ');}
  const color=rest.match(/зелен[а-я]*|красн[а-я]*|син[а-я]*|#[\da-f]{6}/u);if(color){f.color=color[0].startsWith('#')?color[0]:color[0].startsWith('зелен')?'#d8eae2':color[0].startsWith('красн')?'#f2dce1':'#d7e7f8';rest=rest.replace(color[0],' ');}
  if(/без времени|весь день/u.test(rest)){f.allDay=true;rest=rest.replace(/без времени|весь день/gu,' ');}
  if(f.time)f.allDay=false;
  return {fields:f,rest:rest.replace(/\s+/g,' ').trim(),start,end};
}
export const localHelp='Я работаю в локальном режиме: понимаю распространённые запросы о задачах и встречах, но могу попросить уточнение.\nНапример: «Напомни завтра в 10 утра позвонить Ивану», «Что у меня на следующей неделе?», «Найди задачу про презентацию», «Перенеси её на завтра». Удаление — только после подтверждения. Для произвольных формулировок потребуется подключение LLM.';
export function interpretLocal(text:string,context:Context,prefs:Preferences,now=new Date()):Command {
  const s=text.trim().toLowerCase().replace(/ё/g,'е').replace(/[?!]$/,'');
  if(/^(отмена|не нужно|забудь|оставь как было|нет)$/u.test(s))return {intent:'cancel_action'};
  if(/^(да|подтверждаю|удалить)$/u.test(s))return {intent:'confirm_action'};
  if(/^(помощь|help|команды)$/u.test(s))return {intent:'answer_question',answer:localHelp};
  if(context.pending?.answer==='comment'&&!/^(создай|добавь|поставь|найди|что |какие |удали|перенеси|измени|открой)/u.test(s))return {...context.pending,fields:{...context.pending.fields,comment:text.trim()}};
  if(context.awaitingScope) {
    const scope=/всю|все|вся/u.test(s)?'all':/последующ/u.test(s)?'future':/только|это повторение/u.test(s)?'one':undefined;
    if(scope)return {...context.awaitingScope,scope};
  }
  if(text.includes(';')){const legacy=parseCommand(text,wallParts(now,prefs.zone).date);if(legacy.entry){const e=legacy.entry;return {intent:e.type==='task'?'create_task':'create_meeting',fields:{title:e.title,date:e.date,time:e.time,duration:e.duration,important:e.important,...(legacy.end?{endDate:legacy.end.date,endTime:legacy.end.time}:{})}};}return {intent:'answer_question',answer:legacy.reply};}
  const t=temporal(s,prefs,now),f=t.fields;
  const indexWord=s.match(/(?:открой|выбери|удали|перенеси)?\s*(первую|вторую|третью|четвертую|пятую|\d+)$/u);
  const index=indexWord?(['первую','вторую','третью','четвертую','пятую'].indexOf(indexWord[1])+1||Number(indexWord[1])):undefined;
  const type=/задач/u.test(s)?'task':/встреч|созвон/u.test(s)?'meeting':undefined;
  let intent:Command['intent']|undefined;
  if(/^(?:а )?(?:удали|убери|отмени|удалить)/u.test(s))intent='delete_event';
  else if(/верни.*невыполн|открой.*заново/u.test(s))intent='reopen_task';
  else if(/выполнен|закончила|закончил|готова|завершила/u.test(s))intent='complete_task';
  else if(/^(?:а )?(?:перенеси|измени|добавь комментарий|сделай|продли)/u.test(s))intent='update_event';
  else if(/^открой|^выбери/u.test(s))intent='open_event';
  else if(/^найди|^когда .*была|^покажи.*(?:про |по |с )/u.test(s))intent='search_events';
  else if(/^что |^какие |^есть ли |^покажи |^расписание/u.test(s))intent='list_events';
  else if(/^(?:создай|создавай|добавь|поставь|запланируй|назначь)|напомни|напоминай|нужно|кажд[а-я]*|ежедневно|еженедельно|ежемесячно/u.test(s))intent=type==='meeting'||/планерка/u.test(s)?'create_meeting':'create_task';
  if(!intent&&context.pending) {return {...context.pending,fields:{...context.pending.fields,...f,...(!Object.keys(f).length&&context.pending.fields?.title===undefined&&context.pending.intent.startsWith('create')?{title:text.trim()}: {})},...(!Object.keys(f).length&&!index&&!context.pending.intent.startsWith('create')?{query:text.trim(),id:undefined}:{}),...(index?{index}: {})};}
  if(!intent&&f.recurrence)intent=type==='meeting'?'create_meeting':'create_task';
  if(!intent&&type==='meeting'&&f.date)intent='create_meeting';
  if(!intent)return {intent:'answer_question',answer:'Не удалось уверенно понять запрос. '+localHelp};
  const clean=t.rest.replace(/^(?:а )?(?:создай|создавай|добавь|поставь|запланируй|назначь|напомни мне|напомни|напоминай|найди все|найди|покажи|перенеси|измени время|измени цвет|измени|удали|удалить|убери|отмени|открой|выбери|сделай|продли|верни|отметь|я закончила|я закончил|задача с)\s*/u,'').replace(/^(?:задачу|задачи|задача|встречу|встречи|встреча)\s*/u,'').replace(/(?:выполненной|невыполненные|готова|готов|заново|нужно|цвет|время)/gu,'').trim().replace(/^(?:про|по|на|в|к)\s+/u,'').replace(/\s+(?:на|в|к|до|с|ее|его|эту|это)$/u,'').replace(/\s+/g,' ').trim();
  if(intent.startsWith('create')) {
    const title=clean.replace(/^(?:в |к )/u,'').trim();
    if(title&&!/^(встреча|встречу|задача|задачу)$/u.test(title))f.title=title;
    // A week is a range, not a precise date for a meeting.
    return {intent,fields:f};
  }
  if(intent==='list_events'){const incomplete=/не выпол|не сдел/u.test(s);return {intent,type,incomplete,free:/свободн/u.test(s),start:t.start||f.date||(incomplete?undefined:wallParts(now,prefs.zone).date),end:t.end||f.date||(incomplete?undefined:wallParts(now,prefs.zone).date)};}
  let query=clean.replace(/^(?:комментарий к |к задаче |задаче |задачу )/u,'').replace(/^(?:нее|ее|его|эту встречу|эту задачу|это|встречу|задачу|в|на|к)$/u,'');
  if(index)query='';
  const command:Command={intent,fields:f,...(query?{query}:{}),...(type?{type}:{}),...(index?{index}: {})};
  if(intent==='search_events'||intent==='delete_event'){command.start=t.start||f.date;command.end=t.end||f.date;}
  if(intent==='update_event') {
    if(/добавь комментарий/u.test(s))command.answer='comment';
    const comment=text.match(/комментарий.*?:\s*(.+)$/u);if(comment) {f.comment=comment[1];query=query.split(':')[0].replace(/^комментарий к\s*/u,'');command.query=query;}
    if(/продли/u.test(s)&&f.duration) {command.answer='extend';}
  }
  return command;
}
