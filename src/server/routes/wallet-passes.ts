import express from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { query, get, run } from '../models/database';
import { getMemberQRCode, generateMemberQRCode } from '../services/qr-generator';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// NOTE: Wallet pass generation is currently stubbed
// To enable full functionality, you'll need:
// - Apple Wallet: Pass Type ID certificate from Apple Developer account
// - Google Wallet: Service account JSON from Google Cloud Console
// Once credentials are available, implement the actual pass generation in wallet-pass.ts service

// Generate wallet pass for a member
router.post('/generate/:memberId', async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.params;
    const { passType = 'apple' } = req.body; // 'apple' or 'google'

    // Verify member exists
    const member = await get(`
      SELECT id, firstName, lastName, email, programType, ranking
      FROM members WHERE id = ?
    `, [memberId]);

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Ensure member has a QR code
    let qrCode = await getMemberQRCode(parseInt(memberId));
    if (!qrCode) {
      qrCode = await generateMemberQRCode(parseInt(memberId));
    }

    // Log the attempt
    await run(`
      INSERT INTO wallet_pass_logs (memberId, passType, action, status, createdAt)
      VALUES (?, ?, 'generated', 'pending_credentials', CURRENT_TIMESTAMP)
    `, [memberId, passType]);

    // Return stubbed response
    res.json({
      success: false,
      stubbed: true,
      message: `${passType === 'apple' ? 'Apple' : 'Google'} Wallet pass generation requires credentials configuration`,
      member: {
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName
      },
      qrCode: qrCode?.qrCode,
      instructions: passType === 'apple'
        ? 'To enable Apple Wallet passes, add your Pass Type ID certificate to the server configuration'
        : 'To enable Google Wallet passes, add your Google Cloud service account JSON to the server configuration'
    });
  } catch (error) {
    console.error('Error generating wallet pass:', error);
    res.status(500).json({ error: 'Failed to generate wallet pass' });
  }
});

// Send wallet pass via email
router.post('/send/:memberId', async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.params;
    const { passType = 'apple', email } = req.body;

    // Verify member exists
    const member = await get(`
      SELECT id, firstName, lastName, email
      FROM members WHERE id = ?
    `, [memberId]);

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const recipientEmail = email || member.email;
    if (!recipientEmail) {
      return res.status(400).json({ error: 'No email address available' });
    }

    // Log the attempt
    await run(`
      INSERT INTO wallet_pass_logs (memberId, passType, action, recipientEmail, status, errorMessage, createdAt)
      VALUES (?, ?, 'sent', ?, 'pending_credentials', 'Wallet pass credentials not configured', CURRENT_TIMESTAMP)
    `, [memberId, passType, recipientEmail]);

    // Return stubbed response
    res.json({
      success: false,
      stubbed: true,
      message: `${passType === 'apple' ? 'Apple' : 'Google'} Wallet pass email requires credentials configuration`,
      recipientEmail,
      instructions: 'Configure wallet pass credentials in server settings to enable email sending'
    });
  } catch (error) {
    console.error('Error sending wallet pass:', error);
    res.status(500).json({ error: 'Failed to send wallet pass' });
  }
});

// Download wallet pass file
router.get('/download/:memberId', async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.params;
    const { passType = 'apple' } = req.query;

    // Verify member exists
    const member = await get(`
      SELECT id, firstName, lastName, email, programType, ranking
      FROM members WHERE id = ?
    `, [memberId]);

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Log the attempt
    await run(`
      INSERT INTO wallet_pass_logs (memberId, passType, action, status, errorMessage, createdAt)
      VALUES (?, ?, 'downloaded', 'pending_credentials', 'Wallet pass credentials not configured', CURRENT_TIMESTAMP)
    `, [memberId, passType]);

    // Return stubbed response (would normally return file)
    res.status(501).json({
      success: false,
      stubbed: true,
      message: `${passType === 'apple' ? 'Apple' : 'Google'} Wallet pass download requires credentials configuration`,
      instructions: passType === 'apple'
        ? 'Apple Wallet passes require a Pass Type ID certificate from your Apple Developer account'
        : 'Google Wallet passes require a service account JSON from Google Cloud Console'
    });
  } catch (error) {
    console.error('Error downloading wallet pass:', error);
    res.status(500).json({ error: 'Failed to download wallet pass' });
  }
});

// Get wallet pass status for a member
router.get('/status/:memberId', async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.params;

    // Get latest pass log entries
    const logs = await query(`
      SELECT * FROM wallet_pass_logs
      WHERE memberId = ?
      ORDER BY createdAt DESC
      LIMIT 10
    `, [memberId]);

    // Check if member has QR code
    const qrCode = await getMemberQRCode(parseInt(memberId));

    res.json({
      memberId: parseInt(memberId),
      hasQRCode: !!qrCode,
      qrCode: qrCode?.qrCode || null,
      credentialsConfigured: {
        apple: false, // Would check for actual credentials
        google: false
      },
      recentActivity: logs
    });
  } catch (error) {
    console.error('Error fetching wallet pass status:', error);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// Get all wallet pass activity (admin view)
router.get('/activity', async (req: AuthRequest, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const logs = await query(`
      SELECT wpl.*, m.firstName, m.lastName, m.email
      FROM wallet_pass_logs wpl
      JOIN members m ON wpl.memberId = m.id
      ORDER BY wpl.createdAt DESC
      LIMIT ? OFFSET ?
    `, [parseInt(limit as string), parseInt(offset as string)]);

    res.json(logs);
  } catch (error) {
    console.error('Error fetching wallet pass activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// Configuration status endpoint
router.get('/config-status', async (req: AuthRequest, res) => {
  try {
    res.json({
      configured: false,
      apple: {
        configured: false,
        requirements: [
          'Pass Type ID certificate (.p12 file)',
          'Pass Type ID (e.g., pass.com.yourcompany.membercard)',
          'Team ID from Apple Developer account',
          'WWDR certificate'
        ]
      },
      google: {
        configured: false,
        requirements: [
          'Google Cloud service account JSON',
          'Google Wallet API enabled',
          'Issuer ID from Google Pay & Wallet Console'
        ]
      },
      instructions: 'Contact support for help setting up wallet pass credentials'
    });
  } catch (error) {
    console.error('Error fetching config status:', error);
    res.status(500).json({ error: 'Failed to fetch config status' });
  }
});

export default router;
