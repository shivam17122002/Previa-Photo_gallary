'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Cloud, ShieldCheck } from 'lucide-react';
import { api, json } from '@/lib/api';

export default function RegisterPage() {
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; setError(''); setMessage(''); setBusy(true); const data = new FormData(form);
    try { const result = await api<{ message: string }>('/auth/register', json('POST', { fullName: data.get('name'), email: data.get('email'), password: data.get('password') })); setMessage(result.message); form.reset(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create your account.'); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell"><section className="auth-card"><Link className="brand" href="/"><span className="brand-mark"><Cloud size={21}/></span>previa</Link><div className="auth-icon"><ShieldCheck size={22}/></div><h1>Your files, in good hands.</h1><p className="muted">Create a private space for everything you want to keep.</p><form onSubmit={submit} className="stack"><label>Full name<input name="name" autoComplete="name" placeholder="Your name" minLength={2} required/></label><label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required/></label><label>Password<input name="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" minLength={8} required/></label>{error && <div className="alert">{error}</div>}{message && <div className="success">{message}</div>}<button className="button primary wide" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button></form><p className="auth-foot">Already have an account? <Link href="/login">Sign in</Link></p><p className="privacy-note">Every new account is reviewed by an administrator before access is granted.</p></section></main>;
}
