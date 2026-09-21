'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import Notifications from '../../components/Notifications';

type Vehicle = 'okada' | 'keke';
type Point = [number, number];

const nextStatus: Record<string, string> = {
  driver_assigned: 'driver_arriving',
  driver_arriving: 'driver_waiting',
  driver_waiting: 'in_progress',
};

export default function Driver() {
  const [session, setSession] = useState<any>(null);
  const [verification, setVerification] = useState<any>(null);
  const [vehicle, setVehicle] = useState<Vehicle>('okada');
  const [online, setOnline] = useState(false);
  const [msg, setMsg] = useState('Offline');
  const [offers, setOffers] = useState<any[]>([]);
  const [ride, setRide] = useState<any>(null);
  const [fare, setFare] = useState('');
  const [sos, setSos] = useState(false);
  const [passenger, setPassenger] = useState<Point | null>(null);
  const [driverPos, setDriverPos] = useState<Point | null>(null);
  const [navRoute, setNavRoute] = useState<Point[]>([]);
  const [navInfo, setNavInfo] = useState<any>(null);
  const [earnings, setEarnings] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authBusy, setAuthBusy] = useState(false);

  const watchId = useRef<number | null>(null);
  const rideId = useRef<string | null>(null);
  const map = useRef<any>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const marks = useRef<any[]>([]);

  async function loadVerification(uid: string) {
    const [{ data: d }, { data: v }] = await Promise.all([
      supabase.from('drivers').select('status,license_number,license_document_url,id_document_url').eq('id', uid).maybeSingle(),
      supabase.from('vehicles').select('is_active,photo_url,type').eq('driver_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setVerification({ d, v });
  }

  async function loadDriver(uid: string) {
    await loadVerification(uid);
    const { data } = await supabase
      .from('rides')
      .select('*')
      .eq('driver_id', uid)
      .in('status', ['driver_assigned', 'driver_arriving', 'driver_waiting', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setRide(data);
      rideId.current = data.id;
    }
  }

  useEffect(() => {
    let channel: any;
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (mounted && data.session) {
        setSession(data.session);
        await loadDriver(data.session.user.id);
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, next) => {
      if (!mounted) return;
      setSession(next);
      if (next) await loadDriver(next.user.id);
      else {
        setVerification(null);
        setRide(null);
        setOffers([]);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      if (map.current) map.current.remove();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    const uid = session.user.id;
    const channel = supabase
      .channel('driver-verification-' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers', filter: 'id=eq.' + uid }, () => loadVerification(uid))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles', filter: 'driver_id=eq.' + uid }, () => loadVerification(uid))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session || !online) return;
    const channel = supabase
      .channel('offers-' + session.user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_offers', filter: 'driver_id=eq.' + session.user.id }, ({ new: offer }) => {
        setOffers(current => [offer, ...current.filter(x => x.id !== offer.id)]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id, online]);

  useEffect(() => {
    if (!ride?.id) return;
    const channel = supabase
      .channel('driver-ride-' + ride.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: 'id=eq.' + ride.id }, ({ new: row }) => {
        setRide(row);
        if (['completed', 'cancelled'].includes(row.status)) {
          rideId.current = null;
          setPassenger(null);
          setFare('');
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_locations', filter: 'ride_id=eq.' + ride.id }, ({ new: row }) => {
        if (row.actor_id !== session?.user?.id && row.latitude != null && row.longitude != null) {
          setPassenger([Number(row.latitude), Number(row.longitude)]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ride?.id, session?.user?.id]);

  useEffect(() => {
    if (!mapEl.current || map.current) return;
    let active = true;
    (async () => {
      const L = await import('leaflet');
      if (!active || !mapEl.current) return;
      map.current = L.map(mapEl.current).setView([10.5105, 7.4165], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map.current);
      setTimeout(() => map.current?.invalidateSize(), 100);
    })();
    return () => { active = false; };
  }, [ride?.id]);

  useEffect(() => {
    (async () => {
      if (!map.current) return;
      const L = await import('leaflet');
      marks.current.forEach(marker => marker.remove());
      marks.current = [];
      if (driverPos) marks.current.push(L.circleMarker(driverPos, { radius: 10 }).addTo(map.current).bindPopup('You'));
      if (passenger) marks.current.push(L.circleMarker(passenger, { radius: 10 }).addTo(map.current).bindPopup('Passenger'));
      if (navRoute.length) marks.current.push(L.polyline(navRoute, { weight: 5 }).addTo(map.current));
      const focus = passenger || driverPos;
      if (focus) map.current.setView(focus, 15);
    })();
  }, [driverPos, passenger, navRoute]);

  useEffect(() => {
    if (!driverPos || !ride) return;
    let target: Point | null = null;
    if (ride.status === 'driver_arriving' && passenger) target = passenger;
    if (ride.status === 'in_progress') {
      if (ride.destination_latitude != null && ride.destination_longitude != null) {
        target = [Number(ride.destination_latitude), Number(ride.destination_longitude)];
      } else if (ride.destination_location?.coordinates) {
        const [lng, lat] = ride.destination_location.coordinates;
        target = [Number(lat), Number(lng)];
      }
    }
    if (!target) return;
    (async () => {
      try {
        const r = await fetch('/api/route?fromLat=' + driverPos[0] + '&fromLng=' + driverPos[1] + '&toLat=' + target![0] + '&toLng=' + target![1]);
        const j = await r.json();
        if (r.ok) { setNavRoute(j.geometry || []); setNavInfo(j); }
      } catch {
        setNavRoute([]);
        setNavInfo(null);
      }
    })();
  }, [driverPos, passenger, ride?.status, ride?.destination_latitude, ride?.destination_longitude]);

  async function sendLocation(position: GeolocationPosition) {
    const c = position.coords;
    const point: Point = [c.latitude, c.longitude];
    setDriverPos(point);
    const fn = rideId.current ? 'record_ride_driver_location' : online ? 'update_driver_live_location' : null;
    if (!fn) return;
    const { error } = await supabase.rpc(fn, rideId.current
      ? { p_ride_id: rideId.current, p_lat: c.latitude, p_long: c.longitude, p_accuracy_meters: c.accuracy, p_heading: c.heading, p_speed_mps: c.speed }
      : { p_lat: c.latitude, p_long: c.longitude, p_accuracy_meters: c.accuracy, p_heading: c.heading, p_speed_mps: c.speed });
    if (error) setMsg(error.message);
  }

  async function toggleOnline() {
    if (!session) return setMsg('Please sign in first.');
    if (!online) {
      if (!navigator.geolocation) return setMsg('GPS is unavailable.');
      const ready = verification?.d?.status === 'approved' &&
        !!verification.d.license_number &&
        !!verification.d.license_document_url &&
        !!verification.d.id_document_url &&
        verification?.v?.is_active;
      if (!ready) return setMsg('Complete driver verification and activate an approved vehicle first.');
      const { error } = await supabase.rpc('set_driver_online', { p_online: true });
      if (error) return setMsg(error.message);
      setOnline(true);
      setMsg('Online — GPS active.');
      watchId.current = navigator.geolocation.watchPosition(
        sendLocation,
        e => setMsg(e.message || 'GPS error'),
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
      );
    } else {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      const { error } = await supabase.rpc('set_driver_online', { p_online: false });
      if (error) return setMsg(error.message);
      setOnline(false);
      setMsg('Offline.');
    }
  }

  async function accept(offer: any) {
    if (!session) return;
    const { data: vehicles, error: vehicleError } = await supabase.from('vehicles').select('id').eq('driver_id', session.user.id).eq('type', vehicle).eq('is_active', true).limit(1);
    if (vehicleError) return setMsg(vehicleError.message);
    if (!vehicles?.[0]) return setMsg('No active vehicle registered for ' + vehicle + '.');
    const { data, error } = await supabase.rpc('accept_ride', { p_ride_id: offer.ride_id, p_driver_id: session.user.id, p_vehicle_id: vehicles[0].id });
    if (error) return setMsg(error.message);
    setRide(Array.isArray(data) ? data[0] : data);
    rideId.current = Array.isArray(data) ? data[0]?.id : data?.id;
    setOffers([]);
    setMsg('Ride accepted.');
  }

  async function advance() {
    if (!ride) return;
    const status = nextStatus[ride.status];
    if (!status) return;
    const { data, error } = await supabase.rpc('update_ride_status', { p_ride_id: ride.id, p_status: status });
    if (error) return setMsg(error.message);
    setRide(Array.isArray(data) ? data[0] : data);
  }

  async function cancel() {
    if (!ride) return;
    const { data, error } = await supabase.rpc('cancel_active_ride', { p_ride_id: ride.id, p_reason: 'Driver cancelled' });
    if (error) return setMsg(error.message);
    setRide(data?.ride || data);
    rideId.current = null;
    setPassenger(null);
    setMsg('Ride cancelled.');
  }

  async function complete() {
    if (!ride || !session) return;
    const amount = Number(fare);
    if (!amount || amount <= 0) return setMsg('Enter a valid final fare.');
    const { data, error } = await supabase.rpc('complete_ride_and_record_earnings', { p_ride_id: ride.id, p_driver_id: session.user.id, p_final_fare: amount });
    if (error) return setMsg(error.message);
    setRide(Array.isArray(data) ? data[0] : data);
    rideId.current = null;
    setPassenger(null);
    setFare('');
    await loadEarnings();
    setMsg('Trip completed and earnings recorded.');
  }

  async function loadEarnings() {
    if (!session) return;
    const { data, error } = await supabase.from('driver_earnings_daily').select('*').eq('driver_id', session.user.id).order('day', { ascending: false }).limit(30);
    if (error) setMsg(error.message);
    else setEarnings(data || []);
  }

  async function sendSOS() {
    if (!ride) return;
    navigator.geolocation.getCurrentPosition(async position => {
      const { error } = await supabase.rpc('raise_driver_sos', {
        p_ride_id: ride.id,
        p_message: 'Driver emergency alert',
        p_latitude: position.coords.latitude,
        p_longitude: position.coords.longitude,
      });
      setSos(!error);
      setMsg(error ? error.message : 'SOS sent to GoKeke admin.');
    }, () => setMsg('GPS unavailable.'), { enableHighAccuracy: true, timeout: 5000 });
  }

  async function authenticate(e: FormEvent) {
    e.preventDefault();
    setAuthBusy(true);
    setMsg('');
    if (authMode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, role: 'driver' } },
      });
      if (error) setMsg(error.message);
      else if (data.user) {
        const { error: profileError } = await supabase.from('profiles').upsert({ id: data.user.id, full_name: fullName, role: 'driver' });
        if (profileError) setMsg(profileError.message);
        else setMsg(data.session ? 'Driver account created.' : 'Account created. Check your email to confirm.');
      }
    }
    setAuthBusy(false);
  }

  async function logout() {
    if (online) await supabase.rpc('set_driver_online', { p_online: false });
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    await supabase.auth.signOut();
    setOnline(false);
    setSession(null);
  }

  useEffect(() => {
    if (session) loadEarnings();
  }, [session?.user?.id]);

  if (!session) {
    return (
      <main style={{ maxWidth: 520, margin: '70px auto', padding: 24 }}>
        <div className="panel">
          <h1>GoKeke Driver</h1>
          <p>{authMode === 'login' ? 'Sign in to drive with GoKeke.' : 'Create your driver account.'}</p>
          <form onSubmit={authenticate}>
            {authMode === 'signup' && <input required placeholder="Full name" value={fullName} onChange={e => setFullName(e.target.value)} />}
            <input required type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
            <input required minLength={8} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
            <button className="btn lime" disabled={authBusy}>{authBusy ? 'Please wait...' : authMode === 'login' ? 'Sign in' : 'Create driver account'}</button>
          </form>
          <button className="btn" onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}>
            {authMode === 'login' ? 'Create driver account' : 'I already have an account'}
          </button>
          {msg && <p>{msg}</p>}
        </div>
      </main>
    );
  }

  const action = ride ? nextStatus[ride.status] : null;
  const verified = verification?.d?.status === 'approved' && !!verification.d.license_number && !!verification.d.license_document_url && !!verification.d.id_document_url && verification?.v?.is_active;

  return (
    <>
      <Notifications />
      <div style={{ maxWidth: 850, margin: '10px auto', padding: '0 24px' }}>
        <a href="/driver/profile">Driver profile & verification</a>
        <button className="btn dark" style={{ float: 'right' }} onClick={logout}>Sign out</button>
      </div>
      <main style={{ maxWidth: 850, margin: '30px auto', padding: 24 }}>
        <h1>GoKeke Driver — Kaduna</h1>
        <p>{online ? '🟢 Online — GPS active' : '⚪ Offline'}</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className={'btn ' + (vehicle === 'okada' ? 'lime' : 'dark')} onClick={() => setVehicle('okada')}>Okada</button>
          <button className={'btn ' + (vehicle === 'keke' ? 'lime' : 'dark')} onClick={() => setVehicle('keke')}>Keke</button>
          <button className="btn lime" onClick={toggleOnline}>{online ? 'Go offline' : 'Go online'}</button>
        </div>
        <p>{msg}</p>

        {!verified && <div className="panel">
          <h3>Verification required</h3>
          <p>{verification?.d?.status === 'approved' ? '✓' : '○'} Driver approval</p>
          <p>{verification?.d?.license_number ? '✓' : '○'} Licence number</p>
          <p>{verification?.d?.license_document_url ? '✓' : '○'} Licence document</p>
          <p>{verification?.d?.id_document_url ? '✓' : '○'} ID document</p>
          <p>{verification?.v?.is_active ? '✓' : '○'} Approved active vehicle</p>
          <a href="/driver/profile">Complete verification →</a>
        </div>}

        {offers.map(offer => (
          <div className="panel" key={offer.id}>
            <h3>New nearby {vehicle} request</h3>
            <p>{Math.round(Number(offer.distance_meters || 0))} m away</p>
            <button className="btn lime" onClick={() => accept(offer)}>Accept</button>
            <button className="btn dark" style={{ marginLeft: 8 }} onClick={async () => {
              const { error } = await supabase.rpc('decline_ride_offer', { p_offer_id: offer.id });
              if (error) setMsg(error.message);
              else setOffers(current => current.filter(x => x.id !== offer.id));
            }}>Decline</button>
          </div>
        ))}

        {ride && (
          <div className="panel">
            <h2>Active trip</h2>
            <div ref={mapEl} style={{ height: 300, borderRadius: 14, overflow: 'hidden', marginBottom: 12 }} />
            <p>{navInfo ? `Road route: ${Number(navInfo.distance_km).toFixed(1)} km · ${Math.round(Number(navInfo.duration_minutes))} min` : passenger ? 'Passenger location live' : 'Waiting for passenger GPS'}</p>
            <p>Status: {ride.status}</p>
            <p>{ride.pickup_address} → {ride.destination_address}</p>
            {action && <button className="btn lime" onClick={advance}>{action === 'driver_arriving' ? 'Heading to pickup' : action === 'driver_waiting' ? 'I have arrived' : 'Start trip'}</button>}
            {!['completed', 'cancelled'].includes(ride.status) && <>
              <button className="btn" onClick={sendSOS}>{sos ? 'SOS SENT' : '🚨 DRIVER SOS'}</button>
              <button className="btn dark" onClick={cancel}>Cancel ride</button>
            </>}
            {ride.status === 'in_progress' && <>
              <input value={fare} onChange={e => setFare(e.target.value)} type="number" min="1" placeholder="Final fare (NGN)" style={{ padding: 12, width: '100%', marginTop: 12 }} />
              <button className="btn lime" onClick={complete}>Complete trip</button>
            </>}
            {ride.status === 'completed' && <p>✓ Completed and earnings recorded.</p>}
          </div>
        )}

        {!ride && <div className="panel">
          <h2>Earnings history</h2>
          {earnings.length === 0 ? <p>No earnings recorded yet.</p> : earnings.map((entry: any) => (
            <div key={entry.day} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #ddd' }}>
              <span>{new Date(entry.day).toLocaleDateString()}</span>
              <strong>NGN {Number(entry.total_earnings || entry.driver_earnings || 0).toLocaleString()}</strong>
            </div>
          ))}
        </div>}
      </main>
    </>
  );
}