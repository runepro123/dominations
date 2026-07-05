// War visualisation layer. Sits inside the globe Canvas and renders one WarMarker
// per ActiveWar — marching troop spheres along a great-circle slerp, a pulsing
// defender halo, and an in-world HTML counter overlay showing ATK / DEF / ticks
// remaining. None of the meshes receive pointer events so they never intercept
// clicks from underlying country hitboxes.

import { useRef } from 'react';
import type { ReactElement } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useGame } from '../../game/store';
import { latLngToVec3, EARTH_RADIUS } from '../../game/geo';
import { WAR } from '../../game/constants';

/** Slerp two unit-radius vectors on the sphere surface. */
function slerpSphere(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  const dot = Math.min(1, Math.max(-1, a.dot(b)));
  const omega = Math.acos(dot);
  if (omega < 1e-5) return a.clone();
  const sinOmega = Math.sin(omega);
  const scaleA = Math.sin((1 - t) * omega) / sinOmega;
  const scaleB = Math.sin(t * omega) / sinOmega;
  return new THREE.Vector3(
    a.x * scaleA + b.x * scaleB,
    a.y * scaleA + b.y * scaleB,
    a.z * scaleA + b.z * scaleB,
  );
}

interface TroopProps {
  index: number;
  total: number;
  attackerSurface: THREE.Vector3;
  defenderSurface: THREE.Vector3;
}

function MarchingTroop({ index, total, attackerSurface, defenderSurface }: TroopProps) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    // Cycle 0→1 over ~6 seconds, offset by index/total for the column look.
    const cycle = ((clock.elapsedTime / 6) + index / total) % 1;
    const pos = slerpSphere(attackerSurface, defenderSurface, cycle);
    // Lift slightly above surface so troops arc visibly above the countries.
    const arc = Math.sin(cycle * Math.PI) * 0.04;
    pos.multiplyScalar(EARTH_RADIUS * (1.018 + arc));
    ref.current.position.copy(pos);
  });
  return (
    <mesh ref={ref} raycast={() => null}>
      <sphereGeometry args={[0.008, 6, 6]} />
      <meshBasicMaterial color={0xff8855} toneMapped={false} />
    </mesh>
  );
}

interface MarkerProps {
  defenderSurface: THREE.Vector3;
  attackerMil: number;
  defenderDef: number;
  ticksRemaining: number;
  totalTicks: number;
  attackerSurface: THREE.Vector3;
}

function WarMarker({ defenderSurface, attackerMil, defenderDef, ticksRemaining, totalTicks, attackerSurface }: MarkerProps) {
  const haloRef = useRef<THREE.Mesh>(null);
  const outerRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (haloRef.current) {
      const mat = haloRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.55 + 0.35 * Math.sin(t * 5);
      const s = 1 + 0.08 * Math.sin(t * 4);
      haloRef.current.scale.setScalar(s);
    }
    if (outerRef.current) {
      const mat = outerRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.25 + 0.18 * Math.sin(t * 3 + 1);
    }
  });

  const defenderWorldPos = defenderSurface.clone().multiplyScalar(EARTH_RADIUS);
  const overlayPos = defenderSurface.clone().multiplyScalar(EARTH_RADIUS * 1.07);

  const troops = [];
  for (let i = 0; i < WAR.marchTroopCount; i++) {
    troops.push(
      <MarchingTroop
        key={i}
        index={i}
        total={WAR.marchTroopCount}
        attackerSurface={attackerSurface}
        defenderSurface={defenderSurface}
      />,
    );
  }

  const progress = 1 - ticksRemaining / Math.max(1, totalTicks);

  return (
    <group raycast={() => null}>
      {troops}
      {/* Pulsing defender halo */}
      <mesh ref={haloRef} position={defenderWorldPos.toArray()} raycast={() => null}>
        <sphereGeometry args={[0.025, 16, 16]} />
        <meshBasicMaterial color={0xff3344} transparent opacity={0.6} toneMapped={false} />
      </mesh>
      {/* Outer warning ring */}
      <mesh ref={outerRef} position={defenderWorldPos.toArray()} raycast={() => null}>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshBasicMaterial color={0xff8855} transparent opacity={0.3} toneMapped={false} />
      </mesh>
      <Html
        position={overlayPos.toArray()}
        center
        distanceFactor={5}
        zIndexRange={[100, 50]}
        style={{ pointerEvents: 'none' }}
      >
        <div
          style={{
            background: 'rgba(8, 14, 30, 0.92)',
            border: '1px solid rgba(255, 88, 88, 0.7)',
            padding: '1px 4px',
            borderRadius: 4,
            color: 'white',
            fontSize: 8,
            fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            minWidth: 64,
            lineHeight: 1.25,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontWeight: 700,
              letterSpacing: '0.05em',
              fontSize: 7,
              color: '#ff8855',
            }}
          >
            <span>WAR</span>
            <span style={{ color: '#cdd6f4' }}>⏳{ticksRemaining}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
            <span>🪖{attackerMil}</span>
            <span style={{ color: '#8ab4ff' }}>🛡{defenderDef}</span>
          </div>
          <div
            style={{
              marginTop: 1,
              height: 2,
              background: 'rgba(255,255,255,0.12)',
              borderRadius: 1,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.round(progress * 100)}%`,
                background: 'linear-gradient(90deg, #ff8855, #ff3344)',
                transition: 'width 0.4s linear',
              }}
            />
          </div>
        </div>
      </Html>
    </group>
  );
}

export function WarOverlay() {
  const wars = useGame((s) => s.activeWars);
  const warOrder = useGame((s) => s.activeWarOrder);
  const countries = useGame((s) => s.countries);

  const items: ReactElement[] = [];
  for (const warId of warOrder) {
    const war = wars[warId];
    if (!war) continue;
    const attacker = countries[war.attackerId];
    const defender = countries[war.defenderId];
    if (!attacker || !defender) continue;
    const attackerSurface = latLngToVec3(attacker.cy, attacker.cx, EARTH_RADIUS).normalize();
    const defenderSurface = latLngToVec3(defender.cy, defender.cx, EARTH_RADIUS).normalize();
    items.push(
      <WarMarker
        key={warId}
        defenderSurface={defenderSurface}
        attackerSurface={attackerSurface}
        attackerMil={war.attackerCurrentMilitary}
        defenderDef={war.defenderCurrentDefense}
        ticksRemaining={war.ticksRemaining}
        totalTicks={war.totalTicks}
      />,
    );
  }

  return <group>{items}</group>;
}
