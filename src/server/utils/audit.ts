import { pool } from '../models/database';
import { Request } from 'express';

export type AuditAction =
  | 'member.delete'
  | 'member.bulk_delete'
  | 'member.bulk_update'
  | 'member.import_csv'
  | 'member.status_change'
  | 'api_key.create'
  | 'api_key.revoke';

export const auditLog = async (
  action: AuditAction,
  userId: number | null,
  req: Request,
  details: Record<string, unknown>
): Promise<void> => {
  try {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';

    await pool.query(
      `INSERT INTO audit_logs (action, user_id, ip_address, details, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [action, userId, ip, JSON.stringify(details)]
    );
  } catch (_) {
    // Never let audit logging failure break the main operation
  }
};
