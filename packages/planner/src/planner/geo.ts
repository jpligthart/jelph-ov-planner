const EARTH_RADIUS_M = 6_371_000;
/** Average walking speed used for first/last mile estimates. */
export const WALK_METERS_PER_MINUTE = 80;

export function haversineMeters(
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
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function walkMinutes(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return 0;
  return Math.ceil(meters / WALK_METERS_PER_MINUTE);
}
