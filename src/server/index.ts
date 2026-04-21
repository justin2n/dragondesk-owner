import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { pool } from './models/database';
import authRoutes from './routes/auth';
import membersRoutes from './routes/members';
import audiencesRoutes from './routes/audiences';
import campaignsRoutes from './routes/campaigns';
import abtestsRoutes from './routes/abtests';
import usersRoutes from './routes/users';
import eventsRoutes from './routes/events';
import locationsRoutes from './routes/locations';
import workforceRoutes from './routes/workforce';
import templatesRoutes from './routes/templates';
import emailRoutes from './routes/email';
import socialCampaignsRoutes from './routes/social-campaigns';
import socialAccountsRoutes from './routes/social-accounts';
import socialPostsRoutes from './routes/social-posts';
import socialCommentsRoutes from './routes/social-comments';
import abAnalyticsRoutes from './routes/ab-analytics';
import dkimRoutes from './routes/dkim';
import analyticsRoutes from './routes/analytics';
import programsRoutes from './routes/programs';
import smsCampaignsRoutes from './routes/sms-campaigns';
import leadFormsRoutes from './routes/lead-forms';
import churnMetricsRoutes from './routes/churn-metrics';
import billingSettingsRoutes from './routes/billing-settings';
import pricingPlansRoutes from './routes/pricing-plans';
import subscriptionsRoutes from './routes/subscriptions';
import paymentMethodsRoutes from './routes/payment-methods';
import invoicesRoutes from './routes/invoices';
import stripeWebhooksRoutes from './routes/stripe-webhooks';
import checkInsRoutes from './routes/check-ins';
import qrCodesRoutes from './routes/qr-codes';
import kioskRoutes from './routes/kiosk';
import attendanceRoutes from './routes/attendance';
import walletPassesRoutes from './routes/wallet-passes';
import proxyRoutes from './routes/proxy';
import assistantRoutes from './routes/assistant';
import trackingRoutes from './routes/tracking';
import importCsvRoutes from './routes/import-csv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

// Stripe webhooks need raw body for signature verification - must be before express.json()
app.use('/api/stripe/webhooks', express.raw({ type: 'application/json' }));

app.use(express.json());

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/members', membersRoutes);
app.use('/api/audiences', audiencesRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/abtests', abtestsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/workforce', workforceRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/social-campaigns', socialCampaignsRoutes);
app.use('/api/social-accounts', socialAccountsRoutes);
app.use('/api/social-posts', socialPostsRoutes);
app.use('/api/social-comments', socialCommentsRoutes);
app.use('/api/ab-analytics', abAnalyticsRoutes);
app.use('/api/dkim', dkimRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/programs', programsRoutes);
app.use('/api/sms-campaigns', smsCampaignsRoutes);
app.use('/api/lead-forms', leadFormsRoutes);
app.use('/api/churn-metrics', churnMetricsRoutes);
app.use('/api/billing', billingSettingsRoutes);
app.use('/api/pricing-plans', pricingPlansRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/payment-methods', paymentMethodsRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/stripe/webhooks', stripeWebhooksRoutes);
app.use('/api/check-ins', checkInsRoutes);
app.use('/api/qr-codes', qrCodesRoutes);
app.use('/api/kiosk', kioskRoutes);
app.use('/api/proxy', proxyRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/wallet-passes', walletPassesRoutes);
app.use('/api/import-csv', importCsvRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'DragonDesk CRM API is running' });
});

// Public lead capture — no auth required, for marketing site and lead forms
app.post('/api/public/lead', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const { firstName, lastName, email, phone, studio, message, program } = req.body;
    if (!firstName || !email) return res.status(400).json({ error: 'Name and email required' });

    const notes = [
      studio ? `Studio: ${studio}` : null,
      message || null,
    ].filter(Boolean).join('. ') || null;

    await pool.query(
      `INSERT INTO members ("firstName", "lastName", email, phone, "accountStatus", "accountType", "programType", "membershipAge", ranking, notes)
       VALUES ($1, $2, $3, $4, 'lead', 'basic', 'No Program Selected', 'Adult', 'White', $5)
       ON CONFLICT (email) DO NOTHING`,
      [
        firstName.trim(),
        (lastName || '').trim(),
        email.trim().toLowerCase(),
        phone || null,
        notes,
      ]
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// CORS preflight for public lead endpoint
app.options('/api/public/lead', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

// Temporary: assign pricing plans to members that don't have one
app.post('/api/admin/assign-plans', async (req, res) => {
  try {
    const plans = await pool.query(`SELECT id, "programType", "membershipAge", name FROM pricing_plans WHERE "isActive" = true ORDER BY id ASC`);
    if (plans.rows.length === 0) {
      return res.status(400).json({ error: 'No active pricing plans found. Create plans in Settings first.' });
    }

    const members = await pool.query(`SELECT id, "programType", "membershipAge" FROM members WHERE "pricingPlanId" IS NULL`);
    if (members.rows.length === 0) {
      return res.json({ message: 'All members already have a plan assigned.', updated: 0 });
    }

    let updated = 0;
    for (const member of members.rows) {
      // Try to find a matching plan by programType + membershipAge, then programType only, then any plan
      let plan = plans.rows.find(p =>
        (p.programType === member.programType || p.programType === 'All') &&
        (p.membershipAge === member.membershipAge || p.membershipAge === 'All')
      ) || plans.rows.find(p =>
        p.programType === member.programType || p.programType === 'All'
      ) || plans.rows[updated % plans.rows.length];

      await pool.query(`UPDATE members SET "pricingPlanId" = $1 WHERE id = $2`, [plan.id, member.id]);
      updated++;
    }

    res.json({ message: `Assigned plans to ${updated} members.`, updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Temporary: check member count
app.get('/api/admin/member-count', async (req, res) => {
  try {
    const total = await pool.query('SELECT COUNT(*) as count, COUNT("locationId") as with_location FROM members');
    const byStatus = await pool.query('SELECT "accountStatus", COUNT(*) as count FROM members GROUP BY "accountStatus"');
    res.json({ ...total.rows[0], byStatus: byStatus.rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Serve static client files if built (works regardless of NODE_ENV)
import { existsSync } from 'fs';
const clientPath = path.join(__dirname, '../client');
if (existsSync(clientPath)) {
  app.use(express.static(clientPath));

  // Catch-all route for client-side routing (Express 5 syntax)
  app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`🐉 DragonDesk CRM server running on port ${PORT}`);
});
