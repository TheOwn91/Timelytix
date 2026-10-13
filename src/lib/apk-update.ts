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

/** 0.21.3 → [0, 21, 3]; Vergleich wie bei Versionsnummern üblich. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
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

/** Neueste Version mit APK samt Verlauf (für die Vorschau „Was ist neu?“). */
export function latestApkRelease(list: GithubRelease[]): LatestRelease | undefined {
  const releases = list
    .filter((r) => !r.draft && /^v\d+\.\d+\.\d+$/.test(r.tag_name))
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
  return latestApkRelease((await res.json()) as GithubRelease[]);
}
