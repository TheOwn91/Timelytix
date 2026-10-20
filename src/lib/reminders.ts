import { buildIndex, daySummary } from './calc';
import { DEMO } from './demo';
import { NATIVE, cancelNative, cancelWidgetForgotNative, scheduleReminderNative } from './native';
import { WEEKDAYS_SHORT, addDays, combine, dateKey, fmtTime, parseDateKey } from './time';
import type { AppState, DateKey } from './types';

/**
 * Erinnerungen per Benachrichtigung:
 * - samstags zur eingestellten Uhrzeit (Standard 10 Uhr), wenn in der Woche (Montag bis Freitag) Einträge fehlen,
 * - wenn die Zeit länger als eingestellt läuft (vergessen abzustempeln?).
 *
 * Android-App: Android zeigt sie zur geplanten Zeit, auch wenn die App geschlossen ist (neu geplant bei
 * jeder Änderung). Web-App: Der Browser kann nichts im Voraus planen – dort erscheinen sie nur, während
 * die App geöffnet ist bzw. beim nächsten Öffnen.
 */

export const DEFAULT_WEEK_REMINDER_TIME = '10:00';
export const DEFAULT_FORGOT_HOURS = 10;
export const FORGOT_OPTIONS = [0, 8, 9, 10, 11, 12, 14, 16];

export interface Reminder {
  id: number;
  /** Eindeutig für Inhalt und Zeitpunkt – ändert er sich, wird neu geplant. */
  key: string;
  title: string;
  body: string;
  at: number;
}

export function weekReminderEnabled(state: AppState): boolean {
  return state.settings?.weekReminder !== false;
}

/** Uhrzeit der Erinnerung am Samstag (HH:MM). */
export function weekReminderTime(state: AppState): string {
  return state.settings?.weekReminderTime ?? DEFAULT_WEEK_REMINDER_TIME;
}

/** Stunden, nach denen an das Abstempeln erinnert wird (0 = aus). */
export function forgotStopHours(state: AppState): number {
  return state.settings?.forgotStopHours ?? DEFAULT_FORGOT_HOURS;
}

/** Samstag zur Uhrzeit `hm` in der Woche von `key` (Woche Montag–Sonntag). */
function saturdayOf(key: DateKey, hm: string): number {
  const d = new Date(`${key}T12:00:00`);
  const toSat = 6 - ((d.getDay() + 6) % 7) - 1; // Montag = 0 … Sonntag = 6, Samstag = 5
  d.setDate(d.getDate() + toSat);
  return combine(dateKey(d), hm);
}

/** Fehlende Arbeitstage Montag–Freitag vor dem Samstag `sat` (je Arbeitgeber). */
export function weekGaps(state: AppState, sat: number): { name: string; dates: DateKey[] }[] {
  const satKey = dateKey(sat);
  const result: { name: string; dates: DateKey[] }[] = [];
  for (const p of state.projects) {
    if (p.archived) continue;
    const index = buildIndex(state, p.id);
    const dates: DateKey[] = [];
    for (let i = 5; i >= 1; i--) {
      const key = addDays(satKey, -i);
      if (daySummary(p, key, index, sat).untracked) dates.push(key);
    }
    if (dates.length) result.push({ name: p.name, dates });
  }
  return result;
}

/** Zwei Kennungen im Wechsel: Die Erinnerung vom Wochenende bleibt stehen, während die nächste geplant wird. */
function weekId(sat: number): number {
  // Nach dem Datum (nicht der Uhrzeit), damit eine andere Uhrzeit die Kennung nicht ändert
  return 10 + (Math.round(Date.parse(`${dateKey(sat)}T00:00Z`) / (7 * 864e5)) % 2);
}

/** Kurz, z. B. „Mi 7.10.“ */
function shortDay(key: DateKey): string {
  const d = parseDateKey(key);
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
}

function weekReminder(state: AppState, sat: number): Reminder | null {
  const gaps = weekGaps(state, sat);
  if (!gaps.length) return null;
  const many = gaps.length > 1;
  const body = gaps
    .map((g) => `${many ? `${g.name}: ` : ''}${g.dates.map(shortDay).join(', ')}`)
    .join(' · ');
  const n = gaps.reduce((a, g) => a + g.dates.length, 0);
  return {
    id: weekId(sat),
    key: `${sat}|${body}`,
    title: n === 1 ? '📝 Ein Tag dieser Woche fehlt noch' : `📝 ${n} Tage dieser Woche fehlen noch`,
    body,
    at: sat,
  };
}

/**
 * Kennung der Erinnerung „Abstempeln vergessen?“ – auch in android/…/ForgotReminder.java: Start und Beenden im Widget
 * planen bzw. löschen sie dort, solange die App nicht läuft.
 */
const FORGOT_ID = 4;

