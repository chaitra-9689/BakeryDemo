import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function AdminLogin() {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next')?.startsWith('/admin') ? params.get('next')! : '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && isAdmin) navigate(next, { replace: true });
  }, [user, isAdmin, next, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setSubmitting(false);
  };

  const notAdmin = user && isAdmin === false;

  return (
    <div className="admin-login">
      <div className="card form auth-card">
        <div>
          <p className="logo"><span aria-hidden>🥐</span> Crumb CRM</p>
          <p className="muted small">Staff sign-in for orders, customers and products.</p>
        </div>

        {notAdmin ? (
          <div className="form" data-testid="admin-denied">
            <p className="error">{user.email} doesn't have CRM access.</p>
            <button className="btn btn-block" onClick={signOut}>Sign in with another account</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="form" data-testid="admin-login-form">
            <label>
              Email
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" data-testid="admin-email" />
            </label>
            <label>
              Password
              <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" data-testid="admin-password" />
            </label>
            {error && <p className="error" data-testid="admin-login-error">{error}</p>}
            <button className="btn btn-block" disabled={submitting || (!!user && isAdmin === null)} data-testid="admin-login-submit">
              {submitting ? 'Please wait…' : 'Sign in'}
            </button>
          </form>
        )}
        <Link to="/" className="center-link small">← Back to store</Link>
      </div>
    </div>
  );
}
