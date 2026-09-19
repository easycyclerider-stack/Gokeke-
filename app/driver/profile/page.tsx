'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export default function DriverProfile(){
 const [user,setUser]=useState<any>(null),[profile,setProfile]=useState<any>(null),[driver,setDriver]=useState<any>(null),[vehicle,setVehicle]=useState<any>(null),[app,setApp]=useState<any>(null),[msg,setMsg]=useState('');
 const [type,setType]=useState<'okada'|'keke'>('okada'),[plate,setPlate]=useState(''),[make,setMake]=useState(''),[model,setModel]=useState(''),[color,setColor]=useState(''),[year,setYear]=useState(''),[photo,setPhoto]=useState('');
 async function load(){
  const {data:u}=await supabase.auth.getUser(); if(!u.user)return; setUser(u.user);
  const [pr,dr,ve,ap]=await Promise.all([
   supabase.from('profiles').select('*').eq('id',u.user.id).single(),
   supabase.from('drivers').select('*').eq('id',u.user.id).single(),
   supabase.from('vehicles').select('*').eq('driver_id',u.user.id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
   supabase.from('driver_applications').select('*').eq('id',u.user.id).maybeSingle()
  ]);
  setProfile(pr.data);setDriver(dr.data);setVehicle(ve.data);setApp(ap.data);
  if(ve.data){setType(ve.data.type);setPlate(ve.data.plate_number||'');setMake(ve.data.make||'');setModel(ve.data.model||'');setColor(ve.data.color||'');setYear(ve.data.year?String(ve.data.year):'');setPhoto(ve.data.photo_url||'');}
 }
 useEffect(()=>{load()},[]);
 async function upload(file:File){const path=user.id+'/vehicle-'+Date.now()+'.'+(file.name.split('.').pop()||'jpg');const {error}=await supabase.storage.from('driver-documents').upload(path,file,{contentType:file.type});if(error)return setMsg(error.message);setPhoto(path);setMsg('Vehicle photo uploaded. Save to request verification.');}
 async function save(){if(!vehicle)return setMsg('No vehicle registered.');const {error}=await supabase.rpc('driver_update_vehicle',{p_vehicle_id:vehicle.id,p_type:type,p_plate_number:plate,p_make:make,p_model:model,p_color:color,p_year:year?Number(year):null,p_photo_path:photo});setMsg(error?'Update failed: '+error.message:'Vehicle updated and sent for admin verification.');load();}
 if(!user)return <main style={{maxWidth:720,margin:'40px auto',padding:24}}>Please sign in.</main>;
 return <main style={{maxWidth:800,margin:'30px auto',padding:24}}><div className="panel">
 <h1>GoKeke Driver Profile</h1><p>{profile?.full_name||'Driver'} · {profile?.phone||'No phone'}</p>
 <h2>Verification status</h2><p><b>Driver:</b> {driver?.status||'pending'} {driver?.verified_at?'✓ verified':''}</p><p><b>Application:</b> {app?.reviewed_at?'Reviewed':'Pending review'}</p>{app?.notes&&<p><b>Admin note:</b> {app.notes}</p>}
 <hr/><h2>Vehicle</h2><p>Status: <b>{vehicle?.is_active?'Approved / active':'Pending verification or inactive'}</b></p>
 <select value={type} onChange={e=>setType(e.target.value as any)} style={{padding:12}}><option value="okada">Okada</option><option value="keke">Keke</option></select>
 <input value={plate} onChange={e=>setPlate(e.target.value)} placeholder="Plate number" style={{display:'block',width:'100%',padding:12,marginTop:8}}/>
 <input value={make} onChange={e=>setMake(e.target.value)} placeholder="Make" style={{display:'block',width:'100%',padding:12,marginTop:8}}/>
 <input value={model} onChange={e=>setModel(e.target.value)} placeholder="Model" style={{display:'block',width:'100%',padding:12,marginTop:8}}/>
 <input value={color} onChange={e=>setColor(e.target.value)} placeholder="Colour" style={{display:'block',width:'100%',padding:12,marginTop:8}}/>
 <input value={year} onChange={e=>setYear(e.target.value)} type="number" placeholder="Year" style={{display:'block',width:'100%',padding:12,marginTop:8}}/>
 <input type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(f)upload(f)}} style={{marginTop:12}}/>
 <p>{photo?'✓ Vehicle photo on file':'No vehicle photo uploaded'}</p><button className="btn lime" onClick={save}>Save & request verification</button><p>{msg}</p><a href="/driver">← Driver dashboard</a>
 </div></main>;
}