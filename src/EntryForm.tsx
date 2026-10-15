import { useState } from 'react';
import { Check, Trash2, Palette, Pipette } from 'lucide-react';
import { Entry, colors, validEntry } from './calendar';
import { commentOf, endParts, toInstant, wallParts } from './model';
import { validRecurrence } from './recurrence';
export default function EntryForm({ initial, exists, zone, taskColor, meetingColor, save, remove }: { initial: Entry; exists: boolean; zone: string; taskColor: string; meetingColor: string; save: (entry: Entry)=>void; remove: ()=>void }) {
  const [entry,set] = useState({...initial,duration:initial.startAt?(Date.parse(initial.endAt!)-Date.parse(initial.startAt))/60000:initial.duration});
  const [mode,setMode] = useState('end');
  const [end,setEnd] = useState(endParts(initial));
  const [errors,setErrors] = useState<Record<string,string>>({});
  const [confirmDelete,setConfirmDelete]=useState(false);
  const zoned=!!initial.startAt||!exists;
  const resolveStart = (value: Entry) => initial.startAt&&value.date===initial.date&&value.time===initial.time?initial.startAt:toInstant(value.date,value.time,zone);
  const resolveEnd = () => {
    const old=initial.endAt?wallParts(initial.endAt,zone):null;
    return old&&old.date===end.date&&old.time===end.time?initial.endAt!:toInstant(end.date,end.time,zone);
  };
  const calculatedEnd = (value: Entry) => {
    try { return zoned?wallParts(new Date(Date.parse(resolveStart(value))+value.duration*60000),zone):endParts(value); } catch { return {date:'',time:''}; }
  };
  const change = (patch: Partial<Entry>) => { const next={...entry,...patch}; set(next); if(mode==='duration') setEnd(calculatedEnd(next)); };
  const localDuration = () => {try{return zoned?(Date.parse(resolveEnd())-Date.parse(resolveStart(entry)))/60000:(Date.parse(`${end.date}T${end.time}:00Z`)-Date.parse(`${entry.date}T${entry.time}:00Z`))/60000;}catch{return NaN;}};
  const switchMode = (next: string) => { if (next==='duration') set({...entry,duration:localDuration()}); else setEnd(calculatedEnd(entry)); setMode(next); };
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); const e:Record<string,string>={};
    if(!entry.title.trim()) e.title='Введите название';
    if(!/^#[\da-f]{6}$/i.test(entry.color)) e.color='Выберите цвет в формате #RRGGBB';
    if(entry.recurrence&&(!validRecurrence(entry.recurrence)||entry.recurrence.until&&entry.recurrence.until<entry.date))e.end='Проверьте правило повторения и дату окончания';
    const duration=entry.allDay?1440:mode==='end'?localDuration():entry.duration;
    if(!Number.isFinite(duration)||duration<15||duration>5256000) e.end='Продолжительность от 15 минут до 10 лет; окончание должно быть позже начала';
    const candidate={...entry,duration,description:commentOf(entry)};
    if(entry.allDay){candidate.time='00:00';delete candidate.startAt;delete candidate.endAt;}
    if (!validEntry(candidate) && !Object.keys(e).length) e.start='Проверьте дату и время начала';
    if(!Object.keys(e).length) {
      try {
        // Editing a legacy record retains its floating local-time semantics.
        if(!entry.allDay&&(initial.startAt || !exists)) {
          candidate.startAt=resolveStart(entry);
          candidate.endAt=mode==='end'?resolveEnd():new Date(Date.parse(candidate.startAt)+duration*60000).toISOString();
          if(Date.parse(candidate.endAt)<=Date.parse(candidate.startAt)) throw Error('Окончание должно быть позже начала');
          candidate.duration=(Date.parse(candidate.endAt)-Date.parse(candidate.startAt))/60000;
        }
        if(!validEntry(candidate)) throw Error('Проверьте даты и продолжительность');
        save({...candidate,title:candidate.title.trim()});
      } catch(error) { e.end=(error as Error).message; }
    }
    setErrors(e);
  };
  const error = (key:string) => errors[key] && <span className="field-error" role="alert">{errors[key]}</span>;
  return <form onSubmit={submit} noValidate><h2 id="modal-title">{exists?'Редактировать запись':'Новая запись'}</h2><p className="hint">{initial.startAt||!exists?zone:'Старая запись: местное время без привязки к часовому поясу'}</p>
    <label>Название<input autoFocus value={entry.title} maxLength={150} onChange={e=>change({title:e.target.value})} />{error('title')}</label>
    <label>Тип<select value={entry.type} onChange={e=>change({type:e.target.value as Entry['type'],...(e.target.value==='meeting'?{allDay:false}:{}),...(!exists && [taskColor,meetingColor].includes(entry.color)?{color:e.target.value==='task'?taskColor:meetingColor}:{})})}><option value="task">Задача</option><option value="meeting">Встреча</option></select></label>
    {entry.type==='task'&&<label className="checkbox-label"><input type="checkbox" checked={!!entry.allDay} onChange={e=>change({allDay:e.target.checked})}/>Без точного времени</label>}
    <div className="form-row"><label>Дата начала<input type="date" value={entry.date} onChange={e=>change({date:e.target.value})} />{error('start')}</label>{!entry.allDay&&<label>Время начала<input type="time" value={entry.time} onChange={e=>change({time:e.target.value})} /></label>}</div>
    {!entry.allDay&&<><label>Способ задания окончания<select value={mode} onChange={e=>switchMode(e.target.value)}><option value="end">Дата и время окончания</option><option value="duration">Продолжительность</option></select></label>
    {mode==='end'?<div className="form-row"><label>Дата окончания<input type="date" value={end.date} onChange={e=>setEnd({...end,date:e.target.value})} /></label><label>Время окончания<input type="time" value={end.time} onChange={e=>setEnd({...end,time:e.target.value})} /></label></div>:<div className="form-row"><label>Часы<input type="number" min={0} value={Math.floor(entry.duration/60)||0} onChange={e=>change({duration:Number(e.target.value)*60+entry.duration%60})} /></label><label>Минуты<input type="number" min={0} max={59} value={entry.duration%60||0} onChange={e=>change({duration:Math.floor(entry.duration/60)*60+Number(e.target.value)})} /></label></div>}</>}{error('end')}
    <label>Повторение<select value={entry.recurrence?.frequency||''} onChange={e=>change({recurrence:e.target.value?{frequency:e.target.value as 'daily'|'weekly'|'monthly'}:undefined})}><option value="">Не повторять</option><option value="daily">Ежедневно</option><option value="weekly">Еженедельно</option><option value="monthly">Ежемесячно</option></select></label>
    {entry.recurrence&&<><label>Повторять до (необязательно)<input type="date" min={entry.date} value={entry.recurrence.until||''} onChange={e=>change({recurrence:{...entry.recurrence!,until:e.target.value||undefined}})}/></label>{entry.recurrence.frequency==='weekly'&&<fieldset><legend>Дни недели</legend>{['Вс','Пн','Вт','Ср','Чт','Пт','Сб'].map((day,i)=><label key={day} className="checkbox-label"><input type="checkbox" checked={(entry.recurrence!.weekdays||[new Date(`${entry.date}T12:00:00`).getDay()]).includes(i)} onChange={e=>{const days=entry.recurrence!.weekdays||[new Date(`${entry.date}T12:00:00`).getDay()];change({recurrence:{...entry.recurrence!,weekdays:e.target.checked?[...days,i]:days.filter(d=>d!==i)}});}}/>{day}</label>)}</fieldset>}</>}
    <label>Комментарий<textarea rows={4} value={commentOf(entry)} onChange={e=>change({description:e.target.value,comment:e.target.value})} /></label>
    <div className="color-label">Цвет записи</div><div className="color-options">{colors.map(c=><button key={c} type="button" aria-label={`Цвет ${c}`} aria-pressed={entry.color===c} className={entry.color===c?'selected':''} style={{background:c}} onClick={()=>change({color:c})}>{entry.color===c&&<Check size={16}/>}</button>)}<label className="custom-color" title="Свой цвет"><Palette size={18}/><Pipette size={16}/><input aria-label="Свой цвет" type="color" value={entry.color} onChange={e=>change({color:e.target.value})}/></label></div>{error('color')}<div className="color-preview" style={{background:entry.color}}>Предпросмотр: {entry.title||'Новая запись'}</div>
    <label className="checkbox-label"><input type="checkbox" checked={entry.important} onChange={e=>change({important:e.target.checked})}/>Важная запись</label>
    {entry.type==='task'&&<label className="checkbox-label"><input type="checkbox" checked={!!entry.completed} onChange={e=>change({completed:e.target.checked})}/>Задача выполнена</label>}
    {confirmDelete&&<div className="error" role="alert"><p>Удалить «{entry.title}»?</p><button type="button" onClick={remove}>Подтвердить удаление</button><button type="button" onClick={()=>setConfirmDelete(false)}>Отмена</button></div>}
    <div className="modal-actions">{exists&&<button type="button" className="delete-button" onClick={()=>setConfirmDelete(true)}><Trash2 size={16}/>Удалить</button>}<button type="submit" className="primary-button"><Check size={16}/>Сохранить</button></div>
  </form>;
}
