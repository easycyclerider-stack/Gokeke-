'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Vehicle='okada'|'keke'; type Payment='cash'|'flutterwave';

export default function Ride(){
 const [session,setSession]=useState<any>(null),[vehicle,setVehicle]=useState<Vehicle>('okada'),[payment,setPayment]=useState<Payment>('cash');
 const [pickup,setPickup]=useState('Current location'),[destination,setDestination]=useState('Tap the map to choose destination');
 const [pickupLat,setPickupLat]=useState(10.5105),[pickupLng,setPickupLng]=useState(7.4165),[destLat,setDestLat]=useState(10.5167),[destLng,setDestLng]=useState(7.4383);
 const [status,setStatus]=useState('Choose pickup and destination on the Kaduna map'),[ride,setRide]=useState<any>(null),[driverPos,setDriverPos]=useState<[number,number]|null>(null);
 const mapRef=useRef<HTMLDivElement|null>(null), mapObj=useRef<any>(null), markers=useRef<any[]>([]),watchRef=useRef<number|null>(null);

 useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session));const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>{data.subscription.unsubscribe();if(watchRef.current!==null)navigator.geolocation.clearWatch(watchRef.current);}},[]);

 useEffect(()=>{let alive=true;(async()=>{if(!mapRef.current||mapObj.current)return;const L=await import('leaflet');if(!alive)return;const map=L.map(mapRef.current).setView([10.5105,7.4165],13);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(map);map.on('click',(e:any)=>{setDestLat(e.latlng.lat);setDestLng(e.latlng.lng);setDestination('Selected destination');setStatus('Destination selected on Kaduna map');});mapObj.current=map;setTimeout(()=>map.invalidateSize(),100);})();return()=>{alive=false;if(mapObj.current){mapObj.current.remove();mapObj.current=null;}}},[]);

 useEffect(()=>{(async()=>{if(!mapObj.current)return;const L=await import('leaflet');markers.current.forEach(m=>m.remove());markers.current=[];markers.current.push(L.circleMarker([pickupLat,pickupLng],{radius:9,color:'#111',fillColor:'#d8ff3e',fillOpacity:1}).addTo(mapObj.current).bindPopup('Pickup'));markers.current.push(L.circleMarker([destLat,destLng],{radius:9,color:'#111',fillColor:'#ff6b35',fillOpacity:1}).addTo(mapObj.current).bindPopup('Destination'));if(driverPos)markers.current.push(L.circleMarker(driverPos,{radius:8,color:'#1769aa',fillColor:'#1769aa',fillOpacity:1}).addTo(mapObj.current).bindPopup('Driver'));})();},[pickupLat,pickupLng,destLat,destLng,driverPos]);

 function useGPS(){if(!navigator.geolocation)return setStatus('GPS unavailable');setStatus('Getting precise pickup GPS…');navigator.geolocation.getCurrentPosition(p=>{setPickupLat(p.coords.latitude);setPickupLng(p.coords.longitude);setPickup('Current location');mapObj.current?.setView([p.coords.latitude,p.coords.longitude],15);setStatus('Pickup GPS updated');},e=>setStatus(e.message),{enableHighAccuracy:true,timeout:10000,maximumAge:3000});}
 async function requestRide(){
  if(!session)return setStatus('Please sign in first'); setStatus('Dispatching to the nearest verified online driver…');
  const {data,error}=await supabase.rpc('request_ride',{p_passenger_id:session.user.id,p_vehicle_type:vehicle,p_pickup_address:pickup,p_destination_address:destination,p_pickup_lat:pickupLat,p_pickup_long:pickupLng,p_destination_lat:destLat,p_destination_long:destLng,p_estimated_distance_km:6,p_estimated_duration_minutes:20,p_payment_method:payment});
  if(error)return setStatus(error.message);setRide(data);setStatus('Ride requested — matching nearby Kaduna drivers');
  const ch=supabase.channel('ride-'+data.id).on('postgres_changes',{event:'UPDATE',schema:'public',table:'rides',filter:'id=eq.'+data.id},({new:r})=>{setRide(r);setStatus(r.status==='driver_assigned'?'Driver matched — live tracking active':'Ride status: '+r.status)})
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'ride_locations',filter:'ride_id=eq.'+data.id},({new:l})=>{if(l.actor_id!==session.user.id)setDriverPos([Number(l.latitude),Number(l.longitude)]);}).subscribe();
  const {data:last}=await supabase.from('ride_locations').select('latitude,longitude,actor_id').eq('ride_id',data.id).neq('actor_id',session.user.id).order('created_at',{ascending:false}).limit(1).maybeSingle();if(last)setDriverPos([last.latitude,last.longitude]);
  watchRef.current=navigator.geolocation.watchPosition(async p=>{await supabase.from('ride_locations').insert({ride_id:data.id,actor_id:session.user.id,latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy_meters:p.coords.accuracy,heading:p.coords.heading,speed_mps:p.coords.speed});},()=>{},{enableHighAccuracy:true,maximumAge:3000,timeout:10000});
  if(payment==='flutterwave'){const {data:fn,error:e}=await supabase.functions.invoke('flutterwave-initiate',{body:{ride_id:data.id,redirect_url:window.location.origin+'/ride'}});if(!e&&fn?.link)window.location.href=fn.link;else if(e)setStatus(e.message);}
  return()=>supabase.removeChannel(ch);
 }
 return <main style={{maxWidth:1000,margin:'30px auto',padding:24}}><h1>GoKeke Kaduna</h1><p>{session?'Passenger signed in':'Please sign in'}</p>
  <div className="panel"><div ref={mapRef} style={{height:420,borderRadius:18,overflow:'hidden'}}/><p>Tap the map to set destination. Pickup: <b>{pickup}</b></p><button className="btn dark" onClick={useGPS}>Use my live GPS</button><p>{status}</p></div>
  <div className="panel" style={{marginTop:16}}><input value={destination} onChange={e=>setDestination(e.target.value)} style={{width:'100%',padding:12}} placeholder="Destination in Kaduna"/><p>Vehicle</p><button className={'btn '+(vehicle==='okada'?'lime':'dark')} onClick={()=>setVehicle('okada')}>Okada</button> <button className={'btn '+(vehicle==='keke'?'lime':'dark')} onClick={()=>setVehicle('keke')}>Keke</button><p>Payment</p><button className={'btn '+(payment==='cash'?'lime':'dark')} onClick={()=>setPayment('cash')}>Cash</button> <button className={'btn '+(payment==='flutterwave'?'lime':'dark')} onClick={()=>setPayment('flutterwave')}>Card / Transfer</button><br/><br/><button className="btn lime" onClick={requestRide}>Request GoKeke</button>{ride&&<p>Ride: {ride.id} — {ride.status}</p>}</div>
 </main>;
}