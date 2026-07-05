import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useState } from 'react';
import { GlobeScene } from './components/Globe/GlobeScene';
import { StartScreen } from './components/UI/StartScreen';
import { HUD } from './components/UI/HUD';
import { CountryPanel } from './components/UI/CountryPanel';
import { ActionDock } from './components/UI/ActionDock';
import { EndScreen } from './components/UI/EndScreen';
import { EventToasts } from './components/UI/EventToasts';
import { UpdateModal } from './components/UI/UpdateModal';
import { ChangelogSplash } from './components/UI/ChangelogSplash';
import { useGame } from './game/store';
import { useGameLoop } from './hooks/useGameLoop';
import { loadCountries } from './game/data/borders';
import type { CountryFeature } from './game/data/borders';
import { bootstrapUpdaterSettings, checkForUpdate } from './services/updater';

export default function App() {
  const phase = useGame((s) => s.phase);
  const load = useGame((s) => s.load);
  const [features, setFeatures] = useState<CountryFeature[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCountries()
      .then(({ features: feats, adjacency }) => {
        if (cancelled) return;
        setFeatures(feats);
        load(feats, adjacency);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useGameLoop();

  // Boot the auto-updater once on app mount. bootstrapUpdaterSettings() pulls
  // lastInstalledVersion + channel from Tauri appData and persists the running
  // version so next launch can detect 'we just updated'. checkForUpdate() is
  // throttled to once per 24h, so most launches silently noop.
  useEffect(() => {
    void bootstrapUpdaterSettings().then(() => {
      void checkForUpdate();
    });
  }, []);

  return (
    <div className="relative w-screen h-[100dvh] overflow-hidden bg-ink-900 text-slate-100 select-none">
      <div className="absolute inset-0">
        <Canvas
          camera={{ position: [0, 0, 3], fov: 38, near: 0.1, far: 100 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          dpr={[1, 2]}
        >
          <color attach="background" args={['#050810']} />
          <fog attach="fog" args={['#050810', 4, 12]} />
          <Suspense fallback={<LoadingEarth />}>
            {features && <GlobeScene features={features} />}
          </Suspense>
        </Canvas>
      </div>

      {/* Starfield */}
      <div className="pointer-events-none absolute inset-0 opacity-60 mix-blend-screen" style={starsStyle()} />

      {/* Vignette */}
      <div className="pointer-events-none absolute inset-0" style={vignetteStyle()} />

      {error && (
        <div className="absolute inset-x-0 top-0 z-50 bg-accent-crimson/90 text-white text-center py-2 text-sm">
          Failed to load world data: {error}
        </div>
      )}

      {!features && !error && phase === 'start' && null}

      <HUD />
      <CountryPanel />
      <ActionDock />
      <EventToasts />
      <UpdateModal />
      <ChangelogSplash />
      {phase === 'start' && <StartScreen />}
      <EndScreen />
    </div>
  );
}

function LoadingEarth() {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial color="#0a1024" wireframe />
      </mesh>
    </group>
  );
}

function starsStyle(): React.CSSProperties {
  // Subtle CSS starfield – saves us downloading a star texture.
  return {
    backgroundImage:
      'radial-gradient(1px 1px at 12% 18%, rgba(255,255,255,0.6) 99%, transparent 100%),' +
      'radial-gradient(1px 1px at 65% 32%, rgba(255,255,255,0.45) 99%, transparent 100%),' +
      'radial-gradient(1.5px 1.5px at 80% 76%, rgba(255,255,255,0.55) 99%, transparent 100%),' +
      'radial-gradient(1px 1px at 30% 80%, rgba(255,255,255,0.4) 99%, transparent 100%),' +
      'radial-gradient(1px 1px at 90% 12%, rgba(255,255,255,0.6) 99%, transparent 100%),' +
      'radial-gradient(1px 1px at 45% 60%, rgba(255,255,255,0.4) 99%, transparent 100%)',
    backgroundRepeat: 'no-repeat',
  };
}

function vignetteStyle(): React.CSSProperties {
  return {
    background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)',
  };
}
