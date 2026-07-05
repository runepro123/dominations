// Assembles the 3D globe: earth sphere, atmosphere, clouds, borders, and camera rig.

import { useMemo } from 'react';
import * as THREE from 'three';
import { EarthSphere } from './EarthSphere';
import { Atmosphere } from './Atmosphere';
import { Clouds } from './Clouds';
import { Borders } from './Borders';
import { CameraRig } from './CameraRig';
import { ClickCatcher } from './ClickCatcher';
import { WarOverlay } from '../Scene/WarOverlay';
import { useGame } from '../../game/store';
import type { CountryFeature } from '../../game/data/borders';

interface Props {
  features: CountryFeature[];
}

export function GlobeScene({ features }: Props) {
  const select = useGame((s) => s.select);
  const sunDir = useMemo(() => new THREE.Vector3(1.0, 0.4, 0.4), []);

  return (
    <>
      <ambientLight intensity={0.35} color={new THREE.Color(0x9bb6e0)} />
      <directionalLight
        intensity={1.4}
        color={new THREE.Color(0xfff6d8)}
        position={[sunDir.x * 5, sunDir.y * 5, sunDir.z * 5]}
      />

      <EarthSphere sunDir={sunDir} />
      <Atmosphere />
      <Clouds />
      <Borders features={features} />
      <ClickCatcher features={features} onCountryClick={(id) => select(id)} />
      <WarOverlay />
      <CameraRig />
    </>
  );
}
