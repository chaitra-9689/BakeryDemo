import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import PasswordInput from '../components/PasswordInput';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

type Mode = 'signin' | 'forgot';

export default function AdminLogin() {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next')?.startsWith('/admin') ? params.get('next')! : '/admin';

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (user && isAdmin) navigate(next, { replace: true });
  }, [user, isAdmin, next, navigate]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setInfo(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/admin/reset-password`,
      });
      if (error) setError(error.message);
      else setInfo('If that email has a CRM account, a reset link is on its way. Check your inbox.');
    }
    setSubmitting(false);
  };

  const notAdmin = user && isAdmin === false;

  return (
    <div className="admin-login">
      <div className="card form auth-card">
        <div>
          <p className="logo"><span aria-hidden>🥐</span> Crumb CRM</p>
          <p className="muted small">
            {mode === 'signin' ? 'Staff sign-in for orders, customers and products.' : 'Enter your email and we’ll send you a link to reset your password.'}
          </p>
        </div>

        {notAdmin ? (
          <div className="form" data-testid="admin-denied">
            <p className="error">{user.email} doesn't have CRM access.</p>
            <button className="btn btn-block" onClick={signOut}>Sign in with another account</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="form" data-testid={mode === 'signin' ? 'admin-login-form' : 'admin-forgot-form'}>
            <label>
              Email
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" data-testid="admin-email" />
            </label>
            {mode === 'signin' && (
              <label>
                <span className="label-row">
                  Password
                  <button type="button" className="link-button small" onClick={() => switchMode('forgot')} data-testid="admin-forgot-link">
                    Forgot password?
                  </button>
                </span>
                <PasswordInput required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" data-testid="admin-password" />
              </label>
            )}
            {error && <p className="error" data-testid="admin-login-error">{error}</p>}
            {info && <p className="success" data-testid="admin-forgot-info">{info}</p>}
            <button className="btn btn-block" disabled={submitting || (!!user && isAdmin === null)} data-testid="admin-login-submit">
              {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Send reset link'}
            </button>
            {mode === 'forgot' && (
              <button type="button" className="link-button small center-link" onClick={() => switchMode('signin')} data-testid="admin-back-to-signin">
                ← Back to sign in
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
