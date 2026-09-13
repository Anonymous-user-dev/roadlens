export const DUSHANBE_BOUNDS = {
  south: 38.39,
  north: 38.78,
  west: 68.53,
  east: 69.04,
} as const;

export function isWithinDushanbe(latitude: unknown, longitude: unknown) {
  return typeof latitude === "number" && Number.isFinite(latitude)
    && typeof longitude === "number" && Number.isFinite(longitude)
    && latitude >= DUSHANBE_BOUNDS.south && latitude <= DUSHANBE_BOUNDS.north
    && longitude >= DUSHANBE_BOUNDS.west && longitude <= DUSHANBE_BOUNDS.east;
}
