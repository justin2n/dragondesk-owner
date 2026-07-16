import { serverError } from '../utils/errors';
import express from 'express';
import nodemailer from 'nodemailer';
import { randomBytes } from 'crypto';
import { query, get } from '../models/database';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { getDKIMConfig, extractDomain } from '../utils/dkim-signer';
import { sendViaSendgrid } from '../services/sendgrid';
import { sendViaMailgun } from '../services/mailgun';
import { sendViaSes } from '../services/ses';
import { getEmailConfig, invalidateEmailConfigCache, EmailConfig } from '../services/emailConfig';
import { encryptSecret, isEncryptionConfigured } from '../utils/crypto';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

const MASK = '••••••••';

// Deliver one email through the resolved provider. SendGrid uses its own verified
// sender + API key; SMTP builds a transporter (the test panel may pass per-request
// SMTP settings). Returns the provider message id when available.
async function deliver(
  cfg: EmailConfig,
  opts: { to: string; subject: string; html: string; emailSettings?: any },
  reuseTransporter?: any
): Promise<{ messageId?: string }> {
  if (cfg.provider === 'sendgrid') {
    return await sendViaSendgrid({
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      apiKey: cfg.sendgrid.apiKey || undefined,
      fromEmail: cfg.fromEmail || undefined,
      fromName: cfg.fromName || undefined,
    });
  }
  if (cfg.provider === 'mailgun') {
    return await sendViaMailgun({
      apiKey: cfg.mailgun.apiKey || '',
      domain: cfg.mailgun.domain || '',
      region: cfg.mailgun.region,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      fromEmail: cfg.fromEmail || '',
      fromName: cfg.fromName || undefined,
    });
  }
  if (cfg.provider === 'ses') {
    return await sendViaSes({
      accessKeyId: cfg.ses.accessKeyId || '',
      secretAccessKey: cfg.ses.secretAccessKey || '',
      region: cfg.ses.region || '',
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      fromEmail: cfg.fromEmail || '',
      fromName: cfg.fromName || undefined,
    });
  }
  const transporter = reuseTransporter || await createTransporter(opts.emailSettings);
  const fromEmail = opts.emailSettings?.fromEmail || cfg.fromEmail;
  const fromName = opts.emailSettings?.fromName || cfg.fromName || 'DragonDesk CRM';
  const fromField = fromEmail
    ? `"${fromName}" <${fromEmail}>`
    : `"${fromName}" <noreply@dragondesk.com>`;
  const info = await transporter.sendMail({ from: fromField, to: opts.to, subject: opts.subject, html: opts.html });
  return { messageId: info.messageId };
}

// Create email transporter (configure with your SMTP settings)
const createTransporter = async (settings?: any) => {
  // Resolve SMTP config: explicit settings > environment variables
  const host = settings?.host || process.env.SMTP_HOST;
  const port = settings?.port || Number(process.env.SMTP_PORT) || 587;
  const secure = settings?.secure ?? (process.env.SMTP_SECURE === 'true');
  const username = settings?.username || process.env.SMTP_USER;
  const password = settings?.password || process.env.SMTP_PASS;
  const fromEmail = settings?.fromEmail || process.env.SMTP_FROM_EMAIL;

  if (!host || !username || !password) {
    throw new Error('SMTP credentials are not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables.');
  }

  // Get DKIM configuration if fromEmail is provided
  let dkimOptions = undefined;
  if (fromEmail) {
    const domain = extractDomain(fromEmail);
    if (domain) {
      const dkimConfig = await getDKIMConfig(domain);
      if (dkimConfig) {
        dkimOptions = {
          domainName: dkimConfig.domainName,
          keySelector: dkimConfig.keySelector,
          privateKey: dkimConfig.privateKey,
        };
      }
    }
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: username,
      pass: password,
    },
    dkim: dkimOptions,
    // Fail fast instead of hanging when the SMTP host is unreachable (many
    // PaaS hosts block outbound SMTP ports) — otherwise the request stays
    // pending forever and the real error never surfaces to the client.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
};

