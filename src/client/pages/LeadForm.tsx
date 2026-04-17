import React, { useState, useEffect } from 'react';
import styles from './LeadForm.module.css';

interface FormConfig {
  locations: Array<{ id: number; name: string; city?: string; state?: string }>;
  programs: Array<{ id: number; name: string; description?: string }>;
}

const LeadForm = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    programType: '',
    membershipAge: 'Adult',
    locationId: '',
    notes: ''
  });

  const [config, setConfig] = useState<FormConfig>({ locations: [], programs: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  // Get API URL from query params or use default
  const urlParams = new URLSearchParams(window.location.search);
  const apiUrl = urlParams.get('api') || 'http://localhost:5000';
  const theme = urlParams.get('theme') || 'dark';
  const bgColor = urlParams.get('bg') || '';
  const textColor = urlParams.get('text') || '';
  const accentColor = urlParams.get('accent') || '';

  useEffect(() => {
    loadConfig();

    // Apply custom theme colors if provided
    if (bgColor) document.documentElement.style.setProperty('--form-bg', bgColor);
    if (textColor) document.documentElement.style.setProperty('--form-text', textColor);
    if (accentColor) document.documentElement.style.setProperty('--form-accent', accentColor);
  }, []);

  const loadConfig = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/lead-forms/config`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load form configuration');
      }

      const data = await response.json();
      setConfig({
        locations: data.locations || [],
        programs: data.programs || []
      });
    } catch (err) {
      console.error('Error loading form config:', err);
      // Use defaults if config fails to load
      setConfig({
        locations: [],
        programs: [
          { id: 1, name: "Children's Martial Arts", description: "Children's Martial Arts" },
          { id: 2, name: 'Adult BJJ', description: 'Adult BJJ' },
          { id: 3, name: 'Adult TKD & HKD', description: 'Adult TKD & HKD' },
          { id: 4, name: 'DG Barbell', description: 'DG Barbell' },
          { id: 5, name: 'Adult Muay Thai & Kickboxing', description: 'Adult Muay Thai & Kickboxing' },
          { id: 6, name: 'The Ashtanga Club', description: 'The Ashtanga Club' },
          { id: 7, name: 'Dragon Gym Learning Center', description: 'Dragon Gym Learning Center' },
          { id: 8, name: 'Kids BJJ', description: 'Kids BJJ' },
          { id: 9, name: 'Kids Muay Thai', description: 'Kids Muay Thai' },
          { id: 10, name: 'Young Ladies Yoga', description: 'Young Ladies Yoga' },
          { id: 11, name: 'DG Workspace', description: 'DG Workspace' },
          { id: 12, name: 'Dragon Launch', description: 'Dragon Launch' },
          { id: 13, name: 'Personal Training', description: 'Personal Training' },
          { id: 14, name: 'DGMT Private Training', description: 'DGMT Private Training' }
        ]
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${apiUrl}/api/lead-forms/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          locationId: formData.locationId ? parseInt(formData.locationId) : null,
          source: 'Web Form'
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit form');
      }

      setIsSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  if (isSubmitted) {
    return (
      <div className={`${styles.container} ${styles[theme]}`}>
        <div className={styles.successCard}>
          <div className={styles.successIcon}>✓</div>
          <h2 className={styles.successTitle}>Thank You!</h2>
          <p className={styles.successMessage}>
            We've received your information and will contact you soon.
          </p>
          <p className={styles.successSubtext}>
            Check your email for confirmation and next steps.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${styles[theme]}`}>
      <div className={styles.formCard}>
        <div className={styles.formHeader}>
          <h1 className={styles.title}>Start Your Martial Arts Journey</h1>
          <p className={styles.subtitle}>Fill out the form below and we'll get back to you shortly</p>
        </div>

        {error && (
          <div className={styles.errorAlert}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>
                First Name <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                className={styles.input}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>
                Last Name <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                className={styles.input}
                required
              />
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>
                Email <span className={styles.required}>*</span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className={styles.input}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Phone</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className={styles.input}
                placeholder="+1 (555) 123-4567"
              />
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Program Interest</label>
              <select
                name="programType"
                value={formData.programType}
                onChange={handleChange}
                className={styles.select}
              >
                <option value="">Select a program...</option>
                {config.programs.map((program) => (
                  <option key={program.id} value={program.name}>
                    {program.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Age Group</label>
              <select
                name="membershipAge"
                value={formData.membershipAge}
                onChange={handleChange}
                className={styles.select}
              >
                <option value="Adult">Adult</option>
                <option value="Kids">Kids</option>
              </select>
            </div>
          </div>

          {config.locations.length > 0 && (
            <div className={styles.formGroup}>
              <label className={styles.label}>Preferred Location</label>
              <select
                name="locationId"
                value={formData.locationId}
                onChange={handleChange}
                className={styles.select}
              >
                <option value="">Select a location...</option>
                {config.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}{location.city ? ` - ${location.city}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.label}>Message / Questions</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className={styles.textarea}
              rows={4}
              placeholder="Tell us about your goals or ask any questions..."
            />
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={isLoading}
          >
            {isLoading ? 'Submitting...' : 'Get Started'}
          </button>

          <p className={styles.privacy}>
            By submitting this form, you agree to receive communications from us.
          </p>
        </form>
      </div>
    </div>
  );
};

export default LeadForm;
