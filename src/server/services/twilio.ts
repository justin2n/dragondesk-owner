import { query, run, get } from '../models/database';
import { getSmsConfig } from './smsConfig';

interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
  cost?: number;
}

// Public base URL for Twilio status callbacks (set on outbound messages).
function publicBaseUrl(): string {
  return process.env.APP_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '');
}

/**
 * Send a single SMS message
 */
export async function sendSMS(to: string, message: string): Promise<SMSResult> {
  try {
    const config = await getSmsConfig();
    if (!config.configured || !config.accountSid || !config.authToken) {
      return { success: false, error: 'Twilio is not configured. Add your Twilio credentials in Settings → SMS.' };
    }

    // Basic validation + E.164 formatting (assume US when no country code).
    const cleaned = to.replace(/[\s\-()]/g, '');
    if (!/^\+?[1-9]\d{1,14}$/.test(cleaned)) {
      return { success: false, error: 'Invalid phone number format' };
    }
    const formattedPhone = cleaned.startsWith('+') ? cleaned : '+1' + cleaned;

    // Twilio REST API (no SDK dependency — same fetch approach as the email providers).
    const body = new URLSearchParams();
    body.set('To', formattedPhone);
    body.set('Body', message);
    if (config.messagingServiceSid) body.set('MessagingServiceSid', config.messagingServiceSid);
    else body.set('From', config.fromNumber || '');
    const cbBase = publicBaseUrl();
    if (cbBase) body.set('StatusCallback', `${cbBase}/api/sms-campaigns/status`);

    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { success: false, error: data?.message || `Twilio error ${resp.status}` };
    }
    return {
      success: true,
      messageId: data.sid,
      // Twilio returns price as a negative string once billed; often null at create time.
      cost: data.price ? Math.abs(parseFloat(data.price)) : 0,
    };
  } catch (error: any) {
    console.error('Error sending SMS:', error);
    return { success: false, error: error.message || 'Failed to send SMS' };
  }
}

/**
 * Send SMS campaign to all recipients
 */
export async function sendSMSCampaign(campaignId: number): Promise<void> {
  try {
    // Get campaign
    const campaign = await get('SELECT * FROM sms_campaigns WHERE id = ?', [campaignId]);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Get all pending recipients
    const recipients = await query(
      'SELECT * FROM sms_campaign_recipients WHERE campaignId = ? AND status = \'pending\'',
      [campaignId]
    );

    // Compliance: ensure the message carries opt-out language.
    const message = /\bstop\b/i.test(campaign.message)
      ? campaign.message
      : `${campaign.message} Reply STOP to opt out.`;

    let successCount = 0;
    let failureCount = 0;
    let totalCost = 0;

    // Send to each recipient
    for (const recipient of recipients) {
      // Defensive: never text someone who has opted out (belt-and-suspenders;
      // opted-out members are already excluded when recipients are snapshotted).
      const optedOut = recipient.memberId
        ? await get('SELECT "smsOptOut" FROM members WHERE id = ?', [recipient.memberId])
        : null;
      if (optedOut?.smsOptOut) {
        await run(`UPDATE sms_campaign_recipients SET status = 'unsubscribed' WHERE id = ?`, [recipient.id]);
        continue;
      }
      const result = await sendSMS(recipient.phoneNumber, message);

      if (result.success) {
        // Update recipient status
        await run(
          `UPDATE sms_campaign_recipients SET
            status = 'sent',
            messageId = ?,
            cost = ?,
            sentAt = CURRENT_TIMESTAMP
          WHERE id = ?`,
          [result.messageId, result.cost || 0, recipient.id]
        );
        successCount++;
        totalCost += result.cost || 0;
      } else {
        // Mark as failed
        await run(
          `UPDATE sms_campaign_recipients SET
            status = 'failed',
            errorMessage = ?
          WHERE id = ?`,
          [result.error, recipient.id]
        );
        failureCount++;
      }

      // Add a small delay to avoid rate limiting (optional)
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Update campaign status
    await run(
      `UPDATE sms_campaigns SET
        status = 'sent',
        sentAt = CURRENT_TIMESTAMP,
        successCount = ?,
        failureCount = ?,
        cost = ?,
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [successCount, failureCount, totalCost, campaignId]
    );

    console.log(`SMS Campaign ${campaignId} completed: ${successCount} sent, ${failureCount} failed, $${totalCost.toFixed(4)} cost`);

  } catch (error: any) {
    console.error('Error sending SMS campaign:', error);

    // Mark campaign as failed
    await run(
      `UPDATE sms_campaigns SET
        status = 'failed',
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [campaignId]
    );

    throw error;
  }
}

/**
 * Process delivery status webhook from Twilio
 * This would be called by a webhook endpoint when Twilio sends delivery updates
 */
export async function processDeliveryStatus(
  messageId: string,
  status: 'delivered' | 'failed' | 'undelivered',
  errorMessage?: string
): Promise<void> {
  try {
    const recipient = await get(
      'SELECT * FROM sms_campaign_recipients WHERE messageId = ?',
      [messageId]
    );

    if (!recipient) {
      console.warn(`Recipient not found for message ${messageId}`);
      return;
    }

    if (status === 'delivered') {
      await run(
        `UPDATE sms_campaign_recipients SET
          status = 'delivered',
          deliveredAt = CURRENT_TIMESTAMP
        WHERE messageId = ?`,
        [messageId]
      );
    } else {
      await run(
        `UPDATE sms_campaign_recipients SET
          status = 'failed',
          errorMessage = ?
        WHERE messageId = ?`,
        [errorMessage || 'Delivery failed', messageId]
      );
    }
  } catch (error) {
    console.error('Error processing delivery status:', error);
  }
}

export default {
  sendSMS,
  sendSMSCampaign,
  processDeliveryStatus
};
