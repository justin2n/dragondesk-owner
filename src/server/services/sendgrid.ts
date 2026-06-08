interface AdminEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export async function sendAdminEmail(opts: AdminEmailOptions): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME || 'DragonDesk';

  if (!apiKey) throw new Error('SENDGRID_API_KEY is not set');
  if (!fromEmail) throw new Error('SENDGRID_FROM_EMAIL is not set');

  const toArray = Array.isArray(opts.to) ? opts.to : [opts.to];

  const body = {
    personalizations: toArray.map(email => ({ to: [{ email }] })),
    from: { email: fromEmail, name: fromName },
    subject: opts.subject,
    content: [
      ...(opts.text ? [{ type: 'text/plain', value: opts.text }] : []),
      { type: 'text/html', value: opts.html },
    ],
    ...(opts.replyTo ? { reply_to: { email: opts.replyTo } } : {}),
  };

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`SendGrid error ${response.status}: ${errText}`);
  }
}

export function isSendgridConfigured(): boolean {
  return !!(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL);
}

export function welcomeEmailHtml(opts: {
  firstName: string;
  username: string;
  password: string;
  loginUrl: string;
  role: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#1a1a2e;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.4)">
    <div style="background:linear-gradient(135deg,#6c63ff 0%,#a855f7 100%);padding:32px 40px">
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;letter-spacing:-0.5px">DragonDesk</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px">Your CRM account is ready</p>
    </div>
    <div style="padding:36px 40px">
      <p style="margin:0 0 20px;color:#e2e8f0;font-size:16px">Hi ${opts.firstName},</p>
      <p style="margin:0 0 24px;color:#94a3b8;font-size:14px;line-height:1.6">
        An admin has created a DragonDesk account for you. Your login credentials are below.
        You'll be prompted to change your password on first login.
      </p>
      <div style="background:#0f0f1a;border-radius:8px;padding:24px;margin:0 0 28px">
        <div style="margin-bottom:16px">
          <div style="color:#6c63ff;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">Username</div>
          <div style="color:#e2e8f0;font-size:18px;font-weight:600;font-family:monospace">${opts.username}</div>
        </div>
        <div style="margin-bottom:16px">
          <div style="color:#6c63ff;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">Temporary Password</div>
          <div style="color:#e2e8f0;font-size:18px;font-weight:600;font-family:monospace">${opts.password}</div>
        </div>
        <div>
          <div style="color:#6c63ff;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">Role</div>
          <div style="color:#e2e8f0;font-size:14px;text-transform:capitalize">${opts.role.replace('_', ' ')}</div>
        </div>
      </div>
      <a href="${opts.loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#6c63ff,#a855f7);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;margin-bottom:28px">
        Log In to DragonDesk
      </a>
      <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6">
        For security, please change your password immediately after logging in.
        If you did not expect this email, please contact your admin.
      </p>
    </div>
    <div style="padding:20px 40px;border-top:1px solid #2d2d44;text-align:center">
      <p style="margin:0;color:#4a5568;font-size:12px">DragonDesk CRM — Platform Notification</p>
    </div>
  </div>
</body>
</html>`;
}
