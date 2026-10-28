export type PlaceHit = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: "address" | "stop" | "station" | "other";
  stationCode?: string;
  stopCode?: string;
  city?: string;
};

export type PlanLeg = {
  origin: string;
  destination: string;
  plannedDeparture?: string;
  plannedArrival?: string;
  modality?: string;
  cancelled?: boolean;
  distanceMeters?: number;
  originTrack?: string;
  destinationTrack?: string;
  originLat?: number;
  originLng?: number;
  destinationLat?: number;
  destinationLng?: number;
};

export type PlanOption = {
  id: string;
  summary: string;
  totalDoorToDoorMinutes: number;
  transitMinutes: number;
  walkMetersOrigin: number;
  walkMetersDestination: number;
  walkMinutesOrigin: number;
  walkMinutesDestination: number;
  transfers: number;
  departure?: string;
  arrival?: string;
  fromStation?: { code: string; name: string; distanceMeters?: number };
  toStation?: { code: string; name: string; distanceMeters?: number };
  notes: string[];
  legs: PlanLeg[];
};

export type PlanResponse = {
  from: { label: string; lat: number; lng: number; kind?: string };
  to: { label: string; lat: number; lng: number; kind?: string };
  options: PlanOption[];
};

export type PlanRequest = {
  from: string;
  to: string;
  dateTime?: string;
  searchForArrival?: boolean;
  maxWalkMeters?: number;
  maxNearby?: number;
  topK?: number;
};

/** Fired when the API says the session is missing or expired. */
export const AUTH_REQUIRED_EVENT = "jelph:auth-required";

async function readError(response: Response): Promise<string> {
  if (response.status === 401) window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
  try {
    const data = (await response.json()) as { error?: string };
    if (data.error) return data.error;
  } catch {
    // ignore
  }
  return `Request failed (${response.status})`;
}

export async function planTrip(body: PlanRequest): Promise<PlanResponse> {
  const response = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as PlanResponse;
}

/** Another way to cover the last part of a trip, from the stop you change at. */
export type ConnectionAlternative = {
  id: string;
  departure?: string;
  arrival?: string;
  transfers: number;
  legs: PlanLeg[];
};

export type AlternativesRequest = {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  readyAt: string;
  arrival: string;
  maxWalkMeters?: number;
};

export async function fetchAlternatives(
  body: AlternativesRequest,
): Promise<ConnectionAlternative[]> {
  const response = await fetch("/api/alternatives", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { alternatives: ConnectionAlternative[] };
  return data.alternatives ?? [];
}

export async function searchPlaces(query: string, limit = 8): Promise<PlaceHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ q, limit: String(limit) });
  const response = await fetch(`/api/places?${params}`);
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { places: PlaceHit[] };
  return data.places ?? [];
}

export type Me = {
  user: { name: string } | null;
  auth: "enabled" | "disabled";
};

export async function fetchMe(): Promise<Me> {
  const response = await fetch("/api/me");
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as Me;
}

export async function login(username: string, password: string): Promise<void> {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function logout(): Promise<void> {
  await fetch("/api/logout", { method: "POST" });
}
