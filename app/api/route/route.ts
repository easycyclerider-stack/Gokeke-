import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fromLat = Number(searchParams.get('fromLat'));
  const fromLng = Number(searchParams.get('fromLng'));
  const toLat = Number(searchParams.get('toLat'));
  const toLng = Number(searchParams.get('toLng'));
  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
  const base = process.env.ROUTING_API_URL || 'https://router.project-osrm.org';
  const url = new URL('/route/v1/driving/' + fromLng + ',' + fromLat + ';' + toLng + ',' + toLat, base);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('steps', 'false');
  const response = await fetch(url, { next: { revalidate: 30 } });
  if (!response.ok) return NextResponse.json({ error: 'Routing provider unavailable' }, { status: 502 });
  const data = await response.json();
  const route = data?.routes?.[0];
  if (!route?.geometry?.coordinates?.length) return NextResponse.json({ error: 'No route found' }, { status: 404 });
  return NextResponse.json({
    distance_km: Number(route.distance || 0) / 1000,
    duration_minutes: Number(route.duration || 0) / 60,
    geometry: route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]),
  });
}