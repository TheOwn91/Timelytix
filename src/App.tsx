import { useEffect, useRef, useState } from 'react';
import { Home } from './components/Home';
import { Icon, type IconName } from './components/Icon';
import { MonthView } from './components/MonthView';
import { Projects } from './components/Projects';
import { SetupWizard } from './components/SetupWizard';
import { WhatsNew } from './components/WhatsNew';
import { YearView } from './components/YearView';
import { CHANGELOG, markVersionSeen, pendingReleaseNotes, type Release } from './lib/changelog';
import { ConfirmHost } from './components/ConfirmHost';
import { UpdatePreview } from './components/UpdatePreview';
import { runAutoBackup } from './lib/backup';
import { DEMO, demoState } from './lib/demo';
import { syncReminders } from './lib/reminders';
import { refreshNotifySupport, requestNotifyPermission, setNotifyEnabled, shouldAskNotifyOnStart, syncRunningStatus } from './lib/status';
import { ask } from './lib/confirm';
import { NATIVE } from './lib/native';
import { useStore } from './lib/store';
import { applyWidgetActions, onWidgetActions, syncWidget, takeWidgetActions } from './lib/widget';
import { consumeForcedReleaseNotes, consumeNotesShownBeforeUpdate, getUpdateStatus, onUpdateStatus, openUpdatePreview } from './lib/update';

