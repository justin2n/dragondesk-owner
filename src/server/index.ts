import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
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
import membershipsRoutes from './routes/memberships';
import membershipSeatsRoutes from './routes/membership-seats';
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
import webhooksRoutes from './routes/webhooks';
import posRoutes from './routes/pos';
import adminEmailsRoutes from './routes/admin-emails';
import salesSignalsRoutes from './routes/sales-signals';
import alertsRoutes from './routes/alerts';
import { authenticateToken, authorizeAdmin } from './middleware/auth';
import { serverError } from './utils/errors';
import { createHash } from 'crypto';
import rateLimit from 'express-rate-limit';
import { isValidEmail, normalizeEmail } from './utils/validate';

dotenv.config();

pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN DEFAULT false`).catch(() => {});
pool.query(`ALTER TABLE tracking_visitors ADD COLUMN IF NOT EXISTS "ipAddress" TEXT`).catch(() => {});
pool.query(`ALTER TABLE tracking_visitors ADD COLUMN IF NOT EXISTS country TEXT`).catch(() => {});
pool.query(`ALTER TABLE tracking_visitors ADD COLUMN IF NOT EXISTS city TEXT`).catch(() => {});
pool.query(`ALTER TABLE tracking_visitors ADD COLUMN IF NOT EXISTS "geoResolved" BOOLEAN DEFAULT false`).catch(() => {});
pool.query(`
  CREATE TABLE IF NOT EXISTS visitor_identities (
    id SERIAL PRIMARY KEY,
    "visitorId" TEXT NOT NULL,
    token TEXT NOT NULL,
    type TEXT NOT NULL,
    value TEXT NOT NULL,
    "memberId" INTEGER REFERENCES members(id) ON DELETE SET NULL,
    confidence TEXT DEFAULT 'high',
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("visitorId", token, type)
  )
`).catch(() => {});
pool.query(`CREATE INDEX IF NOT EXISTS idx_visitor_identities_vid ON visitor_identities("visitorId", token)`).catch(() => {});
pool.query(`
  CREATE TABLE IF NOT EXISTS identity_settings (
    id SERIAL PRIMARY KEY,
    priority JSONB NOT NULL DEFAULT '["email","phone","name"]',
    "autoResolve" BOOLEAN DEFAULT true,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).catch(() => {});
pool.query(`
  CREATE TABLE IF NOT EXISTS member_history (
    id SERIAL PRIMARY KEY,
    "memberId" INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    "userId" INTEGER REFERENCES users(id) ON DELETE SET NULL,
    "userName" TEXT,
    action TEXT NOT NULL,
    changes JSONB,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).catch(() => {});
pool.query(`CREATE INDEX IF NOT EXISTS idx_member_history_member ON member_history("memberId")`).catch(() => {});

// Unconditionally fix schema on every boot — independent of migration chain
pool.query(`ALTER TABLE members DROP CONSTRAINT IF EXISTS members_accountstatus_check`).catch(() => {});
pool.query(`ALTER TABLE members DROP CONSTRAINT IF EXISTS "members_accountStatus_check"`).catch(() => {});
pool.query(`ALTER TABLE members ADD CONSTRAINT members_accountstatus_check CHECK("accountStatus" IN ('lead', 'trialer', 'member', 'cancelled'))`).catch(() => {});
pool.query(`ALTER TABLE members DROP CONSTRAINT IF EXISTS members_programtype_check`).catch(() => {});
pool.query(`ALTER TABLE members DROP CONSTRAINT IF EXISTS "members_programType_check"`).catch(() => {});
pool.query(`ALTER TABLE members ALTER COLUMN "programType" DROP NOT NULL`).catch(() => {});
pool.query(`ALTER TABLE members ALTER COLUMN "programType" SET DEFAULT 'No Program Selected'`).catch(() => {});
pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS "pricingPlanId" INTEGER REFERENCES pricing_plans(id) ON DELETE SET NULL`).catch(() => {});
pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS "syncedFromMyStudio" BOOLEAN DEFAULT false`).catch(() => {});
pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS "companyName" TEXT`).catch(() => {});
pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS "gaClientId" TEXT`).catch(() => {});
pool.query(`ALTER TABLE pricing_plans DROP CONSTRAINT IF EXISTS pricing_plans_programtype_check`).catch(() => {});
pool.query(`ALTER TABLE pricing_plans DROP CONSTRAINT IF EXISTS "pricing_plans_programType_check"`).catch(() => {});
pool.query(`
  CREATE TABLE IF NOT EXISTS webhook_api_keys (
    id SERIAL PRIMARY KEY,
    label TEXT NOT NULL DEFAULT 'Zapier',
    api_key TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true
  )
