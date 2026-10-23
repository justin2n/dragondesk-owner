import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { useToast } from './Toast';
import styles from '../pages/Settings.module.css';

// Settings > Notifications: new-lead alerts in the app bell and by email.

interface AlertSettings {
  newLeadInApp: boolean;
  newLeadEmail: boolean;
  newLeadRecipients: string[];
}

const TRANSPORT_LABEL: Record<string, string> = {
  resend: 'Resend (RESEND_API_KEY)',
  sendgrid: 'SendGrid (SENDGRID_API_KEY)',
};

const NotificationSettings = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [recipients, setRecipients] = useState('');
  const [transport, setTransport] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    api.get('/notifications/settings')
      .then(data => {
        setSettings(data.settings);
        setRecipients(data.settings.newLeadRecipients.join('\n'));
        setTransport(data.emailTransport);
      })
      .catch((error: any) => toast(error.message || 'Failed to load notification settings', 'error'));
  }, []);

  const save = async () => {
    if (!settings) return;
    setIsSaving(true);
    try {
      const data = await api.put('/notifications/settings', { ...settings, newLeadRecipients: recipients });
      setSettings(data.settings);
      setRecipients(data.settings.newLeadRecipients.join('\n'));
      setTransport(data.emailTransport);
      if (data.invalid?.length) toast(`Saved. Skipped invalid address: ${data.invalid.join(', ')}`, 'error');
      else toast('Notification settings saved', 'success');
    } catch (error: any) {
      toast(error.message || 'Failed to save notification settings', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const sendTest = async () => {
    const to = recipients.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
    setIsTesting(true);
    try {
      const data = await api.post('/notifications/test-email', { to });
      toast(data.message || 'Test alert sent', 'success');
    } catch (error: any) {
      toast(error.message || 'Failed to send test alert', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  if (!settings) return <div className={styles.section}>Loading...</div>;

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Notifications</h2>
      <p className={styles.sectionDesc}>
        Get alerted when a new lead comes in from your website lead forms, the website chat agent, the marketing site, or Zapier.
        Contacts your staff add by hand and CSV imports don't trigger alerts.
      </p>

      <div className={styles.formGroup}>
        <label className={styles.toggleLabel}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={settings.newLeadInApp}
            onChange={e => setSettings({ ...settings, newLeadInApp: e.target.checked })}
          />
          Show new leads in the DragonDesk notification bell
        </label>
        <small className={styles.helpText}>
          Everyone who uses DragonDesk sees them under the bell in the sidebar, and gets a pop-up if they have DragonDesk open when the
          lead arrives.
        </small>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.toggleLabel}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={settings.newLeadEmail}
            onChange={e => setSettings({ ...settings, newLeadEmail: e.target.checked })}
          />
          Email new leads to these people
        </label>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Recipients</label>
        <textarea
          className={styles.textarea}
          rows={4}
          value={recipients}
          onChange={e => setRecipients(e.target.value)}
          placeholder={'owner@yourgym.com\nfrontdesk@yourgym.com'}
          disabled={!settings.newLeadEmail}
        />
        <small className={styles.helpText}>One email address per line (or separated by commas). Up to 25.</small>
      </div>

      {transport ? (
        <div className={styles.infoBox}>Alert emails are sent through {TRANSPORT_LABEL[transport] || transport}.</div>
      ) : (
        <div className={styles.warning}>
          <span>
            No email provider is configured, so alert emails can't be sent yet. Add RESEND_API_KEY (or SENDGRID_API_KEY and
            SENDGRID_FROM_EMAIL) to the server environment. In-app alerts work without it.
          </span>
        </div>
      )}

      <div className={styles.buttonGroup} style={{ marginTop: 20 }}>
        <button onClick={save} className={styles.saveBtn} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={sendTest}
          className={styles.testBtn}
          disabled={isTesting || !transport || !recipients.trim()}
        >
          {isTesting ? 'Sending...' : 'Send Test Email'}
        </button>
      </div>
    </div>
  );
};

export default NotificationSettings;
