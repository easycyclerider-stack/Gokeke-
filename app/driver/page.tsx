'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Vehicle = 'okada' | 'keke';

export default function Driver() {
  const [session, setSession] = useState<any>(null);
  const [vehicle, setVehicle] = useState<Vehicle>('okada');
  const [online, setOnline] = useState(false);
  const [msg, setMsg] = useState('Offline');
  const [offers, setOffers] = useState<any[]>([]);
  const [ride, setRide] = useState<any>(null);
  const watchId = useRef<number | null>(null);
  const rideId = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  async function sendLocation(position: GeolocationPosition) {
    const { latitude, longitude, accuracy, heading, speed } = position.coords;
    const activeRide = rideId.current;
    if (activeRide) {
      await supabase.rpc('record_ride_driver_location', {
        p_ride_id: activeRide, p_lat: latitude, p_long: longitude,
        p_accuracy_meters: accuracy, p_heading: heading, p_speed_mps: speed
      });
    } else if (online) {
      const { error } = await supabase.rpc('update_driver_live_location', {
        p_lat: latitude, p_long: longitude,
        p_accuracy_meters: accuracy, p_heading: heading, p_speed_mps: speed
      });
      if (error) setMsg(error.message);
    }
  }

  async function toggleOnline() {
    if (!session) return setMsg('Sign in first.');
    if (!online) {
      if (!navigator.geolocation) return setMsg('GPS is unavailable.');
      setMsg('Starting GPS...');
      const { error } = await supabase.from('drivers').update({ is_online: true }).eq('id', session.user.id);
      if (error) return setMsg(error.message);
      setOnline(true); setMsg('Online — waiting for Kaduna rides.');
      watchId.current = navigator.geolocation.watchPosition(sendLocation, e => setMsg(e.message), {
        enableHighAccuracy: true, maximumAge: 5000, timeout: 15000
      });
    } else {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      await supabase.from('drivers').update({ is_online: false }).eq('id', session.user.id);
      setOnline(false); setMsg('Offline');
    }
  }

  useEffect(() => {
    if (!session || !online) return;
    const channel = supabase.channel('driver-offers-' + session.user.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'ride_offers',
        filter: 'driver_id=eq.' + session.user.id
      }, async ({ new: offer }) => {
        const { data } = await supabase.from('ride_offers').select('*').eq('id', offer.id).single();
        if (data) setOffers(old => [data, ...old]);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, online]);

  async function accept(offer: any) {
    setMsg('Accepting ride...');
    const { data: vehicles } = await supabase.from('vehicles').select('id').eq('driver_id', session.user.id).eq('type', vehicle).eq('is_active', true).limit(1);
    const vehicleId = vehicles?.[0]?.id;
    if (!vehicleId) return setMsg('No active vehicle registered for this vehicle type.');
    const { data, error } = await supabase.rpc('accept_ride', {
      p_ride_id: offer.ride_id, p_driver_id: session.user.id, p_vehicle_id: vehicleId
    });
    if (error) return setMsg(error.message);
    setRide(data); rideId.current = data.id;
    setOffers([]);
    setMsg('Ride accepted. Live GPS tracking is active.');
  }

  useEffect(() => {
    if (!ride?.id) return;
    const channel = supabase.channel('driver-ride-' + ride.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: 'id=eq.' + ride.id },
        ({ new: row }) => setRide(row))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ride?.id]);

  if (!session) return <main style={{maxWidth:600,margin:'70px auto',padding:24}}><div className="panel"><h1>GoKeke Driver</h1><p>Please sign in through the driver account.</p></div></main>;

  return <main style={{maxWidth:800,margin:'30px auto',padding:24}}>
    <h1>GoKeke Driver — Kaduna</h1>
    <p>{online ? '🟢 Online — GPS sharing active' : '⚪ Offline'}</p>
    <div style={{display:'flex',gap:10}}>
      <button className={'btn '+(vehicle==='okada'?'lime':'dark')} onClick={()=>setVehicle('okada')}>Okada</button>
      <button className={'btn '+(vehicle==='keke'?'lime':'dark')} onClick={()=>setVehicle('keke')}>Keke</button>
      <button className="btn lime" onClick={toggleOnline}>{online?'Go offline':'Go online'}</button>
    </div>
    <p>{msg}</p>
    {offers.map(o => <div className="panel" key={o.id} style={{marginTop:12}}>
      <h3>New nearby {vehicle} request</h3>
      <p>Pickup distance: {Math.round(Number(o.distance_meters || 0))} m</p>
      <button className="btn lime" onClick={()=>accept(o)}>Accept ride</button>
    </div>)}
    {ride && <div className="panel" style={{marginTop:20}}>
      <h2>Active ride</h2>
      <p>Status: {ride.status}</p>
      <p>Pickup: {ride.pickup_address}</p>
      <p>Destination: {ride.destination_address}</p>
      <p>GPS updates are being sent automatically while this ride is active.</p>
    </div>}
  </main>;
}