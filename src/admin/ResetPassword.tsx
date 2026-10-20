import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import PasswordInput from '../components/PasswordInput';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

// Landing page for the emailed reset link. Supabase signs the user in from the
// link's URL hash, so by the time this renders there is a recovery session.
export default function ResetPassword() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expired or already-used links come back with the error in the hash.
  const linkError = new URLSearchParams(window.location.hash.slice(1)).get('error_description');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError('Passwords don’t match.');
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) return setError(error.message);
    navigate('/admin', { replace: true });
  };

  return (
    <div className="admin-login">
      <div className="card form auth-card">
        <div>
          <p className="logo"><span aria-hidden>🥐</span> Crumb CRM</p>
          <p className="muted small">Choose a new password.</p>
        </div>

        {loading ? (
          <p className="muted">Checking your link…</p>
        ) : !user ? (
          <div className="form" data-testid="reset-invalid">
            <p className="error">{linkError ?? 'This reset link is invalid or has expired.'}</p>
            <Link to="/admin/login" className="btn btn-block">Request a new link</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="form" data-testid="reset-form">
            <p className="small muted">Signed in as {user.email}</p>
            <label>
              New password
              <PasswordInput required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" data-testid="reset-password" />
            </label>
            <label>
              Confirm new password
              <PasswordInput required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" data-testid="reset-confirm" />
            </label>
            {error && <p className="error" data-testid="reset-error">{error}</p>}
            <button className="btn btn-block" disabled={submitting} data-testid="reset-submit">
              {submitting ? 'Saving…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
