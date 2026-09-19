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
  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [destinationText, setDestinationText] = useState('');
  const [vehicle, setVehicle] = useState<Vehicle>('okada');
  const [ride, setRide] = useState<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<HTMLDivElement | null>(null);\n  const mapObj = useRef<any>(null);\n  const driverMarker = useRef<any>(null);
  const pickupMarker = useRef<any>(null);
  const destinationMarker = useRef<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  useEffect(() => {
    if (!session || mapReady) return;
    let cancelled = false;
    (async () => {
      const L = await import('leaflet');
      if (cancelled || !mapRef.current) return;
      const map = L.map(mapRef.current).setView([KADUNA.lat, KADUNA.lng], 14);\n      mapObj.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      map.on('click', (e: any) => {
        const point = { lat: e.latlng.lat, lng: e.latlng.lng };
        if (!pickup) setPickup(point); else setDestination(point);
      });
      setMapReady(true);
    })();
    return () => { cancelled = true; };
  }, [session, mapReady, pickup]);

  useEffect(() => {
    if (!mapReady) return;
    (async () => {
      const L = await import('leaflet');
      if (mapRef.current && pickup) {
        const map = (mapRef.current as any)._leaflet_map;
      }
      if (pickup && !pickupMarker.current) {
        const map = (mapRef.current as any)?._leaflet_map;
        if (map) pickupMarker.current = L.marker([pickup.lat, pickup.lng]).addTo(map);
      }
    })();
  }, [pickup, destination, mapReady]);

  async function useGPS() {
    if (!navigator.geolocation) return setMsg('GPS is not available on this device.');
    navigator.geolocation.getCurrentPosition(
      p => setPickup({ lat: p.coords.latitude, lng: p.coords.longitude }),
      e => setMsg(e.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  }

  async function requestRide() {
    if (!session) return setMsg('Please sign in first.');
    if (!pickup || !destination) return setMsg('Set both pickup and destination on the map.');
    setMsg('Finding the closest verified online driver in Kaduna...');
    const distanceKm = Math.max(1, Math.round((Math.hypot((destination.lat-pickup.lat)*111, (destination.lng-pickup.lng)*109) * 10)) / 10);
    const { data, error } = await supabase.rpc('request_ride', {
      p_passenger_id: session.user.id, p_vehicle_type: vehicle,
      p_pickup_address: 'Selected on Kaduna map', p_destination_address: destinationText || 'Selected destination',
      p_pickup_lat: pickup.lat, p_pickup_long: pickup.lng,
      p_destination_lat: destination.lat, p_destination_long: destination.lng,
      p_estimated_distance_km: distanceKm, p_estimated_duration_minutes: Math.max(5, Math.round(distanceKm * 4)),
      p_payment_method: 'flutterwave'
    });
    if (error) return setMsg(error.message);
    setRide(data);
    setMsg(data?.driver_id ? 'Driver matched. Tracking is live.' : 'Searching nearby verified drivers...');
  }

  useEffect(() => {
    if (!ride?.id) return;
    const rideChannel = supabase.channel('passenger-ride-' + ride.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: 'id=eq.' + ride.id },
        ({ new: row }) => setRide(row))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_locations', filter: 'ride_id=eq.' + ride.id },
        ({ new: row }) => { setRide((old: any) => ({ ...old, live_location: row })); if (mapObj.current) { import('leaflet').then(L => { const coords = row.location?.coordinates; if (!coords) return; const [lng,lat] = coords; if (!driverMarker.current) driverMarker.current = L.marker([lat,lng]).addTo(mapObj.current); else driverMarker.current.setLatLng([lat,lng]); }); } })
      .subscribe();
    return () => { supabase.removeChannel(rideChannel); };
  }, [ride?.id]);

  if (!session) return <main style={{maxWidth:520,margin:'70px auto',padding:24}}><div className="panel"><h1>GoKeke Passenger</h1><p>{mode==='login'?'Sign in to book a ride':'Create your passenger account'}</p><form onSubmit={async(e:FormEvent)=>{e.preventDefault();setMsg('');if(mode==='login'){const{x,error}=await supabase.auth.signInWithPassword({email,password:pw});if(error)setMsg(error.message);else{setS(x.session);router.push('/passenger')}}else{const{x,error}=await supabase.auth.signUp({email,password:pw,options:{data:{full_name:name,role:'passenger'}}});if(error)setMsg(error.message);else if(x.user){await supabase.from('profiles').upsert({id:x.user.id,full_name:name,role:'passenger'});setMsg('Account created. Check email confirmation if enabled.')}}}}>{mode==='signup'&&<input required placeholder="Full name" value={name} onChange={e=>setName(e.target.value)}/>}<input required type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/><input required minLength={8} type="password" placeholder="Password" value={pw} onChange={e=>setPw(e.target.value)}/><button className="btn lime">{mode==='login'?'Sign in':'Create account'}</button></form><button className="btn" onClick={()=>setMode(mode==='login'?'signup':'login')}>{mode==='login'?'Create account':'I already have an account'}</button>{msg&&<p>{msg}</p>}</div></main>;

  return <main style={{maxWidth:900,margin:'30px auto',padding:24}}>
    <h1>GoKeke Kaduna</h1><p>Live pickup and destination map</p>
    <div ref={mapRef} style={{height:420,borderRadius:16,overflow:'hidden',border:'1px solid #ddd'}} />
    <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:12}}>
      <button className="btn" onClick={useGPS}>Use my live GPS</button>
      <button className={'btn '+(vehicle==='okada'?'lime':'dark')} onClick={()=>setVehicle('okada')}>Okada</button>
      <button className={'btn '+(vehicle==='keke'?'lime':'dark')} onClick={()=>setVehicle('keke')}>Keke</button>
    </div>
    <p>Pickup: {pickup ? pickup.lat.toFixed(5)+', '+pickup.lng.toFixed(5) : 'Tap map or use GPS'}</p>
    <input placeholder="Destination name (optional)" value={destinationText} onChange={e=>setDestinationText(e.target.value)}/>
    <p>Destination: {destination ? destination.lat.toFixed(5)+', '+destination.lng.toFixed(5) : 'Tap map after pickup'}</p>
    <button className="btn lime" onClick={requestRide}>Request ride</button>
    {msg&&<p>{msg}</p>}
    {ride&&<section className="panel" style={{marginTop:16}}><h2>{ride.status}</h2><p>{ride.driver_id?'Driver matched automatically.':'Matching nearby drivers...'}</p>{ride.live_location&&<p>Driver GPS: {JSON.stringify(ride.live_location)}</p>}</section>}
  </main>;
}