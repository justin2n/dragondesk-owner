import { Resend } from 'resend';

// Platform email (password resets) via Resend on the verified dragondeskapp.com
// domain — the same setup as DragonDesk: Optimize, with this app's own API key.
// Kept separate from any studio-configured marketing provider so login recovery
// works even when that provider is missing or broken. Without RESEND_API_KEY
// the link is logged instead, so the app still boots and an admin can recover
// an account from the server logs.
let cached: Resend | null = null;

function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!cached) cached = new Resend(key);
  return cached;
}

const FROM = () => process.env.EMAIL_FROM || 'DragonDesk <noreply@dragondeskapp.com>';
export const appUrl = (fallback: string) => (process.env.APP_URL || fallback).replace(/\/$/, '');

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export async function sendPasswordResetEmail(to: string, username: string, link: string): Promise<void> {
  const resend = client();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — password reset link for', to, 'is', link);
    return;
  }
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#111">
      <h2 style="margin:0 0 12px">Reset your password</h2>
      <p style="margin:0 0 16px;line-height:1.5">We received a request to reset the password for your
      DragonDesk account. Your username is <strong>${escapeHtml(username)}</strong>.</p>
      <p style="margin:0 0 24px">
        <a href="${link}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;
        padding:12px 20px;border-radius:6px;font-weight:600">Reset password</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#555">This link expires in 1 hour and can only be
      used once. If you did not request it, you can safely ignore this email — your password will not
      change.</p>
      <p style="margin:0;font-size:13px;color:#555;word-break:break-all">${link}</p>
    </div>`;
  // Resend reports failures in the response rather than throwing; log them with
  // the link so a locked-out user can still be helped from the server logs.
  const { error } = await resend.emails.send({ from: FROM(), to, subject: 'Reset your DragonDesk password', html });
  if (error) {
    console.error(`[email] password reset send FAILED for ${to}: ${error.message} — link: ${link}`);
    return;
  }
  console.log(`[email] password reset sent to ${to}`);
}
