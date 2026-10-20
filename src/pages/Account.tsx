import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';

export default function Account() {
  const { user } = useAuth();
  const [form, setForm] = useState({ full_name: '', phone: '', address: '' });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle().then(({ data }) => {
      const p = data as Profile | null;
      setForm({ full_name: p?.full_name ?? '', phone: p?.phone ?? '', address: p?.address ?? '' });
    });
  }, [user]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setStatus(null);
    const { error } = await supabase.from('profiles').update(form).eq('id', user.id);
    setError(error?.message ?? null);
    if (!error) setStatus('Saved.');
  };

  return (
    <div className="container page narrow">
      <h1>Account</h1>
      <p className="muted">Signed in as {user?.email}</p>
      <form className="card form" onSubmit={handleSubmit} data-testid="account-form">
        <label>
          Full name
          <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </label>
        <label>
          Phone
          <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>
        <label>
          Default delivery address
          <textarea rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </label>
        {error && <p className="error">{error}</p>}
        {status && <p className="success">{status}</p>}
        <button className="btn">Save details</button>
      </form>
    </div>
  );
}