`).catch(() => {});
pool.query(`
  CREATE TABLE IF NOT EXISTS check_ins (
    id SERIAL PRIMARY KEY,
    "memberId" INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    "locationId" INTEGER REFERENCES locations(id),
    "checkInTime" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "checkInMethod" TEXT NOT NULL DEFAULT 'manual',
    "eventId" INTEGER REFERENCES events(id),
    notes TEXT,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).catch(() => {});
pool.query(`
  CREATE TABLE IF NOT EXISTS churn_metrics (
    id SERIAL PRIMARY KEY,
    "memberId" INTEGER REFERENCES members(id) ON DELETE SET NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    email TEXT NOT NULL,
    "accountType" TEXT,
    "programType" TEXT,
    "membershipAge" TEXT,
    "cancelledBy" INTEGER REFERENCES users(id) ON DELETE SET NULL,
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).catch(() => {});

pool.query(`
  CREATE TABLE IF NOT EXISTS zapier_webhook_log (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "memberId" INTEGER REFERENCES members(id) ON DELETE SET NULL,
    "wasNew" BOOLEAN NOT NULL DEFAULT true,
    "receivedAt" TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(() => {});
pool.query(`CREATE INDEX IF NOT EXISTS idx_zapier_log_received ON zapier_webhook_log("receivedAt")`).catch(() => {});

pool.query(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    action TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ip_address TEXT,
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
  )
`).catch(() => {});
pool.query(`CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action)`).catch(() => {});
pool.query(`CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON audit_logs(user_id)`).catch(() => {});

// POS tables
pool.query(`
  CREATE TABLE IF NOT EXISTS pos_products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price INTEGER NOT NULL,
    sku TEXT,
    category TEXT DEFAULT 'General',
    "imageUrl" TEXT,
    "isActive" BOOLEAN DEFAULT true,
    inventory INTEGER,
    "locationId" INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
  )
`).catch(() => {});
pool.query(`
  CREATE TABLE IF NOT EXISTS pos_transactions (
    id SERIAL PRIMARY KEY,
    "locationId" INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    "memberId" INTEGER REFERENCES members(id) ON DELETE SET NULL,
    subtotal INTEGER NOT NULL,
    tax INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    status TEXT NOT NULL DEFAULT 'completed',
    "cashReceived" INTEGER,
    "changeGiven" INTEGER,
    notes TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW()
  )
`).catch(() => {});
pool.query(`
  CREATE TABLE IF NOT EXISTS pos_transaction_items (
    id SERIAL PRIMARY KEY,
    "transactionId" INTEGER NOT NULL REFERENCES pos_transactions(id) ON DELETE CASCADE,
    "productId" INTEGER REFERENCES pos_products(id) ON DELETE SET NULL,
    "productName" TEXT NOT NULL,
    "productPrice" INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    subtotal INTEGER NOT NULL
  )
