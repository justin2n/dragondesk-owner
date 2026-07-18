import { serverError } from '../utils/errors';
import express from 'express';
import { query, run, get } from '../models/database';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';
import { buildAudienceQuery } from '../utils/audienceMembers';

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
    // email + the Audiences preview), then keep only those with a phone number.
    const filters = JSON.parse(audience.filters);
    const built = buildAudienceQuery(filters, { columns: 'id, phone, firstName, lastName', locationId });
    const members = await query(
      `${built.sql} AND phone IS NOT NULL AND phone != ''`,
      built.params
    );

    const recipientCount = members.length;

    if (recipientCount === 0) {
      return res.status(400).json({ error: 'No recipients with phone numbers found in the selected audience' });
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

    // Update status to sending
    await run(
      `UPDATE sms_campaigns SET status = 'sending', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );

    // Get recipients
    const recipients = await query(
      `SELECT * FROM sms_campaign_recipients WHERE campaignId = ? AND status = 'pending'`,
      [id]
    );

    // In a real implementation, this would be handled by a queue/background job
    // For now, we'll just mark it as sent
    // The actual SMS sending will be handled by the Twilio service

    res.json({
      message: 'SMS campaign sending initiated',
      recipientCount: recipients.length,
      campaignId: id
    });

    // Note: The actual sending logic would be in a separate service/worker
    // This would typically:
    // 1. Get Twilio credentials from settings
    // 2. Send messages in batches
    // 3. Update recipient status
    // 4. Update campaign statistics
    // 5. Mark campaign as sent when complete

  } catch (error: any) {
    console.error('Error sending SMS campaign:', error);
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

// Send a test SMS via Twilio REST API
router.post('/send-test', authenticateToken, async (req: AuthRequest, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({ error: 'to and message are required' });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return res.status(400).json({
      error: 'Twilio is not configured.',
      details: 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in your Railway environment variables.',
    });
  }

  // Normalise to E.164
  let toNumber = to.replace(/[\s\-\(\)]/g, '');
  if (!toNumber.startsWith('+')) toNumber = '+1' + toNumber;

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({ To: toNumber, From: fromNumber, Body: message });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data: any = await response.json();

    if (!response.ok) {
      return res.status(400).json({ error: data.message || 'Twilio error', details: data });
    }

    res.json({ success: true, messageId: data.sid, to: toNumber });
  } catch (error: any) {
    console.error('SMS send-test error:', error);
    serverError(res, error);
  }
});

export default router;
