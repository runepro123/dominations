// Geographic helpers shared by the globe renderer and the game logic.

import * as THREE from 'three';
import { geoContains, geoDistance } from 'd3-geo';

export const EARTH_RADIUS = 1; // unit sphere; visualisation lives here

/** Convert latitude / longitude (degrees) to a unit-sphere Vector3. */
export function latLngToVec3(lat: number, lng: number, radius = EARTH_RADIUS): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

/** Inverse of latLngToVec3 — finds the surface point under a unit Vector3. */
export function vec3ToLatLng(v: THREE.Vector3): { lat: number; lng: number } {
  const n = v.clone().normalize();
  const lat = 90 - (Math.acos(n.y) * 180) / Math.PI;
  const lng = (Math.atan2(n.z, -n.x) * 180) / Math.PI - 180;
  return { lat, lng: ((lng + 540) % 360) - 180 };
}

/**
 * A Feature-like object that satisfies the bits of d3-geo we use:
 *   { type: 'Feature', geometry: { type: 'Polygon' | 'MultiPolygon', coordinates: ... } }
 */
interface FeatureLike {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

/** Returns true if the two features share a border or touch. */
export function featuresTouch(a: FeatureLike, b: FeatureLike, toleranceDeg = 1.0): boolean {
  // Quick reject: bounding boxes further apart than tolerance.
  const aRings = ringsOf(a);
  const bRings = ringsOf(b);

  if (!aRings.length || !bRings.length) return false;

  const aBox = bboxOf(aRings);
  const bBox = bboxOf(bRings);
  const gap = bboxGap(aBox, bBox);
  if (gap > toleranceDeg) return false;

  // Wedge test: does any a-ring lie inside b? (peninsulas, enclaves)
  for (const ring of aRings) {
    for (let i = 0; i < ring.length; i += Math.max(1, Math.floor(ring.length / 8))) {
      const [lng, lat] = ring[i]!;
      try {
        if (geoContains(b as any, [lng, lat])) return true;
      } catch {
        /* ignore malformed rings */
      }
    }
  }

  // Mutual perimeter sampling — most borders are detected here.
  const probe = (src: number[][][], dst: number[][][]) => {
    const step = Math.max(1, Math.floor(src.length / 12));
    for (const ring of src) {
      for (let i = 0; i < ring.length; i += step) {
        const [lng, lat] = ring[i]!;
        for (const other of dst) {
          for (let j = 0; j < other.length; j += 4) {
            const [olng, olat] = other[j]!;
            if (Math.abs(olng - lng) < toleranceDeg && Math.abs(olat - lat) < toleranceDeg) {
              try {
                const d = geoDistance([lng, lat], [olng, olat]);
                if (d <= toleranceDeg / 180) {
                  return true;
                }
              } catch {
                /* dateline edge cases */
              }
            }
          }
        }
      }
    }
    return false;
  };

  return probe(aRings, bRings) || probe(bRings, aRings);
}

function ringsOf(f: FeatureLike): number[][][] {
  const g = f.geometry;
  if (g.type === 'Polygon') return g.coordinates as number[][][];
  if (g.type === 'MultiPolygon') return (g.coordinates as number[][][][]).flat();
  return [];
}

function bboxOf(rings: number[][][]): [number, number, number, number] {
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [minLng, minLat, maxLng, maxLat];
}

function bboxGap(a: [number, number, number, number], b: [number, number, number, number]): number {
  const dx = Math.max(0, Math.max(a[0] - b[2], b[0] - a[2]));
  const dy = Math.max(0, Math.max(a[1] - b[3], b[1] - a[3]));
  return Math.sqrt(dx * dx + dy * dy);
}

/** Compute the arithmetic centroid of a Feature's polygons. */
export function featureCentroid(f: FeatureLike): { lng: number; lat: number } {
  const rings = ringsOf(f);
  let sumLng = 0,
    sumLat = 0,
    count = 0;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      sumLng += lng;
      sumLat += lat;
      count++;
    }
  }
  if (count === 0) return { lng: 0, lat: 0 };
  return { lng: sumLng / count, lat: sumLat / count };
}

/** Polygon area on the sphere proportional to a unit-sphere cap. */
export function featureArea(f: FeatureLike): number {
  let total = 0;
  for (const ring of ringsOf(f)) {
    if (ring.length < 3) continue;
    for (let i = 0; i < ring.length - 1; i++) {
      const [lng1, lat1] = ring[i]!;
      const [lng2, lat2] = ring[i + 1]!;
      total += (lng2 - lng1) * (Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180));
    }
  }
  return Math.abs(total) / 2;
}
