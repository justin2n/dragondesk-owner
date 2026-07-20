import { serverError } from '../utils/errors';
import express from 'express';
import { query, run, get } from '../models/database';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';
import { buildAudienceQuery } from '../utils/audienceMembers';
import { getSmsConfig, invalidateSmsConfigCache } from '../services/smsConfig';
import { sendSMS, sendSMSCampaign, processDeliveryStatus } from '../services/twilio';
import { encryptSecret, isEncryptionConfigured } from '../utils/crypto';

const MASK = '••••••••';

const router = express.Router();

// Get all SMS campaigns
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const campaigns = await query(
      `SELECT
        sc.*,
        a.name as audienceName,
        u.firstName || ' ' || u.lastName as createdByName
      FROM sms_campaigns sc
      LEFT JOIN audiences a ON sc.audienceId = a.id
      LEFT JOIN users u ON sc.createdBy = u.id
      ORDER BY sc.createdAt DESC`
    );
    res.json(campaigns);
  } catch (error: any) {
    console.error('Error fetching SMS campaigns:', error);
    serverError(res, error);
  }
});

// Twilio SMS config (DB-encrypted). Auth token is never returned — only masked.
// NOTE: must be registered before '/:id' so 'config' isn't treated as an id.
router.get('/config', authenticateToken, async (req: AuthRequest, res) => {
  const cfg = await getSmsConfig();
  res.json({
    accountSid: cfg.accountSid,
    fromNumber: cfg.fromNumber,
    messagingServiceSid: cfg.messagingServiceSid,
    authToken: cfg.authToken ? MASK : null,
    configured: cfg.configured,
    encryptionConfigured: isEncryptionConfigured(),
  });
});

