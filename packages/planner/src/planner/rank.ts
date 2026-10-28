import type { NsTrip } from "../ns/types.js";
import type { Station } from "../ns/types.js";

export type RankedOption = {
  id: string;
  summary: string;
  totalDoorToDoorMinutes: number;
  transitMinutes: number;
  walkMetersOrigin: number;
  walkMetersDestination: number;
  walkMinutesOrigin: number;
  walkMinutesDestination: number;
  transfers: number;
  status: string;
  departure?: string;
  arrival?: string;
  fromStation?: Station;
  toStation?: Station;
  notes: string[];
  legs: NsTrip["legs"];
  trip: NsTrip;
  source: "nearby_combo" | "transitous";
};

function tripSignature(trip: NsTrip): string {
  const first = trip.legs[0];
  const last = trip.legs[trip.legs.length - 1];
  const legKey = trip.legs
    .map((l) => `${l.origin}>${l.destination}|${l.modality ?? ""}`)
    .join(";");
  return [
    first?.plannedDeparture ?? "",
    last?.plannedArrival ?? "",
    trip.transfers,
    legKey,
  ].join("||");
}

export function dedupeOptions(options: RankedOption[]): RankedOption[] {
  const seen = new Set<string>();
  const out: RankedOption[] = [];
  for (const option of options) {
    const key = tripSignature(option.trip);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(option);
  }
  return out;
}

export function rankOptions(options: RankedOption[]): RankedOption[] {
  return [...options].sort((a, b) => {
    if (a.totalDoorToDoorMinutes !== b.totalDoorToDoorMinutes) {
      return a.totalDoorToDoorMinutes - b.totalDoorToDoorMinutes;
    }
    if (a.transfers !== b.transfers) return a.transfers - b.transfers;
    const walkA = a.walkMetersOrigin + a.walkMetersDestination;
    const walkB = b.walkMetersOrigin + b.walkMetersDestination;
    if (walkA !== walkB) return walkA - walkB;
    return a.summary.localeCompare(b.summary);
  });
}
