// Auto-update service for the Tauri desktop app.
//
// Wraps @tauri-apps/plugin-updater behind:
//   - 24h throttle (per user preference — most launches noop silently)
//   - stable / beta channel selection (URL switched per channel)
//   - skip-this-version persistence (survives across installs)
//   - graceful noop in browser / PWA / Tauri dev mode
//
// Persistence lives in Tauri appData via LazyStore('domination-settings.json')
// which is independent of webview storage and survives reinstalls, so
// "Skip this version" still skips that exact version after an update.

import { check, type Update } from '@tauri-apps/plugin-updater';
import { LazyStore } from '@tauri-apps/plugin-store';
import { getVersion as getAppVersion } from '@tauri-apps/api/app';
import { useUpdaterStore } from './updaterStore';

const THROTTLE_MS = 24 * 60 * 60 * 1000; // 24 hours
const SETTINGS_FILE = 'domination-settings.json';

const ENDPOINTS = {
  stable:
    'https://github.com/runepro123/dominations/releases/latest/download/latest.json',
  beta:
    'https://github.com/runepro123/dominations/releases/download/beta/latest.json',
} as const;

let _store: LazyStore | null = null;

function getStore(): LazyStore | null {
  if (_store) return _store;
  if (!isTauri()) return null;
  _store = new LazyStore(SETTINGS_FILE);
  return _store;
}

export function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    '__TAURI_INTERNALS__' in window
  );
}

type SettingsKey =
  | 'channel'
  | 'skippedVersion'
  | 'lastInstalledVersion'
  | 'lastCheckedAt'
  | 'pendingWelcomeNotes'
  | 'dataVersion';

async function readSetting<T>(key: SettingsKey): Promise<T | null> {
  const store = getStore();
  if (!store) return null;
  try {
    return ((await store.get<T>(key)) ?? null) as T | null;
  } catch {
    return null;
  }
}

async function writeSetting<T>(
  key: SettingsKey,
  value: T | null,
): Promise<void> {
  const store = getStore();
  if (!store) return;
  if (value === null || value === undefined) {
    await store.delete(key);
  } else {
    await store.set(key, value);
  }
  await store.save();
}

export async function getCurrentAppVersion(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await getAppVersion();
  } catch {
    return null;
  }
}

export async function getLastInstalledVersion(): Promise<string | null> {
  return readSetting<string>('lastInstalledVersion');
}

export async function setLastInstalledVersion(version: string): Promise<void> {
  await writeSetting('lastInstalledVersion', version);
}

export async function getSkippedVersion(): Promise<string | null> {
  return readSetting<string>('skippedVersion');
}

export async function setSkippedVersion(version: string | null): Promise<void> {
  await writeSetting<string>('skippedVersion', version);
}

export async function getChannelPref(): Promise<UpdateChannel> {
  return (await readSetting<UpdateChannel>('channel')) ?? 'stable';
}

export async function setChannelPref(
  channel: UpdateChannel,
): Promise<void> {
  await writeSetting<UpdateChannel>('channel', channel);
  useUpdaterStore.getState().setChannel(channel);
}

export async function getDataVersion(): Promise<number | null> {
  const v = await readSetting<number>('dataVersion');
  return typeof v === 'number' ? v : null;
}

export async function setDataVersion(v: number): Promise<void> {
  await writeSetting<number>('dataVersion', v);
}

interface PendingWelcome {
  version: string;
  notes: string;
}

export async function getPendingWelcome(): Promise<PendingWelcome | null> {
  return readSetting<PendingWelcome>('pendingWelcomeNotes');
}

export async function setPendingWelcome(payload: PendingWelcome): Promise<void> {
  await writeSetting<PendingWelcome>('pendingWelcomeNotes', payload);
}

export async function clearPendingWelcome(): Promise<void> {
  await writeSetting<PendingWelcome>('pendingWelcomeNotes', null);
}

interface CheckResult {
  update: Update | null;
  reason:
    | 'available'
    | 'no_update'
    | 'skipped'
    | 'throttled'
    | 'failed'
    | 'unsupported';
  message?: string;
}

