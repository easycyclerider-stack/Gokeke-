'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

export default function Security() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/auth');
      else setEmail(data.user.email ?? '');
    });
  }, [router]);

  async function signOutOthers() {
    setBusy(true);
    setMsg('');
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    setMsg(error?.message ?? 'All other active sessions have been signed out.');
    setBusy(false);
  }

  async function signOutCurrent() {
    setBusy(true);
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) setMsg(error.message);
    else router.replace('/auth');
    setBusy(false);
  }

  return <main style={{ maxWidth: 520, margin: '70px auto', padding: 24 }}>
    <div className="panel">
      <h1>Account security</h1>
      <p>{email}</p>
      <p>Use this page to control active browser sessions for your GoKeke account.</p>
      <button className="btn lime" disabled={busy} onClick={signOutOthers}>Sign out other devices</button>
      <button className="btn" disabled={busy} onClick={signOutCurrent}>Sign out this device</button>
      {msg && <p>{msg}</p>}
    </div>
  </main>;
}
