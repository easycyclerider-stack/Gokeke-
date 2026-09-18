'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type VehicleType = 'okada' | 'keke';

export default function Driver() {
  const [session, setSession] = useState<any>(null);
  const [driver, setDriver] = useState<any>(null);
  const [vehicleType, setVehicleType] = useState<VehicleType>('okada');
  const [online, setOnline] = useState(false);
  const [rides, setRides] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [earnings, setEarnings] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (!data.session) return;
      const id = data.session.user.id;
      const { data: driverRow } = await supabase.from('drivers').select('*').eq('id', id).maybeSingle();
      if (!mounted) return;
      setDriver(driverRow);
      setOnline(!!driverRow?.is_online);
      const { data: earningRows } = await supabase.from('driver_earnings_daily').select('*').eq('driver_id', id).order('day', { ascending: false }).limit(14);
      setEarnings(earningRows || []);
      const { data: rideRows } = await supabase.from('rides').select('*').eq('status', 'requested').eq('vehicle_type', vehicleType).order('created_at', { ascending: false });
      setRides(rideRows || []);
    });
    return () => { mounted = false; };
  }, [vehicleType]);

  useEffect(() => {
    if (!online) return;
    const channel = supabase.channel('driver-requests').on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'rides', filter: 'status=eq.requested'
    }, (payload) => {
      if (payload.new.vehicle_type === vehicleType) setRides((current) => [payload.new, ...current]);
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [online, vehicleType]);

  async function toggleOnline() {
    if (!driver || driver.status !== 'approved') {
      setMessage('Admin approval is required before going online.');
      return;
    }
    const next = !online;
    const { error } = await supabase.from('drivers').update({ is_online: next }).eq('id', session.user.id);
    if (error) setMessage(error.message);
    else setOnline(next);
  }

  async function acceptRide(ride: any) {
    if (!driver) return;
    const { data: vehicle } = await supabase.from('vehicles').select('id').eq('driver_id', driver.id).eq('type', vehicleType).eq('is_active', true).limit(1).maybeSingle();
    if (!vehicle) {
      setMessage('Add an active vehicle first.');
      return;
    }
    const result = await supabase.rpc('accept_ride', {
      p_ride_id: ride.id, p_driver_id: driver.id, p_vehicle_id: vehicle.id
    });
    if (result.error) setMessage(result.error.message);
    else {
      setActive(result.data);
      setRides((current) => current.filter((item) => item.id !== ride.id));
      setMessage('Ride accepted.');
    }
  }

  async function startTrip() {
    if (!active || !driver) return;
    const result = await supabase.rpc('update_ride_status', {
      p_ride_id: active.id, p_actor_id: driver.id, p_status: 'in_progress', p_reason: null
    });
    if (result.error) setMessage(result.error.message);
    else setActive(result.data);
  }

  async function completeTrip() {
    if (!active || !driver) return;
    const result = await supabase.rpc('complete_ride_and_record_earnings', {
      p_ride_id: active.id, p_driver_id: driver.id, p_final_fare: Number(active.estimated_fare || 0)
    });
    if (result.error) {
      setMessage(result.error.message);
      return;
    }
    setActive(null);
    setMessage('Trip completed and earnings recorded.');
    const { data: earningRows } = await supabase.from('driver_earnings_daily').select('*').eq('driver_id', driver.id).order('day', { ascending: false }).limit(14);
    setEarnings(earningRows || []);
  }

  async function uploadDocument(field: string, file: File) {
    if (!session) return;
    const path = session.user.id + '/' + field + '-' + Date.now() + '-' + file.name;
    const result = await supabase.storage.from('driver-documents').upload(path, file);
    if (result.error) {
      setMessage(result.error.message);
      return;
    }
    await supabase.from('drivers').update({ [field]: path }).eq('id', session.user.id);
    setDriver({ ...driver, [field]: path });
    setMessage('Document uploaded.');
  }

  return (
    <main style={{ maxWidth: 1050, margin: 'auto', padding: 30 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div><h1>GoKeke Driver</h1><p>Verification · Trips · Earnings</p></div>
        <button className={'btn ' + (online ? 'dark' : 'lime')} onClick={toggleOnline}>{online ? 'Go offline' : 'Go online'}</button>
      </header>

      {!driver ? (
        <section className="panel"><h2>Driver registration</h2><p>Sign in first to register.</p></section>
      ) : (
        <>
          <section className="panel">
            <h2>Verification: {driver.status}</h2>
            <p>Admin approval is required before receiving trips.</p>
            <label>ID document <input type="file" accept="image/*,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadDocument('id_document_url', file); }} /></label>
            <br />
            <label>Licence <input type="file" accept="image/*,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadDocument('license_document_url', file); }} /></label>
          </section>

          <section className="panel" style={{ marginTop: 16 }}>
            <h2>Vehicle</h2>
            <button className={'btn ' + (vehicleType === 'okada' ? 'lime' : 'dark')} onClick={() => setVehicleType('okada')}>Okada</button>{' '}
            <button className={'btn ' + (vehicleType === 'keke' ? 'lime' : 'dark')} onClick={() => setVehicleType('keke')}>Keke</button>
            <p>An active vehicle is required to accept rides.</p>
          </section>

          {active && (
            <section className="panel" style={{ marginTop: 16 }}>
              <h2>Active trip</h2>
              <p>{active.pickup_address} → {active.destination_address}</p>
              <p>Fare: ₦{active.estimated_fare}</p>
              {active.status === 'driver_assigned' && <button className="btn lime" onClick={startTrip}>Start trip</button>}
              {active.status === 'in_progress' && <button className="btn lime" onClick={completeTrip}>Complete trip</button>}
            </section>
          )}

          <section className="panel" style={{ marginTop: 16 }}>
            <h2>Nearby requests</h2>
            {online && rides.map((ride) => (
              <div key={ride.id} style={{ padding: 14, borderTop: '1px solid #ddd' }}>
                <b>₦{ride.estimated_fare}</b>
                <p>{ride.pickup_address} → {ride.destination_address}</p>
                <button className="btn lime" onClick={() => acceptRide(ride)}>Accept</button>
              </div>
            ))}
            {!online && <p>Go online to receive requests.</p>}
          </section>

          <section className="panel" style={{ marginTop: 16 }}>
            <h2>Earnings</h2>
            {earnings.map((earning) => (
              <div key={earning.id} style={{ padding: 10, borderTop: '1px solid #ddd' }}>
                {earning.day}: <b>₦{Number(earning.net_earnings).toLocaleString()}</b> · {earning.rides_completed} trips
              </div>
            ))}
          </section>
        </>
      )}
      {message && <p>{message}</p>}
    </main>
  );
}
