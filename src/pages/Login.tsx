import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

type Mode = 'signin' | 'signup';

export default function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next')?.startsWith('/') ? params.get('next')! : '/';

  const [mode, setMode] = useState<Mode>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, next, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin + next },
      });
      if (error) setError(error.message);
      else if (!data.session) setInfo('Account created. Check your inbox to confirm your email, then sign in.');
    }
    setSubmitting(false);
  };

  return (
    <div className="container page auth-page">
      <div className="card form auth-card">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'tab-active' : ''} onClick={() => setMode('signin')} data-testid="tab-signin">
            Sign in
          </button>
          <button role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'tab-active' : ''} onClick={() => setMode('signup')} data-testid="tab-signup">
            Create account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="form" data-testid="auth-form">
          {mode === 'signup' && (
            <label>
              Full name
              <input required value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" data-testid="auth-name" />
            </label>
          )}
          <label>
            Email
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" data-testid="auth-email" />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              data-testid="auth-password"
            />
          </label>
          {error && <p className="error" data-testid="auth-error">{error}</p>}
          {info && <p className="success" data-testid="auth-info">{info}</p>}
          <button className="btn btn-block" disabled={submitting} data-testid="auth-submit">
            {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
