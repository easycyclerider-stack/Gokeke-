'use client';

import { FormEvent, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next')?.startsWith('/admin') ? searchParams.get('next')! : '/admin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .single();

    if (profileError || profile?.role !== 'admin') {
      await supabase.auth.signOut();
      setError('This account does not have admin access.');
      setBusy(false);
      return;
    }

    router.replace(next);
    router.refresh();
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f6f7f4' }}>
      <section style={{ width: '100%', maxWidth: 440, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 24, padding: 32, boxShadow: '0 20px 60px rgba(0,0,0,.08)' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontWeight: 800, fontSize: 24 }}>Go<span style={{ color: '#84cc16' }}>Keke</span></div>
          <p style={{ margin: '8px 0 0', color: '#6b7280' }}>Administrator console</p>
        </div>

        <h1 style={{ fontSize: 30, margin: '0 0 8px' }}>Admin login</h1>
        <p style={{ color: '#6b7280', marginTop: 0 }}>Sign in with your authorized GoKeke admin account.</p>

        <form onSubmit={submit} style={{ display: 'grid', gap: 16, marginTop: 24 }}>
          <label style={{ display: 'grid', gap: 8 }}>
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ padding: '13px 14px', borderRadius: 12, border: '1px solid #d1d5db', fontSize: 16 }}
            />
          </label>

          <label style={{ display: 'grid', gap: 8 }}>
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ padding: '13px 14px', borderRadius: 12, border: '1px solid #d1d5db', fontSize: 16 }}
            />
          </label>

          {error && <p role="alert" style={{ margin: 0, color: '#b91c1c', background: '#fef2f2', padding: 12, borderRadius: 10 }}>{error}</p>}

          <button
            type="submit"
            disabled={busy}
            style={{ padding: '14px 16px', border: 0, borderRadius: 12, background: '#111827', color: '#fff', fontWeight: 700, fontSize: 16, cursor: busy ? 'wait' : 'pointer', opacity: busy ? .7 : 1 }}
          >
            {busy ? 'Signing in…' : 'Sign in to admin'}
          </button>
        </form>

        <p style={{ marginTop: 20, fontSize: 13, color: '#6b7280' }}>
          Admin access is controlled by the server-side profile role, not by the login form.
        </p>
      </section>
    </main>
  );
}
