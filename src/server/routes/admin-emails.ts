import { Router } from 'express';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';
import { sendAdminEmail, isSendgridConfigured } from '../services/sendgrid';
import { serverError } from '../utils/errors';

const router = Router();
router.use(authenticateToken);

router.get('/config-status', async (req: AuthRequest, res) => {
  res.json({
    configured: isSendgridConfigured(),
    apiKeySet: !!process.env.SENDGRID_API_KEY,
    fromEmail: process.env.SENDGRID_FROM_EMAIL || null,
    fromName: process.env.SENDGRID_FROM_NAME || null,
  });
});

router.post('/send-test', async (req: AuthRequest, res) => {
  try {
    if (!isSendgridConfigured()) {
      return res.status(400).json({ error: 'SendGrid is not configured. Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL in Railway environment variables.' });
    }

    const to = (req.body.to as string) || (req.user as any)?.email;
    if (!to) return res.status(400).json({ error: 'Recipient email required' });

    await sendAdminEmail({
      to,
      subject: 'DragonDesk — Test Admin Email',
      html: `<!DOCTYPE html>
<html><body style="font-family:'Segoe UI',Arial,sans-serif;background:#0f0f1a;margin:0;padding:40px 0">
  <div style="max-width:500px;margin:0 auto;background:#1a1a2e;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#6c63ff,#a855f7);padding:28px 36px">
      <h1 style="margin:0;color:#fff;font-size:22px">DragonDesk</h1>
    </div>
    <div style="padding:32px 36px">
      <p style="color:#e2e8f0;font-size:16px;margin:0 0 12px">Admin email integration is working correctly.</p>
      <p style="color:#94a3b8;font-size:14px;margin:0">This test was sent from the DragonDesk Settings → Admin Email panel.</p>
    </div>
  </div>
</body></html>`,
      text: 'DragonDesk admin email integration is working correctly.',
    });

    res.json({ success: true, message: `Test email sent to ${to}` });
  } catch (err: any) {
    console.error('SendGrid test error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/send-alert', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    if (!isSendgridConfigured()) {
      return res.status(400).json({ error: 'SendGrid is not configured.' });
    }

    const { to, subject, message } = req.body;
    if (!to || !subject || !message) {
      return res.status(400).json({ error: 'to, subject, and message are required' });
    }

    const recipients: string[] = Array.isArray(to) ? to : [to];

    await sendAdminEmail({
      to: recipients,
      subject,
      html: `<!DOCTYPE html>
<html><body style="font-family:'Segoe UI',Arial,sans-serif;background:#0f0f1a;margin:0;padding:40px 0">
  <div style="max-width:560px;margin:0 auto;background:#1a1a2e;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#6c63ff,#a855f7);padding:28px 36px">
      <h1 style="margin:0;color:#fff;font-size:22px">DragonDesk</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:13px">Platform Alert</p>
    </div>
    <div style="padding:32px 36px">
      <p style="color:#e2e8f0;font-size:15px;line-height:1.7;white-space:pre-wrap;margin:0">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
    </div>
    <div style="padding:16px 36px;border-top:1px solid #2d2d44;text-align:center">
      <p style="margin:0;color:#4a5568;font-size:12px">DragonDesk CRM — Platform Notification</p>
    </div>
  </div>
</body></html>`,
      text: message,
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error('Send alert error:', err);
    serverError(res, err);
  }
});

export default router;
