// Loads the world-atlas TopoJSON and constructs country adjacency tables.
// Defensive: initialises adjacency entries before any pairwise push, and isolates
// each pair-comparison in a try/catch so a malformed geometry can't sink the load.

import * as topojson from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { featuresTouch, featureCentroid, featureArea } from '../geo';

type CountryProperties = { name: string };
export type CountryFeature = Feature<Geometry, CountryProperties>;

/** Primary copy is bundled in `/public` so desktop builds work offline. We
 *  keep CDN mirrors as fallbacks for the pure web build, in case the static
 *  asset is ever stripped (e.g. deploying to a CDN without our `public/`
 *  directory). */
const TOPO_URLS = [
  '/countries-110m.json',
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
  'https://unpkg.com/world-atlas@2/countries-110m.json',
];

interface CachedShape {
  features: CountryFeature[];
  adjacency: Record<string, string[]>;
}

let cache: CachedShape | null = null;

interface LooseTopology {
  objects: { countries: unknown };
  arcs: unknown[];
  transform?: unknown;
}

function hasCountryGeometry(f: CountryFeature): f is CountryFeature & {
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
} {
  const t = f.geometry?.type;
  return t === 'Polygon' || t === 'MultiPolygon';
}

async function fetchTopology(): Promise<LooseTopology> {
  let lastErr: unknown = null;
  for (const url of TOPO_URLS) {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} from ${url}`);
        continue;
      }
      return (await res.json()) as LooseTopology;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `World topology fetch failed across ${TOPO_URLS.length} mirrors: ${String(
      lastErr instanceof Error ? lastErr.message : lastErr,
    )}`,
  );
}

export async function loadCountries(): Promise<CachedShape> {
  if (cache) return cache;
  const topology = await fetchTopology();
  const collection = topojson.feature(
    topology as any,
    topology.objects.countries as any,
  ) as unknown as FeatureCollection<Geometry, CountryProperties>;
  const feats = collection.features as CountryFeature[];

  // Build a stable string-id for every polygonal feature, then seed adjacency.
  const idOf = (f: CountryFeature): string | null => {
    const raw = f.id ?? (f.properties as any)?.id;
    if (raw === undefined || raw === null) return null;
    const s = String(raw);
    return s.length === 0 ? null : s;
  };

  const adj: Record<string, string[]> = {};
  const polyFeatures: CountryFeature[] = [];
  for (const f of feats) {
    if (!hasCountryGeometry(f)) continue;
    const id = idOf(f);
    if (!id) continue;
    polyFeatures.push(f);
    if (!adj[id]) adj[id] = [];
  }

  // Pairwise adjacency. Each pair in its own try/catch so one bad geometry
  // doesn't drop the whole topology.
  for (let i = 0; i < polyFeatures.length; i++) {
    const a = polyFeatures[i]!;
    const idA = idOf(a)!;
    for (let j = i + 1; j < polyFeatures.length; j++) {
      const b = polyFeatures[j]!;
      const idB = idOf(b);
      if (!idB) continue;
      let touches = false;
      try {
        touches = featuresTouch(a as any, b as any);
      } catch {
        // Treat as non-adjacent and continue.
        continue;
      }
      if (touches) {
        adj[idA].push(idB);
        adj[idB].push(idA);
      }
    }
  }

  cache = { features: feats, adjacency: adj };
  return cache;
}

export { featureCentroid, featureArea };
