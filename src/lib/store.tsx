import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { materializeAutoBreaks } from './autobreak';
import { DEMO, demoState } from './demo';
import { dateKey, fmtHours, uid } from './time';
import type { AppState, Project, SurchargeRule } from './types';
import { validateState } from './validate';

export { validateState };

const STORAGE_KEY = DEMO ? 'timetrack.demo.v3' : 'timetrack.v1';

export const PROJECT_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#db2777'];

export function defaultSurcharges(): SurchargeRule[] {
  return [
    { id: uid(), name: 'Spätschicht', kind: 'time', from: '18:00', to: '22:00', percent: 10, enabled: true },
    { id: uid(), name: 'Nachtschicht', kind: 'time', from: '22:00', to: '06:00', percent: 25, enabled: true },
    { id: uid(), name: 'Samstag', kind: 'weekday', weekdays: [6], percent: 0, enabled: false },
    { id: uid(), name: 'Sonntag', kind: 'weekday', weekdays: [0], percent: 50, enabled: true },
    { id: uid(), name: 'Feiertag', kind: 'holiday', percent: 125, enabled: true },
  ];
}

export function newProject(name: string, index = 0): Project {
  return {
    id: uid(),
    name,
    color: PROJECT_COLORS[index % PROJECT_COLORS.length],
    hourlyRate: 0,
    dailyTargetHours: 8,
    workdays: [1, 2, 3, 4, 5],
    autoBreak: true,
    state: 'NW',
    surcharges: defaultSurcharges(),
    startDate: dateKey(new Date()),
    vacationDaysPerYear: 30,
    overtimeSurchargePercent: 0,
  };
}

export function emptyState(): AppState {
  return { version: 1, projects: [], sessions: [], absences: [] };
}

export function loadState(): AppState {
  let state: AppState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? validateState(JSON.parse(raw)) : DEMO ? demoState() : emptyState();
  } catch {
    state = DEMO ? demoState() : emptyState();
  }
  materializeAutoBreaks(state);
  return state;
}

type Updater = (draft: AppState) => void;

interface StoreValue {
  state: AppState;
  update: (fn: Updater) => void;
  replace: (s: AppState) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* Speicher voll oder deaktiviert */
    }
  }, [state]);

  // Änderungen aus anderen Tabs übernehmen
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setState(loadState());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((fn: Updater) => {
    setState((prev) => {
      const draft = structuredClone(prev);
      fn(draft);
      // Beendete Tage: gesetzliche Pausen als echte Pausen eintragen
      materializeAutoBreaks(draft);
      return draft;
    });
  }, []);

  const replace = useCallback((s: AppState) => {
    const next = structuredClone(s);
    materializeAutoBreaks(next);
    setState(next);
  }, []);

  return (
    <StoreContext.Provider value={{ state, update, replace }}>{children}</StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('StoreProvider fehlt');
  return ctx;
}

/** Formatiert Stunden-Summen gemäß Einstellung (h:mm oder dezimal). */
export function useHours() {
  const { state } = useStore();
  const decimal = !!state.settings?.decimalHours;
  return (minutes: number, withSign = false) => fmtHours(minutes, decimal, withSign);
}

/** Sekündlich aktualisierter Zeitstempel (nur wenn aktiv). */
export function useNow(active = true, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs]);
  return now;
}
