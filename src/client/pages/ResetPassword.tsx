import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBranding } from '../contexts/BrandingContext';
import defaultLogo from '../assets/dragondesk-logo.png';
import styles from './Login.module.css';

// Redeem an emailed reset link. The token is probed on load so an expired or
// already-used link says so up front, not after a new password is typed.
const ResetPassword = () => {
  const navigate = useNavigate();
  const { branding } = useBranding();
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setChecking(false); return; }
    fetch(`/api/auth/reset/${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => { setValid(!!d.valid); if (d.username) setUsername(d.username); })
      .catch(() => setValid(false))
      .finally(() => setChecking(false));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not reset your password');
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err: any) {
      setError(err.message || 'Could not reset your password');
    } finally {
      setIsLoading(false);
    }
  };

  const card = (title: string, subtitle: React.ReactNode, body: React.ReactNode) => (
    <div className={styles.loginPage}>
      <div className={styles.loginCard}>
        <div className={styles.header}>
          <img src={branding.logo || defaultLogo} alt={branding.gymName} className={styles.logoImage} />
          <p className={styles.brandName}>{title}</p>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        {body}
      </div>
    </div>
  );

  if (checking) return card('Checking your link...', null, null);

  if (!valid) {
    return card('That link is no longer valid', null, (
      <div className={styles.form}>
        <p style={{ lineHeight: 1.5, margin: '0 0 1.25rem' }}>
          Reset links expire after 1 hour and can only be used once. Request a fresh one and we will
          email it right away.
        </p>
        <Link to="/forgot" className={styles.submitBtn} style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
          Request a new link
        </Link>
      </div>
    ));
  }

  if (done) {
    return card('Password updated', null, (
      <div className={styles.form}>
        <p style={{ lineHeight: 1.5, margin: 0 }}>
          You can now log in{username ? <> as <strong>{username}</strong></> : null} with your new password. Taking you there...
        </p>
      </div>
    ));
  }

  return card('Choose a new password', username ? `for ${username}` : null, (
    <form onSubmit={submit} className={styles.form}>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.formGroup}>
        <label htmlFor="password" className={styles.label}>New password</label>
        <input
          type="password" id="password" value={password} onChange={e => setPassword(e.target.value)}
          className={styles.input} required autoFocus minLength={8} autoComplete="new-password"
        />
      </div>
      <div className={styles.formGroup}>
        <label htmlFor="confirm" className={styles.label}>Confirm password</label>
        <input
          type="password" id="confirm" value={confirm} onChange={e => setConfirm(e.target.value)}
          className={styles.input} required minLength={8} autoComplete="new-password"
        />
      </div>
      <button type="submit" className={styles.submitBtn} disabled={isLoading}>
        {isLoading ? 'Saving...' : 'Set new password'}
      </button>
    </form>
  ));
};

export default ResetPassword;
