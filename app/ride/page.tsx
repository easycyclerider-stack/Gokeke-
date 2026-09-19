'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Vehicle = 'okada' | 'keke';
type Payment = 'cash' | 'flutterwave';

export default function Ride() {
  const [session, setSession] = useState<any>(null);
  const [vehicle, setVehicle] = useState<Vehicle>('okada');
  const [payment, setPayment] = useState<Payment>('cash');
  const [pickup, setPickup] = useState('Kaduna');
  const [destination, setDestination] = useState('');
  const [pickupLat, setPickupLat] = useState(10.5105);
  const [pickupLng, setPickupLng] = useState(7.4165);
  const [destinationLat, setDestinationLat] = useState(10.5167);
  const [destinationLng, setDestinationLng] = useState(7.4383);
  const [status, setStatus] = useState('Ready');
  const [ride, setRide] = useState<any>(null);
  const watchRef = useRef<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => {
      data.subscription.unsubscribe();
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  function useMyLocation() {
    if (!navigator.geolocation) return setStatus('GPS is not available on this device');
    setStatus('Getting your Kaduna GPS location…');
    navigator.geolocation.getCurrentPosition(
      p => { setPickupLat(p.coords.latitude); setPickupLng(p.coords.longitude); setPickup('Current location'); setStatus('Pickup location updated'); },
      e => setStatus('GPS error: ' + e.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  }

  function trackPassengerLocation(rideId: string) {
    if (!navigator.geolocation) return;
    watchRef.current = navigator.geolocation.watchPosition(async p => {
      await supabase.from('ride_locations').insert({
        ride_id: rideId, actor_id: session?.user.id, latitude: p.coords.latitude,
        longitude: p.coords.longitude, accuracy_meters: p.coords.accuracy,
        heading: p.coords.heading, speed_mps: p.coords.speed
      });
    }, () => {}, { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 });
  }

  async function requestRide() {
    if (!session) return setStatus('Please sign in first');
    if (!destination.trim()) return setStatus('Enter your destination');
    setStatus('Finding your location and matching a verified nearby Kaduna driver…');
    const { data, error } = await supabase.rpc('request_ride', {
      p_passenger_id: session.user.id, p_vehicle_type: vehicle,
      p_pickup_address: pickup, p_destination_address: destination,
      p_pickup_lat: pickupLat, p_pickup_long: pickupLng,
      p_destination_lat: destinationLat, p_destination_long: destinationLng,
      p_estimated_distance_km: 6, p_estimated_duration_minutes: 20, p_payment_method: payment
    });
    if (error) return setStatus(error.message);
    setRide(data);
    trackPassengerLocation(data.id);
    const channel = supabase.channel('ride-' + data.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: 'id=eq.' + data.id },
        payload => { setRide(payload.new); setStatus(payload.new.status === 'driver_assigned' ? 'Driver matched. Live trip tracking is active.' : 'Ride status: ' + payload.new.status); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_locations', filter: 'ride_id=eq.' + data.id },
        payload => { if (payload.new.actor_id !== session.user.id) setStatus('Driver location updated — live tracking active'); })
      .subscribe();
    if (payment === 'flutterwave') {
      const { data: fn, error: fnError } = await supabase.functions.invoke('flutterwave-initiate', { body: { ride_id: data.id, redirect_url: window.location.origin + '/ride' } });
      if (!fnError && fn?.link) window.location.href = fn.link;
      else if (fnError) setStatus(fnError.message);
    }
    return () => { supabase.removeChannel(channel); };
  }

  return <main style={{ maxWidth: 760, margin: '40px auto', padding: 24 }}>
    <h1>GoKeke Kaduna</h1>
    <p>{session ? 'Passenger signed in' : 'Please sign in'}</p>
    <button className="btn dark" onClick={useMyLocation}>Use my GPS location</button>
    <p>Pickup: {pickup} ({pickupLat.toFixed(5)}, {pickupLng.toFixed(5)})</p>
    <input value={destination} onChange={e => setDestination(e.target.value)} placeholder="Where are you going in Kaduna?" style={{ width:'100%', padding:12 }} />
    <p>Destination coordinates: {destinationLat.toFixed(5)}, {destinationLng.toFixed(5)}</p>
    <h3>Vehicle</h3>
    <button className={'btn '+(vehicle==='okada'?'lime':'dark')} onClick={()=>setVehicle('okada')}>Okada</button>
    <button className={'btn '+(vehicle==='keke'?'lime':'dark')} onClick={()=>setVehicle('keke')}>Keke</button>
    <h3>Payment</h3>
    <button className={'btn '+(payment==='cash'?'lime':'dark')} onClick={()=>setPayment('cash')}>Cash</button>
    <button className={'btn '+(payment==='flutterwave'?'lime':'dark')} onClick={()=>setPayment('flutterwave')}>Card / Transfer</button>
    <p>Server-side fare + nearest verified online driver matching.</p>
    <button className="btn lime" onClick={requestRide}>Request ride</button>
    <p>{status}</p>
    {ride && <pre>{JSON.stringify(ride, null, 2)}</pre>}
  </main>;
}