// Get server-side SMTP config status (no credentials exposed)
router.get('/config-status', async (req: AuthRequest, res) => {
  res.json({
    host: process.env.SMTP_HOST || null,
    port: process.env.SMTP_PORT || '587',
    secure: process.env.SMTP_SECURE === 'true',
    userConfigured: !!process.env.SMTP_USER,
    passConfigured: !!process.env.SMTP_PASS,
    fromEmail: process.env.SMTP_FROM_EMAIL || null,
    fromName: process.env.SMTP_FROM_NAME || null,
    configured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  });
});

// Helper: build the masked client view of the resolved email config.
async function settingsView(locationId?: number) {
  const cfg = await getEmailConfig(locationId);
  return {
    provider: cfg.provider,
    fromEmail: cfg.fromEmail,
    fromName: cfg.fromName,
    sendgridApiKey: cfg.sendgrid.apiKey ? MASK : null,
    sendgridConfigured: cfg.sendgrid.configured,
    mailgunApiKey: cfg.mailgun.apiKey ? MASK : null,
    mailgunDomain: cfg.mailgun.domain,
    mailgunRegion: cfg.mailgun.region,
    mailgunConfigured: cfg.mailgun.configured,
    sesAccessKeyId: cfg.ses.accessKeyId,
    sesSecretAccessKey: cfg.ses.secretAccessKey ? MASK : null,
    sesRegion: cfg.ses.region,
    sesConfigured: cfg.ses.configured,
    smtpConfigured: cfg.smtp.configured,
    encryptionConfigured: isEncryptionConfigured(),
  };
}

// Editable email provider config (default provider, SendGrid key, from-address).
// The API key is never returned — only whether one is set (masked).
router.get('/settings', async (req: AuthRequest, res) => {
  const locationId = req.query.locationId ? Number(req.query.locationId) : undefined;
  res.json(await settingsView(locationId));
});

