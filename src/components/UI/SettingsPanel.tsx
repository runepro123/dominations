import { useEffect, useState } from 'react';
import {
  checkForUpdate,
  getCurrentAppVersion,
  isTauri,
  setChannelPref,
} from '../../services/updater';
import { useUpdaterStore } from '../../services/updaterStore';

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const channel = useUpdaterStore((s) => s.channel);
  const lastCheckedAtMs = useUpdaterStore((s) => s.lastCheckedAtMs);
  const status = useUpdaterStore((s) => s.status);
  const setChannel = useUpdaterStore((s) => s.setChannel);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    if (isTauri()) {
      void getCurrentAppVersion().then(setAppVersion);
    }
  }, []);

  async function switchChannel(ch: 'stable' | 'beta') {
    if (ch === channel) return;
    await setChannelPref(ch);
    setChannel(ch);
    // Force a recheck from the new endpoint so the user immediately sees
    // results from the channel they just switched to.
    await checkForUpdate({ channel: ch, force: true });
  }

  async function manualCheck() {
    await checkForUpdate({ force: true, channel });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink-900/85 backdrop-blur-sm pointer-events-auto p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-ink-800/95 shadow-2xl shadow-accent-gold/20 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold tracking-wider text-accent-gold uppercase">
            Settings
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-100 transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400 mb-2">
              Release channel
            </p>
            <div className="grid grid-cols-2 gap-2">
              <ChannelOption
                label="Stable"
                selected={channel === 'stable'}
                onClick={() => switchChannel('stable')}
              />
              <ChannelOption
                label="Beta"
                selected={channel === 'beta'}
                onClick={() => switchChannel('beta')}
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
              Beta gets new features earlier but may see more bugs. You can
              switch back at any time.
            </p>
          </div>

          <div className="border-t border-white/10 pt-4">
            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400 mb-2">
              Updates
            </p>
            <div className="text-xs text-slate-400 leading-relaxed mb-3">
              {appVersion ? (
                <>Currently running v{appVersion}.</>
              ) : (
                <>
                  Running in browser context — auto-update is only available
                  in the desktop build.
                </>
              )}
              <br />
              {lastCheckedAtMs ? (
                <>Last checked {new Date(lastCheckedAtMs).toLocaleString()}.</>
              ) : (
                <>Never checked for updates.</>
              )}
            </div>
            <button
              onClick={manualCheck}
              disabled={status === 'checking' || !isTauri()}
              className="px-4 py-2 text-xs uppercase tracking-[0.2em] border border-accent-gold/60 text-accent-gold rounded hover:bg-accent-gold/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {status === 'checking' ? 'Checking…' : 'Check for updates'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChannelOption({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-xs uppercase tracking-[0.2em] rounded border transition-all ${
        selected
          ? 'border-accent-gold bg-accent-gold/15 text-accent-gold'
          : 'border-white/20 text-slate-300 hover:bg-white/5'
      }`}
    >
      {label}
    </button>
  );
}
