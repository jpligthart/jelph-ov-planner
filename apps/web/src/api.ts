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
  legs: Array<{
    origin: string;
    destination: string;
    plannedDeparture?: string;
    plannedArrival?: string;
    modality?: string;
    cancelled?: boolean;
  }>;
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

async function readError(response: Response): Promise<string> {
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

export async function searchPlaces(query: string, limit = 8): Promise<PlaceHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ q, limit: String(limit) });
  const response = await fetch(`/api/places?${params}`);
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { places: PlaceHit[] };
  return data.places ?? [];
}
