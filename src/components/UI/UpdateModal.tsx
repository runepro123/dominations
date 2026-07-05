import { useEffect, useState } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';
import {
  checkForUpdate,
  downloadUpdate,
  setSkippedVersion,
} from '../../services/updater';
import { useUpdaterStore } from '../../services/updaterStore';

export function UpdateModal() {
  const status = useUpdaterStore((s) => s.status);
  const available = useUpdaterStore((s) => s.available);
  const progress = useUpdaterStore((s) => s.progress);
  const error = useUpdaterStore((s) => s.error);

  const [update, setUpdate] = useState<Update | null>(null);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  const isOpen =
    status === 'available' ||
    status === 'downloading' ||
    status === 'downloaded';

  // When a new version is detected, re-run the check so we have the live
  // `Update` object — `checkForUpdate` returns the manifest-aware handle
  // that powers `downloadAndInstall`. Without this we'd only have plain
  // metadata from the store, which doesn't expose downloadAndInstall.
  useEffect(() => {
    if (status === 'available' && available.version && !update) {
      let cancelled = false;
      checkForUpdate({ force: true })
        .then(({ update: u }) => {
          if (!cancelled) setUpdate(u);
        })
        .catch(() => {
          if (!cancelled) setUpdate(null);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [status, available.version, update]);

  if (!isOpen) return null;

  function handleSkip() {
    if (!available.version) return;
    setSkippedVersion(available.version).then(() => {
      setShowSkipConfirm(false);
      useUpdaterStore.getState().setStatus('no_update');
      setUpdate(null);
    });
  }

  async function handleInstallNow() {
    if (!update) return;
    try {
      await downloadUpdate(update);
    } catch (err) {
      useUpdaterStore
        .getState()
        .setError(err instanceof Error ? err.message : String(err));
      useUpdaterStore.getState().setStatus('failed');
    }
  }

  function handleLater() {
    useUpdaterStore.getState().setStatus('idle');
    setUpdate(null);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/85 backdrop-blur-sm pointer-events-auto p-4">
      <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-ink-800/95 shadow-2xl shadow-accent-gold/20 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
              Domination Update
            </p>
            <h2 className="font-display text-xl font-bold tracking-wider text-accent-gold">
              {status === 'available' &&
                `Version ${available.version ?? ''} is available`}
              {status === 'downloading' &&
                `Downloading v${available.version ?? ''}…`}
              {status === 'downloaded' &&
                `Ready to apply v${available.version ?? ''}`}
            </h2>
          </div>
          <button
            aria-label="Close"
            onClick={handleLater}
            disabled={status === 'downloading'}
            className="text-slate-400 hover:text-slate-100 transition-colors text-2xl leading-none disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          {available.pubDate && (
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2">
              Released {new Date(available.pubDate).toLocaleDateString()}
            </p>
          )}
          {available.notes ? (
            <pre className="whitespace-pre-wrap font-sans text-sm text-slate-200 leading-relaxed">
              {available.notes}
            </pre>
          ) : (
            <p className="text-sm text-slate-400 italic">
              No release notes were attached to this build.
            </p>
          )}
        </div>

        {status === 'downloading' && (
          <div className="px-6 pb-4">
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full bg-accent-gold transition-[width] duration-200"
                style={{
                  width: progress.percent != null ? `${progress.percent}%` : '12%',
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] tracking-[0.2em] uppercase text-slate-400 mt-2">
              <span>
                {formatBytes(progress.chunkedBytes)} /{' '}
                {progress.totalBytes ? formatBytes(progress.totalBytes) : '—'}
              </span>
              <span>{progress.percent ?? '…'}%</span>
            </div>
          </div>
        )}

        {status === 'downloaded' && (
          <div className="px-6 pb-4 text-xs text-slate-300">
            Installer downloaded. The update will apply automatically the
            next time the game quits, or hit <em>Restart now</em> below.
          </div>
        )}

        {error && status === 'failed' && (
          <div className="px-6 pb-4 text-xs text-accent-crimson">
            Update failed: {error}
          </div>
        )}

        <div className="px-6 py-4 border-t border-white/10 flex flex-col gap-3">
          {showSkipConfirm ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-300">
                Skip v{available.version} permanently? You can still update
                via Settings → channel toggle.
              </p>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setShowSkipConfirm(false)}
                  className="px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-slate-300 hover:text-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSkip}
                  className="px-3 py-1.5 text-xs uppercase tracking-[0.2em] bg-accent-crimson text-white rounded"
                >
                  Skip
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {status === 'available' && (
                <>
                  <button
                    onClick={() => setShowSkipConfirm(true)}
                    className="px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-300 hover:text-slate-100"
                  >
                    Skip this version
                  </button>
                  <button
                    onClick={handleLater}
                    className="px-4 py-2 text-xs uppercase tracking-[0.2em] border border-white/20 text-slate-100 rounded hover:bg-white/5"
                  >
                    Later
                  </button>
                  <button
                    onClick={handleInstallNow}
                    disabled={!update}
                    className="px-5 py-2 text-xs uppercase tracking-[0.2em] bg-accent-gold text-ink-900 font-bold rounded shadow-lg shadow-accent-gold/30 hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Update Now
                  </button>
                </>
              )}
              {status === 'downloading' && (
                <button
                  disabled
                  className="px-5 py-2 text-xs uppercase tracking-[0.2em] bg-white/10 text-slate-400 rounded cursor-not-allowed"
                >
                  Downloading…
                </button>
              )}
              {status === 'downloaded' && (
                <button
                  onClick={() => {
                    handleInstallNow();
                  }}
                  disabled
                  className="px-5 py-2 text-xs uppercase tracking-[0.2em] bg-accent-gold text-ink-900 font-bold rounded shadow-lg shadow-accent-gold/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Quit and relaunch to apply the installer"
                >
                  Restart to apply (close & reopen)
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
