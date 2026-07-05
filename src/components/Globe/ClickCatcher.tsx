// Global click catch-all. A single invisible sphere above the cloud layer
// intercepts every pointer event on the globe; the click is resolved by
// converting the ray-intersection point to lat/lng and running d3-geo's
// geoContains against the world topology with a bounding-box prefilter.
//
// This replaces the per-country fan-triangulated hitbox meshes that leaked
// geometric gaps on concave polygons and tiny islands; point-in-polygon over
// the actual GeoJSON geometry never misses.

import { useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { geoBounds, geoContains } from 'd3-geo';
import type { CountryFeature } from '../../game/data/borders';

interface Props {
  features: CountryFeature[];
  onCountryClick: (id: string) => void;
}

interface Bbox {
  id: string;
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export function ClickCatcher({ features, onCountryClick }: Props) {
  // Precompute bounding boxes and a feature lookup once per features-load.
  const indexed = useMemo(() => {      const bboxes: Bbox[] = [];
      const featureById = new Map<string, CountryFeature>();
      for (const f of features) {
        const id = String(f.id);
        if (!id || id === '-99') continue;
        featureById.set(id, f);
        // geoBounds returns [[minLng, minLat], [maxLng, maxLat]] in GeoJSON coord order.
        const [[minLng, minLat], [maxLng, maxLat]] = geoBounds(f as any);
        if (Number.isFinite(minLng) && Number.isFinite(maxLng)) {
          bboxes.push({ id, minLng, minLat, maxLng, maxLat });
        }
      }
      return { bboxes, featureById };
    }, [features]);

  const handleClick = useCallback(
    (e: any) => {
      e.stopPropagation();
      const point: THREE.Vector3 | undefined = e.point;
      if (!point) return;

      // Project the intersection point onto the unit sphere.
      const v = point.clone().normalize();
      // Same convention as latLngToVec3; verified by the formula.
      const lat = 90 - (Math.acos(v.y) * 180) / Math.PI;
      const lng = (Math.atan2(v.z, -v.x) * 180) / Math.PI - 180;

      // Walk candidate bboxes first (cheap), then run geoContains (precise).
      // Features are looked up from a precomputed Map for O(1) cost per candidate.
      const { bboxes, featureById } = indexed;
      for (const bb of bboxes) {
        if (lat < bb.minLat || lat > bb.maxLat) continue;
        const lngInBbox =
          bb.minLng <= bb.maxLng
            ? lng >= bb.minLng && lng <= bb.maxLng
            : lng >= bb.minLng || lng <= bb.maxLng;
        if (!lngInBbox) continue;
        const feature = featureById.get(bb.id);
        if (!feature) continue;
        try {
          if (geoContains(feature as any, [lng, lat])) {
            onCountryClick(bb.id);
            return;
          }
        } catch {
          // Malformed ring; skip and continue scanning candidates.
        }
      }
    },
    [indexed, onCountryClick],
  );

  return (
    // Sits above cloud (1.012); invisible-but-raycastable so every globe click
    // goes through here, then is resolved geometrically. We use onClick (not
    // onPointerDown) so an OrbitControls drag-to-rotate never triggers a
    // country selection — onClick fires only on a clean press+release.
    <mesh onClick={handleClick}>
      <sphereGeometry args={[1.018, 64, 64]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.FrontSide} />
    </mesh>
  );
}


