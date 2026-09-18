'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Vehicle = 'okada' | 'keke';
type Payment = 'cash' | 'flutterwave';

export default function Ride() {
  const [session, setSession] = useState<any>(null);
  const [vehicle, setVehicle] = useState<Vehicle>('okada');
  const [payment, setPayment] = useState<Payment>('cash');
  const [pickup, setPickup] = useState('Kaduna, Kaduna State');
  const [destination, setDestination] = useState('');
  const [status, setStatus] = useState('Ready');
  const [ride, setRide] = useState<any>(null);
  const [checkout, setCheckout] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  async function requestRide() {
    if (!session) return setStatus('Please sign in first');
    if (!destination.trim()) return setStatus('Enter your destination');
    setStatus('Matching the nearest verified online driver in Kaduna…');

    const { data, error } = await supabase.rpc('request_ride', {
      p_passenger_id: session.user.id,
      p_vehicle_type: vehicle,
      p_pickup_address: pickup,
      p_destination_address: destination,
      // Kaduna MVP defaults. Live browser GPS/map geocoding will replace these.
      p_pickup_lat: 10.5105,
      p_pickup_long: 7.4165,
      p_destination_lat: 10.5167,
      p_destination_long: 7.4383,
      p_estimated_distance_km: 6,
      p_estimated_duration_minutes: 20,
      p_payment_method: payment
    });

    if (error) return setStatus(error.message);
    setRide(data);
    setStatus(data.status === 'driver_assigned'
      ? 'Driver matched automatically. Your driver has been notified.'
      : 'No verified online driver is close enough yet. Admin has been notified.');

    const channel = supabase
      .channel('ride-' + data.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: 'id=eq.' + data.id },
        (payload) => {
          setRide(payload.new);
          setStatus(payload.new.status === 'driver_assigned'
            ? 'Driver matched automatically.'
            : 'Ride status: ' + payload.new.status);
        })
      .subscribe();

    if (payment === 'flutterwave') {
      const { data: fn, error: fnError } = await supabase.functions.invoke('flutterwave-initiate', {
        body: { ride_id: data.id, redirect_url: window.location.origin + '/ride' }
      });
      if (fnError || !fn?.link) {
        setStatus(fnError?.message || 'Unable to open Flutterwave checkout');
      } else {
        setCheckout(fn.link);
        window.location.href = fn.link;
      }
    }

    return () => { supabase.removeChannel(channel); };
  }

  return (
    <main style={{ maxWidth: 760, margin: '50px auto', padding: 24 }}>
      <h1>GoKeke Kaduna</h1>
      <p>{session ? 'Signed in' : 'Not signed in'}</p>

      <h3>Choose vehicle</h3>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className={'btn ' + (vehicle === 'okada' ? 'lime' : 'dark')} onClick={() => setVehicle('okada')}>Okada</button>
        <button className={'btn ' + (vehicle === 'keke' ? 'lime' : 'dark')} onClick={() => setVehicle('keke')}>Keke</button>
      </div>

      <h3>Trip</h3>
      <input value={pickup} onChange={e => setPickup(e.target.value)} placeholder="Pickup in Kaduna" style={{ width: '100%', padding: 12, marginBottom: 10 }} />
      <input value={destination} onChange={e => setDestination(e.target.value)} placeholder="Where are you going?" style={{ width: '100%', padding: 12 }} />

      <h3>Payment</h3>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className={'btn ' + (payment === 'cash' ? 'lime' : 'dark')} onClick={() => setPayment('cash')}>Cash</button>
        <button className={'btn ' + (payment === 'flutterwave' ? 'lime' : 'dark')} onClick={() => setPayment('flutterwave')}>Card / Transfer</button>
      </div>

      <p>Fare is calculated by the server using the configured Kaduna GoKeke fare rules.</p>
      <button className="btn lime" onClick={requestRide}>Request ride</button>
      <p>{status}</p>
      {checkout && <p>Opening secure Flutterwave checkout…</p>}
      {ride && <pre>{JSON.stringify(ride, null, 2)}</pre>}
    </main>
  );
}
