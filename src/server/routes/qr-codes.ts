import express from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { query, get } from '../models/database';
import {
  generateMemberQRCode,
  regenerateMemberQRCode,
  getMemberQRCode,
  lookupMemberByQRCode,
  deactivateMemberQRCode,
  generateQRCodeBuffer
} from '../services/qr-generator';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get all QR codes (admin view)
router.get('/', async (_req: AuthRequest, res) => {
  try {
    const qrCodes = await query(`
      SELECT qr.*, m.firstName, m.lastName, m.email, m.programType
      FROM member_qr_codes qr
      JOIN members m ON qr.memberId = m.id
      WHERE qr.isActive = 1
      ORDER BY qr.createdAt DESC
    `);
    res.json(qrCodes);
  } catch (error) {
    console.error('Error fetching QR codes:', error);
    res.status(500).json({ error: 'Failed to fetch QR codes' });
  }
});

// Get QR code for a specific member
router.get('/member/:memberId', async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.params;
    const qrCode = await getMemberQRCode(parseInt(memberId));

    if (!qrCode) {
      return res.status(404).json({ error: 'No QR code found for this member' });
    }

    res.json(qrCode);
  } catch (error) {
    console.error('Error fetching member QR code:', error);
    res.status(500).json({ error: 'Failed to fetch QR code' });
  }
});

// Generate QR code for a member
router.post('/generate/:memberId', async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.params;

    // Verify member exists
    const member = await get('SELECT id FROM members WHERE id = ?', [memberId]);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const qrCode = await generateMemberQRCode(parseInt(memberId));
    res.json(qrCode);
  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Regenerate QR code for a member (invalidates old one)
router.post('/regenerate/:memberId', async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.params;

    // Verify member exists
    const member = await get('SELECT id FROM members WHERE id = ?', [memberId]);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const qrCode = await regenerateMemberQRCode(parseInt(memberId));
    res.json(qrCode);
  } catch (error) {
    console.error('Error regenerating QR code:', error);
    res.status(500).json({ error: 'Failed to regenerate QR code' });
  }
});

// Deactivate QR code for a member
router.delete('/member/:memberId', async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.params;
    await deactivateMemberQRCode(parseInt(memberId));
    res.json({ success: true, message: 'QR code deactivated' });
  } catch (error) {
    console.error('Error deactivating QR code:', error);
    res.status(500).json({ error: 'Failed to deactivate QR code' });
  }
});

// Scan/lookup member by QR code (for admin scanner)
router.get('/scan/:code', async (req: AuthRequest, res) => {
  try {
    const { code } = req.params;
    const member = await lookupMemberByQRCode(code);

    if (!member) {
      return res.status(404).json({ error: 'Invalid or inactive QR code' });
    }

    res.json(member);
  } catch (error) {
    console.error('Error scanning QR code:', error);
    res.status(500).json({ error: 'Failed to scan QR code' });
  }
});

// Download QR code as PNG
router.get('/download/:memberId', async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.params;
    const qrCodeRecord = await get(
      'SELECT qrCode FROM member_qr_codes WHERE memberId = ? AND isActive = 1',
      [memberId]
    );

    if (!qrCodeRecord) {
      return res.status(404).json({ error: 'No QR code found for this member' });
    }

    const buffer = await generateQRCodeBuffer(qrCodeRecord.qrCode);

    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="qrcode-member-${memberId}.png"`,
      'Content-Length': buffer.length
    });

    res.send(buffer);
  } catch (error) {
    console.error('Error downloading QR code:', error);
    res.status(500).json({ error: 'Failed to download QR code' });
  }
});

// Bulk generate QR codes for all members without one
router.post('/bulk-generate', async (_req: AuthRequest, res) => {
  try {
    // Get all members without active QR codes
    const membersWithoutQR = await query(`
      SELECT m.id FROM members m
      LEFT JOIN member_qr_codes qr ON m.id = qr.memberId AND qr.isActive = 1
      WHERE qr.id IS NULL
    `);

    const results = {
      generated: 0,
      failed: 0,
      errors: [] as string[]
    };

    for (const member of membersWithoutQR) {
      try {
        await generateMemberQRCode(member.id);
        results.generated++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(`Member ${member.id}: ${error.message}`);
      }
    }

    res.json({
      success: true,
      message: `Generated ${results.generated} QR codes`,
      ...results
    });
  } catch (error) {
    console.error('Error in bulk QR code generation:', error);
    res.status(500).json({ error: 'Failed to bulk generate QR codes' });
  }
});

export default router;
