export const runtime = "edge";

import { isWithinDushanbe } from "../../../lib/dushanbe.ts";

type Coordinate = { latitude: number; longitude: number };

function isCoordinate(point: unknown): point is Coordinate {
  if (!point || typeof point !== "object") return false;
  const candidate = point as Partial<Coordinate>;
  return isWithinDushanbe(candidate.latitude, candidate.longitude);
}

export async function POST(request: Request) {
  let body: { coordinates?: Coordinate[] };
  try { body = await request.json() as { coordinates?: Coordinate[] }; }
  catch { return Response.json({ error: "Expected route coordinates." }, { status: 400 }); }

  const coordinates = Array.isArray(body.coordinates) ? body.coordinates : [];
  if (!coordinates.length || coordinates.length > 12 || !coordinates.every(isCoordinate)) {
    return Response.json({ error: "Valid route coordinates are required." }, { status: 422 });
  }
  if (coordinates.length === 1) return Response.json({ coordinates: [[coordinates[0].latitude, coordinates[0].longitude]], distanceMeters: 0, durationSeconds: 0, source: "single-stop" });

  const waypoints = coordinates.map((point) => `${point.longitude},${point.latitude}`).join(";");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson&steps=false`, {
      headers: { "User-Agent": "RoadLens-Dushanbe/1.0", Accept: "application/json" }, signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Routing returned ${response.status}`);
    const payload = await response.json() as { routes?: Array<{ distance: number; duration: number; geometry: { coordinates: number[][] } }> };
    const route = payload.routes?.[0];
    if (!route?.geometry?.coordinates?.length || !Number.isFinite(route.distance) || route.distance < 0 || !Number.isFinite(route.duration) || route.duration < 0 || route.geometry.coordinates.some((point) => point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || point[0] < -180 || point[0] > 180 || point[1] < -90 || point[1] > 90)) throw new Error("Invalid road route returned");
    return Response.json({ coordinates: route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]), distanceMeters: route.distance, durationSeconds: route.duration, source: "road-network" }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (error) {
    console.error("Road routing unavailable", error);
    return Response.json({ error: "Road routing is temporarily unavailable." }, { status: 503 });
  } finally { clearTimeout(timeout); }
}
