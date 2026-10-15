import { BUILD_VERSION } from '../lib/changelog';
import { NATIVE } from '../lib/native';

const ADDRESS = 'timelytix@schiers.me';

/** E-Mail mit Betreff „[Timelytix] …“; Version und Plattform stehen schon drin (hilft bei Fehlern). */
function mailto(topic: string): string {
  const subject = `[Timelytix] ${topic}`;
  const body = `\n\n—\nTimelytix ${BUILD_VERSION} (${NATIVE ? 'Android-App' : 'Web-App'})`;
  return `mailto:${ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Rückmeldung zu Fehlern und Ideen per E-Mail. */
export function FeedbackCard() {
  return (
    <section className="card">
      <h2>Feedback</h2>
      <p className="muted small">Fehler gefunden oder eine Idee? Über eine Rückmeldung freue ich mich.</p>
      <div className="button-row">
        <a className="btn secondary" href={mailto('Bug Report')}>
          Fehler melden
        </a>
        <a className="btn secondary" href={mailto('Feature Request')}>
          Idee vorschlagen
        </a>
      </div>
      <p className="muted small feedback-address">{ADDRESS}</p>
    </section>
  );
}
