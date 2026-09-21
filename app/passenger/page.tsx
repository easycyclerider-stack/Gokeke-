'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

type Vehicle = 'okada' | 'keke';
type LatLng = { lat: number; lng: number };

const KADUNA: LatLng = { lat: 10.5105, lng: 7.4165 };

export default function Passenger() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [destinationText, setDestinationText] = useState('');
  const [vehicle, setVehicle] = useState<Vehicle>('okada');
  const [ride, setRide] = useState<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<any>(null);
  const driverMarker = useRef<any>(null);
  const pickupMarker = useRef<any>(null);
  const destinationMarker = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase.auth.getSession();
      if (mounted) setSession(data.session);
    };
    load();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      if (mounted) setSession(next);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session || mapReady || !mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = await import('leaflet');
      if (cancelled || !mapRef.current) return;
      const map = L.map(mapRef.current).setView([KADUNA.lat, KADUNA.lng], 14);
      mapObj.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      map.on('click', (e: any) => {
        const point = { lat: e.latlng.lat, lng: e.latlng.lng };
        if (!pickup) setPickup(point);
        else if (!destination) setDestination(point);
        else setDestination(point);
      });
      setMapReady(true);
      setTimeout(() => map.invalidateSize(), 100);
    })();
    return () => { cancelled = true; };
  }, [session, mapReady, pickup, destination]);

  useEffect(() => {
    if (!mapReady) return;
    (async () => {
      const L = await import('leaflet');
      const map = mapObj.current;
      if (!map) return;
      if (pickup) {
        if (!pickupMarker.current) pickupMarker.current = L.marker([pickup.lat, pickup.lng]).addTo(map);
        else pickupMarker.current.setLatLng([pickup.lat, pickup.lng]);
      } else if (pickupMarker.current) {
        pickupMarker.current.remove(); pickupMarker.current = null;
      }
      if (destination) {
        if (!destinationMarker.current) destinationMarker.current = L.marker([destination.lat, destination.lng]).addTo(map);
        else destinationMarker.current.setLatLng([destination.lat, destination.lng]);
      } else if (destinationMarker.current) {
        destinationMarker.current.remove(); destinationMarker.current = null;
      }
      if (pickup && destination) {
        map.fitBounds([[pickup.lat, pickup.lng], [destination.lat, destination.lng]], { padding: [30, 30] });
      }
    })();
  }, [pickup, destination, mapReady]);

  useEffect(() => {
    return () => {
      if (mapObj.current) mapObj.current.remove();
    };
  }, []);

  async function useGPS() {
    if (!navigator.geolocation) return setMsg('GPS is not available on this device.');
    setMsg('Getting your live location...');
    navigator.geolocation.getCurrentPosition(
      p => {
        setPickup({ lat: p.coords.latitude, lng: p.coords.longitude });
        setMsg('Pickup location set from GPS.');
      },
      e => setMsg(e.message || 'Unable to get GPS location.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  }

  async function requestRide() {
    if (!session) return setMsg('Please sign in first.');
    if (!pickup || !destination) return setMsg('Set both pickup and destination on the map.');
    setBusy(true);
    setMsg('Finding the closest verified online driver...');
    const distanceKm = Math.max(
      1,
      Math.round(
        Math.hypot((destination.lat - pickup.lat) * 111, (destination.lng - pickup.lng) * 109) * 10
      ) / 10
    );
    const { data, error } = await supabase.rpc('request_ride', {
      p_passenger_id: session.user.id,
      p_vehicle_type: vehicle,
      p_pickup_address: 'Selected on Kaduna map',
      p_destination_address: destinationText || 'Selected destination',
      p_pickup_lat: pickup.lat,
      p_pickup_long: pickup.lng,
      p_destination_lat: destination.lat,
      p_destination_long: destination.lng,
      p_estimated_distance_km: distanceKm,
      p_estimated_duration_minutes: Math.max(5, Math.round(distanceKm * 4)),
      p_payment_method: 'flutterwave',
    });
    setBusy(false);
    if (error) return setMsg(error.message);
    const nextRide = Array.isArray(data) ? data[0] : data;
    setRide(nextRide);
    setMsg(nextRide?.driver_id ? 'Driver matched. Tracking is live.' : 'Searching nearby verified drivers...');
  }

  useEffect(() => {
    if (!ride?.id) return;
    const updateDriverMarker = async (row: any) => {
      const coords = row?.location?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2 || !mapObj.current) return;
      const L = await import('leaflet');
      const [lng, lat] = coords;
      if (!driverMarker.current) driverMarker.current = L.marker([lat, lng]).addTo(mapObj.current);
      else driverMarker.current.setLatLng([lat, lng]);
    };
    const channel = supabase
      .channel('passenger-ride-' + ride.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: 'id=eq.' + ride.id },
        ({ new: row }) => setRide(row))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_locations', filter: 'ride_id=eq.' + ride.id },
        ({ new: row }) => updateDriverMarker(row))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ride?.id]);

  async function logout() {
    await supabase.auth.signOut();
    setSession(null);
    setRide(null);
    router.push('/passenger');
  }

  if (!session) {
    return <main style={{ maxWidth: 520, margin: '70px auto', padding: 24 }}>
      <div className="panel">
        <h1>GoKeke Passenger</h1>
        <p>{mode === 'login' ? 'Sign in to book a ride' : 'Create your passenger account'}</p>
        <form onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          setMsg('');
          setBusy(true);
          if (mode === 'login') {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
            if (error) setMsg(error.message);
            else { setSession(data.session); router.push('/passenger'); }
          } else {
            const { data, error } = await supabase.auth.signUp({
              email, password: pw, options: { data: { full_name: name, role: 'passenger' } },
            });
            if (error) setMsg(error.message);
            else if (data.user) {
              await supabase.from('profiles').upsert({ id: data.user.id, full_name: name, role: 'passenger' });
              setMsg(data.session ? 'Account created successfully.' : 'Account created. Check your email to confirm.');
              if (data.session) setSession(data.session);
            }
          }
          setBusy(false);
        }}>
          {mode === 'signup' && <input required placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />}
          <input required type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <input required minLength={8} type="password" placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} />
          <button disabled={busy} className="btn lime">{busy ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        <button className="btn" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'Create account' : 'I already have an account'}
        </button>
        {msg && <p>{msg}</p>}
      </div>
    </main>;
  }

  return <main style={{ maxWidth: 900, margin: '30px auto', padding: 24 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div><h1>GoKeke Kaduna</h1><p>Book and track your Okada or Keke ride.</p></div>
      <button className="btn dark" onClick={logout}>Sign out</button>
    </div>
    <div ref={mapRef} style={{ height: 420, borderRadius: 16, overflow: 'hidden', border: '1px solid #ddd' }} />
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
      <button className="btn" onClick={useGPS}>Use my live GPS</button>
      <button className={'btn ' + (vehicle === 'okada' ? 'lime' : 'dark')} onClick={() => setVehicle('okada')}>Okada</button>
      <button className={'btn ' + (vehicle === 'keke' ? 'lime' : 'dark')} onClick={() => setVehicle('keke')}>Keke</button>
      <button className="btn" onClick={() => { setPickup(null); setDestination(null); setRide(null); setMsg('Map cleared.'); }}>Clear trip</button>
    </div>
    <p>Pickup: {pickup ? pickup.lat.toFixed(5) + ', ' + pickup.lng.toFixed(5) : 'Tap map or use GPS'}</p>
    <input placeholder="Destination name (optional)" value={destinationText} onChange={e => setDestinationText(e.target.value)} />
    <p>Destination: {destination ? destination.lat.toFixed(5) + ', ' + destination.lng.toFixed(5) : 'Tap map after pickup'}</p>
    <button disabled={busy} className="btn lime" onClick={requestRide}>{busy ? 'Requesting...' : 'Request ride'}</button>
    {msg && <p>{msg}</p>}
    {ride && <section className="panel" style={{ marginTop: 16 }}>
      <h2>{String(ride.status || 'ride').replaceAll('_', ' ').toUpperCase()}</h2>
      <p>{ride.driver_id ? 'Driver matched automatically. Follow the live marker on the map.' : 'Matching nearby verified drivers...'}</p>
      {ride.fare_amount != null && <p>Estimated fare: <strong>NGN {Number(ride.fare_amount).toLocaleString()}</strong></p>}
      {ride.status === 'completed' && <p>✓ Ride completed.</p>}
      {ride.status === 'cancelled' && <p>Ride cancelled.</p>}
    </section>}
  </main>;
}