function forgotReminder(state: AppState): Reminder | null {
  const hours = forgotStopHours(state);
  const s = state.sessions.find((x) => x.end === undefined);
  if (!hours || !s) return null;
  const at = s.start + hours * 3600e3;
  const name = state.projects.find((p) => p.id === s.projectId)?.name ?? 'Timelytix';
  return {
    id: FORGOT_ID,
    key: `${s.id}|${at}`,
    title: `⏰ Seit ${hours} Stunden eingestempelt – ${name}`,
    body: `Zeit läuft seit ${fmtTime(s.start)}. Vergessen abzustempeln?`,
    at,
  };
}

/**
 * Welche Erinnerungen jetzt gelten. `current`: Erinnerung des laufenden Wochenendes (ab Samstag 10 Uhr bis
 * Sonntag), `next`: die des nächsten Samstags.
 */
export function reminders(state: AppState, now: number) {
  const today = dateKey(now);
  const hm = weekReminderTime(state);
  const thisSat = saturdayOf(today, hm);
  const nextSat = now < thisSat ? thisSat : saturdayOf(addDays(today, 7), hm);
  const week = weekReminderEnabled(state);
  return {
    currentAt: thisSat,
    forgot: forgotReminder(state),
    current: week && now >= thisSat ? weekReminder(state, thisSat) : null,
    next: week ? weekReminder(state, nextSat) : null,
    currentId: weekId(thisSat),
    nextId: weekId(nextSat),
  };
}

/** Pro Kennung der zuletzt geplante bzw. gezeigte Stand (übersteht das Schließen der App). */
const STORE_KEY = 'timetrack.reminders';

function readStore(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, string>) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* ignorieren */
  }
}

export interface ReminderDriver {
  /** Planen (Android) bzw. zeigen, wenn fällig (Web). `false` = noch nicht gezeigt, später erneut versuchen. */
  show(r: Reminder, now: number): Promise<boolean>;
  remove(id: number): Promise<void>;
}

/**
 * Gewünschten Stand mit dem gespeicherten vergleichen und nur Änderungen weitergeben. Eine bereits
 * gemeldete Erinnerung wird nicht erneut gemeldet; sie verschwindet, sobald sie nicht mehr zutrifft.
 */
export async function applyReminders(state: AppState, now: number, driver: ReminderDriver, allowed: boolean) {
  const store = readStore();
  const r = reminders(state, now);
  const wanted = new Map<number, Reminder | null>([
    [FORGOT_ID, allowed ? r.forgot : null],
    [r.nextId, allowed ? r.next : null],
  ]);
  // Laufendes Wochenende: nur nachholen, wenn noch nichts gemeldet wurde, und entfernen, wenn alles eingetragen ist
  if (r.currentId !== r.nextId) {
    const cur = allowed ? r.current : null;
    const sent = store[r.currentId]?.startsWith(`${r.currentAt}|`);
    wanted.set(r.currentId, cur && sent ? { ...cur, key: store[r.currentId] } : cur);
  }
  for (const [id, want] of wanted) {
    const had = store[id];
    if ((want?.key ?? undefined) === had) continue;
    if (had) await driver.remove(id).catch(() => undefined);
    delete store[id];
    if (want && (await driver.show(want, now).catch(() => false))) store[id] = want.key;
  }
  writeStore(store);
}

const nativeDriver: ReminderDriver = {
  async show(r) {
    await scheduleReminderNative(r);
    // Die App erinnert jetzt selbst – die vom Widget geplante Erinnerung entfällt
    if (r.id === FORGOT_ID) await cancelWidgetForgotNative();
    return true;
  },
  async remove(id) {
    if (id === FORGOT_ID) await cancelWidgetForgotNative();
    await cancelNative([id]);
  },
};

function webDriver(): ReminderDriver {
  const reg = async () => {
    try {
      return await navigator.serviceWorker.ready;
    } catch {
      return undefined;
    }
  };
  return {
    async show(r, now) {
      if (r.at > now) return false; // erst wenn fällig (die App prüft jede Minute)
      const sw = await reg();
      if (!sw) return false;
      await sw.showNotification(r.title, { body: r.body, tag: `timetrack-reminder-${r.id}`, icon: './icon-192.png', badge: './badge-96.png' });
      return true;
    },
    async remove(id) {
      const list = (await (await reg())?.getNotifications({ tag: `timetrack-reminder-${id}` })) ?? [];
      list.forEach((n) => n.close());
    },
  };
}

let running: Promise<void> = Promise.resolve();

/** Erinnerungen an den Zustand anpassen (nacheinander, damit sich Aufrufe nicht überholen). */
/** „Wecker und Erinnerungen“ wurde erlaubt: „Abstempeln vergessen?“ neu (jetzt genau) planen. */
export function replanForgotReminder(state: AppState, allowed: boolean) {
  const store = readStore();
  delete store[FORGOT_ID];
  writeStore(store);
  return syncReminders(state, allowed);
}

export function syncReminders(state: AppState, allowed: boolean) {
  if (DEMO) return running;
  running = running.then(() => applyReminders(state, Date.now(), NATIVE ? nativeDriver : webDriver(), allowed)).catch(() => undefined);
  return running;
}
