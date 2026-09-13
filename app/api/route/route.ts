export const runtime = "edge";

type Coordinate = { latitude: number; longitude: number };

export async function POST(request: Request) {
  let body: { coordinates?: Coordinate[] };
  try { body = await request.json() as { coordinates?: Coordinate[] }; }
  catch { return Response.json({ error: "Expected route coordinates." }, { status: 400 }); }

  const coordinates = Array.isArray(body.coordinates) ? body.coordinates.slice(0, 12) : [];
  if (!coordinates.length || coordinates.some((point) => !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || point.latitude < -90 || point.latitude > 90 || point.longitude < -180 || point.longitude > 180)) {
    return Response.json({ error: "Valid route coordinates are required." }, { status: 422 });
  }
  if (coordinates.length === 1) return Response.json({ coordinates: [[coordinates[0].latitude, coordinates[0].longitude]], distanceMeters: 0, durationSeconds: 0, source: "single-stop" });

  const waypoints = coordinates.map((point) => `${point.longitude},${point.latitude}`).join(";");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson&steps=false`, {
      headers: { "User-Agent": "RoadLens-Dushanbe/1.0" }, signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Routing returned ${response.status}`);
    const payload = await response.json() as { routes?: Array<{ distance: number; duration: number; geometry: { coordinates: number[][] } }> };
    const route = payload.routes?.[0];
    if (!route?.geometry?.coordinates?.length) throw new Error("No road route returned");
    return Response.json({ coordinates: route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]), distanceMeters: route.distance, durationSeconds: route.duration, source: "road-network" }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (error) {
    console.error("Road routing unavailable", error);
    return Response.json({ error: "Road routing is temporarily unavailable." }, { status: 503 });
  } finally { clearTimeout(timeout); }
}
