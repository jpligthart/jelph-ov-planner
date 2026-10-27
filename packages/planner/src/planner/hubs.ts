import type { NsClient } from "../ns/client.js";
import { nearbyPlaces, type PlaceHit } from "../ns/places.js";
import { nearestStations } from "../ns/stations.js";
import { haversineMeters } from "./geo.js";
import type { NearbyOptions } from "./nearby.js";

export type TransitHub = {
  id: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
  kind: "station" | "stop";
  distanceMeters: number;
};

function fromStationNearest(
  stations: Awaited<ReturnType<typeof nearestStations>>,
  originLat: number,
  originLng: number,
): TransitHub[] {
  return stations.map((s) => {
    const distanceMeters =
      s.distanceMeters ??
      haversineMeters(originLat, originLng, s.lat, s.lng);
    return {
      id: `station:${s.code || s.uicCode}`,
      code: s.code || s.uicCode,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      kind: "station" as const,
      distanceMeters,
    };
  });
}

function fromPlaceHit(hit: PlaceHit, originLat: number, originLng: number): TransitHub | null {
  if (hit.kind !== "station" && hit.kind !== "stop") return null;
  const code =
    hit.kind === "station"
      ? hit.stationCode || hit.uicCode || hit.id
      : hit.stopCode || hit.id;
  if (!code) return null;
  return {
    id: `${hit.kind}:${code}`,
    code,
    name: hit.name,
    lat: hit.lat,
    lng: hit.lng,
    kind: hit.kind,
    distanceMeters:
      hit.distanceMeters ??
      haversineMeters(originLat, originLng, hit.lat, hit.lng),
  };
}

/**
 * Nearby transit hubs within walk radius: bus/tram stops + train stations.
 * Deduped and capped by maxNearby (preferring closer hubs).
 */
export async function findNearbyHubs(
  client: NsClient,
  lat: number,
  lng: number,
  options: NearbyOptions,
): Promise<TransitHub[]> {
  const [places, stations] = await Promise.all([
    nearbyPlaces(client, lat, lng, {
      radiusMeters: options.maxWalkMeters,
      limit: Math.max(options.maxNearby * 4, 12),
      types: ["stop", "stationV2"],
    }).catch(() => [] as PlaceHit[]),
    nearestStations(client, lat, lng, Math.max(options.maxNearby, 5)).catch(
      () => [],
    ),
  ]);

  const hubs: TransitHub[] = [];
  const seen = new Set<string>();

  for (const hit of places) {
    const hub = fromPlaceHit(hit, lat, lng);
    if (!hub) continue;
    if (hub.distanceMeters > options.maxWalkMeters) continue;
    if (seen.has(hub.id)) continue;
    seen.add(hub.id);
    hubs.push(hub);
  }

  for (const hub of fromStationNearest(stations, lat, lng)) {
    if (hub.distanceMeters > options.maxWalkMeters) continue;
    if (seen.has(hub.id)) continue;
    seen.add(hub.id);
    hubs.push(hub);
  }

  hubs.sort((a, b) => a.distanceMeters - b.distanceMeters);

  // Always keep the nearest train station for fallback planning
  // (many NS keys cannot do lat/lng door-to-door / bus planning).
  const nearestStation = fromStationNearest(stations, lat, lng)[0];
  const within = hubs.slice(0, options.maxNearby);

  if (nearestStation) {
    if (!within.some((h) => h.id === nearestStation.id)) {
      // Replace farthest hub if needed so the station always fits.
      if (within.length >= options.maxNearby) {
        within[within.length - 1] = nearestStation;
      } else {
        within.push(nearestStation);
      }
    }
    within.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return within;
  }

  return within;
}
