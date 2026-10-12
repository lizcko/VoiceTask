export type Entry = { id: string; title: string; type: 'task' | 'meeting'; date: string; time: string; duration: number; color: string; important: boolean; description: string; comment?: string; completed?: boolean; startAt?: string; endAt?: string };
export const colors = ['#ddd8f5', '#d8eae2', '#f7e5cf', '#d7e7f8', '#f2dce1'];
export function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export function fromKey(key: string) { return new Date(`${key}T12:00:00`); }
export function addDays(date: Date, days: number) { const result = new Date(date); result.setDate(result.getDate() + days); return result; }
export function weekStart(date: Date) { return addDays(date, -(date.getDay() + 6) % 7); }
export function minutes(time: string) { const [h, m] = time.split(':').map(Number); return h * 60 + m; }
export function formatDate(date: Date, options: Intl.DateTimeFormatOptions) { return date.toLocaleDateString('ru-RU', options); }
export function seedEntries(): Entry[] {
  const monday = weekStart(new Date());
  return [
    ['Обсудить новый проект', 'meeting', 0, '09:00', 60, 0, true, 'Обсудить задачи и распределить роли в команде.'],
    ['Подготовить презентацию', 'task', 0, '11:00', 90, 1, false, 'Собрать идеи и подготовить первые слайды.'],
    ['Встреча с командой', 'meeting', 1, '10:00', 60, 2, false, 'Еженедельная встреча по текущим проектам.'],
    ['Обновить дизайн', 'task', 1, '13:00', 90, 3, true, 'Проверить макеты и внести правки.'],
    ['Планирование недели', 'meeting', 2, '09:00', 60, 1, false, 'Приоритеты и планы на следующую неделю.'],
    ['Отправить документы', 'task', 2, '12:00', 60, 0, false, 'Проверить документы перед отправкой.'],
    ['Созвон с клиентом', 'meeting', 3, '10:00', 90, 3, true, 'Обсудить обратную связь по проекту.'],
    ['Проверить отчёт', 'task', 3, '14:00', 60, 2, false, 'Подвести промежуточные итоги.'],
    ['Завершить проект', 'task', 4, '11:00', 90, 0, true, 'Собрать финальные материалы.'],
    ['Кофе с Анной', 'meeting', 4, '15:00', 60, 4, false, 'Небольшой перерыв в конце недели.'],
    ['Время для себя', 'task', 5, '10:00', 90, 1, false, 'Прогулка, книга и немного тишины.'],
  ].map((v, i) => ({ id: `demo-${i}`, title: v[0] as string, type: v[1] as Entry['type'], date: dateKey(addDays(monday, v[2] as number)), time: v[3] as string, duration: v[4] as number, color: colors[v[5] as number], important: v[6] as boolean, description: v[7] as string }));
}
export function validEntry(value: unknown): value is Entry {
  if (!value || typeof value !== 'object') return false;
  const v = value as Entry;
  return typeof v.id === 'string' && typeof v.title === 'string' && v.title.trim().length > 0 && ['task', 'meeting'].includes(v.type) && typeof v.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.date) && !isNaN(fromKey(v.date).getTime()) && dateKey(fromKey(v.date)) === v.date && typeof v.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.time) && Number.isFinite(v.duration) && v.duration >= 15 && v.duration <= 5256000 && typeof v.color === 'string' && /^#[\da-f]{6}$/i.test(v.color) && typeof v.important === 'boolean' && (typeof v.description === 'string' || typeof v.comment === 'string') && (v.completed === undefined || typeof v.completed === 'boolean') && (v.startAt === undefined || (Number.isFinite(Date.parse(v.startAt)) && Number.isFinite(Date.parse(v.endAt || '')) && Date.parse(v.endAt!) > Date.parse(v.startAt)));
}
export const helpText = 'Я понимаю команды:\nзадача Название; сегодня; 14:00\nвстреча Название; завтра; 10:00; 60\nзадача Долгая работа; 2026-12-31; 23:00; 2027-01-02 02:00\nВместо «сегодня» можно указать дату ГГГГ-ММ-ДД. Последнее число — длительность в минутах (по умолчанию 60); можно указать дату и время окончания, как в третьем примере. Многодневные записи поддерживаются. Добавьте «; важно» для важной записи. Команда «помощь» покажет эту подсказку.';
export function parseCommand(input: string, today = dateKey(new Date())): { entry?: Entry; end?: { date: string; time: string }; reply: string } {
  if (/^(помощь|help|команды)$/i.test(input.trim())) return { reply: helpText };
  const match = input.trim().match(/^(задача|встреча)\s+([^;]+);\s*([^;]+);\s*([^;]+)(?:;\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}|\d+))?(?:;\s*(важно))?$/i);
  if (!match) return { reply: 'Пока я работаю только с командами и не умею понимать свободные запросы.\n\n' + helpText };
  const [, type, title, day, time, duration, important] = match;
  const key = day.trim().toLowerCase();
  const end = duration?.includes('-') ? {date:duration.trim().split(/\s+/)[0],time:duration.trim().split(/\s+/)[1]} : undefined;
  const entry: Entry = { id: crypto.randomUUID(), title: title.trim(), type: type.toLowerCase() === 'задача' ? 'task' : 'meeting', date: key === 'сегодня' ? today : key === 'завтра' ? dateKey(addDays(fromKey(today), 1)) : key, time: time.trim(), duration: end ? 60 : duration ? Number(duration) : 60, important: !!important, color: colors[type.toLowerCase() === 'задача' ? 0 : 1], description: '' };
  if(end) {
    if(dateKey(fromKey(end.date))!==end.date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end.time)) return {reply:'Проверьте дату и время окончания.'};
    entry.duration=(Date.parse(`${end.date}T${end.time}:00Z`)-Date.parse(`${entry.date}T${entry.time}:00Z`))/60000;
  }
  if (!validEntry(entry)) return { reply: 'Проверьте дату (ГГГГ-ММ-ДД), время (ЧЧ:ММ) и длительность. Минимум — 15 минут.' };
  return { entry, end, reply: `Готово! ${entry.type === 'task' ? 'Задача' : 'Встреча'} «${entry.title}» добавлена на ${formatDate(fromKey(entry.date), { day: 'numeric', month: 'long' })} в ${entry.time}. Нажмите на карточку в календаре, чтобы изменить детали.` };
}
