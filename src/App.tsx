import { useEffect, useRef, useState } from 'react';
import { AudioLines, ArrowUp, Bell, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, FilePenLine, Mic, Plus, Search, Settings, Sparkles, UserRound, X, Check, Upload, Trash2 } from 'lucide-react';
import { addDays, dateKey, Entry, formatDate, fromKey, minutes, parseCommand, weekStart, validEntry } from './calendar';
import { ENTRY_KEY, Preferences, Reminder, commentOf, dateLabel, displayEntry, dueReminders, endParts, loadPreferences, loadRecords, readJSON, searchEntries, segment, toInstant, wallParts, weekNumber, writeJSON } from './model';
import SettingsPanel from './SettingsPanel';
import EntryForm from './EntryForm';
type Message = { role: 'assistant' | 'user'; text: string };
type View = { kind: 'edit'; entry: Entry } | { kind: 'detail'; id: string } | { kind: 'day'; day: string } | { kind: 'settings' | 'profile' } | null;
function loadSetting(key:string,fallback:string) { try { return localStorage.getItem(key)??fallback; } catch { return fallback; } }
function initialRecords() { try { return { records:loadRecords(), error:'' }; } catch { return {records:[],error:'Не удалось прочитать записи. Исходные данные сохранены; запись изменений заблокирована.'}; } }
const greeting: Message[] = [{role:'assistant',text:'Привет! Я ваш помощник VoiceTask 👋\n\nПомогу добавить задачи и встречи в календарь с помощью простых текстовых команд. С чего начнём?'}];
export default function App() {
  const [initial] = useState(initialRecords);
  const [records,setRecords] = useState<unknown[]>(initial.records);
  const [storageError,setStorageError] = useState(initial.error);
  const [prefs,setPrefs] = useState(loadPreferences);
  const [date,setDate] = useState(()=>fromKey(wallParts(new Date(),prefs.zone).date));
  const [now,setNow] = useState(new Date());
  const [period,setPeriod] = useState<Preferences['defaultPeriod']>(prefs.defaultPeriod);
  const [filter,setFilter] = useState('Все');
  const [query,setQuery] = useState(''); const [debounced,setDebounced] = useState(''); const [searchOpen,setSearchOpen] = useState(false); const [active,setActive] = useState(-1);
  const [input,setInput] = useState('');
  const [messages,setMessages] = useState<Message[]>(()=>{const value=readJSON<unknown>('voicetask.chat.v1',greeting); return Array.isArray(value)&&value.every(v=>v&&['assistant','user'].includes(v.role)&&typeof v.text==='string')?value:greeting;});
  const [view,setView] = useState<View>(null); const [notice,setNotice] = useState('');
  const [name,setName] = useState(()=>loadSetting('voicetask.name','Александр')); const [avatar,setAvatar] = useState(()=>loadSetting('voicetask.avatar',''));
  const [showWeekend,setShowWeekend] = useState(()=>loadSetting('voicetask.weekend','true')!=='false');
  const [userMenu,setUserMenu] = useState(false); const [bellOpen,setBellOpen] = useState(false);
  const [notifications,setNotifications] = useState<Reminder[]>([]);
  const seen = useRef<string[]>(readJSON('voicetask.reminders.v2',[]));
  const audio = useRef<AudioContext|null>(null);
  const messageEnd=useRef<HTMLDivElement>(null), modal=useRef<HTMLDivElement>(null), timeScroll=useRef<HTMLDivElement>(null), searchRef=useRef<HTMLDivElement>(null), actionsRef=useRef<HTMLDivElement>(null);
  const entries=records.filter(validEntry); const shown=entries.map(e=>displayEntry(e,prefs.zone));
  const visible=shown.filter(e=>filter==='Все'||e.type===(filter==='Задачи'?'task':'meeting'));
  const results=searchEntries(shown,debounced);
  const today=wallParts(now,prefs.zone); const todayKey=today.date;
  const week=weekStart(date), days=period==='День'?[date]:Array.from({length:showWeekend?7:5},(_,i)=>addDays(week,i));
  const hours=Array.from({length:prefs.hourEnd-prefs.hourStart},(_,i)=>prefs.hourStart+i);
  function notify(text:string) { setNotice(text); }
  function persist(key:string,value:unknown) { try { writeJSON(key,value); return true; } catch { setStorageError('Не удалось сохранить данные: проверьте свободное место и доступ к localStorage.'); return false; } }
  function commit(next:unknown[]) {
    if(initial.error) { notify(initial.error); return false; }
    try {
      const raw=localStorage.getItem(ENTRY_KEY);
      if(raw!==null && JSON.stringify(JSON.parse(raw))!==JSON.stringify(records)) { setRecords(loadRecords()); notify('Записи изменились в другой вкладке. Список обновлён; повторите действие.'); return false; }
      if(raw!==null && !localStorage.getItem('voicetask.entries.backup.v1')) localStorage.setItem('voicetask.entries.backup.v1',raw);
      writeJSON(ENTRY_KEY,next); setRecords(next); setStorageError(''); return true;
    } catch { setStorageError('Не удалось сохранить запись. Изменение не применено.'); return false; }
  }
  function updatePrefs(next:Preferences) { if(persist('voicetask.preferences.v2',next)) setPrefs(next); }
  function original(id:string) { return entries.find(e=>e.id===id)!; }
  function openEditor(entry?:Entry,day=date,time='09:00') { setView({kind:'edit',entry:entry?displayEntry(original(entry.id),prefs.zone):{id:crypto.randomUUID(),title:'',type:'task',date:dateKey(day),time,duration:60,color:prefs.taskColor,important:false,description:'',completed:false}}); }
  function toggle(id:string) { commit(records.map(e=>validEntry(e)&&e.id===id?{...e,completed:!e.completed}:e)); }
  function openResult(e:Entry) { setDate(fromKey(e.date)); setSearchOpen(false); setView({kind:'detail',id:e.id}); }
  function navigate(direction:number) { const next=new Date(date); if(period==='Год') next.setFullYear(next.getFullYear()+direction); else if(period==='Месяц') {next.setDate(1);next.setMonth(next.getMonth()+direction);} else next.setDate(next.getDate()+direction*(period==='Неделя'?7:1)); setDate(next); }
  function sendMessage(text=input) {
    if(!text.trim()) return;
    const result=parseCommand(text,todayKey); let reply=result.reply;
    if(result.entry) {
      try {
        result.entry.startAt=toInstant(result.entry.date,result.entry.time,prefs.zone);
        result.entry.endAt=result.end?toInstant(result.end.date,result.end.time,prefs.zone):new Date(Date.parse(result.entry.startAt)+result.entry.duration*60000).toISOString();
        result.entry.duration=(Date.parse(result.entry.endAt)-Date.parse(result.entry.startAt))/60000;
        if(!validEntry(result.entry))throw Error('Проверьте время окончания и продолжительность');
        result.entry.color=result.entry.type==='task'?prefs.taskColor:prefs.meetingColor;
        if(commit([...records,result.entry])) {setDate(fromKey(result.entry.date));notify(`Добавлено: ${result.entry.title}`);} else reply='Запись не сохранена. Проверьте доступность хранилища.';
      } catch(error) { reply=`Запись не сохранена: ${(error as Error).message}`; }
    }
    setMessages(m=>[...m,{role:'user',text:text.trim()},{role:'assistant',text:reply}]); setInput('');
  }
  useEffect(()=>{const t=setInterval(()=>setNow(new Date()),15000);return()=>clearInterval(t);},[]);
  useEffect(()=>{const t=setTimeout(()=>{setDebounced(query);setActive(-1);},180);return()=>clearTimeout(t);},[query]);
  useEffect(()=>{if(active>=0)document.getElementById(`result-${active}`)?.scrollIntoView({block:'nearest'});},[active]);
  useEffect(()=>{persist('voicetask.chat.v1',messages);messageEnd.current?.scrollIntoView({block:'nearest'});},[messages]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),5000);return()=>clearTimeout(t);},[notice]);
  useEffect(()=>{if(timeScroll.current)timeScroll.current.scrollTop=Math.max(0,8-prefs.hourStart)*90;},[period,prefs.hourStart]);
  useEffect(()=>{
    const media=matchMedia('(prefers-color-scheme: dark)');
    const apply=()=>{document.documentElement.dataset.theme=prefs.theme==='system'?(media.matches?'dark':'light'):prefs.theme;document.documentElement.dataset.text=prefs.text;document.documentElement.style.setProperty('--accent',prefs.accent);};
    apply();media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply);
  },[prefs.theme,prefs.text,prefs.accent]);
  useEffect(()=>{
    const click=(e:PointerEvent)=>{if(!searchRef.current?.contains(e.target as Node))setSearchOpen(false);if(!actionsRef.current?.contains(e.target as Node)){setBellOpen(false);setUserMenu(false);}};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setSearchOpen(false);setBellOpen(false);setUserMenu(false);}};
    const unlock=()=>{if(!audio.current){try{audio.current=new AudioContext();}catch{/* Sound unavailable */}} if(audio.current?.state==='suspended')void audio.current.resume();};
    document.addEventListener('pointerdown',click);document.addEventListener('keydown',key);document.addEventListener('pointerdown',unlock);
    return()=>{document.removeEventListener('pointerdown',click);document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',unlock);};
  },[]);
  useEffect(()=>{
    let due:Reminder[]=[]; try {due=dueReminders(entries,prefs,+now,seen.current);} catch {return;}
    const upcoming=dueReminders(entries,prefs,+now,[]).filter(r=>r.key.endsWith(':soon'));
    setNotifications(previous=>{
      const overdue=previous.filter(r=>r.key.endsWith(':overdue')&&entries.some(e=>e.id===r.entryId&&!e.completed&&r.key.startsWith(`${e.id}:${e.startAt||e.date+'T'+e.time}:`)));
      return prefs.enabled?[...upcoming,...overdue].slice(0,40):[];
    });
    if(!due.length)return;
    const next=[...seen.current,...due.map(r=>r.key)];
    if(!persist('voicetask.reminders.v2',next))return;
    seen.current=next;setNotifications(n=>[...due.filter(r=>!!r.entryId),...n.filter(r=>!due.some(v=>v.key===r.key))].slice(0,40));
    if(prefs.popup||due.some(r=>!r.entryId))setNotice(due.filter(r=>prefs.popup||!r.entryId).map(r=>r.text).join('\n'));
    if(prefs.sound&&audio.current?.state==='running'){const oscillator=audio.current.createOscillator(),gain=audio.current.createGain();oscillator.connect(gain);gain.connect(audio.current.destination);gain.gain.value=.07;oscillator.frequency.value=660;oscillator.start();oscillator.stop(audio.current.currentTime+.2);}
  },[records,prefs,now]);
  useEffect(()=>{
    if(!view)return;const previous=document.activeElement as HTMLElement;const el=modal.current;el?.querySelector<HTMLElement>('button,input')?.focus();
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setView(null);if(e.key!=='Tab'||!el)return;const list=[...el.querySelectorAll<HTMLElement>('button,input,select,textarea,[tabindex="0"]')].filter(e=>!e.hasAttribute('disabled'));const first=list[0],last=list[list.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}};
    document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};
  },[view?.kind]);
  async function upload(file?:File) {
    if(!file)return;
    if(!['image/jpeg','image/png'].includes(file.type)||file.size>5*1024*1024){notify('Выберите JPG или PNG размером до 5 МБ.');return;}
    try {const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');const scale=Math.min(1,256/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const data=canvas.toDataURL('image/png');localStorage.setItem('voicetask.avatar',data);setAvatar(data);}catch{notify('Не удалось прочитать или сохранить изображение.');}
  }
  const avatarNode=(large=false)=><span className={`avatar ${large?'large-avatar':''}`}>{avatar?<img src={avatar} alt="Аватар"/>:name.slice(0,1).toUpperCase()||'П'}</span>;
  function card(e:Entry,compact=false) {
    const finish=endParts(e); const endTime=finish.date!==e.date&&finish.time==='00:00'?'24:00':finish.time;
    return <article key={e.id} className={`event-card ${compact?'compact':''} ${e.important?'important-card':''} ${e.completed?'completed':''}`} style={{background:e.color}}>
      {e.important&&<b className="importance-mark" aria-label="Важная запись">!</b>}
      <button className="card-open" onClick={event=>{event.stopPropagation();setView({kind:'detail',id:e.id});}} aria-label={`Открыть ${e.title}`}><div className="event-top"><span>{e.time} – {endTime}</span>{e.type==='task'?<FilePenLine size={18}/>:<UserRound size={18}/>}</div><strong>{e.title}</strong>{prefs.density!=='standard'&&commentOf(e)&&<span className={`card-comment ${prefs.density==='brief'?'brief':'full'}`}>{commentOf(e)}</span>}</button>
      {e.type==='task'&&<button className="completion" aria-label={`${e.completed?'Снять выполнение':'Выполнить'}: ${e.title}`} aria-pressed={!!e.completed} onClick={event=>{event.stopPropagation();toggle(e.id);}}>{e.completed?<Check size={16}/>:<span/>}</button>}
    </article>;
  }
  function monthGrid(monthDate:Date,mini=false) {
    const start=weekStart(new Date(monthDate.getFullYear(),monthDate.getMonth(),1));
    return <div className={mini?'mini-grid':'month-grid'}>{['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d=><div className="month-weekday" key={d}>{d}</div>)}{Array.from({length:42},(_,i)=>{
      const day=addDays(start,i),key=dateKey(day),list=visible.map(e=>segment(e,key)).filter((e):e is Entry=>!!e);
      const dots=<span className="event-dots">{list.slice(0,3).map(e=><i key={e.id} style={{background:e.color}}/>)}{list.length>3&&<small>+{list.length-3}</small>}</span>;
      const click=()=>{setDate(day);setView({kind:'day',day:key});};
      return mini?<button key={key} title={`${dateLabel(key,prefs.dateFormat)}: ${list.length} записей`} className={`${day.getMonth()!==monthDate.getMonth()?'muted':''} ${prefs.highlight&&key===todayKey?'is-today':''}`} aria-label={`${dateLabel(key,prefs.dateFormat)}, записей: ${list.length}`} onClick={click}>{day.getDate()}{dots}</button>:<div key={key} className={`month-cell ${day.getMonth()!==monthDate.getMonth()?'outside':''}`} onClick={event=>{if(event.target===event.currentTarget)click();}}><button className={`date-number ${prefs.highlight&&key===todayKey?'is-today':''}`} onClick={click}>{day.getDate()}</button>{prefs.weekNumbers&&i%7===0&&<small className="week-number">н. {weekNumber(day)}</small>}<button className="cell-add" aria-label="Добавить запись" onClick={()=>openEditor(undefined,day)}><Plus size={14}/></button>{list.slice(0,3).map(e=>card(e,true))}{list.length>3&&<button className="more-events" onClick={click}>Ещё {list.length-3}</button>}</div>;
    })}</div>;
  }
  const detail=view?.kind==='detail'?shown.find(e=>e.id===view.id):undefined;
  return <div className="app">
    <aside className="assistant-panel">
      <a className="brand" href="./"><span className="brand-icon"><AudioLines size={26} /></span>Voice<span>Task</span><span className="brand-dot">•</span></a>
      <div className="assistant-caption"><span>ВАШ ЛИЧНЫЙ АССИСТЕНТ</span><Sparkles size={14} /></div>
      <section className="chat">
        <div className="chat-heading"><span className="assistant-avatar"><Sparkles size={19} /></span><div><strong>Ассистент VoiceTask</strong><small><i />Режим команд</small></div><button className="icon-button" aria-label="Помощь по командам" onClick={() => sendMessage('помощь')}><CircleHelp size={18} /></button></div>
        <div className="messages" aria-live="polite"><div className="chat-date">Сегодня</div>{messages.map((m, i) => <div key={i} className={`message ${m.role}`}>
          {m.role === 'assistant' && <span className="message-avatar"><Sparkles size={14} /></span>}<div><div className="message-bubble">{m.text}</div><small>{m.role === 'assistant' ? 'VoiceTask' : 'Вы'}</small></div>
        </div>)}{messages.length === 1 && <div className="chat-suggestions"><span>Попробуйте, например</span><button onClick={() => sendMessage('задача Подготовить презентацию; завтра; 14:00')}>Добавить задачу на завтра <Plus size={14} /></button><button onClick={() => sendMessage('помощь')}>Какие команды доступны? <ChevronRight size={14} /></button></div>}<div ref={messageEnd} /></div>
        <div className="chat-compose"><form onSubmit={e => { e.preventDefault(); sendMessage(); }}><textarea aria-label="Сообщение ассистенту" placeholder="Напишите сообщение…" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} rows={2} /><div className="compose-bottom"><button type="button" className="icon-button mic" aria-label="Голосовой ввод пока недоступен" onClick={() => setNotice('Голосовой ввод пока не подключён. Используйте текстовые команды.')}><Mic size={20} /></button><span>Ваши планы начинаются здесь</span><button type="submit" className="send-button" aria-label="Отправить сообщение" disabled={!input.trim()}><ArrowUp size={19} /></button></div></form></div>
      </section><div className="sidebar-footer"><span className="footer-mark"><AudioLines size={14} /></span>Меньше рутины. Больше жизни.</div>
    </aside>

    <main><header className="topbar"><h1>Ваш календарь<span>.</span></h1><div ref={actionsRef} className="header-actions"><button className="icon-button" aria-label="Настройки" onClick={()=>{setView({kind:'settings'});setBellOpen(false);}}><Settings size={22}/></button><button className="icon-button notification-button" aria-label="Уведомления" aria-expanded={bellOpen} onClick={()=>{setBellOpen(!bellOpen);setUserMenu(false);}}><Bell size={22}/>{notifications.length>0&&<i/>}</button><button className="profile-button" aria-expanded={userMenu} onClick={()=>{setUserMenu(!userMenu);setBellOpen(false);}}>{avatarNode()}<span>{name||'Пользователь'}</span><ChevronDown size={16}/></button>
    {userMenu&&<div className="header-popover user-popover"><button onClick={()=>{setView({kind:'profile'});setUserMenu(false);}}>Мой профиль</button></div>}
    {bellOpen&&<div className="header-popover notification-popover"><strong>Напоминания</strong><p className="hint">Только при открытом сайте</p>{notifications.length?notifications.map(n=><div className="reminder" key={n.key}><button onClick={()=>{if(n.entryId){const e=shown.find(e=>e.id===n.entryId);if(e)openResult(e);}setBellOpen(false);}}>{n.text}</button><button aria-label="Скрыть напоминание" onClick={()=>setNotifications(v=>v.filter(r=>r.key!==n.key))}><X size={16}/></button></div>):<p>Новых напоминаний нет.</p>}</div>}</div></header>
    <div className="workspace"><div className="search-create"><div className="search-container" ref={searchRef}><div className="search"><Search size={21}/><input role="combobox" aria-label="Поиск записей" aria-controls="search-results" aria-expanded={searchOpen&&!!query.trim()} aria-autocomplete="list" aria-activedescendant={active>=0?`result-${active}`:undefined} placeholder="Поиск по названию и комментарию" value={query} onFocus={()=>setSearchOpen(true)} onChange={e=>{setQuery(e.target.value);setSearchOpen(true);}} onKeyDown={e=>{if(e.key==='Escape'){setSearchOpen(false);e.stopPropagation();}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setSearchOpen(true);setActive(v=>Math.max(0,Math.min(results.length-1,v+(e.key==='ArrowDown'?1:-1))));}if(e.key==='Enter'&&searchOpen&&results[active]){e.preventDefault();openResult(results[active]);}}}/>{query&&<button className="icon-button" aria-label="Очистить поиск" onClick={()=>{setQuery('');setDebounced('');}}><X size={16}/></button>}</div>{searchOpen&&query.trim()&&<div id="search-results" role="listbox" className="search-results">{results.length?results.map((e,i)=><button key={e.id} id={`result-${i}`} role="option" aria-selected={active===i} className={active===i?'selected':''} onMouseEnter={()=>setActive(i)} onClick={()=>openResult(e)}><strong>{e.title}</strong><span>{e.type==='task'?'Задача':'Встреча'} · {dateLabel(e.date,prefs.dateFormat)} · {e.time}</span></button>):<p role="status">Ничего не найдено</p>}</div>}</div><button className="primary-button" onClick={()=>openEditor()}><Plus size={19}/>Создать запись</button></div>
    <div className="calendar-controls"><label className="control-select"><span className="sr-only">Категория записей</span><select aria-label="Категория записей" value={filter} onChange={e=>setFilter(e.target.value)}><option value="Все">Все записи</option><option>Задачи</option><option>Встречи</option></select></label><label className="control-select"><CalendarDays size={19}/><select aria-label="Режим календаря" value={period} onChange={e=>setPeriod(e.target.value as Preferences['defaultPeriod'])}>{['День','Неделя','Месяц','Год'].map(p=><option key={p}>{p}</option>)}</select></label></div>
    <section className="calendar"><div className="calendar-heading"><div className="calendar-title"><CalendarDays size={21}/><h2>{period==='Год'?date.getFullYear():period==='День'?dateLabel(dateKey(date),prefs.dateFormat):formatDate(date,{month:'long',year:'numeric'})}</h2>{prefs.weekNumbers&&<span>Неделя {weekNumber(date)}</span>}</div><div className="date-navigation"><button className="today-button" onClick={()=>setDate(fromKey(todayKey))}>Сегодня</button><button className="icon-button" aria-label="Предыдущий период" onClick={()=>navigate(-1)}><ChevronLeft/></button><button className="icon-button" aria-label="Следующий период" onClick={()=>navigate(1)}><ChevronRight/></button></div></div>
    {(period==='День'||period==='Неделя')&&<div className={`time-calendar ${period==='День'?'day-view':''}`}><div className="day-headers" style={{gridTemplateColumns:`66px repeat(${days.length},minmax(0,1fr))`}}><div className="timezone" title={prefs.zone}>{prefs.zone}</div>{days.map(d=><button key={dateKey(d)} className={`day-header ${prefs.highlight&&dateKey(d)===todayKey?'current':''}`} onClick={()=>{setDate(d);setView({kind:'day',day:dateKey(d)});}}><span>{formatDate(d,{weekday:'short'})}</span><b>{d.getDate()}</b><small>{visible.filter(e=>segment(e,dateKey(d))).length}</small></button>)}</div><div className="time-scroll" ref={timeScroll}><div className="time-grid" style={{gridTemplateColumns:`66px repeat(${days.length},minmax(0,1fr))`,height:hours.length*90}}><div className="time-labels">{hours.map(h=><div key={h}>{String(h).padStart(2,'0')}:00</div>)}</div>{days.map(day=>{
      const list=visible.map(e=>segment(e,dateKey(day))).filter((e):e is Entry=>!!e).map(e=>{const a=Math.max(minutes(e.time),prefs.hourStart*60),b=Math.min(minutes(e.time)+e.duration,prefs.hourEnd*60);return {e,a,b};}).filter(v=>v.b>v.a).sort((a,b)=>a.a-b.a);
      const placed:{e:Entry;a:number;b:number;lane:number;group:number}[]=[];let group=-1,end=-1;const laneEnds:number[]=[];
      for(const v of list){if(v.a>=end){group++;laneEnds.length=0;end=-1;}let lane=laneEnds.findIndex(e=>e<=v.a);if(lane<0)lane=laneEnds.length;laneEnds[lane]=v.b;end=Math.max(end,v.b);placed.push({...v,lane,group});}
      return <div key={dateKey(day)} className={`day-column ${prefs.highlight&&dateKey(day)===todayKey?'current-column':''}`}>{hours.map(h=><button key={h} className="hour-slot" aria-label={`Добавить запись: ${dateKey(day)}, ${h}:00`} onClick={()=>openEditor(undefined,day,`${String(h).padStart(2,'0')}:00`)}/>)}{placed.map(v=>{const lanes=Math.max(...placed.filter(p=>p.group===v.group).map(p=>p.lane))+1;return <div key={v.e.id} className="event-position" style={{top:(v.a-prefs.hourStart*60)*1.5,height:(v.b-v.a)*1.5,left:`calc(${v.lane/lanes*100}% + 3px)`,width:`calc(${100/lanes}% - 6px)`}}>{card(v.e)}</div>;})}{dateKey(day)===todayKey&&minutes(today.time)>=prefs.hourStart*60&&minutes(today.time)<prefs.hourEnd*60&&<div className="now-line" style={{top:(minutes(today.time)-prefs.hourStart*60)*1.5}}/>}</div>;
    })}</div></div></div>}
    {period==='Месяц'&&monthGrid(date)}{period==='Год'&&<div className="year-grid">{Array.from({length:12},(_,i)=><div key={i} className="mini-month"><button className="month-name" onClick={()=>{setDate(new Date(date.getFullYear(),i,1));setPeriod('Месяц');}}>{formatDate(new Date(date.getFullYear(),i,1),{month:'long'})}<ChevronRight size={16}/></button>{monthGrid(new Date(date.getFullYear(),i,1),true)}</div>)}</div>}</section>
    <div className="calendar-footer"><div><span className="legend-dot" style={{background:prefs.taskColor}}/>Задачи<span className="legend-dot" style={{background:prefs.meetingColor}}/>Встречи<span className="legend-important">!</span>Важное</div><span><Clock3 size={15}/>Время для того, что важно</span></div>{storageError&&<p className="error" role="alert">{storageError}</p>}{records.length!==entries.length&&<p className="hint">Есть записи неизвестного формата: {records.length-entries.length}. Они сохранены без изменений.</p>}</div></main>
    {view&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setView(null);}}><div ref={modal} className={`modal ${view.kind==='settings'?'settings-modal':view.kind==='profile'?'profile-modal':''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close icon-button" aria-label="Закрыть" onClick={()=>setView(null)}><X/></button>
      {view.kind==='edit'&&<EntryForm key={view.entry.id} initial={view.entry} exists={entries.some(e=>e.id===view.entry.id)} zone={prefs.zone} taskColor={prefs.taskColor} meetingColor={prefs.meetingColor} save={e=>{const next=entries.some(v=>v.id===e.id)?records.map(v=>validEntry(v)&&v.id===e.id?e:v):[...records,e];if(commit(next)){notify('Запись сохранена');setView({kind:'detail',id:e.id});}}} remove={()=>{if(commit(records.filter(e=>!(validEntry(e)&&e.id===view.entry.id)))){notify('Запись удалена');setView(null);}}}/>}
      {detail&&<><h2 id="modal-title">{detail.title}</h2><p>{detail.type==='task'?'Задача':'Встреча'}{detail.important?' · Важная запись !':''}</p><p>{dateLabel(detail.date,prefs.dateFormat)} {detail.time} — {dateLabel(endParts(detail).date,prefs.dateFormat)} {endParts(detail).time}</p><p>Продолжительность: {original(detail.id).duration} мин.</p><div className="full-comment">{commentOf(detail)||'Комментарий не добавлен'}</div>{detail.type==='task'&&<label className="checkbox-label"><input type="checkbox" checked={!!detail.completed} onChange={()=>toggle(detail.id)}/>Выполнено</label>}<button className="primary-button" onClick={()=>openEditor(detail)}>Редактировать</button></>}
      {view.kind==='day'&&<><h2 id="modal-title">{dateLabel(view.day,prefs.dateFormat)}</h2><p className="hint">Задачи и встречи за выбранный день</p><div className="day-list">{visible.filter(e=>segment(e,view.day)).length?visible.filter(e=>segment(e,view.day)).map(e=><article key={e.id}><button className="day-entry-title" onClick={()=>setView({kind:'detail',id:e.id})}>{e.important&&<b className="day-important">!</b>}{e.title}</button><p>{e.type==='task'?'Задача':'Встреча'} · {segment(e,view.day)!.time} – {endParts(segment(e,view.day)!).time==='00:00'?'24:00':endParts(segment(e,view.day)!).time}{e.type==='task'&&(e.completed?' · Выполнено':' · Не выполнено')}</p><div className="full-comment">{commentOf(e)||'Комментарий не добавлен'}</div></article>):<p>На этот день пока нет записей.</p>}</div></>}
      {view.kind==='settings'&&<SettingsPanel value={prefs} update={updatePrefs} weekend={showWeekend} setWeekend={v=>{try{localStorage.setItem('voicetask.weekend',String(v));setShowWeekend(v);}catch{notify('Не удалось сохранить настройку');}}}/>}
      {view.kind==='profile'&&<><header className="profile-modal-heading"><span className="settings-section-icon"><UserRound size={25}/></span><div><h2 id="modal-title">Профиль</h2><p>Ваше имя и изображение в VoiceTask</p></div></header><div className="profile-modal-content"><section className="profile-card"><h3>Фото профиля</h3><p className="settings-description">Добавьте изображение, чтобы сделать профиль узнаваемым</p><div className="profile-photo-row">{avatarNode(true)}<div className="profile-photo-actions"><label className="profile-upload-button"><Upload size={17}/>Загрузить изображение<input type="file" accept="image/jpeg,image/png" aria-label="Загрузить изображение" onChange={e=>{const file=e.target.files?.[0];e.target.value='';void upload(file);}}/></label><button className="profile-remove-button" disabled={!avatar} onClick={()=>{try{localStorage.removeItem('voicetask.avatar');setAvatar('');}catch{notify('Не удалось удалить изображение');}}}><Trash2 size={16}/>Удалить изображение</button></div></div><p className="profile-image-hint">JPG или PNG до 5 МБ. Изображение уменьшается до 256 пикселей.</p></section><section className="profile-card"><label>Отображаемое имя<input maxLength={40} autoComplete="nickname" placeholder="Введите ваше имя" value={name} onChange={e=>{try{localStorage.setItem('voicetask.name',e.target.value);setName(e.target.value);}catch{notify('Не удалось сохранить имя');}}}/></label><p className="settings-description">Это имя отображается в верхней панели приложения.</p></section><p className="settings-footnote">Изменения сохраняются автоматически в этом браузере.</p></div></>}
    </div></div>}
    {notice&&<div className="toast" role="status"><Check size={18}/><span>{notice}</span><button className="icon-button" aria-label="Скрыть уведомление" onClick={()=>setNotice('')}><X size={16}/></button></div>}
  </div>;
}
