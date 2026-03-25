import express from 'express';
import nodemailer from 'nodemailer';
import { query, get } from '../models/database';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { getDKIMConfig, extractDomain } from '../utils/dkim-signer';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Create email transporter (configure with your SMTP settings)
const createTransporter = async (settings?: any) => {
  // Get DKIM configuration if fromEmail is provided
  let dkimOptions = undefined;

  if (settings?.fromEmail) {
    const domain = extractDomain(settings.fromEmail);
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

  // Default to ethereal (test) email if no settings provided
  if (!settings || !settings.host) {
    // For testing, we'll use a simple configuration
    // In production, users would configure their SMTP settings
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: 'ethereal.user@ethereal.email',
        pass: 'ethereal.password'
      },
      dkim: dkimOptions,
    });
  }

  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port || 587,
    secure: settings.secure || false,
    auth: {
      user: settings.username,
      pass: settings.password,
    },
    dkim: dkimOptions,
  });
};

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

    const transporter = await createTransporter(emailSettings);

    // Build the "from" field with optional name
    let fromField = '"DragonDesk CRM" <noreply@dragondesk.com>';
    if (emailSettings?.fromEmail) {
      fromField = emailSettings.fromName
        ? `"${emailSettings.fromName}" <${emailSettings.fromEmail}>`
        : emailSettings.fromEmail;
    }

    const info = await transporter.sendMail({
      from: fromField,
      to,
      subject,
      html: body,
    });

    console.log('Test email sent:', info.messageId);

    res.json({
      message: 'Test email sent successfully',
      messageId: info.messageId,
      previewUrl: nodemailer.getTestMessageUrl(info) || undefined,
    });
  } catch (error: any) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      error: 'Failed to send test email',
      details: error.message
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
    let sql = 'SELECT email, firstName, lastName FROM members WHERE 1=1';
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

    const transporter = await createTransporter(emailSettings);

    // Build the "from" field with optional name
    let fromField = '"DragonDesk CRM" <noreply@dragondesk.com>';
    if (emailSettings?.fromEmail) {
      fromField = emailSettings.fromName
        ? `"${emailSettings.fromName}" <${emailSettings.fromEmail}>`
        : emailSettings.fromEmail;
    }

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

        await transporter.sendMail({
          from: fromField,
          to: member.email,
          subject: content.subject,
          html: personalizedBody,
        });

        sent++;
      } catch (error: any) {
        failed++;
        errors.push(`Failed to send to ${member.email}: ${error.message}`);
        console.error(`Failed to send to ${member.email}:`, error);
      }
    }

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