type Tab = 'home' | 'month' | 'year' | 'projects';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Start', icon: 'timer' },
  { id: 'month', label: 'Monat', icon: 'calendar' },
  { id: 'year', label: 'Jahr', icon: 'chart' },
  { id: 'projects', label: 'Einstellungen', icon: 'settings' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [notice, setNotice] = useState<string | null>(null);
  // „Was ist neu?“ nach einem Update (einmal beim Start ermittelt)
  const [whatsNew, setWhatsNew] = useState<{ releases: Release[]; afterUpdate: boolean } | null>(() => {
    // Bei „Jetzt aktualisieren“ wurden die Änderungen schon vor dem Update gezeigt
    if (consumeNotesShownBeforeUpdate()) {
      markVersionSeen();
      return null;
    }
    const releases = pendingReleaseNotes(consumeForcedReleaseNotes());
    return releases.length ? { releases, afterUpdate: true } : null;
  });
  const { state, update: updateState, replace } = useStore();
  // Einrichtungs-Assistent: beim ersten Start und für neue Arbeitgeber
  const [wizard, setWizard] = useState<{ firstRun: boolean; name?: string } | null>(() =>
    state.projects.length === 0 ? { firstRun: true } : null,
  );
  // Nach „Alle Daten löschen“ wie beim ersten Start einrichten
  useEffect(() => {
    if (state.projects.length === 0 && !wizard) {
      setTab('home');
      setWizard({ firstRun: true });
    }
  }, [state.projects.length]);
  const [update, setUpdate] = useState(getUpdateStatus);
  useEffect(() => onUpdateStatus(setUpdate), []);

  // Automatische Sicherung: beim Start und beim Zurückholen der App, wenn fällig
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const check = () => document.visibilityState === 'visible' && runAutoBackup(stateRef.current);
    // Kurz warten, damit die App zuerst fertig startet
    const t = setTimeout(check, 3000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  // Android-App: nach der Installation einmal nach der Anzeige „Zeit läuft“ fragen
  // (erst nach dem Einrichtungs-Assistenten – der bietet sie selbst an)
  useEffect(() => {
    if (wizard) return;
    const t = setTimeout(async () => {
      if (!(await shouldAskNotifyOnStart())) return;
      const ok = await ask('Soll Timelytix Benachrichtigungen zeigen?', {
        detail:
          'Die Anzeige „Zeit läuft“ in der Statusleiste und Erinnerungen, wenn Einträge fehlen oder du vergessen hast abzustempeln. Nach „Erlauben“ fragt Android einmal nach der Erlaubnis. Ändern kannst du das jederzeit unter Einstellungen → Benachrichtigungen.',
        confirmLabel: 'Erlauben',
        cancelLabel: 'Nicht jetzt',
        onConfirm: () => void requestNotifyPermission().then((granted) => granted && void syncRunningStatus(stateRef.current, true)),
      });
      if (!ok) setNotifyEnabled(false);
    }, 1000);
    return () => clearTimeout(t);
  }, [wizard]);

  // Benachrichtigung und Badge folgen dem Timer (auch nach Neustart der App)
  useEffect(() => {
    void syncRunningStatus(state);
  }, [state]);

  // Android-App: Aktionen aus Widget und Benachrichtigung übernehmen – beim Start, beim Zurückholen bzw.
  // Verlassen der App und sofort, wenn sie geöffnet ist (lib/widget.ts)
  useEffect(() => {
    if (!NATIVE) return;
    const pull = async () => {
      const actions = await takeWidgetActions();
      if (actions.length) updateState((d) => applyWidgetActions(d, actions));
      // Sonst den Auszug neu ablegen (z. B. Benachrichtigungen in den Einstellungen aus-/eingeschaltet)
      else void syncWidget(stateRef.current);
    };
    void pull();
    document.addEventListener('visibilitychange', pull);
    const off = onWidgetActions(() => void pull());
    return () => {
      document.removeEventListener('visibilitychange', pull);
      off();
    };
  }, [updateState]);

  // Widget: Auszug nach jeder Änderung neu ablegen
  useEffect(() => {
    void syncWidget(state);
  }, [state]);

  // Erinnerungen (fehlende Tage, vergessen abzustempeln): bei Änderungen neu planen und jede Minute
  // prüfen – die Web-App kann sie nur zeigen, solange sie geöffnet ist
  useEffect(() => {
    const sync = async () => {
      void syncReminders(stateRef.current, (await refreshNotifySupport()) === 'ok');
    };
    void sync();
    const timer = setInterval(() => void sync(), 60_000);
    document.addEventListener('visibilitychange', sync);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [state]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onNotice = (e: Event) => {
      setNotice((e as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setNotice(null), 5000);
    };
    window.addEventListener('timetrack-notice', onNotice);
    return () => {
      window.removeEventListener('timetrack-notice', onNotice);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Timelytix</h1>
        {DEMO && (
          <div className="demo-bar">
            <span>
              Demo · Stand{' '}
              {new Date(__BUILD_TIME__).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
            <button className="link" onClick={() => replace(demoState())}>
              Zurücksetzen
            </button>
          </div>
        )}
      </header>
      {update.state === 'available' && (
        <div className="update-bar" role="status">
          <span>
            Update{update.release ? ` auf ${update.release.version}` : ''} verfügbar
          </span>
          <button className="btn primary" onClick={openUpdatePreview}>
            Jetzt aktualisieren
          </button>
        </div>
      )}
      {update.state === 'installing' && <div className="update-bar">Update wird installiert …</div>}
      <main>
        {tab === 'home' && (
          <Home onOpenProjects={() => setTab('projects')} onStartSetup={() => setWizard({ firstRun: state.projects.length === 0 })} />
        )}
        {tab === 'month' && <MonthView />}
        {tab === 'year' && <YearView />}
        {tab === 'projects' && (
          <Projects
            onShowWhatsNew={() => setWhatsNew({ releases: CHANGELOG, afterUpdate: false })}
            onNewEmployer={(name) => setWizard({ firstRun: false, name })}
          />
        )}
      </main>
      {wizard && (
        <SetupWizard
          firstRun={wizard.firstRun}
          initialName={wizard.name}
          onClose={() => {
            setWizard(null);
            setTab('home');
          }}
        />
      )}
      {!wizard && whatsNew && (
        <WhatsNew releases={whatsNew.releases} afterUpdate={whatsNew.afterUpdate} onClose={() => setWhatsNew(null)} />
      )}
      <UpdatePreview />
      <ConfirmHost />
      {notice && (
        <div className="toast" role="status" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <span className="tab-icon">
              <Icon name={t.icon} />
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
