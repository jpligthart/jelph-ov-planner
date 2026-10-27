import type { NsClient } from "../ns/client.js";
import { nearestStations } from "../ns/stations.js";
import type { Station } from "../ns/types.js";
import { haversineMeters } from "./geo.js";

export type NearbyOptions = {
  maxWalkMeters: number;
  maxNearby: number;
};

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
  const raw = await nearestStations(client, lat, lng, fetchLimit);

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
