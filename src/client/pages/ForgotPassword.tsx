import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useBranding } from '../contexts/BrandingContext';
import defaultLogo from '../assets/dragondesk-logo.png';
import styles from './Login.module.css';

// Self-serve account recovery. Takes an email or username (logins are by
// username), and the server always answers the same way so this can't be used
// to discover which accounts exist.
const ForgotPassword = () => {
  const { branding } = useBranding();
  const [identifier, setIdentifier] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      // Public, unauthenticated endpoint — no api.ts token handling needed.
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.loginPage}>
      <div className={styles.loginCard}>
        <div className={styles.header}>
          <img src={branding.logo || defaultLogo} alt={branding.gymName} className={styles.logoImage} />
          <p className={styles.brandName}>Reset your password</p>
          <p className={styles.subtitle}>
            {sent ? 'Check your inbox' : 'Enter your email or username and we will send you a link'}
          </p>
        </div>

        {sent ? (
          <div className={styles.form}>
            <p style={{ lineHeight: 1.5, margin: '0 0 1rem' }}>
              If that matches an account, a reset link is on its way to the email address on file.
            </p>
            <p style={{ fontSize: 13, opacity: 0.75, margin: '0 0 1.25rem' }}>
              The link expires in 1 hour. Remember to check your spam folder.
            </p>
            <Link to="/login" className={styles.submitBtn} style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className={styles.form}>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.formGroup}>
              <label htmlFor="identifier" className={styles.label}>Email or username</label>
              <input
                type="text" id="identifier" value={identifier} onChange={e => setIdentifier(e.target.value)}
                className={styles.input} required autoFocus autoComplete="username"
              />
            </div>
            <button type="submit" className={styles.submitBtn} disabled={isLoading}>
              {isLoading ? 'Sending...' : 'Send reset link'}
            </button>
            <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: 14 }}>
              <Link to="/login" style={{ color: 'var(--color-red-light)' }}>Back to login</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