router.put('/config', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { accountSid, authToken, fromNumber, messagingServiceSid } = req.body;
    const existing = await get(`SELECT * FROM sms_settings WHERE "locationId" IS NULL`);

    let tokenToStore: string | null = existing?.authToken ?? null;
    if (typeof authToken === 'string' && authToken.trim() && !authToken.includes('•')) {
      if (!isEncryptionConfigured()) {
        return res.status(400).json({ error: 'Set APP_ENCRYPTION_KEY (32-byte hex/base64) before storing the Twilio auth token.' });
      }
      tokenToStore = encryptSecret(authToken.trim());
    }

    const vals = [
      accountSid !== undefined ? (accountSid || null) : (existing?.accountSid ?? null),
      tokenToStore,
      fromNumber !== undefined ? (fromNumber || null) : (existing?.fromNumber ?? null),
      messagingServiceSid !== undefined ? (messagingServiceSid || null) : (existing?.messagingServiceSid ?? null),
    ];

    if (existing) {
      await run(
        `UPDATE sms_settings SET "accountSid" = ?, "authToken" = ?, "fromNumber" = ?, "messagingServiceSid" = ?,
           "isActive" = true, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
        [...vals, existing.id]
      );
    } else {
      await run(
        `INSERT INTO sms_settings ("locationId", "accountSid", "authToken", "fromNumber", "messagingServiceSid")
         VALUES (NULL, ?, ?, ?, ?)`,
        vals
      );
    }
    invalidateSmsConfigCache();
    const cfg = await getSmsConfig();
    res.json({
      accountSid: cfg.accountSid, fromNumber: cfg.fromNumber, messagingServiceSid: cfg.messagingServiceSid,
      authToken: cfg.authToken ? MASK : null, configured: cfg.configured, encryptionConfigured: isEncryptionConfigured(),
    });
  } catch (error: any) {
    serverError(res, error);
  }
});

// ── Twilio webhooks (public — Twilio posts form-urlencoded, no auth) ─────────

// Inbound SMS: handle STOP/START keywords to keep our opt-out state in sync.
router.post('/inbound', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const from: string = (req.body.From || '').trim();
    const text: string = (req.body.Body || '').trim().toUpperCase();
    const STOP = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
    const START = ['START', 'YES', 'UNSTOP'];
    const last10 = from.replace(/\D/g, '').slice(-10);
    if (last10) {
      if (STOP.includes(text)) {
        await run(`UPDATE members SET "smsOptOut" = true, "smsOptOutAt" = CURRENT_TIMESTAMP WHERE regexp_replace(phone, '\\D', '', 'g') LIKE ?`, [`%${last10}`]);
      } else if (START.includes(text)) {
        await run(`UPDATE members SET "smsOptOut" = false, "smsOptOutAt" = NULL WHERE regexp_replace(phone, '\\D', '', 'g') LIKE ?`, [`%${last10}`]);
      }
    }
    res.set('Content-Type', 'text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (e) {
    res.set('Content-Type', 'text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

// Delivery status callbacks from Twilio.
router.post('/status', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const sid = req.body.MessageSid || req.body.SmsSid;
    const status = String(req.body.MessageStatus || req.body.SmsStatus || '').toLowerCase();
    if (sid && ['delivered', 'undelivered', 'failed'].includes(status)) {
      await processDeliveryStatus(sid, status as any, req.body.ErrorMessage);
    }
    res.sendStatus(204);
  } catch {
    res.sendStatus(204);
  }
});

// Get single SMS campaign
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const campaign = await get(
      `SELECT
        sc.*,
        a.name as audienceName,
        u.firstName || ' ' || u.lastName as createdByName
      FROM sms_campaigns sc
      LEFT JOIN audiences a ON sc.audienceId = a.id
      LEFT JOIN users u ON sc.createdBy = u.id
      WHERE sc.id = ?`,
      [id]
    );

    if (!campaign) {
      return res.status(404).json({ error: 'SMS campaign not found' });
    }

    // Get recipients
    const recipients = await query(
      `SELECT
        scr.*,
        m.firstName || ' ' || m.lastName as memberName
      FROM sms_campaign_recipients scr
      LEFT JOIN members m ON scr.memberId = m.id
      WHERE scr.campaignId = ?
      ORDER BY scr.sentAt DESC`,
      [id]
    );

    res.json({ ...campaign, recipients });
  } catch (error: any) {
    console.error('Error fetching SMS campaign:', error);
    serverError(res, error);
  }
});

// Create SMS campaign
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { name, description, audienceId, message, scheduledFor, locationId } = req.body;

    if (!name || !audienceId || !message) {
      return res.status(400).json({ error: 'Name, audience, and message are required' });
    }

    // Validate message length (SMS limit is 160 characters for single message, 1600 for concatenated)
    if (message.length > 1600) {
      return res.status(400).json({ error: 'Message exceeds maximum length of 1600 characters' });
    }

    // Get audience to count recipients
    const audience = await get('SELECT * FROM audiences WHERE id = ?', [audienceId]);
    if (!audience) {
      return res.status(404).json({ error: 'Audience not found' });
    }

    // Resolve members via the shared audience resolver (same full filter set as
    // email + the Audiences preview); keep only those with a phone AND who have
    // not opted out of SMS.
    const filters = JSON.parse(audience.filters);
    const built = buildAudienceQuery(filters, { columns: 'id, phone, firstName, lastName', locationId });
    const members = await query(
      `${built.sql} AND phone IS NOT NULL AND phone != '' AND ("smsOptOut" IS NULL OR "smsOptOut" = false)`,
      built.params
    );

    const recipientCount = members.length;

    if (recipientCount === 0) {
      return res.status(400).json({ error: 'No opted-in recipients with phone numbers found in the selected audience' });
    }

    // Fail closed: a no-filter audience texts everyone. Require explicit confirm.
    if (built.filterCount === 0 && !req.body.confirmSendAll) {
      return res.status(400).json({
        error: `This audience has no filters, so it would text ALL ${recipientCount} members with a phone. Refused — confirm to text everyone.`,
        requiresConfirmAll: true,
        recipientCount,
      });
    }

    // Create campaign
    const result = await run(
      `INSERT INTO sms_campaigns (name, description, audienceId, message, scheduledFor, recipientCount, locationId, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description || null, audienceId, message, scheduledFor || null, recipientCount, locationId || null, req.user!.id]
    );

    // Create recipient records
    for (const member of members) {
      await run(
        `INSERT INTO sms_campaign_recipients (campaignId, memberId, phoneNumber)
         VALUES (?, ?, ?)`,
        [result.id, member.id, member.phone]
      );
    }

    const newCampaign = await get('SELECT * FROM sms_campaigns WHERE id = ?', [result.id]);
    res.status(201).json(newCampaign);
  } catch (error: any) {
    console.error('Error creating SMS campaign:', error);
    serverError(res, error);
  }
});

