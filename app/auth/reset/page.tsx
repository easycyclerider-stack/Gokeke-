'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

export default function Reset() {
  const router = useRouter();
  const [email,setEmail]=useState(''),[pw,setPw]=useState(''),[confirm,setConfirm]=useState(''),[recovery,setRecovery]=useState(false),[msg,setMsg]=useState('');
  useEffect(() => {
    supabase.auth.getSession().then(({data}) => setRecovery(!!data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setRecovery(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);
  async function request(e:FormEvent){e.preventDefault();const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}/auth/reset`});setMsg(error?.message||'If that email exists, a reset link has been sent.');}
  async function update(e:FormEvent){e.preventDefault();if(pw.length<8)return setMsg('Password must be at least 8 characters.');if(pw!==confirm)return setMsg('Passwords do not match.');const {error}=await supabase.auth.updateUser({password:pw});setMsg(error?.message||'Password updated.');if(!error){await supabase.auth.signOut();router.replace('/auth');}}
  return <main style={{maxWidth:520,margin:'70px auto',padding:24}}><div className="panel"><h1>Reset GoKeke password</h1>{recovery?<form onSubmit={update}><input required minLength={8} type="password" placeholder="New password" value={pw} onChange={e=>setPw(e.target.value)}/><input required minLength={8} type="password" placeholder="Confirm new password" value={confirm} onChange={e=>setConfirm(e.target.value)}/><button className="btn lime">Update password</button></form>:<form onSubmit={request}><input required type="email" placeholder="Your email" value={email} onChange={e=>setEmail(e.target.value)}/><button className="btn lime">Send reset link</button></form>}{msg&&<p>{msg}</p>}</div></main>;
}