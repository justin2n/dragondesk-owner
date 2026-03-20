import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { run, get, query } from '../models/database';

export interface QRCodeResult {
  qrCode: string;
  qrCodeData: string;
  qrCodeImage: string; // Base64 encoded PNG
}

// Generate a unique QR code for a member
export async function generateMemberQRCode(memberId: number): Promise<QRCodeResult> {
  // Check if member already has a QR code
  const existing = await get(
    'SELECT * FROM member_qr_codes WHERE memberId = ? AND isActive = 1',
    [memberId]
  );

  if (existing) {
    // Return existing QR code with regenerated image
    const qrCodeImage = await QRCode.toDataURL(existing.qrCode, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    return {
      qrCode: existing.qrCode,
      qrCodeData: existing.qrCodeData,
      qrCodeImage
    };
  }

  // Generate new unique QR code
  const qrCode = `DD-${uuidv4()}`;
  const qrCodeData = JSON.stringify({
    type: 'member_checkin',
    code: qrCode,
    memberId,
    version: 1
  });

  // Generate QR code image
  const qrCodeImage = await QRCode.toDataURL(qrCode, {
    width: 300,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });

  // Store in database
  await run(
    `INSERT INTO member_qr_codes (memberId, qrCode, qrCodeData, isActive, createdAt, updatedAt)
     VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [memberId, qrCode, qrCodeData]
  );

  return {
    qrCode,
    qrCodeData,
    qrCodeImage
  };
}

// Regenerate QR code (invalidates old one)
export async function regenerateMemberQRCode(memberId: number): Promise<QRCodeResult> {
  // Deactivate existing QR codes
  await run(
    'UPDATE member_qr_codes SET isActive = 0, updatedAt = CURRENT_TIMESTAMP WHERE memberId = ?',
    [memberId]
  );

  // Generate new unique QR code
  const qrCode = `DD-${uuidv4()}`;
  const qrCodeData = JSON.stringify({
    type: 'member_checkin',
    code: qrCode,
    memberId,
    version: 1
  });

  // Generate QR code image
  const qrCodeImage = await QRCode.toDataURL(qrCode, {
    width: 300,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });

  // Store in database
  await run(
    `INSERT INTO member_qr_codes (memberId, qrCode, qrCodeData, isActive, createdAt, updatedAt)
     VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [memberId, qrCode, qrCodeData]
  );

  return {
    qrCode,
    qrCodeData,
    qrCodeImage
  };
}

// Look up member by QR code
export async function lookupMemberByQRCode(qrCode: string): Promise<any | null> {
  const qrRecord = await get(
    'SELECT * FROM member_qr_codes WHERE qrCode = ? AND isActive = 1',
    [qrCode]
  );

  if (!qrRecord) {
    return null;
  }

  // Update last used timestamp
  await run(
    'UPDATE member_qr_codes SET lastUsedAt = CURRENT_TIMESTAMP WHERE id = ?',
    [qrRecord.id]
  );

  // Get member details
  const member = await get(
    `SELECT m.*, l.name as locationName
     FROM members m
     LEFT JOIN locations l ON m.locationId = l.id
     WHERE m.id = ?`,
    [qrRecord.memberId]
  );

  return member;
}

// Get QR code for member
export async function getMemberQRCode(memberId: number): Promise<QRCodeResult | null> {
  const existing = await get(
    'SELECT * FROM member_qr_codes WHERE memberId = ? AND isActive = 1',
    [memberId]
  );

  if (!existing) {
    return null;
  }

  // Generate QR code image
  const qrCodeImage = await QRCode.toDataURL(existing.qrCode, {
    width: 300,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });

  return {
    qrCode: existing.qrCode,
    qrCodeData: existing.qrCodeData,
    qrCodeImage
  };
}

// Deactivate QR code
export async function deactivateMemberQRCode(memberId: number): Promise<void> {
  await run(
    'UPDATE member_qr_codes SET isActive = 0, updatedAt = CURRENT_TIMESTAMP WHERE memberId = ?',
    [memberId]
  );
}

// Generate QR code as PNG buffer (for downloads)
export async function generateQRCodeBuffer(qrCode: string): Promise<Buffer> {
  return await QRCode.toBuffer(qrCode, {
    width: 400,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });
}
