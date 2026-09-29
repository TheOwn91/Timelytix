import { useEffect, useRef, useState } from 'react';
import { Home } from './components/Home';
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
import { syncRunningStatus } from './lib/status';
import { useStore } from './lib/store';
import { consumeForcedReleaseNotes, consumeNotesShownBeforeUpdate, getUpdateStatus, onUpdateStatus, openUpdatePreview } from './lib/update';

type Tab = 'home' | 'month' | 'year' | 'projects';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Start', icon: '⏱' },
  { id: 'month', label: 'Monat', icon: '📅' },
  { id: 'year', label: 'Jahr', icon: '📊' },
  { id: 'projects', label: 'Einstellungen', icon: '⚙️' },
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
  const { state, replace } = useStore();
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

  // Benachrichtigung und Badge folgen dem Timer (auch nach Neustart der App)
  useEffect(() => {
    void syncRunningStatus(state);
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
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