`).catch(() => {});

// Migrate existing plaintext API keys to SHA-256 hashes
(async () => {
  try {
    const rows = await pool.query(
      `SELECT id, api_key FROM webhook_api_keys WHERE api_key LIKE 'ddk_%'`
    );
    for (const row of rows.rows) {
      const hash = createHash('sha256').update(row.api_key).digest('hex');
      await pool.query(`UPDATE webhook_api_keys SET api_key = $1 WHERE id = $2`, [hash, row.id]);
    }
    if (rows.rows.length > 0) {
      console.log(`Migrated ${rows.rows.length} webhook API key(s) to hashed storage.`);
    }
  } catch (_) {}
})();

const app = express();
const PORT = process.env.PORT || 5000;

// Trust Railway / any reverse-proxy's X-Forwarded-* headers so req.protocol
// returns 'https' correctly (without this, it always returns 'http').
app.set('trust proxy', true);

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disabled — React SPA uses inline scripts; enable with a nonce in a future pass
  crossOriginEmbedderPolicy: false,
}));

// Public CORS for tracking endpoints — external websites (e.g. dragongym.com)
// must be able to call /collect and /personalize. This middleware runs before
// the restrictive global cors() so it wins the preflight race.
app.use('/api/tracking', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// CORS — allow any subdomain of dragondeskapp.com plus explicit overrides
const extraOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5000'];

const isAllowedOrigin = (origin: string): boolean => {
  // Any subdomain of dragondeskapp.com over HTTPS
  if (/^https:\/\/[a-z0-9-]+\.dragondeskapp\.com$/.test(origin)) return true;
  // Explicit list (localhost in dev, or any additional domains)
  if (extraOrigins.includes(origin)) return true;
  return false;
};

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, Postman)
    if (!origin) return callback(null, true);
    if (isAllowedOrigin(origin)) return callback(null, true);
    // Return false (not an Error) — don't set the header but don't 500 either.
    // Public tracking endpoints have already set their own CORS headers above.
    callback(null, false);
  },
  credentials: true,
}));

app.use(cookieParser());

// Stripe webhooks need raw body for signature verification - must be before express.json()
app.use('/api/stripe/webhooks', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── Rate limiters for public / unauthenticated endpoints ────────────────────
// These MUST be registered before the routes they protect: Express runs
// middleware in registration order, so a limiter added after the route never
// runs. (They were previously registered afterward and silently did nothing.)
const publicLeadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many submissions. Please try again later.' },
  standardHeaders: true, legacyHeaders: false,
});
const kioskLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests from this kiosk. Slow down.' },
  standardHeaders: true, legacyHeaders: false,
});
const trackingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Rate limit exceeded.' },
  standardHeaders: true, legacyHeaders: false,
});
// The A/B analytics beacon (/track) is public; throttle per-IP so it can't flood
// ab_test_events. Generous enough for real page traffic.
const abAnalyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Rate limit exceeded.' },
  standardHeaders: true, legacyHeaders: false,
});
app.use('/api/kiosk', kioskLimiter);
app.use('/api/tracking', trackingLimiter);
app.use('/api/ab-analytics', abAnalyticsLimiter);

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
app.use('/api/memberships', membershipsRoutes);
app.use('/api/membership-seats', membershipSeatsRoutes);
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
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/admin-emails', adminEmailsRoutes);
app.use('/api/sales-signals', salesSignalsRoutes);
app.use('/api/alerts', alertsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'DragonDesk CRM API is running' });
});


// Public lead capture — no auth required, for marketing site and lead forms
app.post('/api/public/lead', publicLeadLimiter, async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const { firstName, lastName, email, phone, studio, message, program, gaClientId } = req.body;
    if (!firstName || !email) return res.status(400).json({ error: 'Name and email required' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format' });

    // Program Interest is the Lead-stage product, and the lead form's program
    // field is where it comes from. Match it to a configured program so the
    // lead lands with a real interest instead of an unusable free-text string.
    let programInterestId: number | null = null;
    let programName = 'No Program Selected';
    if (program && String(program).trim()) {
      const match = await pool.query(
        `SELECT id, name FROM programs WHERE lower(name) = lower($1) LIMIT 1`,
        [String(program).trim()],
      );
      if (match.rows[0]) {
        programInterestId = match.rows[0].id;
        programName = match.rows[0].name;
      }
    }

    await pool.query(
      `INSERT INTO members ("firstName", "lastName", email, phone, "accountStatus", "programType", "membershipAge", ranking, "companyName", notes, "gaClientId", "programInterestId")
       VALUES ($1, $2, $3, $4, 'lead', $8, 'Adult', 'White', $5, $6, $7, $9)
       ON CONFLICT (email) DO UPDATE SET
         "gaClientId" = COALESCE(members."gaClientId", EXCLUDED."gaClientId"),
         "programInterestId" = COALESCE(members."programInterestId", EXCLUDED."programInterestId")`,
      [
        firstName.trim(),
        (lastName || '').trim(),
        normalizeEmail(email),
        phone || null,
        studio || null,
        message || null,
        gaClientId || null,
        programName,
        programInterestId,
      ]
    );
    res.json({ success: true });
  } catch (error: any) {
    serverError(res, error);
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
app.post('/api/admin/assign-plans', authenticateToken, authorizeAdmin, async (req, res) => {
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
    serverError(res, error);
  }
});

// Temporary: check member count
app.get('/api/admin/member-count', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const total = await pool.query('SELECT COUNT(*) as count, COUNT("locationId") as with_location FROM members');
    const byStatus = await pool.query('SELECT "accountStatus", COUNT(*) as count FROM members GROUP BY "accountStatus"');
    res.json({ ...total.rows[0], byStatus: byStatus.rows });
  } catch (error: any) {
    serverError(res, error);
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

// Safety net: a single stray rejection/exception should never take the whole
// API down (Node's default on unhandledRejection is to exit). Log loudly and
// keep serving — per-request errors are still handled by their route's catch.
process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[process] uncaughtException:', err);
});

app.listen(PORT, () => {
  console.log(`🐉 DragonDesk CRM server running on port ${PORT}`);
});
