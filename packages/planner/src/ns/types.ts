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
  plannedDeparture?: string;
  plannedArrival?: string;
  modality?: string;
  cancelled?: boolean;
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
