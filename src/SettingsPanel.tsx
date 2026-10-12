import { useState } from 'react';
import { AlignLeft, AudioLines, Bell, CalendarDays, Check, List, ListCollapse, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { Preferences } from './model';

type Section = 'Внешний вид' | 'Календарь' | 'Уведомления';
type ChoiceKey = 'theme' | 'text' | 'density' | 'defaultPeriod';
type ToggleKey = 'enabled' | 'tasks' | 'meetings' | 'important' | 'sound' | 'popup' | 'daily' | 'highlight' | 'weekNumbers';
const accents = ['#7850ec', '#4c82f5', '#2ebd87', '#f56b91', '#f4a22e'];
const sections = [
  { title: 'Внешний вид' as const, icon: Palette, description: 'Настройте тему и визуальные параметры приложения' },
  { title: 'Календарь' as const, icon: CalendarDays, description: 'Настройте отображение календаря и параметры времени' },
  { title: 'Уведомления' as const, icon: Bell, description: 'Настройте напоминания о событиях и задачах' },
];
const cities: Record<string, string> = { 'Europe/Moscow': 'Москва', 'Europe/London': 'Лондон', 'Europe/Berlin': 'Берлин', 'Asia/Tokyo': 'Токио', 'Asia/Dubai': 'Дубай', 'America/New_York': 'Нью-Йорк', 'America/Los_Angeles': 'Лос-Анджелес', UTC: 'Всемирное время' };

export default function SettingsPanel({ value: p, update, weekend, setWeekend }: { value: Preferences; update: (p: Preferences) => void; weekend: boolean; setWeekend: (v: boolean) => void }) {
  const [section, setSection] = useState<Section>('Внешний вид');
  const selectedSection = sections.find(s => s.title === section)!;
  const SectionIcon = selectedSection.icon;
  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => update({ ...p, [key]: value });
  const choices = (key: ChoiceKey, title: string, options: { value: string; label: string; icon?: typeof Sun }[], description?: string, small = false) => <fieldset className={`settings-card settings-choice-group ${small ? 'small-choices' : ''}`} data-setting={key}>
    <legend>{title}</legend>{description && <p className="settings-description">{description}</p>}
    <div className="settings-choices">{options.map(option => {
      const Icon = option.icon;
      return <label key={option.value} className={`settings-choice ${p[key] === option.value ? 'is-selected' : ''}`}>
        <input type="radio" name={key} value={option.value} checked={p[key] === option.value} onChange={() => set(key, option.value as never)} />
        {Icon && <Icon aria-hidden="true" size={25} />}{key === 'text' && <span className={`text-size-sample ${option.value}`} aria-hidden="true">А</span>}
        <span>{option.label}</span>
      </label>;
    })}</div>
  </fieldset>;
  const toggle = (key: ToggleKey, title: string, description: string) => <label className="settings-toggle" data-setting={key}>
    <span className="settings-toggle-copy"><strong>{title}</strong><span>{description}</span></span>
    <input type="checkbox" role="switch" aria-label={title} checked={p[key]} onChange={e => set(key, e.target.checked)} />
  </label>;
  const recordColor = (key: 'taskColor' | 'meetingColor', title: string) => <label className="record-color-picker"><span className="record-color-dot" style={{ backgroundColor: p[key] }} /><span>{title}</span><input type="color" aria-label={title} value={p[key]} onChange={e => set(key, e.target.value)} /></label>;
  let zones = ['Europe/Moscow', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Dubai', 'America/New_York', 'America/Los_Angeles', 'UTC'];
  if ('supportedValuesOf' in Intl) zones = (Intl as unknown as { supportedValuesOf: (v: string) => string[] }).supportedValuesOf('timeZone');
  zones = [...new Set([p.zone, ...zones])];
  const zoneLabel = (zone: string) => {
    const offset = new Intl.DateTimeFormat('ru-RU', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(new Date()).find(part => part.type === 'timeZoneName')?.value || 'GMT';
    return `(${offset}) ${cities[zone] || zone.split('/').slice(1).join(' / ').replaceAll('_', ' ') || zone}`;
  };
  return <>
    <header className="settings-modal-header"><h2 id="modal-title">Настройки</h2><span>Ваш календарь — ваши правила</span></header>
    <div className="settings-layout">
      <aside className="settings-sidebar"><div className="settings-brand"><span><AudioLines size={24} /></span>VoiceTask<span className="settings-brand-dot" /></div><p className="settings-nav-caption">НАСТРОЙКИ</p>
        <nav aria-label="Разделы настроек">{sections.map(({ title, icon: Icon }) => <button key={title} className={section === title ? 'selected' : ''} aria-current={section === title ? 'page' : undefined} onClick={() => setSection(title)}><Icon size={21} /><span>{title}</span></button>)}</nav>
      </aside>
      <div className="settings-content" key={section}>
        <header className="settings-section-heading"><span className="settings-section-icon"><SectionIcon size={25} /></span><div><h3>{section}</h3><p>{selectedSection.description}</p></div></header>
        {section === 'Внешний вид' && <div className="settings-cards">
          {choices('theme', 'Тема приложения', [{ value: 'light', label: 'Светлая', icon: Sun }, { value: 'dark', label: 'Тёмная', icon: Moon }, { value: 'system', label: 'Как в системе', icon: Monitor }])}
          <div className="settings-two-columns appearance-columns"><section className="settings-card accent-card"><h4>Основной цвет</h4><p className="settings-description">Выберите цвет акцентов и активных элементов</p><div className="settings-palette">{accents.map(color => <button key={color} type="button" aria-label={`Акцент ${color}`} aria-pressed={p.accent.toLowerCase() === color} className={`accent-swatch ${p.accent.toLowerCase() === color ? 'is-selected' : ''}`} style={{ backgroundColor: color }} onClick={() => set('accent', color)}>{p.accent.toLowerCase() === color && <Check size={15} />}</button>)}<label className={`accent-custom ${!accents.includes(p.accent.toLowerCase()) ? 'is-selected' : ''}`} title="Свой основной цвет"><Palette size={21} /><input type="color" aria-label="Свой основной цвет" value={p.accent} onChange={e => set('accent', e.target.value)} /></label></div></section>
            {choices('text', 'Размер текста', [{ value: 'small', label: 'Маленький' }, { value: 'medium', label: 'Средний' }, { value: 'large', label: 'Большой' }], 'Настройте размер шрифта в интерфейсе', true)}
          </div>
          {choices('density', 'Плотность отображения записей', [{ value: 'standard', label: 'Стандартная', icon: List }, { value: 'brief', label: 'Краткая', icon: ListCollapse }, { value: 'full', label: 'Подробная', icon: AlignLeft }], 'Выберите, сколько информации показывать в карточках')}
          <p className="settings-footnote">Изменения применяются сразу и сохраняются автоматически.</p>
        </div>}
        {section === 'Календарь' && <div className="settings-cards">
          <div className="settings-two-columns"><section className="settings-card"><label className="settings-field">Часовой пояс<span className="settings-description">Выберите ваш часовой пояс</span><select value={p.zone} onChange={e => set('zone', e.target.value)}>{zones.map(zone => <option key={zone} value={zone}>{zoneLabel(zone)}</option>)}</select></label></section>
            {choices('defaultPeriod', 'Режим календаря по умолчанию', ['День', 'Неделя', 'Месяц', 'Год'].map(value => ({ value, label: value })), 'Какой режим показывать при открытии', true)}
          </div>
          <section className="settings-card hours-card"><h4>Отображаемые часы</h4><p className="settings-description">Какой диапазон времени показывать в дневном и недельном режиме</p><div className="settings-two-columns hours-fields"><label>Начало дня<select value={p.hourStart} onChange={e => set('hourStart', Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h} disabled={h >= p.hourEnd}>{String(h).padStart(2, '0')}:00</option>)}</select></label><label>Конец дня<select value={p.hourEnd} onChange={e => set('hourEnd', Number(e.target.value))}>{Array.from({ length: 24 }, (_, i) => i + 1).map(h => <option key={h} value={h} disabled={h <= p.hourStart}>{String(h).padStart(2, '0')}:00</option>)}</select></label></div><label className="settings-weekend"><input type="checkbox" checked={weekend} onChange={e => setWeekend(e.target.checked)} />Показывать выходные в неделе</label></section>
          <div className="settings-two-columns calendar-color-row"><section className="settings-card"><h4>Цвета типов записей</h4><p className="settings-description">Цвета новых задач и встреч</p><div className="record-colors">{recordColor('taskColor', 'Цвет задач')}{recordColor('meetingColor', 'Цвет встреч')}</div></section><section className="settings-card"><label className="settings-field">Формат даты<span className="settings-description">Как показывать даты в интерфейсе</span><select value={p.dateFormat} onChange={e => set('dateFormat', e.target.value)}><option value="DD.MM.YYYY">ДД.ММ.ГГГГ</option><option value="YYYY-MM-DD">ГГГГ-ММ-ДД</option><option value="MM/DD/YYYY">ММ/ДД/ГГГГ</option></select></label></section></div>
          <div className="settings-two-columns calendar-additional"><section className="settings-card">{toggle('highlight', 'Показывать текущую дату', 'Выделять сегодняшний день')}</section><section className="settings-card">{toggle('weekNumbers', 'Показывать номера недель', 'Нумерация недель по стандарту ISO')}</section></div>
          <p className="settings-footnote">Режим по умолчанию применяется при следующем открытии. Старые записи без часового пояса сохраняют прежние местные даты и часы; индивидуальные цвета записей не изменяются.</p>
        </div>}
        {section === 'Уведомления' && <div className="settings-cards notifications-cards">
          <section className="settings-card">{toggle('enabled', 'Включить уведомления', 'Получать напоминания о предстоящих событиях')}</section>
          <fieldset className="settings-card reminder-timing" data-setting="lead"><legend>Напоминать до начала события</legend><p className="settings-description">За какое время напоминать о задачах и встречах</p><div className="reminder-options">{[[5, 'За 5 минут'], [15, 'За 15 минут'], [30, 'За 30 минут'], [60, 'За 1 час'], [1440, 'За 1 день']].map(([value, title]) => <label key={value}><input type="radio" name="lead" value={value} checked={p.lead === value} onChange={() => set('lead', Number(value))} />{title}</label>)}</div></fieldset>
          <section className="settings-card notification-switches">
            {toggle('tasks', 'Напоминания о задачах', 'Напоминать о приближении срока выполнения задач')}
            {toggle('meetings', 'Напоминания о встречах', 'Напоминать о предстоящих встречах')}
            {toggle('important', 'Напоминания о важных записях', 'Отдельные напоминания для важных задач и встреч')}
            {toggle('sound', 'Звуковые оповещения', 'Воспроизводить звук при появлении уведомлений')}
            {toggle('popup', 'Показывать всплывающие уведомления', 'Отображать напоминания внутри приложения')}
            {toggle('daily', 'Отправлять ежедневный обзор', 'Краткий обзор задач и встреч на сегодня')}
          </section>
          <p className="settings-footnote">Напоминания работают только при открытом сайте. Обзор появляется один раз в день. Звук доступен после взаимодействия с сайтом и зависит от настроек браузера.</p>
        </div>}
      </div>
    </div>
  </>;
}