export async function checkForUpdate(
  options: { force?: boolean; channel?: UpdateChannel } = {},
): Promise<CheckResult> {
  const store = useUpdaterStore.getState();

  if (!isTauri()) {
    store.setStatus('no_update');
    return { update: null, reason: 'unsupported' };
  }

  store.setStatus('checking');
  store.setError(null);

  try {
    const lastMs = (await readSetting<number>('lastCheckedAt')) ?? 0;
    if (!options.force && lastMs && Date.now() - lastMs < THROTTLE_MS) {
      store.setStatus('idle');
      return { update: null, reason: 'throttled' };
    }

    const channel = options.channel ?? (await getChannelPref());
    await writeSetting('lastCheckedAt', Date.now());
    store.setLastCheckedAt(Date.now());

    const update = await check({ endpoints: [ENDPOINTS[channel]] });

    if (!update) {
      store.setStatus('no_update');
      return { update: null, reason: 'no_update' };
    }

    const skipped = await getSkippedVersion();
    if (skipped && skipped === update.version) {
      store.setStatus('no_update');
      return { update: null, reason: 'skipped' };
    }

    // Persist pending welcome notes so ChangelogSplash can replay them on
    // the first launch of the new version. Cleared on dismiss.
    const notes = typeof update.notes === 'string' ? update.notes.trim() : '';
    if (update.version && notes.length > 0) {
      await setPendingWelcome({ version: update.version, notes });
    }

    store.setAvailable({
      version: update.version,
      notes,
      pubDate: update.pubDate ?? null,
    });
    store.setStatus('available');
    return { update, reason: 'available' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[updater] check failed:', msg);
    store.setStatus('failed');
    store.setError(msg);
    return { update: null, reason: 'failed', message: msg };
  }
}

interface DownloadCallbacks {
  onProgress?: (
    chunkedBytes: number,
    totalBytes: number | undefined,
    percent: number | undefined,
  ) => void;
}

export async function downloadUpdate(
  update: Update,
  cbs: DownloadCallbacks = {},
): Promise<void> {
  const store = useUpdaterStore.getState();
  store.setStatus('downloading');
  store.setError(null);

  let chunked = 0;
  let total: number | undefined = undefined;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        chunked = 0;
        total = undefined;
        store.setProgress({
          chunkedBytes: 0,
          totalBytes: undefined,
          percent: 0,
        });
        cbs.onProgress?.(0, undefined, 0);
        break;
      case 'Progress': {
        chunked += event.data.chunkLength;
        total = event.data.contentLength ?? total;
        const pct = total ? Math.round((chunked / total) * 100) : undefined;
        store.setProgress({
          chunkedBytes: chunked,
          totalBytes: total,
          percent: pct,
        });
        cbs.onProgress?.(chunked, total, pct);
        break;
      }
      case 'Finished': {
        const finalTotal = total ?? event.data.length ?? chunked;
        store.setProgress({
          chunkedBytes: finalTotal,
          totalBytes: finalTotal,
          percent: 100,
        });
        cbs.onProgress?.(finalTotal, finalTotal, 100);
        break;
      }
    }
  });

  store.setStatus('downloaded');
}

/** Tolerate a small (≤ lifetime) cache clear between launches; treat the
 *  start of every session as a chance to flush stale caches. This is the
 *  "keep save, clear caches" choice from the requirements. */
const CACHE_NAMES = [
  'app-globe-textures',
  'app-runtime-cache',
];

export async function clearLocalCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    for (const name of CACHE_NAMES) {
      const handle = await caches.open(name).catch(() => null);
      // List keys then delete — caches.open returns same handle across calls.
      if (handle) {
        for (const req of await handle.keys()) {
          await handle.delete(req);
        }
      }
    }
  } catch {
    // best-effort: don't block on cache cleanup
  }
}

export async function bootstrapUpdaterSettings(): Promise<void> {
  if (!isTauri()) return;
  await clearLocalCaches();
  const channel = await getChannelPref();
  useUpdaterStore.getState().setChannel(channel);
  // Persist the running version so next launch can detect "we just updated".
  const v = await getCurrentAppVersion();
  if (v) await setLastInstalledVersion(v);
}
