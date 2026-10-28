import type { TripLegSummary } from "../ns/types.js";
import type { TransitousClient } from "../transitous/client.js";

export type ConnectionQuery = {
  /** The stop where you change onto the last part of the trip. */
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  /** When you are at that stop: the arrival of the vehicle before it. */
  readyAt: string;
  /** Door arrival of the trip itself; only later alternatives are useful. */
  arrival: string;
  maxWalkMeters?: number;
  limit?: number;
};

export type ConnectionAlternative = {
  id: string;
  /** Departure of the first vehicle, not of the short walk to its stop. */
  departure?: string;
  arrival?: string;
  transfers: number;
  legs: TripLegSummary[];
};

const WALK_LEG_RE = /^walk/i;

/** Walking from the platform to another stop at the same station. */
const STATION_WALK_METERS = 500;

/**
 * Other ways to cover the last part of a trip from the stop you change at,
 * e.g. another bus line or the next one, as a backup when a delay makes you
 * miss the planned connection. The planned connection itself is left out:
 * anything arriving no later than the trip is that same connection.
 */
export async function findConnectionAlternatives(
  transitous: TransitousClient,
  query: ConnectionQuery,
): Promise<ConnectionAlternative[]> {
  const limit = query.limit ?? 3;
  const itineraries = await transitous.plan({
    fromLat: query.fromLat,
    fromLng: query.fromLng,
    toLat: query.toLat,
    toLng: query.toLng,
    dateTime: query.readyAt,
    maxStartWalkMeters: STATION_WALK_METERS,
    maxWalkMeters: query.maxWalkMeters,
    numItineraries: limit + 2,
  });

  const planned = Date.parse(query.arrival);
  const alternatives: ConnectionAlternative[] = [];
  for (const item of itineraries) {
    const arrival = item.endTime;
    const arrivalMs = arrival ? Date.parse(arrival) : NaN;
    // Minute precision: the planned connection may differ by seconds.
    if (!(arrivalMs - planned >= 60_000)) continue;
    const ride = item.trip.legs.find((l) => !WALK_LEG_RE.test(l.modality ?? ""));
    if (!ride) continue;
    alternatives.push({
      id: item.id,
      departure: ride.plannedDeparture,
      arrival,
      transfers: item.transfers,
      legs: item.trip.legs,
    });
    if (alternatives.length >= limit) break;
  }
  return alternatives;
}
