import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'DragonDesk CRM API is running' });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const clientPath = path.join(__dirname, '../client');
  app.use(express.static(clientPath));

  // Catch-all route for client-side routing (Express 5 syntax)
  app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`🐉 DragonDesk CRM server running on port ${PORT}`);
});