// Update SMS campaign
router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, description, message, scheduledFor, status } = req.body;

    const existing = await get('SELECT * FROM sms_campaigns WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'SMS campaign not found' });
    }

    // Don't allow editing sent campaigns
    if (existing.status === 'sent' || existing.status === 'sending') {
      return res.status(400).json({ error: 'Cannot edit a campaign that has been sent or is sending' });
    }

    await run(
      `UPDATE sms_campaigns SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        message = COALESCE(?, message),
        scheduledFor = COALESCE(?, scheduledFor),
        status = COALESCE(?, status),
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [name, description, message, scheduledFor, status, id]
    );

    const updated = await get('SELECT * FROM sms_campaigns WHERE id = ?', [id]);
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating SMS campaign:', error);
    serverError(res, error);
  }
});

// Delete SMS campaign
router.delete('/:id', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const existing = await get('SELECT * FROM sms_campaigns WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'SMS campaign not found' });
    }

    // Don't allow deleting sent campaigns
    if (existing.status === 'sent' || existing.status === 'sending') {
      return res.status(400).json({ error: 'Cannot delete a campaign that has been sent or is sending' });
    }

    await run('DELETE FROM sms_campaigns WHERE id = ?', [id]);
    res.json({ message: 'SMS campaign deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting SMS campaign:', error);
    serverError(res, error);
  }
});

// Send SMS campaign
router.post('/:id/send', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const campaign = await get('SELECT * FROM sms_campaigns WHERE id = ?', [id]);
    if (!campaign) {
      return res.status(404).json({ error: 'SMS campaign not found' });
    }

    if (campaign.status === 'sent') {
      return res.status(400).json({ error: 'Campaign has already been sent' });
    }

    if (campaign.status === 'sending') {
      return res.status(400).json({ error: 'Campaign is already sending' });
    }

    // Must have Twilio configured before we can send anything real.
    const cfg = await getSmsConfig();
    if (!cfg.configured) {
      return res.status(400).json({ error: 'Twilio is not configured. Add your credentials in Settings → SMS.' });
    }

    const pending = await query(
      `SELECT COUNT(*)::int AS n FROM sms_campaign_recipients WHERE campaignId = ? AND status = 'pending'`,
      [id]
    );
    const recipientCount = pending[0]?.n || 0;
    if (recipientCount === 0) {
      return res.status(400).json({ error: 'No pending recipients to send to.' });
    }

    // Mark sending, then process in the background (service updates per-recipient
    // status + campaign totals; the UI polls /:id/stats).
    await run(`UPDATE sms_campaigns SET status = 'sending', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    sendSMSCampaign(Number(id)).catch((e) => console.error(`SMS campaign ${id} send failed:`, e?.message));

    res.json({ message: 'SMS campaign sending initiated', recipientCount, campaignId: id });
  } catch (error: any) {
    console.error('Error sending SMS campaign:', error);
    serverError(res, error);
  }
});

// Recipients a campaign will text (for the Preview Recipients view).
router.get('/:id/recipients', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const recipients = await query(
      `SELECT r.id, r."phoneNumber", r.status, m."firstName", m."lastName"
       FROM sms_campaign_recipients r
       LEFT JOIN members m ON m.id = r."memberId"
       WHERE r."campaignId" = ? ORDER BY m."lastName" ASC NULLS LAST`,
      [req.params.id]
    );
    res.json({ recipientCount: recipients.length, recipients });
  } catch (error: any) {
    serverError(res, error);
  }
});

// Get campaign statistics
router.get('/:id/stats', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const campaign = await get('SELECT * FROM sms_campaigns WHERE id = ?', [id]);
    if (!campaign) {
      return res.status(404).json({ error: 'SMS campaign not found' });
    }

    const stats = await get(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(cost) as totalCost
      FROM sms_campaign_recipients
      WHERE campaignId = ?`,
      [id]
    );

    res.json({
      ...stats,
      deliveryRate: stats.sent > 0 ? ((stats.delivered / stats.sent) * 100).toFixed(2) : 0,
      failureRate: stats.sent > 0 ? ((stats.failed / stats.sent) * 100).toFixed(2) : 0
    });
  } catch (error: any) {
    console.error('Error fetching campaign stats:', error);
    serverError(res, error);
  }
});

// Send a test SMS through the configured Twilio account.
router.post('/send-test', authenticateToken, async (req: AuthRequest, res) => {
  const { to, message } = req.body;
  if (!to || !message) {
    return res.status(400).json({ error: 'to and message are required' });
  }
  try {
    const result = await sendSMS(to, message);
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Failed to send test SMS' });
    }
    res.json({ success: true, messageId: result.messageId, to });
  } catch (error: any) {
    console.error('SMS send-test error:', error);
    serverError(res, error);
  }
});

export default router;
