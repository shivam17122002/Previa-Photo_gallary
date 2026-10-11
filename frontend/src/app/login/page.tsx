'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Cloud, LockKeyhole } from 'lucide-react';
import { api, json } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const data = new FormData(event.currentTarget);
    try { await api('/auth/login', json('POST', { email: data.get('email'), password: data.get('password'), rememberMe: data.get('rememberMe') === 'on' })); router.push('/drive'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not sign in.'); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell"><section className="auth-card"><Link className="brand" href="/"><span className="brand-mark"><Cloud size={21}/></span>previa</Link><div className="auth-icon"><LockKeyhole size={21}/></div><h1>Welcome back</h1><p className="muted">Sign in to your private cloud.</p><form onSubmit={submit} className="stack"><label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required/></label><label>Password<input name="password" type="password" autoComplete="current-password" placeholder="Your password" required/></label><label className="check"><input name="rememberMe" type="checkbox"/> Keep me signed in</label>{error && <div className="alert">{error}</div>}<button className="button primary wide" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form><p className="auth-foot">New to Previa? <Link href="/register">Create an account</Link></p><p className="privacy-note">Private by design. Your files are only visible to you.</p></section></main>;
}
