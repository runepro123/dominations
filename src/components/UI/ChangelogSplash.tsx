import { useEffect, useState } from 'react';
import {
  clearPendingWelcome,
  getCurrentAppVersion,
  getPendingWelcome,
  getLastInstalledVersion,
  setLastInstalledVersion,
} from '../../services/updater';

interface WelcomeContent {
  version: string;
  body: string;
}

export function ChangelogSplash() {
  const [entry, setEntry] = useState<WelcomeContent | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const current = await getCurrentAppVersion();
      const last = await getLastInstalledVersion();
      // Show splash only if we have persisted notes AND the version differs.
      // If current === last, this is just a normal launch; do nothing.
      if (!current || !last || current === last) return;

      const pending = await getPendingWelcome();
      if (pending && pending.version === current) {
        if (!cancelled) setEntry({ version: current, body: pending.notes });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!entry) return null;

  async function dismiss() {
    if (!entry) return;
    await setLastInstalledVersion(entry.version);
    await clearPendingWelcome();
    setEntry(null);
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-ink-900/90 backdrop-blur-md pointer-events-auto p-4">
      <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-ink-800/95 shadow-2xl shadow-accent-gold/20 overflow-hidden">
        <div className="px-6 py-5 border-b border-white/10">
          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
            Welcome to
          </p>
          <h2 className="font-display text-2xl font-bold tracking-wider text-accent-gold mt-1">
            Domination v{entry.version}
          </h2>
        </div>

        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
          <pre className="whitespace-pre-wrap font-sans text-sm text-slate-200 leading-relaxed">
            {entry.body}
          </pre>
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex justify-end">
          <button
            onClick={dismiss}
            className="px-5 py-2 text-xs uppercase tracking-[0.2em] bg-accent-gold text-ink-900 font-bold rounded shadow-lg shadow-accent-gold/30 hover:scale-[1.02] transition-transform"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
