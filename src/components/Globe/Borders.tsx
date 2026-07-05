// Country borders: outlines and faint ownership fills. Click resolution is
// handled by a global <ClickCatcher> mounted in GlobeScene, so this component
// has no per-country hitbox meshes — it only owns visuals.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGame } from '../../game/store';
import { latLngToVec3, EARTH_RADIUS } from '../../game/geo';
import { COLORS } from '../../game/constants';
import type { CountryFeature } from '../../game/data/borders';

interface Props {
  features: CountryFeature[];
}

interface CountryRenderSet {
  fills: THREE.Mesh[];
  lines: THREE.LineLoop[];
}

interface Registry {
  byCountry: Map<string, CountryRenderSet>;
  fillGroup: THREE.Group;
  lineGroup: THREE.Group;
}

export function Borders({ features }: Props) {
  const countries = useGame((s) => s.countries);
  const selectedId = useGame((s) => s.selectedCountryId);
  const targetId = useGame((s) => s.conquestTargetId);

  // Build the registry exactly once per features-load. Per-state ownership
  // changes never re-tessellate; they only push colors into existing materials.
  const registry = useMemo<Registry>(() => buildRegistry(features), [features]);

  // Cleanup: dispose GPU buffers when features change.
  useEffect(() => {
    return () => disposeRegistry(registry);
  }, [registry]);

  // Per-state material refresh — runs whenever ownership or selection changes.
  useEffect(() => {
    for (const [id, set] of registry.byCountry) {
      const c = countries[id];
      if (!c) continue;

      let fillColor = COLORS.neutral;
      let fillOpacity = 0.4;
      if (id === selectedId) {
        fillColor = COLORS.selected;
        fillOpacity = 0.7;
      } else if (id === targetId) {
        fillColor = COLORS.target;
        fillOpacity = 0.65;
      } else if (c.owner === 'player') {
        fillColor = COLORS.player;
        fillOpacity = 0.55;
      } else if (c.owner?.startsWith('ai_')) {
        fillColor = COLORS.ai;
        fillOpacity = 0.45;
      }
      for (const m of set.fills) {
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.color.setHex(fillColor);
        mat.opacity = fillOpacity;
      }

      let lineColor = COLORS.border;
      let lineOpacity = 0.55;
      if (id === selectedId) {
        lineColor = COLORS.selected;
        lineOpacity = 1;
      } else if (id === targetId) {
        lineColor = COLORS.target;
        lineOpacity = 1;
      } else if (c.owner === 'player') {
        lineColor = COLORS.borderOwned;
        lineOpacity = 0.95;
      } else if (c.owner?.startsWith('ai_')) {
        lineColor = COLORS.ai;
        lineOpacity = 0.85;
      }
      for (const ln of set.lines) {
        const mat = ln.material as THREE.LineBasicMaterial;
        mat.color.setHex(lineColor);
        mat.opacity = lineOpacity;
      }
    }
  }, [countries, selectedId, targetId, registry]);

  return (
    <group>
      <primitive object={registry.fillGroup} />
      <primitive object={registry.lineGroup} />
    </group>
  );
}

function buildRegistry(features: CountryFeature[]): Registry {
  const byCountry = new Map<string, CountryRenderSet>();
  const fillGroup = new THREE.Group();
  fillGroup.name = 'country-fills';
  const lineGroup = new THREE.Group();
  lineGroup.name = 'country-outlines';

  for (const f of features) {
    const id = String(f.id);
    const rings = extractRings(f);
    if (rings.length === 0) continue;
    const entry: CountryRenderSet = { fills: [], lines: [] };
    byCountry.set(id, entry);

    for (const ring of rings) {
      // Fill – fan triangulate first ring vertex (still visual-only, no clicks).
      const positions: number[] = [];
      const indices: number[] = [];
      let cursor = 0;
      if (ring.length >= 3) {
        for (let i = 1; i < ring.length - 1; i++) {
          pushVertex(positions, ring[0]!, 1.001);
          pushVertex(positions, ring[i]!, 1.001);
          pushVertex(positions, ring[i + 1]!, 1.001);
          indices.push(cursor, cursor + 1, cursor + 2);
          cursor += 3;
        }
        const fillGeo = new THREE.BufferGeometry();
        fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        fillGeo.setIndex(indices);
        fillGeo.computeVertexNormals();
        const fillMat = new THREE.MeshBasicMaterial({
          color: COLORS.neutral,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const fillMesh = new THREE.Mesh(fillGeo, fillMat);
        fillMesh.renderOrder = 1;
        fillMesh.raycast = () => null; // global catch-all handles clicks
        entry.fills.push(fillMesh);
        fillGroup.add(fillMesh);
      }

      // Outline – one LineLoop per ring.
      const linePositions: number[] = [];
      for (const coord of ring) pushVertex(linePositions, coord, 1.0035);
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
      const lineMat = new THREE.LineBasicMaterial({ color: COLORS.border, transparent: true, opacity: 0.55 });
      const line = new THREE.LineLoop(lineGeo, lineMat);
      line.raycast = () => null;
      entry.lines.push(line);
      lineGroup.add(line);
    }
  }

  return { byCountry, fillGroup, lineGroup };
}

function pushVertex(out: number[], coord: number[], r: number) {
  const lng = coord[0]!;
  const lat = coord[1]!;
  const v = latLngToVec3(lat, lng, EARTH_RADIUS * r);
  out.push(v.x, v.y, v.z);
}

function extractRings(f: CountryFeature): number[][][] {
  const g = f.geometry as { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
  if (g.type === 'Polygon') {
    const rings = g.coordinates as unknown as number[][][];
    return rings.slice();
  }
  if (g.type === 'MultiPolygon') {
    const polys = g.coordinates as unknown as number[][][][];
    const rings: number[][][] = [];
    for (const poly of polys) for (const ring of poly) rings.push(ring);
    return rings;
  }
  return [];
}

function disposeRegistry(r: Registry) {
  r.byCountry.forEach((entry) => {
    entry.fills.forEach((m) => {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    entry.lines.forEach((l) => {
      l.geometry.dispose();
      (l.material as THREE.Material).dispose();
    });
  });
}