router.put('/settings', requireRole(['super_admin', 'admin']), async (req: AuthRequest, res) => {
  try {
    const { locationId, provider, fromEmail, fromName, sendgridApiKey,
            mailgunApiKey, mailgunDomain, mailgunRegion,
            sesAccessKeyId, sesSecretAccessKey, sesRegion } = req.body;
    const locId: number | null = locationId ? Number(locationId) : null;

    if (provider && !['smtp', 'sendgrid', 'mailgun', 'ses'].includes(provider)) {
      return res.status(400).json({ error: "provider must be 'smtp', 'sendgrid', 'mailgun', or 'ses'" });
    }

    const existing = locId
      ? await get(`SELECT * FROM email_settings WHERE "locationId" = $1`, [locId])
      : await get(`SELECT * FROM email_settings WHERE "locationId" IS NULL`);

    // Preserve a stored key when the incoming value is masked/empty; otherwise encrypt.
    const resolveKey = (incoming: any, stored: string | null): string | null => {
      if (typeof incoming === 'string' && incoming.trim() && !incoming.includes('•')) {
        if (!isEncryptionConfigured()) throw new Error('ENCRYPTION_REQUIRED');
        return encryptSecret(incoming.trim());
      }
      return stored;
    };

    let sendgridKeyToStore: string | null;
    let mailgunKeyToStore: string | null;
    let sesSecretToStore: string | null;
    try {
      sendgridKeyToStore = resolveKey(sendgridApiKey, existing?.sendgridApiKey ?? null);
      mailgunKeyToStore = resolveKey(mailgunApiKey, existing?.mailgunApiKey ?? null);
      sesSecretToStore = resolveKey(sesSecretAccessKey, existing?.sesSecretAccessKey ?? null);
    } catch {
      return res.status(400).json({ error: 'Set APP_ENCRYPTION_KEY (32-byte hex/base64) before storing an API key.' });
    }

    const resolvedProvider = provider || existing?.provider || 'smtp';
    const resolvedFromEmail = fromEmail !== undefined ? (fromEmail || null) : (existing?.fromEmail ?? null);
    const resolvedFromName = fromName !== undefined ? (fromName || null) : (existing?.fromName ?? null);
    const resolvedMgDomain = mailgunDomain !== undefined ? (mailgunDomain || null) : (existing?.mailgunDomain ?? null);
    const resolvedMgRegion = mailgunRegion || existing?.mailgunRegion || 'us';
    // SES access key id + region are not secret (like a username) — stored plaintext.
    const resolvedSesKeyId = sesAccessKeyId !== undefined ? (sesAccessKeyId || null) : (existing?.sesAccessKeyId ?? null);
    const resolvedSesRegion = sesRegion !== undefined ? (sesRegion || null) : (existing?.sesRegion ?? null);

    // Validate the chosen provider has what it needs to actually send.
    if (resolvedProvider === 'sendgrid') {
      if (!sendgridKeyToStore && !process.env.SENDGRID_API_KEY) {
        return res.status(400).json({ error: 'Add a SendGrid API key before choosing SendGrid.' });
      }
      if (!resolvedFromEmail && !process.env.SENDGRID_FROM_EMAIL) {
        return res.status(400).json({ error: 'Set a From Email (verified in SendGrid) before using SendGrid.' });
      }
    }
    if (resolvedProvider === 'mailgun') {
      if (!mailgunKeyToStore && !process.env.MAILGUN_API_KEY) {
        return res.status(400).json({ error: 'Add a Mailgun API key before choosing Mailgun.' });
      }
      if (!resolvedMgDomain && !process.env.MAILGUN_DOMAIN) {
        return res.status(400).json({ error: 'Set your Mailgun sending domain before using Mailgun.' });
      }
      if (!resolvedFromEmail && !process.env.MAILGUN_FROM_EMAIL) {
        return res.status(400).json({ error: 'Set a From Email on your Mailgun domain before using Mailgun.' });
      }
    }
    if (resolvedProvider === 'ses') {
      if ((!resolvedSesKeyId && !process.env.AWS_ACCESS_KEY_ID) || (!sesSecretToStore && !process.env.AWS_SECRET_ACCESS_KEY)) {
        return res.status(400).json({ error: 'Add your AWS access key ID and secret access key before choosing SES.' });
      }
      if (!resolvedSesRegion && !process.env.AWS_SES_REGION && !process.env.AWS_REGION) {
        return res.status(400).json({ error: 'Set your SES region (e.g. us-east-1) before using SES.' });
      }
      if (!resolvedFromEmail && !process.env.SES_FROM_EMAIL) {
        return res.status(400).json({ error: 'Set a From Email verified as an SES identity before using SES.' });
      }
    }

    if (existing) {
      await query(
        `UPDATE email_settings SET provider = $1, "sendgridApiKey" = $2,
           "mailgunApiKey" = $3, "mailgunDomain" = $4, "mailgunRegion" = $5,
           "sesAccessKeyId" = $6, "sesSecretAccessKey" = $7, "sesRegion" = $8,
           "fromEmail" = $9, "fromName" = $10, "isActive" = true, "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $11`,
        [resolvedProvider, sendgridKeyToStore, mailgunKeyToStore, resolvedMgDomain, resolvedMgRegion,
         resolvedSesKeyId, sesSecretToStore, resolvedSesRegion,
         resolvedFromEmail, resolvedFromName, existing.id]
      );
    } else {
      await query(
        `INSERT INTO email_settings ("locationId", provider, "sendgridApiKey",
           "mailgunApiKey", "mailgunDomain", "mailgunRegion",
           "sesAccessKeyId", "sesSecretAccessKey", "sesRegion", "fromEmail", "fromName")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [locId, resolvedProvider, sendgridKeyToStore, mailgunKeyToStore, resolvedMgDomain, resolvedMgRegion,
         resolvedSesKeyId, sesSecretToStore, resolvedSesRegion, resolvedFromEmail, resolvedFromName]
      );
    }

    invalidateEmailConfigCache(locId ?? undefined);
    res.json(await settingsView(locId ?? undefined));
  } catch (error: any) {
    serverError(res, error);
  }
});

// Test server-side SMTP connection (uses env vars only)
router.post('/test-server-connection', async (req: AuthRequest, res) => {
  try {
    const transporter = await createTransporter();
    await transporter.verify();
    res.json({ success: true, message: 'SMTP connection successful.' });
  } catch (error: any) {
    let message = error.message;
    if (error.code === 'EAUTH') message = 'Authentication failed. Check SMTP_USER and SMTP_PASS.';
    else if (error.code === 'ECONNREFUSED') message = 'Connection refused. Check SMTP_HOST and SMTP_PORT.';
    else if (error.code === 'ETIMEDOUT') message = 'Connection timed out. Check SMTP_HOST and SMTP_PORT.';
    res.json({ success: false, message });
  }
});

// Test SMTP connection
router.post('/test-connection', async (req: AuthRequest, res) => {
  try {
    const { host, port, secure, username, password, fromEmail, fromName } = req.body;

    // Validate required fields
    if (!host || !username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: host, username, and password are required'
      });
    }

    // Create test transporter with provided settings
    const transporter = nodemailer.createTransport({
      host,
      port: port || 587,
      secure: secure || false,
      auth: {
        user: username,
        pass: password,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    // Verify connection
    await transporter.verify();

    res.json({
      success: true,
      message: 'SMTP connection successful! Your email settings are configured correctly.'
    });
  } catch (error: any) {
    console.error('SMTP connection test failed:', error);

    // Provide helpful error messages
    let message = error.message;
    if (error.code === 'EAUTH') {
      message = 'Authentication failed. Please check your username and password.';
    } else if (error.code === 'ECONNREFUSED') {
      message = 'Connection refused. Please check your host and port settings.';
    } else if (error.code === 'ETIMEDOUT') {
      message = 'Connection timed out. Please check your host and port settings.';
    }

    res.json({
      success: false,
      message: message
    });
  }
});

// Send test email
router.post('/send-test', requireRole(['super_admin', 'admin']), async (req: AuthRequest, res) => {
  try {
    const { to, subject, body, emailSettings } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, body' });
    }

    const cfg = await getEmailConfig();

    // Ethereal only matters for SMTP (dev-only fake inbox).
    if (cfg.provider === 'smtp') {
      const resolvedHost = emailSettings?.host || process.env.SMTP_HOST || '';
      if (resolvedHost.includes('ethereal')) {
        return res.status(400).json({
          error: 'Ethereal (test) SMTP detected — emails will not be delivered.',
          details: 'Your SMTP_HOST is set to smtp.ethereal.email, which is a development-only fake inbox. Replace SMTP_HOST, SMTP_USER, and SMTP_PASS in your Railway environment variables with a real email provider (e.g. SendGrid, Postmark, or Gmail SMTP).',
        });
      }
    }

    const info = await deliver(cfg, { to, subject, html: body, emailSettings });

    console.log(`Test email sent via ${cfg.provider}:`, info.messageId);

    const providerLabel: Record<string, string> = { sendgrid: 'SendGrid', mailgun: 'Mailgun', ses: 'Amazon SES', smtp: 'SMTP' };
    res.json({
      message: `Test email sent successfully via ${providerLabel[cfg.provider] || cfg.provider}`,
      messageId: info.messageId,
    });
  } catch (error: any) {
    console.error('Error sending test email:', error);
    // Surface the real reason (SMTP auth/connection/config) — the client only
    // shows `error`, so a generic message hid the actual cause.
    res.status(500).json({
      error: `Failed to send test email: ${error.message || 'unknown error'}`,
      details: error.message,
    });
  }
});

// Send campaign to all members in audience
router.post('/send-campaign/:campaignId', requireRole(['super_admin', 'admin']), async (req: AuthRequest, res) => {
  try {
    const { campaignId } = req.params;
    const { emailSettings } = req.body;

    // Get campaign
    const campaign = await get(
      `SELECT * FROM campaigns WHERE id = ? AND type = 'email'`,
      [campaignId]
    );

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const content = typeof campaign.content === 'string'
      ? JSON.parse(campaign.content)
      : campaign.content;

    // Get audience
    const audience = await get('SELECT * FROM audiences WHERE id = ?', [campaign.audienceId]);

    if (!audience) {
      return res.status(404).json({ error: 'Audience not found' });
    }

    const filters = typeof audience.filters === 'string'
      ? JSON.parse(audience.filters)
      : audience.filters;

    // Build query to get members based on audience filters
    let sql = 'SELECT id, email, firstName, lastName, accountStatus FROM members WHERE 1=1';
    const params: any[] = [];

    if (filters.accountStatus && filters.accountStatus.length > 0) {
      sql += ` AND accountStatus IN (${filters.accountStatus.map(() => '?').join(',')})`;
      params.push(...filters.accountStatus);
    }

    if (filters.accountType && filters.accountType.length > 0) {
      sql += ` AND accountType IN (${filters.accountType.map(() => '?').join(',')})`;
      params.push(...filters.accountType);
    }

    if (filters.programType && filters.programType.length > 0) {
      sql += ` AND programType IN (${filters.programType.map(() => '?').join(',')})`;
      params.push(...filters.programType);
    }

    if (filters.membershipAge && filters.membershipAge.length > 0) {
      sql += ` AND membershipAge IN (${filters.membershipAge.map(() => '?').join(',')})`;
      params.push(...filters.membershipAge);
    }

    const members = await query(sql, params);

    if (members.length === 0) {
      return res.status(400).json({ error: 'No members found in audience' });
    }

    const cfg = await getEmailConfig();

    // Build one SMTP transporter for the whole campaign (SendGrid is per-request HTTP).
    const campaignTransporter = cfg.provider === 'smtp' ? await createTransporter(emailSettings) : null;

    // Absolute base for the open-tracking pixel (works behind Railway's proxy).
    const base = `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}`;

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    // Send emails to all members
    for (const member of members) {
      try {
        // Personalize email body
        let personalizedBody = content.body
          .replace(/\[First Name\]/g, member.firstName || '')
          .replace(/\[Last Name\]/g, member.lastName || '')
          .replace(/\[Member Name\]/g, `${member.firstName} ${member.lastName}`.trim());

        // Per-recipient open-tracking pixel.
        const token = randomBytes(16).toString('hex');
        personalizedBody += `<img src="${base}/api/tracking/open/${token}" width="1" height="1" style="display:none" alt="">`;

        await deliver(cfg, {
          to: member.email,
          subject: content.subject,
          html: personalizedBody,
          emailSettings,
        }, campaignTransporter);

        // Record the recipient (baseline status drives conversion attribution).
        await query(
          `INSERT INTO campaign_recipients ("campaignId", "memberId", email, token, "statusAtSend")
           VALUES (?, ?, ?, ?, ?)`,
          [campaignId, member.id, member.email, token, member.accountStatus]
        ).catch(() => {});

        sent++;
      } catch (error: any) {
        failed++;
        errors.push(`Failed to send to member #${member.id}: ${error.message}`);
        console.error(`Failed to send email to member #${member.id}:`, error.message);
      }
    }

    // Persist send totals + mark completed (opens accrue via the pixel endpoint).
    await query(
      `UPDATE campaigns SET sent = ?, delivered = ?, status = 'completed',
         opens = 0, "openRate" = 0, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
      [sent, sent, campaignId]
    ).catch(() => {});

    res.json({
      message: 'Campaign sent',
      totalRecipients: members.length,
      sent,
      failed,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });
  } catch (error: any) {
    console.error('Error sending campaign:', error);
    res.status(500).json({
      error: 'Failed to send campaign',
      details: error.message
    });
  }
});

export default router;
