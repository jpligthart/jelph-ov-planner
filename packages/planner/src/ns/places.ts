import type { NsClient } from "./client.js";

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

export type PlaceKind = "address" | "stop" | "station" | "other";

export type PlaceHit = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: PlaceKind;
  /** Station code when kind is station. */
  stationCode?: string;
  /** UIC code when available. */
  uicCode?: string;
  /** Stop code (e.g. NL:S:...) when kind is stop. */
  stopCode?: string;
  stopType?: string;
  distanceMeters?: number;
  city?: string;
  postalCode?: string;
};

type RawLocation = {
  name?: string;
  lat?: number;
  lng?: number;
  distance?: number;
  stationCode?: string;
  UICCode?: string;
  uicCode?: string;
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
  nearbyMeLocationId?: { value?: string; type?: string };
  extra?: {
    code?: string;
    stopType?: string;
    type?: string;
  };
  link?: { uri?: string };
};

type RawPlaceGroup = {
  type?: string;
  locations?: RawLocation[];
};

const SEARCH_TYPES = ["address", "stop", "stationV2"] as const;
const NEARBY_TYPES = ["stop", "stationV2"] as const;

function mapKind(type: string | undefined): PlaceKind {
  const t = (type ?? "").toLowerCase();
  if (t === "address") return "address";
  if (t === "stop") return "stop";
  if (t === "stationv2" || t === "station") return "station";
  return "other";
}

function flattenPlaces(json: unknown): PlaceHit[] {
  const root = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const payload = root?.payload;
  if (!Array.isArray(payload)) return [];

  const hits: PlaceHit[] = [];
  for (const group of payload as RawPlaceGroup[]) {
    const kind = mapKind(group.type);
    if (kind === "other") continue;
    for (const loc of group.locations ?? []) {
      const lat = Number(loc.lat);
      const lng = Number(loc.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const name = String(loc.name ?? "").trim();
      if (!name) continue;

      const id =
        loc.nearbyMeLocationId?.value ??
        loc.extra?.code ??
        loc.stationCode ??
        loc.link?.uri ??
        `${name}:${lat},${lng}`;

      hits.push({
        id: String(id),
        name,
        lat,
        lng,
        kind,
        stationCode: loc.stationCode?.trim() || undefined,
        uicCode: (loc.UICCode ?? loc.uicCode)?.trim() || undefined,
        stopCode: loc.extra?.code?.trim() || undefined,
        stopType: loc.extra?.stopType ?? loc.extra?.type,
        distanceMeters:
          typeof loc.distance === "number" && Number.isFinite(loc.distance)
            ? loc.distance
            : undefined,
        city: loc.city,
        postalCode: loc.postalCode,
      });
    }
  }
  return hits;
}

export async function searchPlaces(
  client: NsClient,
  query: string,
  options?: { limit?: number; types?: string[] },
): Promise<PlaceHit[]> {
  const q = query.trim();
  if (!q) return [];
  const limit = options?.limit ?? 10;
  const types = options?.types ?? [...SEARCH_TYPES];

  const json = await client.getJson<unknown>("/places-api/v2/places", {
    q,
    limit,
    lang: "nl",
    type: types,
  });

  return flattenPlaces(json).slice(0, limit);
}

export async function nearbyPlaces(
  client: NsClient,
  lat: number,
  lng: number,
  options?: { radiusMeters?: number; limit?: number; types?: string[] },
): Promise<PlaceHit[]> {
  const radius = options?.radiusMeters ?? 1200;
  const limit = options?.limit ?? 15;
  const types = options?.types ?? [...NEARBY_TYPES];

  const json = await client.getJson<unknown>("/places-api/v2/places", {
    lat,
    lng,
    radius,
    limit,
    lang: "nl",
    type: types,
  });

  return flattenPlaces(json)
    .map((hit) => ({
      ...hit,
      distanceMeters:
        hit.distanceMeters ?? haversineMeters(lat, lng, hit.lat, hit.lng),
    }))
    .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
    .slice(0, limit);
}

/** Best-effort resolve of free text to a single place (address / stop / station). */
export async function resolvePlaceQuery(
  client: NsClient,
  query: string,
): Promise<PlaceHit | null> {
  const hits = await searchPlaces(client, query, { limit: 12 });
  if (hits.length === 0) return null;

  const normalized = query.trim().toLowerCase();

  const exactStation = hits.find(
    (h) =>
      h.kind === "station" &&
      (h.stationCode?.toLowerCase() === normalized ||
        h.name.toLowerCase() === normalized),
  );
  if (exactStation) return exactStation;

  // Prefer addresses when the query looks like a street / postal address.
  const looksLikeAddress =
    /\d/.test(query) ||
    /\b\d{4}\s*[a-z]{2}\b/i.test(query) ||
    /,/.test(query);

  if (looksLikeAddress) {
    const address = hits.find((h) => h.kind === "address");
    if (address) return address;
  }

  const station = hits.find((h) => h.kind === "station");
  if (station) return station;

  const stop = hits.find((h) => h.kind === "stop");
  if (stop) return stop;

  return hits[0] ?? null;
}
