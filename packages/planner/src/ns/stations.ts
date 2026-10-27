import type { NsClient } from "./client.js";
import type { Station } from "./types.js";

type RawStation = {
  code?: string | { code?: string; uicCode?: string };
  UICCode?: string;
  uicCode?: string;
  names?: { long?: string; medium?: string; short?: string };
  namen?: { lang?: string; middel?: string; kort?: string };
  name?: string;
  lat?: number;
  lng?: number;
  location?: { lat?: number; lng?: number };
  distance?: number;
  id?: string | { code?: string; uicCode?: string; evaCode?: string };
  nearbyMeLocationId?: { value?: string; type?: string };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function unwrapStationList(json: unknown): RawStation[] {
  if (Array.isArray(json)) return json as RawStation[];

  const root = asRecord(json);
  if (!root) return [];

  const payload = root.payload;
  if (Array.isArray(payload)) return payload as RawStation[];

  const payloadObj = asRecord(payload);
  if (payloadObj) {
    for (const key of ["stations", "payload", "items"]) {
      const nested = payloadObj[key];
      if (Array.isArray(nested)) return nested as RawStation[];
    }
  }

  for (const key of ["stations", "payload", "items", "data"]) {
    const nested = root[key];
    if (Array.isArray(nested)) return nested as RawStation[];
  }

  return [];
}

function pickCode(raw: RawStation): string {
  if (typeof raw.code === "string" && raw.code.trim()) {
    return raw.code.trim().toUpperCase();
  }
  if (raw.code && typeof raw.code === "object" && raw.code.code) {
    return String(raw.code.code).trim().toUpperCase();
  }
  if (raw.id && typeof raw.id === "object" && raw.id.code) {
    return String(raw.id.code).trim().toUpperCase();
  }
  if (raw.nearbyMeLocationId?.value) {
    return String(raw.nearbyMeLocationId.value).trim().toUpperCase();
  }
  return "";
}

function pickUic(raw: RawStation): string {
  if (raw.UICCode) return String(raw.UICCode).trim();
  if (raw.uicCode) return String(raw.uicCode).trim();
  if (raw.id && typeof raw.id === "object" && raw.id.uicCode) {
    return String(raw.id.uicCode).trim();
  }
  if (raw.code && typeof raw.code === "object" && raw.code.uicCode) {
    return String(raw.code.uicCode).trim();
  }
  if (typeof raw.id === "string") return raw.id.trim();
  return "";
}

function normalizeStation(raw: RawStation): Station | null {
  const code = pickCode(raw);
  const uicCode = pickUic(raw);
  const name =
    raw.names?.long ??
    raw.names?.medium ??
    raw.namen?.lang ??
    raw.namen?.middel ??
    raw.name ??
    code;

  const lat = Number(raw.lat ?? raw.location?.lat);
  const lng = Number(raw.lng ?? raw.location?.lng);

  if (!code && !uicCode) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const distanceMeters =
    typeof raw.distance === "number" && Number.isFinite(raw.distance)
      ? raw.distance
      : undefined;

  return {
    code: code || uicCode,
    uicCode: uicCode || code,
    name: String(name),
    lat,
    lng,
    distanceMeters,
  };
}

export async function searchStations(
  client: NsClient,
  query: string,
  limit = 10,
): Promise<Station[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    const json = await client.getJson<unknown>("/nsapp-stations/v3", {
      q,
      limit,
      includeNonPlannableStations: false,
    });
    const stations = unwrapStationList(json)
      .map(normalizeStation)
      .filter((s): s is Station => s !== null);
    if (stations.length > 0) return stations.slice(0, limit);
  } catch {
    // fall through
  }

  const json = await client.getJson<unknown>(
    "/reisinformatie-api/api/v2/stations",
    { q, limit },
  );
  return unwrapStationList(json)
    .map(normalizeStation)
    .filter((s): s is Station => s !== null)
    .slice(0, limit);
}

export async function nearestStations(
  client: NsClient,
  lat: number,
  lng: number,
  limit = 3,
): Promise<Station[]> {
  try {
    const json = await client.getJson<unknown>("/nsapp-stations/v3/nearest", {
      lat,
      lng,
      limit,
    });
    const stations = unwrapStationList(json)
      .map(normalizeStation)
      .filter((s): s is Station => s !== null);
    if (stations.length > 0) return stations.slice(0, limit);
  } catch {
    // fall through
  }

  const json = await client.getJson<unknown>(
    "/reisinformatie-api/api/v2/stations/nearest",
    { lat, lng, limit },
  );
  return unwrapStationList(json)
    .map(normalizeStation)
    .filter((s): s is Station => s !== null)
    .slice(0, limit);
}

export async function resolveStationByCodeOrName(
  client: NsClient,
  input: string,
): Promise<Station | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z0-9]{1,6}$/.test(trimmed)) {
    const hits = await searchStations(client, trimmed, 20);
    const code = trimmed.toUpperCase();
    const exact = hits.find((s) => s.code === code);
    if (exact) return exact;
  }

  const hits = await searchStations(client, trimmed, 10);
  return hits[0] ?? null;
}
