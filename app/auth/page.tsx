'use client';

import { FormEvent, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function Auth() {
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMsg('');
    setBusy(true);

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name, role: 'passenger' } }
      });
      if (error) setMsg(error.message);
      else if (data.user) {
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: data.user.id,
          full_name: name,
          role: 'passenger'
        });
        setMsg(profileError?.message || 'Account created. Check your email if confirmation is enabled.');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setMsg(error?.message || 'Signed in successfully.');
    }

    setBusy(false);
  }

  return (
    <main style={{ maxWidth: 520, margin: '70px auto', padding: 24 }}>
      <div className="panel">
        <h1>GoKeke</h1>
        <p>{mode === 'signup' ? 'Create your account' : 'Sign in to GoKeke'}</p>
        <form onSubmit={submit}>
          {mode === 'signup' && (
            <input required placeholder="Full name" value={name} onChange={e => setName(e.target.value)}
              style={{ display: 'block', width: '100%', padding: 14, margin: '10px 0' }} />
          )}
          <input required type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
            style={{ display: 'block', width: '100%', padding: 14, margin: '10px 0' }} />
          <input required minLength={8} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
            style={{ display: 'block', width: '100%', padding: 14, margin: '10px 0' }} />
          <button disabled={busy} className="btn lime" type="submit">
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <button className="btn" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
          {mode === 'signup' ? 'Already have an account' : 'Create account'}
        </button>
        {msg && <p>{msg}</p>}
      </div>
    </main>
  );
}