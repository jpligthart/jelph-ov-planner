import type { NsClient } from "../ns/client.js";
import { nearestStations } from "../ns/stations.js";
import type { Station } from "../ns/types.js";
import { haversineMeters } from "./geo.js";

export type NearbyOptions = {
  maxWalkMeters: number;
  maxNearby: number;
};

// Station locations hardly ever change, so nearby lookups are cached in-process.
// Keyed on coords rounded to ~10 m so repeated searches from the same place hit.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const nearestCache = new Map<
  string,
  { expires: number; stations: Promise<Station[]> }
>();

function cachedNearestStations(
  client: NsClient,
  lat: number,
  lng: number,
  limit: number,
): Promise<Station[]> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)},${limit}`;
  const now = Date.now();
  const hit = nearestCache.get(key);
  if (hit && hit.expires > now) return hit.stations;

  const stations = nearestStations(client, lat, lng, limit);
  // Don't cache failures.
  stations.catch(() => nearestCache.delete(key));
  if (nearestCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = nearestCache.keys().next().value;
    if (oldest !== undefined) nearestCache.delete(oldest);
  }
  nearestCache.set(key, { expires: now + CACHE_TTL_MS, stations });
  return stations;
}

/**
 * Returns nearby stations within maxWalkMeters, sorted by distance.
 * Always includes at least the closest station when any exist (even if beyond walk radius),
 * so planning never ends with an empty nearby set for valid coords.
 */
export async function findNearbyStations(
  client: NsClient,
  lat: number,
  lng: number,
  options: NearbyOptions,
): Promise<Station[]> {
  const fetchLimit = Math.max(options.maxNearby, 5);
  const raw = await cachedNearestStations(client, lat, lng, fetchLimit);

  const withDistance = raw.map((station) => {
    const distanceMeters =
      station.distanceMeters ??
      haversineMeters(lat, lng, station.lat, station.lng);
    return { ...station, distanceMeters };
  });

  withDistance.sort(
    (a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0),
  );

  const within = withDistance.filter(
    (s) => (s.distanceMeters ?? Infinity) <= options.maxWalkMeters,
  );

  if (within.length > 0) {
    return within.slice(0, options.maxNearby);
  }

  // Fallback: still return the nearest station(s) so fan-out can work.
  return withDistance.slice(0, Math.min(1, options.maxNearby));
}
