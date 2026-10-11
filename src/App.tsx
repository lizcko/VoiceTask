import { useEffect, useRef, useState } from 'react';
import { AudioLines, ArrowUp, Bell, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, FilePenLine, Mic, Plus, Search, Settings, Sparkles, UserRound, UsersRound, X, Check, Trash2, LogOut } from 'lucide-react';
import { addDays, colors, dateKey, Entry, formatDate, fromKey, minutes, parseCommand, seedEntries, validEntry, weekStart } from './calendar';

type Period = 'День' | 'Неделя' | 'Месяц' | 'Год';
type Message = { role: 'assistant' | 'user'; text: string };
const STORAGE = 'voicetask.entries.v1';
function loadEntries() { try { const value = localStorage.getItem(STORAGE); if (value) { const parsed: unknown = JSON.parse(value); if (Array.isArray(parsed) && parsed.every(validEntry)) return parsed as Entry[]; } } catch { /* Keep the app usable if storage is unavailable. */ } return seedEntries(); }
function loadSetting(key: string, fallback: string) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }

export default function App() {
  const [entries, setEntries] = useState<Entry[]>(loadEntries);
  const [date, setDate] = useState(new Date());
  const [now, setNow] = useState(new Date());
  const [period, setPeriod] = useState<Period>('Неделя');
  const [filter, setFilter] = useState('Все');
  const [query, setQuery] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', text: 'Привет! Я ваш помощник VoiceTask 👋\n\nПомогу добавить задачи и встречи в календарь с помощью простых текстовых команд. С чего начнём?' }]);
  const [editor, setEditor] = useState<Entry | null>(null);
  const [panel, setPanel] = useState<'settings' | 'notifications' | 'profile' | null>(null);
  const [notice, setNotice] = useState('');
  const [notifications, setNotifications] = useState<string[]>(['Добро пожаловать в VoiceTask! Ваш календарь готов к работе.']);
  const [name, setName] = useState(() => loadSetting('voicetask.name', 'Александр'));
  const [showWeekend, setShowWeekend] = useState(() => loadSetting('voicetask.weekend', 'true') !== 'false');
  const [storageError, setStorageError] = useState(false);
  const [formError, setFormError] = useState('');
  const messageEnd = useRef<HTMLDivElement>(null);
  const modal = useRef<HTMLDivElement>(null);
  const timeScroll = useRef<HTMLDivElement>(null);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (timeScroll.current) timeScroll.current.scrollTop = 8 * 74; }, [period]);
  useEffect(() => { try { localStorage.setItem(STORAGE, JSON.stringify(entries)); setStorageError(false); } catch { setStorageError(true); } }, [entries]);
  useEffect(() => { try { localStorage.setItem('voicetask.name', name); localStorage.setItem('voicetask.weekend', String(showWeekend)); } catch { setStorageError(true); } }, [name, showWeekend]);
  useEffect(() => { messageEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages]);
  useEffect(() => { if (!notice) return; const timeout = window.setTimeout(() => setNotice(''), 4500); return () => window.clearTimeout(timeout); }, [notice]);
  useEffect(() => {
    if (!editor && !panel) return;
    const previous = document.activeElement as HTMLElement;
    const element = modal.current;
    element?.querySelector<HTMLElement>('button, input')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setEditor(null); setPanel(null); }
      if (event.key !== 'Tab' || !element) return;
      const focusable = [...element.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex="0"]')].filter(el => !el.hasAttribute('disabled'));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, [!!editor, panel]);

  const visible = entries.filter(e => (filter === 'Все' || e.type === (filter === 'Задачи' ? 'task' : 'meeting')) && `${e.title} ${e.description}`.toLowerCase().includes(query.toLowerCase()));
  const week = weekStart(date);
  const days = period === 'День' ? [date] : Array.from({ length: showWeekend ? 7 : 5 }, (_, i) => addDays(week, i));
  const todayKey = dateKey(now);
  const zoneOffset = -now.getTimezoneOffset();
  const zoneLabel = `GMT${zoneOffset >= 0 ? '+' : '-'}${Math.floor(Math.abs(zoneOffset) / 60)}${Math.abs(zoneOffset) % 60 ? ':' + String(Math.abs(zoneOffset) % 60).padStart(2, '0') : ''}`;
  const monthLabel = formatDate(date, { month: 'long', year: 'numeric' }).replace(' г.', '');
  const notify = (text: string) => { setNotifications(n => [text, ...n].slice(0, 20)); setNotice(text); };
  const openEditor = (entry?: Entry, day = date, time = '09:00') => { setFormError(''); setEditor(entry ? { ...entry } : { id: crypto.randomUUID(), title: '', type: 'task', date: dateKey(day), time, duration: 60, color: colors[0], important: false, description: '' }); };
  const navigate = (direction: number) => {
    const next = new Date(date);
    if (period === 'Год') next.setFullYear(next.getFullYear() + direction);
    else if (period === 'Месяц') { next.setDate(1); next.setMonth(next.getMonth() + direction); }
    else next.setDate(next.getDate() + direction * (period === 'Неделя' ? 7 : 1));
    setDate(next);
  };
  const sendMessage = (text = input) => {
    if (!text.trim()) return;
    const result = parseCommand(text);
    setMessages(m => [...m, { role: 'user', text: text.trim() }, { role: 'assistant', text: result.reply }]); setInput('');
    if (result.entry) { setEntries(e => [...e, result.entry!]); setDate(fromKey(result.entry.date)); notify(`Добавлено: ${result.entry.title}`); }
  };
  const saveEntry = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editor || !validEntry(editor)) { setFormError('Проверьте название, дату, время и длительность. Запись должна завершаться в пределах дня.'); return; }
    const exists = entries.some(e => e.id === editor.id);
    setEntries(e => exists ? e.map(v => v.id === editor.id ? { ...editor, title: editor.title.trim() } : v) : [...e, { ...editor, title: editor.title.trim() }]);
    notify(`${exists ? 'Сохранено' : 'Добавлено'}: ${editor.title}`); setEditor(null);
  };
  const card = (entry: Entry, compact = false) => <button key={entry.id} className={`event-card ${compact ? 'compact' : ''}`} style={{ background: entry.color }} onClick={event => { event.stopPropagation(); openEditor(entry); }} title={`${entry.title}, ${entry.time}`}>
    <div className="event-top"><span>{entry.important && <b className="important">!</b>}{entry.time}{!compact && ` – ${String(Math.floor((minutes(entry.time) + entry.duration) / 60)).padStart(2, '0')}:${String((minutes(entry.time) + entry.duration) % 60).padStart(2, '0')}`}</span>{entry.type === 'task' ? <FilePenLine size={15} /> : <UserRound size={15} />}</div>
    <strong>{entry.title}</strong>{!compact && entry.duration >= 90 && <span className="event-description">{entry.type === 'meeting' ? 'Встреча' : 'Задача'} · {entry.duration} мин.</span>}
  </button>;

  function monthGrid(monthDate: Date, mini = false) {
    const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const start = weekStart(first);
    return <div className={mini ? 'mini-grid' : 'month-grid'}>
      {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => <div className="month-weekday" key={d}>{d}</div>)}
      {Array.from({ length: 42 }, (_, i) => {
        const day = addDays(start, i), key = dateKey(day), list = visible.filter(e => e.date === key);
        return mini ? <button key={key} className={`${day.getMonth() !== monthDate.getMonth() ? 'muted' : ''} ${key === todayKey ? 'is-today' : ''} ${list.length ? 'has-events' : ''}`} aria-label={formatDate(day, { day: 'numeric', month: 'long' })} onClick={() => { setDate(day); setPeriod('День'); }}>{day.getDate()}</button> : <div key={key} className={`month-cell ${day.getMonth() !== monthDate.getMonth() ? 'outside' : ''}`}><button className={`date-number ${key === todayKey ? 'is-today' : ''}`} onClick={() => { setDate(day); setPeriod('День'); }}>{day.getDate()}</button><button className="cell-add" aria-label="Добавить запись" onClick={() => openEditor(undefined, day)}><Plus size={14} /></button>{list.slice(0, 3).map(e => card(e, true))}{list.length > 3 && <button className="more-events" onClick={() => { setDate(day); setPeriod('День'); }}>Ещё {list.length - 3}</button>}</div>;
      })}
    </div>;
  }

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
    <main>
      <header className="topbar"><label className="search"><Search size={19} /><input placeholder="Найти задачу, встречу или событие" aria-label="Поиск записей" value={query} onChange={e => setQuery(e.target.value)} />{query && <button className="icon-button" onClick={() => setQuery('')} aria-label="Очистить поиск"><X size={15} /></button>}</label><div className="header-actions"><button className="icon-button" aria-label="Настройки" onClick={() => setPanel('settings')}><Settings size={21} /></button><button className="icon-button notification-button" aria-label="Уведомления" onClick={() => setPanel('notifications')}><Bell size={21} />{notifications.length > 0 && <i />}</button><span className="header-divider"/><button className="profile-button" onClick={() => setPanel('profile')}><span className="avatar">{name.slice(0, 1).toUpperCase() || 'А'}</span><span>{name || 'Пользователь'}</span><ChevronDown size={14} /></button></div></header>
      <div className="workspace"><div className="page-title"><div><div className="eyebrow">ПЛАНИРУЙТЕ С ЛЁГКОСТЬЮ</div><h1>Ваш календарь<span>.</span></h1><p>Всё важное — в одном месте.</p></div><button className="primary-button" onClick={() => openEditor()}><Plus size={17} /> Создать запись</button></div>
      <div className="calendar-controls"><div className="filters">{['Все', 'Задачи', 'Встречи'].map(f => <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>{f === 'Задачи' && <FilePenLine size={15} />}{f === 'Встречи' && <UsersRound size={16} />}{f}</button>)}</div><div className="periods">{(['День', 'Неделя', 'Месяц', 'Год'] as Period[]).map(p => <button key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>{p}</button>)}</div></div>
      <section className="calendar"><div className="calendar-heading"><div className="calendar-title"><span className="calendar-icon"><CalendarDays size={20} /></span><h2>{period === 'Год' ? date.getFullYear() : period === 'День' ? formatDate(date, { day: 'numeric', month: 'long', year: 'numeric' }).replace(' г.', '') : monthLabel}</h2><span className="week-label">{period === 'Неделя' ? `${week.getDate()} – ${formatDate(addDays(week, 6), { day: 'numeric', month: 'short' })}` : period}</span></div><div className="date-navigation"><button className="today-button" onClick={() => setDate(new Date())}>Сегодня</button><button className="icon-button" aria-label="Предыдущий период" onClick={() => navigate(-1)}><ChevronLeft size={19} /></button><button className="icon-button" aria-label="Следующий период" onClick={() => navigate(1)}><ChevronRight size={19} /></button></div></div>
      {(period === 'Неделя' || period === 'День') && <div className={`time-calendar ${period === 'День' ? 'day-view' : ''}`}><div className="day-headers" style={{ gridTemplateColumns: `58px repeat(${days.length}, minmax(0, 1fr))` }}><div className="timezone">{zoneLabel}</div>{days.map(d => <div key={dateKey(d)} className={`day-header ${dateKey(d) === todayKey ? 'current' : ''}`}><span>{formatDate(d, { weekday: 'short' })}</span><b>{d.getDate()}</b>{dateKey(d) === todayKey && <i />}</div>)}</div><div className="time-scroll" ref={timeScroll}><div className="time-grid" style={{ gridTemplateColumns: `58px repeat(${days.length}, minmax(0, 1fr))` }}><div className="time-labels">{Array.from({ length: 24 }, (_, h) => <div key={h}>{String(h).padStart(2, '0')}:00</div>)}</div>{days.map(day => {
        const dayEntries = visible.filter(e => e.date === dateKey(day)).sort((a, b) => minutes(a.time) - minutes(b.time));
        const placed: { entry: Entry; lane: number; group: number }[] = []; let group = -1, groupEnd = -1; const laneEnds: number[] = [];
        dayEntries.forEach(entry => { const start = minutes(entry.time); if (start >= groupEnd) { group++; laneEnds.length = 0; } let lane = laneEnds.findIndex(end => end <= start); if (lane < 0) lane = laneEnds.length; laneEnds[lane] = start + entry.duration; groupEnd = Math.max(groupEnd, start + entry.duration); placed.push({ entry, lane, group }); });
        return <div key={dateKey(day)} className={`day-column ${dateKey(day) === todayKey ? 'current-column' : ''}`}>{Array.from({ length: 24 }, (_, hour) => <button key={hour} className="hour-slot" aria-label={`Добавить запись: ${formatDate(day, { day: 'numeric', month: 'long' })}, ${hour}:00`} onClick={() => openEditor(undefined, day, `${String(hour).padStart(2, '0')}:00`)} />)}{placed.map(item => { const lanes = Math.max(...placed.filter(p => p.group === item.group).map(p => p.lane)) + 1; return <div key={item.entry.id} className="event-position" style={{ top: minutes(item.entry.time) / 60 * 74, height: Math.max(item.entry.duration / 60 * 74 - 5, 25), left: `calc(${item.lane / lanes * 100}% + 5px)`, width: `calc(${100 / lanes}% - 10px)` }}>{card(item.entry, item.entry.duration < 45)}</div>; })}{dateKey(day) === todayKey && <div className="now-line" style={{ top: (now.getHours() + now.getMinutes() / 60) * 74 }}><i /></div>}</div>;
      })}</div></div></div>}
      {period === 'Месяц' && monthGrid(date)}{period === 'Год' && <div className="year-grid">{Array.from({ length: 12 }, (_, i) => <div className="mini-month" key={i}><button className="month-name" onClick={() => { setDate(new Date(date.getFullYear(), i, 1)); setPeriod('Месяц'); }}>{formatDate(new Date(date.getFullYear(), i, 1), { month: 'long' })}<ChevronRight size={14} /></button>{monthGrid(new Date(date.getFullYear(), i, 1), true)}</div>)}</div>}
      </section><div className="calendar-footer"><div><span className="legend-dot task-dot"/>Задачи<span className="legend-dot meeting-dot"/>Встречи<span className="legend-important">!</span>Важное</div><span><Clock3 size={13} /> Время для того, что важно</span></div>{query && <div className="search-summary" role="status">По запросу «{query}» найдено записей: {visible.length}. Совпадения показаны в соответствующих датах календаря.</div>}{storageError && <div className="error" role="alert">Не удалось сохранить данные в браузере. Проверьте доступность localStorage.</div>}</div>
    </main>
    {(editor || panel) && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) { setEditor(null); setPanel(null); } }}><div ref={modal} className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close icon-button" aria-label="Закрыть" onClick={() => { setEditor(null); setPanel(null); }}><X size={20} /></button>
      {editor && <form onSubmit={saveEntry}><div className="modal-symbol"><CalendarDays size={24} /></div><h2 id="modal-title">{entries.some(e => e.id === editor.id) ? 'Детали записи' : 'Новая запись'}</h2><p className="modal-subtitle">Освободите голову — сохраните планы здесь.</p><label>Название<input required maxLength={150} value={editor.title} onChange={e => setEditor({ ...editor, title: e.target.value })} placeholder="Что запланируем?" /></label><div className="form-row"><label>Тип<select value={editor.type} onChange={e => setEditor({ ...editor, type: e.target.value as Entry['type'] })}><option value="task">Задача</option><option value="meeting">Встреча</option></select></label><label>Дата<input required type="date" value={editor.date} onChange={e => setEditor({ ...editor, date: e.target.value })} /></label></div><div className="form-row"><label>Начало<input required type="time" value={editor.time} onChange={e => setEditor({ ...editor, time: e.target.value })} /></label><label>Длительность, мин.<input required type="number" min={15} max={1440} value={editor.duration} onChange={e => setEditor({ ...editor, duration: Number(e.target.value) })} /></label></div><label>Описание<textarea rows={3} value={editor.description} onChange={e => setEditor({ ...editor, description: e.target.value })} placeholder="Детали, ссылки, заметки…" /></label><div className="color-label">Цвет записи</div><div className="color-options">{colors.map(c => <button key={c} type="button" className={editor.color === c ? 'selected' : ''} style={{ background: c }} aria-label={`Цвет ${c}`} aria-pressed={editor.color === c} onClick={() => setEditor({ ...editor, color: c })}>{editor.color === c && <Check size={16} />}</button>)}<input type="color" aria-label="Свой цвет" value={editor.color} onChange={e => setEditor({ ...editor, color: e.target.value })} /></div><label className="checkbox-label"><input type="checkbox" checked={editor.important} onChange={e => setEditor({ ...editor, important: e.target.checked })} />Важная запись <span className="legend-important">!</span></label>{formError && <p className="error" role="alert">{formError}</p>}<div className="modal-actions">{entries.some(e => e.id === editor.id) && <button className="delete-button" type="button" onClick={() => { setEntries(e => e.filter(v => v.id !== editor.id)); notify(`Удалено: ${editor.title}`); setEditor(null); }}><Trash2 size={16} />Удалить</button>}<button className="primary-button" type="submit"><Check size={17} />Сохранить</button></div></form>}
      {panel === 'settings' && <><div className="modal-symbol"><Settings size={24} /></div><h2 id="modal-title">Настройки</h2><p className="modal-subtitle">Ваш календарь — ваши правила.</p><label className="checkbox-label settings-row"><input type="checkbox" checked={showWeekend} onChange={e => setShowWeekend(e.target.checked)} />Показывать выходные в неделе</label><div className="settings-info"><strong>Текстовый помощник</strong><p>Работает с ограниченным набором команд. LLM и распознавание голоса не подключены.</p><button className="text-button" onClick={() => { setPanel(null); sendMessage('помощь'); }}>Посмотреть команды <ChevronRight size={15} /></button></div><div className="settings-info"><strong>Хранение данных</strong><p>Записи и настройки сохраняются локально в этом браузере. Синхронизация с другими устройствами не подключена.</p></div></>}
      {panel === 'notifications' && <><div className="modal-symbol"><Bell size={24} /></div><h2 id="modal-title">Уведомления</h2><p className="modal-subtitle">Последние изменения в вашем календаре.</p><div className="notification-list">{notifications.length ? notifications.map((n, i) => <div key={i}><span><Check size={16} /></span><p>{n}</p></div>) : <p>Новых уведомлений нет.</p>}</div>{notifications.length > 0 && <button className="text-button" onClick={() => setNotifications([])}>Очистить уведомления</button>}</>}
      {panel === 'profile' && <><span className="avatar large-avatar">{name.slice(0, 1).toUpperCase() || 'А'}</span><h2 id="modal-title">Ваш профиль</h2><p className="modal-subtitle">Локальный профиль VoiceTask</p><label>Ваше имя<input maxLength={40} value={name} onChange={e => setName(e.target.value)} placeholder="Введите имя" /></label><div className="settings-info"><UserRound size={20} /><p>Имя хранится на этом устройстве. Вход в аккаунт и облачная синхронизация пока не подключены.</p></div><button className="primary-button" onClick={() => setPanel(null)}><Check size={17} />Готово</button><div className="profile-note"><LogOut size={14} /> Авторизация появится позже</div></>}
    </div></div>}
    {notice && <div className="toast" role="status"><Check size={18} /><span>{notice}</span><button className="icon-button" onClick={() => setNotice('')} aria-label="Скрыть уведомление"><X size={16} /></button></div>}
  </div>;
}

