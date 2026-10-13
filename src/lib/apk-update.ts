import type { LatestRelease, Release } from './changelog';

/**
 * Android-App außerhalb des Play Stores: Neue Versionen liegen als APK an den GitHub-Releases
 * (Workflow „Android-App bauen“). Die App fragt die Liste der Releases ab und bietet die neueste
 * Version mit APK an; installiert wird über den Browser-Download.
 */
export const GITHUB_RELEASES_API = 'https://api.github.com/repos/TheOwn91/Timelytix/releases?per_page=30';

interface GithubRelease {
  tag_name: string;
  body?: string | null;
  draft: boolean;
  assets?: { name: string; browser_download_url: string }[];
}

/** Beta-Versionen: 0.25.0-beta.7 (siehe .github/workflows/android.yml). */
export const BETA_TAG = /^v\d+\.\d+\.\d+-beta\.\d+$/;
const RELEASE_TAG = /^v\d+\.\d+\.\d+$/;

/**
 * 0.21.3 → [0, 21, 3]; Vergleich wie bei Versionsnummern üblich. Eine Beta liegt vor ihrer Version:
 * 0.24.1 < 0.25.0-beta.2 < 0.25.0-beta.10 < 0.25.0.
 */
export function compareVersions(a: string, b: string): number {
  const [ma, ba] = a.split('-beta.');
  const [mb, bb] = b.split('-beta.');
  const pa = ma.split('.').map(Number);
  const pb = mb.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  const na = ba === undefined ? Infinity : Number(ba);
  const nb = bb === undefined ? Infinity : Number(bb);
  return na === nb ? 0 : na < nb ? -1 : 1;
}

const BETA_KEY = 'timetrack.betaUpdates';

/** Android-App: auch Beta-Versionen anbieten (nur auf diesem Gerät, Standard: aus). */
export function betaUpdatesEnabled(): boolean {
  try {
    return localStorage.getItem(BETA_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setBetaUpdatesEnabled(on: boolean) {
  try {
    if (on) localStorage.setItem(BETA_KEY, 'on');
    else localStorage.removeItem(BETA_KEY);
  } catch {
    /* ignorieren */
  }
}

/** Text eines Releases („**29.09.2026**\n\n- Änderung …“, siehe scripts/create-releases.mjs). */
function parseBody(body: string): Pick<Release, 'date' | 'changes'> {
  const date = /\*\*(.+?)\*\*/.exec(body)?.[1] ?? '';
  const changes = body
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
  return { date, changes };
}

/** Neueste Version mit APK samt Verlauf (für die Vorschau „Was ist neu?“); Betas nur mit `beta`. */
export function latestApkRelease(list: GithubRelease[], beta = false): LatestRelease | undefined {
  const releases = list
    .filter((r) => !r.draft && (RELEASE_TAG.test(r.tag_name) || (beta && BETA_TAG.test(r.tag_name))))
    .map((r) => ({
      version: r.tag_name.slice(1),
      ...parseBody(r.body ?? ''),
      apkUrl: r.assets?.find((a) => a.name.endsWith('.apk'))?.browser_download_url,
    }))
    .sort((a, b) => compareVersions(b.version, a.version));
  const newest = releases.find((r) => r.apkUrl);
  if (!newest) return undefined;
  // Versionen ohne APK, die neuer sind (gerade im Bau), noch nicht anbieten
  const history = releases.filter((r) => compareVersions(r.version, newest.version) <= 0).map(({ apkUrl: _url, ...r }) => r);
  return { ...history[0], history, apkUrl: newest.apkUrl };
}

export async function fetchLatestApk(): Promise<LatestRelease | undefined> {
  const res = await fetch(GITHUB_RELEASES_API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (!res.ok) throw new Error(String(res.status));
  return latestApkRelease((await res.json()) as GithubRelease[], betaUpdatesEnabled());
}
