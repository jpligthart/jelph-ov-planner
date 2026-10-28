export {
  NsClient,
  NsApiError,
  createNsClientFromEnv,
  type NsClientOptions,
} from "./ns/client.js";
export {
  searchStations,
  nearestStations,
  resolveStationByCodeOrName,
} from "./ns/stations.js";
export {
  searchPlaces,
  nearbyPlaces,
  resolvePlaceQuery,
  type PlaceHit,
  type PlaceKind,
} from "./ns/places.js";
export { searchTrips } from "./ns/trips.js";
export type {
  Station,
  TripLegSummary,
  NsTrip,
  TripsQuery,
} from "./ns/types.js";
export {
  planRoute,
  parsePlaceString,
  toPublicPlanResult,
  type PlaceInput,
  type PlanRequest,
  type PlanResult,
  type PublicPlanResult,
  type ResolvedPlace,
} from "./planner/plan.js";
export { dropDominated, type RankedOption } from "./planner/rank.js";
export { findNearbyStations, type NearbyOptions } from "./planner/nearby.js";
export { findNearbyHubs, type TransitHub } from "./planner/hubs.js";
export { haversineMeters, walkMinutes, WALK_METERS_PER_MINUTE } from "./planner/geo.js";
export {
  TransitousClient,
  createTransitousClientFromEnv,
  type TransitousClientOptions,
  type TransitousItinerary,
  type TransitousPlanQuery,
} from "./transitous/client.js";
