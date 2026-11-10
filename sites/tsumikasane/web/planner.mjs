import { minutesOf, timeOf } from './core.mjs';

export const WINDOWS = {
  morning: { label: '朝', start: '06:00', end: '12:00' },
  afternoon: { label: '午後', start: '12:00', end: '18:00' },
  evening: { label: '夜', start: '18:00', end: '23:00' },
  flexible: { label: 'いつでも', start: '09:00', end: '21:00' },
};
export function taskWindow(task) { return { start: task.preferredStart || '09:00', end: task.preferredEnd || '21:00' }; }
export function windowLabel(task) {
  const w = taskWindow(task);
  const name = Object.values(WINDOWS).find(p => p.start === w.start && p.end === w.end)?.label;
  return `${name ? name + ' ' : ''}${w.start}–${w.end}`;
}
export function planDay(tasks, events, date) {
  const occupied = events.filter(e => e.date === date).map(e => [minutesOf(e.start), minutesOf(e.end)]);
  const candidates = tasks.filter(t => !t.done && (!t.due || t.due <= date) && !events.some(e => e.taskId === t.id))
    .sort((a,b) => Number(b.priority === 'high') - Number(a.priority === 'high') || (minutesOf(taskWindow(a).end) - minutesOf(taskWindow(a).start)) - (minutesOf(taskWindow(b).end) - minutesOf(taskWindow(b).start)));
  const proposed = [], skipped = [];
  for (const t of candidates) {
    const w = taskWindow(t), limit = minutesOf(w.end), duration = t.estimate;
    let cursor = Math.ceil(minutesOf(w.start) / 5) * 5;
    for (const [start,end] of occupied.slice().sort((a,b) => a[0]-b[0])) {
      if (end <= cursor) continue;
      if (cursor + duration <= start) break;
      cursor = Math.ceil(end/5)*5;
    }
    if (cursor + duration > limit) { skipped.push({task:t,reason:'希望時間帯に、必要な空き時間がありません'}); continue; }
    proposed.push({taskId:t.id,title:t.title,category:t.category,date,start:timeOf(cursor),end:timeOf(cursor+duration)});
    occupied.push([cursor,cursor+duration]);
  }
  return { proposed, skipped };
}
