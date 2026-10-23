import { pool } from '../models/database';
import { isValidEmail } from '../utils/validate';
import { escapeHtml, sendPlatformEmail } from './transactionalEmail';

// New-lead alerts: an entry in the in-app notification bell and, when turned
// on, an email to the configured staff recipients. Called by every path that
// creates a lead from outside the app (lead forms, the website chat agent, the
// marketing-site endpoint, Zapier). Staff-created contacts and CSV imports
// don't alert.

export interface AlertSettings {
  newLeadInApp: boolean;
  newLeadEmail: boolean;
  newLeadRecipients: string[];
}

function parseRecipients(raw: string | null | undefined): string[] {
  return (raw || '').split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
}

export async function getAlertSettings(): Promise<AlertSettings> {
  let result = await pool.query('SELECT * FROM alert_settings ORDER BY id LIMIT 1');
  if (result.rows.length === 0) {
    result = await pool.query('INSERT INTO alert_settings DEFAULT VALUES RETURNING *');
  }
  const row = result.rows[0];
  return {
    newLeadInApp: row.newLeadInApp !== false,
    newLeadEmail: !!row.newLeadEmail,
    newLeadRecipients: parseRecipients(row.newLeadRecipients),
  };
}

export async function saveAlertSettings(
  input: Partial<{ newLeadInApp: boolean; newLeadEmail: boolean; newLeadRecipients: string[] | string }>,
  userId: number,
): Promise<{ settings: AlertSettings; invalid: string[] }> {
  const current = await getAlertSettings();
  const list = input.newLeadRecipients === undefined
    ? current.newLeadRecipients
    : parseRecipients(Array.isArray(input.newLeadRecipients) ? input.newLeadRecipients.join(',') : input.newLeadRecipients);
  const invalid = list.filter(e => !isValidEmail(e));
  const recipients = [...new Set(list.filter(e => isValidEmail(e)))].slice(0, 25);

  await pool.query(
    `UPDATE alert_settings SET "newLeadInApp"=$1, "newLeadEmail"=$2, "newLeadRecipients"=$3,
       "updatedBy"=$4, "updatedAt"=CURRENT_TIMESTAMP
     WHERE id = (SELECT id FROM alert_settings ORDER BY id LIMIT 1)`,
    [
      typeof input.newLeadInApp === 'boolean' ? input.newLeadInApp : current.newLeadInApp,
      typeof input.newLeadEmail === 'boolean' ? input.newLeadEmail : current.newLeadEmail,
      recipients.join(','),
      userId,
    ]
  );
  return { settings: await getAlertSettings(), invalid };
}

interface LeadSummary {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  program: string | null;
  notes: string | null;
}

function leadEmail(lead: LeadSummary, source: string, link: string | null) {
  const rows: [string, string | null][] = [
    ['Name', lead.name],
    ['Email', lead.email],
    ['Phone', lead.phone],
    ['Program', lead.program && lead.program !== 'No Program Selected' ? lead.program : null],
    ['Source', source],
    ['Notes', lead.notes],
  ];
  const shown = rows.filter(([, v]) => v);
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <h2 style="margin:0 0 4px">New lead: ${escapeHtml(lead.name)}</h2>
      <p style="margin:0 0 20px;color:#555;font-size:14px">Came in through ${escapeHtml(source)}.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;margin:0 0 24px">
        ${shown.map(([k, v]) => `
        <tr>
          <td style="padding:8px 12px 8px 0;color:#555;vertical-align:top;white-space:nowrap;border-top:1px solid #eee">${k}</td>
          <td style="padding:8px 0;vertical-align:top;border-top:1px solid #eee;white-space:pre-wrap">${escapeHtml(String(v))}</td>
        </tr>`).join('')}
      </table>
      ${link ? `<p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">Open in DragonDesk</a></p>` : ''}
      <p style="margin:0;font-size:12px;color:#888">You get this because you are on the new-lead alert list in DragonDesk Settings, under Notifications.</p>
    </div>`;
  const text = [`New lead: ${lead.name}`, `Came in through ${source}.`, '', ...shown.map(([k, v]) => `${k}: ${v}`), ...(link ? ['', link] : [])].join('\n');
  return { subject: `New lead: ${lead.name}`, html, text };
}

async function deliver(memberId: number, source: string, appUrl: string | null): Promise<void> {
  const settings = await getAlertSettings();
  const wantsEmail = settings.newLeadEmail && settings.newLeadRecipients.length > 0;
  if (!settings.newLeadInApp && !wantsEmail) return;

  const m = (await pool.query(
    `SELECT id, "firstName", "lastName", email, phone, "programType", notes FROM members WHERE id = $1`,
    [memberId]
  )).rows[0];
  if (!m) return;

  const lead: LeadSummary = {
    id: m.id,
    name: [m.firstName, m.lastName].filter(Boolean).join(' ').trim() || m.email || 'Unknown',
    email: m.email,
    phone: m.phone,
    program: m.programType,
    notes: m.notes ? String(m.notes).slice(0, 1000) : null,
  };
  const path = `/members?member=${lead.id}`;

  if (settings.newLeadInApp) {
    await pool.query(
      `INSERT INTO notifications (type, title, body, link, "memberId") VALUES ('new_lead', $1, $2, $3, $4)`,
      [`New lead: ${lead.name}`, [source, lead.email].filter(Boolean).join(' - '), path, lead.id]
    );
    // Keep the table small; the bell only ever shows the latest few.
    await pool.query(`DELETE FROM notifications WHERE "createdAt" < NOW() - INTERVAL '90 days'`);
  }

  if (wantsEmail) {
    const base = (process.env.APP_URL || appUrl || '').replace(/\/$/, '');
    const { subject, html, text } = leadEmail(lead, source, base ? base + path : null);
    await sendPlatformEmail({ to: settings.newLeadRecipients, subject, html, text });
    console.log(`[alerts] new-lead email for member ${lead.id} sent to ${settings.newLeadRecipients.length} recipient(s)`);
  }
}

// Fire-and-forget: a failed alert must never fail the lead capture itself.
export function notifyNewLead(memberId: number, source: string, appUrl?: string | null): void {
  deliver(memberId, source, appUrl || null).catch(err => {
    console.error(`[alerts] new-lead alert failed for member ${memberId}:`, err?.message || err);
  });
}

// The app's public origin from an incoming request, for links in emails when
// APP_URL isn't set. Uses Host (which the platform routes on) and never
// X-Forwarded-Host, which any public caller could set to plant a link.
export function requestOrigin(req: { get(name: string): string | undefined; protocol: string }): string | null {
  const host = req.get('host');
  if (!host) return null;
  return `${req.get('x-forwarded-proto') || req.protocol}://${host}`;
}

export async function sendTestLeadEmail(to: string[]): Promise<void> {
  const { subject, html, text } = leadEmail(
    { id: 0, name: 'Test Lead', email: 'test.lead@example.com', phone: '555-0100', program: 'Adult BJJ', notes: 'This is a test of your DragonDesk new-lead alert.' },
    'Test',
    null,
  );
  await sendPlatformEmail({ to, subject: `[Test] ${subject}`, html, text });
}
