export type Station = {
  code: string;
  uicCode: string;
  name: string;
  lat: number;
  lng: number;
  /** Distance from query point in meters when returned by nearest. */
  distanceMeters?: number;
};

export type TripLegSummary = {
  origin: string;
  destination: string;
  /** Expected times: real-time when known, else the timetable. */
  plannedDeparture?: string;
  plannedArrival?: string;
  /** Timetable times, to tell a delay apart from a trip that runs on time. */
  scheduledDeparture?: string;
  scheduledArrival?: string;
  modality?: string;
  cancelled?: boolean;
  /** Leg distance in meters when the source provides it (walk legs). */
  distanceMeters?: number;
  /** Platform/track at the boarding and alighting stop, when known. */
  originTrack?: string;
  destinationTrack?: string;
  /** Tracks per the timetable, to spot a platform change. */
  scheduledOriginTrack?: string;
  scheduledDestinationTrack?: string;
  /** Stop coordinates, when the source provides them. */
  originLat?: number;
  originLng?: number;
  destinationLat?: number;
  destinationLng?: number;
};

export type NsTrip = {
  uid: string;
  ctxRecon?: string;
  plannedDurationInMinutes: number;
  actualDurationInMinutes: number;
  transfers: number;
  status: string;
  optimal?: boolean;
  type?: string;
  legs: TripLegSummary[];
  /** Raw trip for debugging / advanced consumers. */
  raw?: unknown;
};

export type TripsQuery = {
  fromStation?: string;
  toStation?: string;
  originLat?: number;
  originLng?: number;
  originName?: string;
  destinationLat?: number;
  destinationLng?: number;
  destinationName?: string;
  dateTime?: string;
  searchForArrival?: boolean;
  originWalk?: boolean;
  destinationWalk?: boolean;
  lang?: string;
};
