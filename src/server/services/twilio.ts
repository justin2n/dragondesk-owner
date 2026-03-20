import { query, run, get } from '../models/database';

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
  cost?: number;
}

/**
 * Get Twilio configuration from database/settings
 */
async function getTwilioConfig(): Promise<TwilioConfig | null> {
  // In a real implementation, this would fetch from a settings table
  // For now, use environment variables
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !phoneNumber) {
    return null;
  }

  return { accountSid, authToken, phoneNumber };
}

/**
 * Send a single SMS message
 */
export async function sendSMS(to: string, message: string): Promise<SMSResult> {
  try {
    const config = await getTwilioConfig();

    if (!config) {
      return {
        success: false,
        error: 'Twilio is not configured. Please add your Twilio credentials in Settings.'
      };
    }

    // Validate phone number format (basic validation)
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(to.replace(/[\s\-\(\)]/g, ''))) {
      return {
        success: false,
        error: 'Invalid phone number format'
      };
    }

    // Format phone number to E.164 format if not already
    let formattedPhone = to.replace(/[\s\-\(\)]/g, '');
    if (!formattedPhone.startsWith('+')) {
      // Assume US number if no country code
      formattedPhone = '+1' + formattedPhone;
    }

    // In a real implementation, this would use the Twilio SDK
    // For now, this is a placeholder that simulates the API call
    // To use real Twilio, install: npm install twilio
    // Then uncomment and use the code below:

    /*
    const twilio = require('twilio');
    const client = twilio(config.accountSid, config.authToken);

    const result = await client.messages.create({
      body: message,
      from: config.phoneNumber,
      to: formattedPhone
    });

    return {
      success: true,
      messageId: result.sid,
      cost: parseFloat(result.price) * -1 // Twilio returns negative price
    };
    */

    // Placeholder response for development
    console.log(`[Twilio Simulation] Sending SMS to ${formattedPhone}: ${message}`);

    return {
      success: true,
      messageId: `SM${Date.now()}${Math.random().toString(36).substr(2, 9)}`,
      cost: 0.0075 // Typical cost per SMS
    };

  } catch (error: any) {
    console.error('Error sending SMS:', error);
    return {
      success: false,
      error: error.message || 'Failed to send SMS'
    };
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

    let successCount = 0;
    let failureCount = 0;
    let totalCost = 0;

    // Send to each recipient
    for (const recipient of recipients) {
      const result = await sendSMS(recipient.phoneNumber, campaign.message);

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
