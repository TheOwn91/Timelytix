/** Datum im Format YYYY-MM-DD (lokale Zeit). */
export type DateKey = string;

/** 0 = Sonntag … 6 = Samstag (wie Date.getDay()). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type SurchargeKind = 'time' | 'weekday' | 'holiday';

export type SurchargeMode = 'max' | 'stack';

export interface SurchargeRule {
  id: string;
  name: string;
  kind: SurchargeKind;
  /** Nur für kind = 'time': Beginn/Ende als HH:MM. Ende < Beginn = über Mitternacht. */
  from?: string;
  to?: string;
  /** Für 'time' (optional, leer = alle Tage) und 'weekday' (Pflicht). */
  weekdays?: Weekday[];
  /** Zuschlag in Prozent des Stundenlohns. */
  percent: number;
  enabled: boolean;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  /** Stundenlohn in €, 0 = keine Geldbeträge anzeigen. */
  hourlyRate: number;
  /** Sollstunden pro Arbeitstag. */
  dailyTargetHours: number;
  workdays: Weekday[];
  /** Gesetzliche Mindestpause (ArbZG §4) automatisch abziehen. */
  autoBreak: boolean;
  /** Länge der automatischen Pause nach 6 h Arbeit in Minuten (Standard 30). */
  autoBreakMinutes?: number;
  /** Bundesland-Kürzel für Feiertage, '' = keine Feiertage. */
  state: string;
  surcharges: SurchargeRule[];
  /**
   * Treffen mehrere Zulagen zusammen (z. B. Sonntag und Nacht): 'max' = nur die höchste zählt
   * (Standard), 'stack' = alle werden addiert.
   */
  surchargeMode?: SurchargeMode;
  /** Ab diesem Tag werden fehlende Einträge angezeigt. */
  startDate: DateKey;
  /** Nachtschichten (Beginn ab 18 Uhr) dem Folgetag zuordnen, siehe shift.ts. */
  shiftToNextDay?: boolean;
  /** Urlaubsanspruch pro Kalenderjahr in Tagen (Standard 30). */
  vacationDaysPerYear?: number;
  /** Verfügbarer Resturlaub im Jahr des Erfassungsbeginns (Standard: voller Jahresanspruch). */
  vacationAtStart?: number;
  /** Stand des Überstundenkontos zum Erfassungsbeginn in Stunden (auch negativ). */
  overtimeAtStartHours?: number;
  /** Zuschlag in % auf positive Monatsüberstunden, gutgeschrieben am Monatsende. */
  overtimeSurchargePercent?: number;
  /**
   * Vertragswerte mit „gültig ab“ (Stundenlohn, Soll, Arbeitstage, Zuschläge). Fehlt die Liste,
   * gelten die Felder oben für den ganzen Zeitraum. Die Felder oben spiegeln immer die heute
   * gültigen Werte.
   */
  terms?: Terms[];
  archived?: boolean;
  /** In den Einstellungen ausgeblendete Schlüssel (Abwesenheiten) – bereits eingetragene Tage bleiben. */
  hiddenAbsences?: AbsenceType[];
}

/** Vertragswerte, die ab einem Datum gelten. */
export interface Terms {
  /** Gültig ab (YYYY-MM-DD); der erste Eintrag gilt ab Erfassungsbeginn: BEGINNING. */
  from: DateKey;
  hourlyRate: number;
  dailyTargetHours: number;
  workdays: Weekday[];
  overtimeSurchargePercent: number;
  /** Zuschlag in % je Zulagen-Regel (fehlt eine Regel, gilt ihr Standardwert). */
  surchargePercents: Record<string, number>;
}

export interface Pause {
  start: number;
  end?: number;
  /** Von der App eingetragene gesetzliche Pause (nach 6 h bzw. 9 h); kann wie jede Pause gelöscht werden. */
  auto?: boolean;
}

export interface Session {
  id: string;
  projectId: string;
  start: number;
  end?: number;
  pauses: Pause[];
  note?: string;
  /** Automatische Pausen für diesen Tag sind eingetragen (siehe lib/autobreak.ts). */
  autoBreaksApplied?: boolean;
}

export type AbsenceType =
  | 'urlaub'
  | 'krank'
  | 'ueberstunden'
  | 'kurzarbeit'
  | 'feiertag'
  | 'frei'
  | 'sonstiges';

export interface Absence {
  id: string;
  projectId: string;
  date: DateKey;
  type: AbsenceType;
  note?: string;
}

/** App-weite Anzeige-Einstellungen (werden mit der Datensicherung gespeichert). */
export interface AppSettings {
  /** Summen (Monat, Jahr) als Dezimalstunden anzeigen, z. B. 156,73 h statt 156:44 h. */
  decimalHours?: boolean;
}

export interface AppState {
  version: 1;
  settings?: AppSettings;
  projects: Project[];
  sessions: Session[];
  absences: Absence[];
  selectedProjectId?: string;
}
