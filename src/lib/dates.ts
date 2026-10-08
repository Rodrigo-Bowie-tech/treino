const pad = (n: number) => String(n).padStart(2, '0');

/** "AAAA-MM-DD" no fuso local. */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "AAAA-MM-DDTHH:mm" no fuso local (formato do input datetime-local). */
export function toDateTimeKey(d: Date): string {
  return `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function todayKey(now = new Date()): string {
  return toDateKey(now);
}

export function parseDateKey(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function parseDateTime(s: string): Date {
  const [date, time = '00:00'] = s.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addDaysKey(key: string, n: number): string {
  return toDateKey(addDays(parseDateKey(key), n));
}

/** Diferença em dias de calendário (b - a). */
export function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

/** Minutos desde a meia-noite para "HH:mm". */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Horas entre dois horários, passando da meia-noite se preciso (ex.: sono). */
export function hoursBetween(from: string, to: string): number {
  let diff = timeToMinutes(to) - timeToMinutes(from);
  if (diff <= 0) diff += 24 * 60;
  return Math.round((diff / 60) * 10) / 10;
}

export function atTime(day: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0);
}

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const shortDateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
const longDateFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const weekdayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
const monthYearFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

const toDate = (v: string | Date) => (v instanceof Date ? v : v.includes('T') ? parseDateTime(v) : parseDateKey(v));

export const formatDate = (v: string | Date) => dateFmt.format(toDate(v));
export const formatShortDate = (v: string | Date) => shortDateFmt.format(toDate(v));
export const formatLongDate = (v: string | Date) => longDateFmt.format(toDate(v));
export const formatWeekday = (v: string | Date) => weekdayFmt.format(toDate(v)).replace('.', '');
export const formatMonthShort = (v: string | Date) => monthFmt.format(toDate(v)).replace('.', '');
export const formatMonthYear = (v: string | Date) => monthYearFmt.format(toDate(v));
export const formatTime = (v: string | Date) => timeFmt.format(toDate(v));
export const formatDateTime = (v: string | Date) => `${formatDate(v)} às ${formatTime(v)}`;

/** "hoje", "amanhã", "ontem", "em 3 dias", "há 2 dias". */
export function relativeDay(target: Date, now = new Date()): string {
  const diff = dayDiff(now, target);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  if (diff === -1) return 'ontem';
  return diff > 0 ? `em ${diff} dias` : `há ${-diff} dias`;
}

/** Idade em anos completos. */
export function ageOn(birthDate: string, on = new Date()): number {
  const b = parseDateKey(birthDate);
  let age = on.getFullYear() - b.getFullYear();
  const beforeBirthday =
    on.getMonth() < b.getMonth() || (on.getMonth() === b.getMonth() && on.getDate() < b.getDate());
  if (beforeBirthday) age--;
  return age;
}
