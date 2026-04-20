import { Pool } from 'pg';

// Railway provides DATABASE_URL automatically when PostgreSQL is attached
const connectionString = process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL;

if (!connectionString) {
  console.error('DATABASE_URL or DATABASE_PRIVATE_URL environment variable is not set');
}

export const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Initialize database on startup
initializeDatabase();

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    // Locations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT,
        city TEXT,
        state TEXT,
        "zipCode" TEXT,
        country TEXT DEFAULT 'USA',
        phone TEXT,
        email TEXT,
        timezone TEXT DEFAULT 'America/New_York',
        "isActive" BOOLEAN DEFAULT true,
        "isPrimary" BOOLEAN DEFAULT false,
        settings TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('super_admin', 'admin', 'staff', 'instructor')),
        "firstName" TEXT NOT NULL,
        "lastName" TEXT NOT NULL,
        "locationId" INTEGER REFERENCES locations(id),
        "allowedLocations" TEXT,
        "isInstructor" BOOLEAN DEFAULT false,
        certifications TEXT,
        specialties TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Members table
    await client.query(`
      CREATE TABLE IF NOT EXISTS members (
        id SERIAL PRIMARY KEY,
        "firstName" TEXT NOT NULL,
        "lastName" TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        "accountStatus" TEXT NOT NULL CHECK("accountStatus" IN ('lead', 'trialer', 'member')),
        "accountType" TEXT NOT NULL CHECK("accountType" IN ('basic', 'premium', 'elite', 'family')),
        "programType" TEXT NOT NULL CHECK("programType" IN ('Children''s Martial Arts', 'Adult BJJ', 'Adult TKD & HKD', 'DG Barbell', 'Adult Muay Thai & Kickboxing', 'The Ashtanga Club', 'Dragon Gym Learning Center', 'Kids BJJ', 'Kids Muay Thai', 'Young Ladies Yoga', 'DG Workspace', 'Dragon Launch', 'Personal Training', 'DGMT Private Training')),
        "membershipAge" TEXT NOT NULL CHECK("membershipAge" IN ('Adult', 'Kids')),
        ranking TEXT NOT NULL,
        "leadSource" TEXT,
        "dateOfBirth" TEXT,
        "emergencyContact" TEXT,
        "emergencyPhone" TEXT,
        notes TEXT,
        tags TEXT,
        "locationId" INTEGER REFERENCES locations(id),
        "trialStartDate" TIMESTAMP,
        "memberStartDate" TIMESTAMP,
        "totalClassesAttended" INTEGER DEFAULT 0,
        "lastCheckInAt" TIMESTAMP,
        "attendanceStreak" INTEGER DEFAULT 0,
        "lastPromotionDate" TIMESTAMP,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Audiences table
    await client.query(`
      CREATE TABLE IF NOT EXISTS audiences (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        filters TEXT NOT NULL,
        "createdBy" INTEGER NOT NULL REFERENCES users(id),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Campaigns table
    await client.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('email', 'call', 'website')),
        "audienceId" INTEGER NOT NULL REFERENCES audiences(id),
        status TEXT NOT NULL CHECK(status IN ('draft', 'active', 'paused', 'completed')),
        content TEXT,
        settings TEXT,
        "locationId" INTEGER REFERENCES locations(id),
        "createdBy" INTEGER NOT NULL REFERENCES users(id),
        sent INTEGER DEFAULT 0,
        delivered INTEGER DEFAULT 0,
        opens INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        "openRate" REAL DEFAULT 0,
        "clickThroughRate" REAL DEFAULT 0,
        leads INTEGER DEFAULT 0,
        trialers INTEGER DEFAULT 0,
        members INTEGER DEFAULT 0,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // AB Tests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ab_tests (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        "audienceId" INTEGER NOT NULL REFERENCES audiences(id),
        "pageUrl" TEXT,
        "trafficSplit" INTEGER DEFAULT 50,
        "variantA" TEXT NOT NULL,
        "variantB" TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('draft', 'running', 'completed')),
        results TEXT,
        "createdBy" INTEGER NOT NULL REFERENCES users(id),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        "myStudioId" TEXT,
        name TEXT NOT NULL,
        description TEXT,
        "eventType" TEXT NOT NULL CHECK("eventType" IN ('class', 'seminar', 'workshop', 'tournament', 'testing', 'social', 'other')),
        "programType" TEXT CHECK("programType" IN ('Children''s Martial Arts', 'Adult BJJ', 'Adult TKD & HKD', 'DG Barbell', 'Adult Muay Thai & Kickboxing', 'The Ashtanga Club', 'Dragon Gym Learning Center', 'Kids BJJ', 'Kids Muay Thai', 'Young Ladies Yoga', 'DG Workspace', 'Dragon Launch', 'Personal Training', 'DGMT Private Training', 'All')),
        "startDateTime" TIMESTAMP NOT NULL,
        "endDateTime" TIMESTAMP NOT NULL,
        location TEXT,
        "locationId" INTEGER REFERENCES locations(id),
        "maxAttendees" INTEGER,
        "currentAttendees" INTEGER DEFAULT 0,
        price REAL DEFAULT 0,
        "requiresRegistration" BOOLEAN DEFAULT false,
        "isRecurring" BOOLEAN DEFAULT false,
        "recurrencePattern" TEXT,
        instructor TEXT,
        "instructorId" INTEGER REFERENCES users(id),
        tags TEXT,
        "imageUrl" TEXT,
        status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'cancelled', 'completed')),
        "syncedFromMyStudio" BOOLEAN DEFAULT false,
        "lastSyncedAt" TIMESTAMP,
        "createdBy" INTEGER REFERENCES users(id),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Event Attendees table
    await client.query(`
      CREATE TABLE IF NOT EXISTS event_attendees (
        id SERIAL PRIMARY KEY,
        "eventId" INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        "memberId" INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'registered' CHECK(status IN ('registered', 'attended', 'no-show', 'cancelled')),
        "registeredAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "checkedInAt" TIMESTAMP,
        "checkInMethod" TEXT,
        UNIQUE("eventId", "memberId")
      )
    `);

    // Work Schedules table
    await client.query(`
      CREATE TABLE IF NOT EXISTS work_schedules (
        id SERIAL PRIMARY KEY,
        "instructorId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "locationId" INTEGER REFERENCES locations(id),
        "dayOfWeek" TEXT NOT NULL CHECK("dayOfWeek" IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
        "startTime" TIME NOT NULL,
        "endTime" TIME NOT NULL,
        "isRecurring" BOOLEAN DEFAULT true,
        "specificDate" DATE,
        "scheduleType" TEXT DEFAULT 'instructor' CHECK("scheduleType" IN ('instructor', 'front_desk')),
        status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'completed', 'cancelled')),
        notes TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // MyStudio sync log
    await client.query(`
      CREATE TABLE IF NOT EXISTS mystudio_sync_log (
        id SERIAL PRIMARY KEY,
        "syncType" TEXT NOT NULL CHECK("syncType" IN ('events', 'members', 'schedule')),
        status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'partial')),
        "recordsImported" INTEGER DEFAULT 0,
        "errorMessage" TEXT,
        "syncedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "syncedBy" INTEGER REFERENCES users(id)
      )
    `);

    // Email templates
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        subject TEXT,
        body TEXT NOT NULL,
        thumbnail TEXT,
        "isDefault" BOOLEAN DEFAULT false,
        "createdBy" INTEGER REFERENCES users(id),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Email images
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_images (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        "originalName" TEXT NOT NULL,
        "mimeType" TEXT NOT NULL,
        size INTEGER NOT NULL,
        url TEXT NOT NULL,
        "uploadedBy" INTEGER REFERENCES users(id),
        "uploadedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Social Accounts
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_accounts (
        id SERIAL PRIMARY KEY,
        platform TEXT NOT NULL CHECK(platform IN ('facebook', 'instagram', 'twitter', 'linkedin')),
        "accountName" TEXT NOT NULL,
        "accountId" TEXT NOT NULL,
        "pageId" TEXT,
        "pageName" TEXT,
        "accessToken" TEXT NOT NULL,
        "refreshToken" TEXT,
        "tokenExpiresAt" TIMESTAMP,
        "isActive" BOOLEAN DEFAULT true,
        "locationId" INTEGER REFERENCES locations(id),
        "createdBy" INTEGER NOT NULL REFERENCES users(id),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Social Campaigns
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_campaigns (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        "audienceId" INTEGER REFERENCES audiences(id),
        "postContent" TEXT NOT NULL,
        "mediaUrls" TEXT,
        platforms TEXT NOT NULL,
        "accountIds" TEXT NOT NULL,
        "scheduledFor" TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'published', 'failed')),
        "publishedAt" TIMESTAMP,
        results TEXT,
        "locationId" INTEGER REFERENCES locations(id),
        "createdBy" INTEGER NOT NULL REFERENCES users(id),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Social Posts
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_posts (
        id SERIAL PRIMARY KEY,
        "campaignId" INTEGER REFERENCES social_campaigns(id) ON DELETE SET NULL,
        "accountId" INTEGER NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
        platform TEXT NOT NULL CHECK(platform IN ('facebook', 'instagram', 'twitter', 'linkedin')),
        "platformPostId" TEXT NOT NULL,
        "postContent" TEXT NOT NULL,
        "mediaUrls" TEXT,
        "postUrl" TEXT,
        likes INTEGER DEFAULT 0,
        shares INTEGER DEFAULT 0,
        comments INTEGER DEFAULT 0,
        impressions INTEGER DEFAULT 0,
        engagement INTEGER DEFAULT 0,
        "publishedAt" TIMESTAMP,
        "lastSyncedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(platform, "platformPostId")
      )
    `);

    // Social Comments
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_comments (
        id SERIAL PRIMARY KEY,
        "postId" INTEGER NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
        platform TEXT NOT NULL CHECK(platform IN ('facebook', 'instagram', 'twitter', 'linkedin')),
        "platformCommentId" TEXT NOT NULL,
        "authorName" TEXT NOT NULL,
        "authorId" TEXT NOT NULL,
        "authorProfileUrl" TEXT,
        "authorImageUrl" TEXT,
        "commentText" TEXT NOT NULL,
        likes INTEGER DEFAULT 0,
        "replyCount" INTEGER DEFAULT 0,
        "parentCommentId" INTEGER REFERENCES social_comments(id) ON DELETE CASCADE,
        sentiment TEXT CHECK(sentiment IN ('positive', 'negative', 'neutral')),
        "isHidden" BOOLEAN DEFAULT false,
        "isReplied" BOOLEAN DEFAULT false,
        "commentedAt" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(platform, "platformCommentId")
      )
    `);

    // Social Comment Replies
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_comment_replies (
        id SERIAL PRIMARY KEY,
        "commentId" INTEGER NOT NULL REFERENCES social_comments(id) ON DELETE CASCADE,
        platform TEXT NOT NULL CHECK(platform IN ('facebook', 'instagram', 'twitter', 'linkedin')),
        "platformReplyId" TEXT,
        "replyText" TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'failed')),
        "sentAt" TIMESTAMP,
        "sentBy" INTEGER REFERENCES users(id),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // DKIM Configuration
    await client.query(`
      CREATE TABLE IF NOT EXISTS dkim_config (
        id SERIAL PRIMARY KEY,
        domain TEXT NOT NULL UNIQUE,
        selector TEXT NOT NULL DEFAULT 'dragondesk',
        "privateKey" TEXT NOT NULL,
        "publicKey" TEXT NOT NULL,
        "isActive" BOOLEAN DEFAULT true,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // AB Test Analytics
    await client.query(`
      CREATE TABLE IF NOT EXISTS ab_test_analytics (
        id SERIAL PRIMARY KEY,
        "testId" INTEGER NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
        variant TEXT NOT NULL CHECK(variant IN ('A', 'B')),
        views INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        leads INTEGER DEFAULT 0,
        "engagementTime" INTEGER DEFAULT 0,
        bounces INTEGER DEFAULT 0,
        "recordedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // AB Test Events
    await client.query(`
      CREATE TABLE IF NOT EXISTS ab_test_events (
        id SERIAL PRIMARY KEY,
        "testId" INTEGER NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
        variant TEXT NOT NULL CHECK(variant IN ('A', 'B')),
        "eventType" TEXT NOT NULL CHECK("eventType" IN ('view', 'click', 'lead', 'engagement', 'bounce')),
        "sessionId" TEXT,
        metadata TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Programs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS programs (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        "isActive" BOOLEAN DEFAULT true,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // SMS Campaigns
    await client.query(`
      CREATE TABLE IF NOT EXISTS sms_campaigns (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        "audienceId" INTEGER NOT NULL REFERENCES audiences(id),
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
        "scheduledFor" TIMESTAMP,
        "sentAt" TIMESTAMP,
        "recipientCount" INTEGER DEFAULT 0,
        "successCount" INTEGER DEFAULT 0,
        "failureCount" INTEGER DEFAULT 0,
        cost REAL DEFAULT 0,
        provider TEXT DEFAULT 'twilio',
        "locationId" INTEGER REFERENCES locations(id),
        "createdBy" INTEGER NOT NULL REFERENCES users(id),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // SMS Campaign Recipients
    await client.query(`
      CREATE TABLE IF NOT EXISTS sms_campaign_recipients (
        id SERIAL PRIMARY KEY,
        "campaignId" INTEGER NOT NULL REFERENCES sms_campaigns(id) ON DELETE CASCADE,
        "memberId" INTEGER NOT NULL REFERENCES members(id),
        "phoneNumber" TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'delivered', 'failed', 'unsubscribed')),
        "messageId" TEXT,
        "errorMessage" TEXT,
        "sentAt" TIMESTAMP,
        "deliveredAt" TIMESTAMP,
        cost REAL DEFAULT 0
      )
    `);

    // Billing Settings
    await client.query(`
      CREATE TABLE IF NOT EXISTS billing_settings (
        id SERIAL PRIMARY KEY,
        "locationId" INTEGER REFERENCES locations(id),
        "stripePublishableKey" TEXT,
        "stripeSecretKey" TEXT,
        "stripeWebhookSecret" TEXT,
        currency TEXT DEFAULT 'usd',
        "defaultTaxRate" REAL DEFAULT 0,
        "trialDays" INTEGER DEFAULT 7,
        "gracePeriodDays" INTEGER DEFAULT 3,
        "autoRetryFailedPayments" BOOLEAN DEFAULT true,
        "sendPaymentReceipts" BOOLEAN DEFAULT true,
        "sendFailedPaymentAlerts" BOOLEAN DEFAULT true,
        "isActive" BOOLEAN DEFAULT true,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Stripe Customers
    await client.query(`
      CREATE TABLE IF NOT EXISTS stripe_customers (
        id SERIAL PRIMARY KEY,
        "memberId" INTEGER NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,
        "stripeCustomerId" TEXT NOT NULL UNIQUE,
        "defaultPaymentMethodId" TEXT,
        email TEXT,
        name TEXT,
        metadata TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Pricing Plans
    await client.query(`
      CREATE TABLE IF NOT EXISTS pricing_plans (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        "stripePriceId" TEXT,
        "stripeProductId" TEXT,
        "accountType" TEXT NOT NULL CHECK("accountType" IN ('basic', 'premium', 'elite', 'family')),
        "programType" TEXT CHECK("programType" IN ('Children''s Martial Arts', 'Adult BJJ', 'Adult TKD & HKD', 'DG Barbell', 'Adult Muay Thai & Kickboxing', 'The Ashtanga Club', 'Dragon Gym Learning Center', 'Kids BJJ', 'Kids Muay Thai', 'Young Ladies Yoga', 'DG Workspace', 'Dragon Launch', 'Personal Training', 'DGMT Private Training', 'All')),
        "membershipAge" TEXT CHECK("membershipAge" IN ('Adult', 'Kids', 'All')),
        amount INTEGER NOT NULL,
        currency TEXT DEFAULT 'usd',
        "billingInterval" TEXT NOT NULL CHECK("billingInterval" IN ('month', 'year', 'week')),
        "intervalCount" INTEGER DEFAULT 1,
        "trialDays" INTEGER DEFAULT 0,
        "locationId" INTEGER REFERENCES locations(id),
        "isActive" BOOLEAN DEFAULT true,
        metadata TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Subscriptions
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        "memberId" INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        "pricingPlanId" INTEGER NOT NULL REFERENCES pricing_plans(id),
        "stripeSubscriptionId" TEXT UNIQUE,
        "stripeCustomerId" TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid', 'paused')),
        "currentPeriodStart" TIMESTAMP,
        "currentPeriodEnd" TIMESTAMP,
        "trialStart" TIMESTAMP,
        "trialEnd" TIMESTAMP,
        "canceledAt" TIMESTAMP,
        "cancelReason" TEXT,
        "cancelAtPeriodEnd" BOOLEAN DEFAULT false,
        metadata TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Payment Methods
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id SERIAL PRIMARY KEY,
        "memberId" INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        "stripePaymentMethodId" TEXT NOT NULL UNIQUE,
        "stripeCustomerId" TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('card', 'bank_account', 'us_bank_account')),
        brand TEXT,
        last4 TEXT,
        "expMonth" INTEGER,
        "expYear" INTEGER,
        "isDefault" BOOLEAN DEFAULT false,
        "billingName" TEXT,
        "billingEmail" TEXT,
        "billingAddress" TEXT,
        metadata TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Invoices
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        "memberId" INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        "subscriptionId" INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
        "stripeInvoiceId" TEXT UNIQUE,
        "stripePaymentIntentId" TEXT,
        "stripeChargeId" TEXT,
        "invoiceNumber" TEXT,
        status TEXT NOT NULL CHECK(status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
        "amountDue" INTEGER NOT NULL,
        "amountPaid" INTEGER DEFAULT 0,
        "amountRemaining" INTEGER DEFAULT 0,
        subtotal INTEGER,
        tax INTEGER DEFAULT 0,
        total INTEGER,
        currency TEXT DEFAULT 'usd',
        description TEXT,
        "invoiceUrl" TEXT,
        "invoicePdfUrl" TEXT,
        "dueDate" TIMESTAMP,
        "paidAt" TIMESTAMP,
        "periodStart" TIMESTAMP,
        "periodEnd" TIMESTAMP,
        "attemptCount" INTEGER DEFAULT 0,
        "nextPaymentAttempt" TIMESTAMP,
        "lastPaymentError" TEXT,
        metadata TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Billing Events
    await client.query(`
      CREATE TABLE IF NOT EXISTS billing_events (
        id SERIAL PRIMARY KEY,
        "stripeEventId" TEXT UNIQUE,
        "eventType" TEXT NOT NULL,
        "memberId" INTEGER REFERENCES members(id) ON DELETE SET NULL,
        "subscriptionId" INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
        "invoiceId" INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
        data TEXT NOT NULL,
        processed BOOLEAN DEFAULT false,
        "processedAt" TIMESTAMP,
        error TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Member QR Codes
    await client.query(`
      CREATE TABLE IF NOT EXISTS member_qr_codes (
        id SERIAL PRIMARY KEY,
        "memberId" INTEGER NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,
        "qrCode" TEXT NOT NULL UNIQUE,
        "qrCodeData" TEXT,
        "applePassSerialNumber" TEXT,
        "googlePassId" TEXT,
        "isActive" BOOLEAN DEFAULT true,
        "lastUsedAt" TIMESTAMP,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Check-ins
    await client.query(`
      CREATE TABLE IF NOT EXISTS check_ins (
        id SERIAL PRIMARY KEY,
        "memberId" INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        "locationId" INTEGER NOT NULL REFERENCES locations(id),
        "checkInTime" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "checkInMethod" TEXT NOT NULL CHECK("checkInMethod" IN ('qr_scan', 'manual', 'name_search', 'phone_lookup')),
        "eventId" INTEGER REFERENCES events(id),
        notes TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Class Skills
    await client.query(`
      CREATE TABLE IF NOT EXISTS class_skills (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        "programType" TEXT NOT NULL CHECK("programType" IN ('Children''s Martial Arts', 'Adult BJJ', 'Adult TKD & HKD', 'DG Barbell', 'Adult Muay Thai & Kickboxing', 'The Ashtanga Club', 'Dragon Gym Learning Center', 'Kids BJJ', 'Kids Muay Thai', 'Young Ladies Yoga', 'DG Workspace', 'Dragon Launch', 'Personal Training', 'DGMT Private Training')),
        "beltLevel" TEXT,
        description TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Member Skills Learned
    await client.query(`
      CREATE TABLE IF NOT EXISTS member_skills_learned (
        id SERIAL PRIMARY KEY,
        "memberId" INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        "skillId" INTEGER NOT NULL REFERENCES class_skills(id) ON DELETE CASCADE,
        "eventId" INTEGER REFERENCES events(id),
        "learnedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "proficiencyLevel" TEXT DEFAULT 'introduced' CHECK("proficiencyLevel" IN ('introduced', 'practiced', 'proficient')),
        "instructorNotes" TEXT,
        UNIQUE("memberId", "skillId")
      )
    `);

    // Belt Requirements
    await client.query(`
      CREATE TABLE IF NOT EXISTS belt_requirements (
        id SERIAL PRIMARY KEY,
        "programType" TEXT NOT NULL CHECK("programType" IN ('Children''s Martial Arts', 'Adult BJJ', 'Adult TKD & HKD', 'DG Barbell', 'Adult Muay Thai & Kickboxing', 'The Ashtanga Club', 'Dragon Gym Learning Center', 'Kids BJJ', 'Kids Muay Thai', 'Young Ladies Yoga', 'DG Workspace', 'Dragon Launch', 'Personal Training', 'DGMT Private Training')),
        "fromRanking" TEXT NOT NULL,
        "toRanking" TEXT NOT NULL,
        "minClassAttendance" INTEGER DEFAULT 0,
        "minTimeInRankDays" INTEGER DEFAULT 0,
        "requiredSkillCategories" TEXT,
        notes TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("programType", "fromRanking", "toRanking")
      )
    `);

    // Wallet Pass Logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallet_pass_logs (
        id SERIAL PRIMARY KEY,
        "memberId" INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        "passType" TEXT NOT NULL CHECK("passType" IN ('apple', 'google')),
        action TEXT NOT NULL CHECK(action IN ('generated', 'sent', 'downloaded', 'updated', 'revoked')),
        "recipientEmail" TEXT,
        status TEXT DEFAULT 'success' CHECK(status IN ('success', 'failed', 'pending')),
        "errorMessage" TEXT,
        metadata TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Kiosk Activity Logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS kiosk_activity_logs (
        id SERIAL PRIMARY KEY,
        "locationId" INTEGER NOT NULL REFERENCES locations(id),
        action TEXT NOT NULL,
        "memberId" INTEGER REFERENCES members(id) ON DELETE SET NULL,
        metadata TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Lead Forms table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_forms (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        fields TEXT NOT NULL,
        "submitButtonText" TEXT DEFAULT 'Submit',
        "successMessage" TEXT DEFAULT 'Thank you for your submission!',
        "redirectUrl" TEXT,
        styling TEXT,
        "isActive" BOOLEAN DEFAULT true,
        "locationId" INTEGER REFERENCES locations(id),
        "createdBy" INTEGER REFERENCES users(id),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Lead Form Submissions
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_form_submissions (
        id SERIAL PRIMARY KEY,
        "formId" INTEGER NOT NULL REFERENCES lead_forms(id) ON DELETE CASCADE,
        "memberId" INTEGER REFERENCES members(id),
        data TEXT NOT NULL,
        "sourceUrl" TEXT,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed default programs
    const programsResult = await client.query('SELECT COUNT(*) as count FROM programs');
    if (parseInt(programsResult.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO programs (name, description) VALUES
        ('Children''s Martial Arts', 'Children''s Martial Arts'),
        ('Adult BJJ', 'Adult BJJ'),
        ('Adult TKD & HKD', 'Adult TKD & HKD'),
        ('DG Barbell', 'DG Barbell'),
        ('Adult Muay Thai & Kickboxing', 'Adult Muay Thai & Kickboxing'),
        ('The Ashtanga Club', 'The Ashtanga Club'),
        ('Dragon Gym Learning Center', 'Dragon Gym Learning Center'),
        ('Kids BJJ', 'Kids BJJ'),
        ('Kids Muay Thai', 'Kids Muay Thai'),
        ('Young Ladies Yoga', 'Young Ladies Yoga'),
        ('DG Workspace', 'DG Workspace'),
        ('Dragon Launch', 'Dragon Launch'),
        ('Personal Training', 'Personal Training'),
        ('DGMT Private Training', 'DGMT Private Training')
      `);
      console.log('Inserted default programs');
    }

    // Seed default belt requirements
    const beltResult = await client.query('SELECT COUNT(*) as count FROM belt_requirements');
    if (parseInt(beltResult.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO belt_requirements ("programType", "fromRanking", "toRanking", "minClassAttendance", "minTimeInRankDays") VALUES
        ('BJJ', 'White', 'Blue', 100, 365),
        ('BJJ', 'Blue', 'Purple', 150, 730),
        ('BJJ', 'Purple', 'Brown', 150, 730),
        ('BJJ', 'Brown', 'Black', 150, 730),
        ('Taekwondo', 'White', 'Yellow', 30, 90),
        ('Taekwondo', 'Yellow', 'Orange', 40, 120),
        ('Taekwondo', 'Orange', 'Green', 40, 120),
        ('Taekwondo', 'Green', 'Purple', 50, 150),
        ('Taekwondo', 'Purple', 'Blue', 50, 150),
        ('Taekwondo', 'Blue', 'Red', 60, 180),
        ('Taekwondo', 'Red', 'Brown', 60, 180),
        ('Taekwondo', 'Brown', 'Il Dan Bo', 80, 270),
        ('Taekwondo', 'Il Dan Bo', 'Black', 100, 365),
        ('Muay Thai', 'White', 'Green', 50, 180),
        ('Muay Thai', 'Green', 'Purple', 60, 180),
        ('Muay Thai', 'Purple', 'Blue', 80, 270),
        ('Muay Thai', 'Blue', 'Red', 100, 365)
      `);
      console.log('Inserted default belt requirements');
    }

    // Behavior Tracking — site config
    await client.query(`
      CREATE TABLE IF NOT EXISTS tracking_site_config (
        id SERIAL PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        "createdBy" INTEGER REFERENCES users(id),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Behavior Tracking — visitors
    await client.query(`
      CREATE TABLE IF NOT EXISTS tracking_visitors (
        id SERIAL PRIMARY KEY,
        "visitorId" TEXT NOT NULL,
        token TEXT NOT NULL,
        "firstSeen" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "lastSeen" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "eventCount" INTEGER DEFAULT 0,
        "pageCount" INTEGER DEFAULT 0,
        UNIQUE("visitorId", token)
      )
    `);

    // Behavior Tracking — events
    await client.query(`
      CREATE TABLE IF NOT EXISTS tracking_events (
        id SERIAL PRIMARY KEY,
        "visitorId" TEXT NOT NULL,
        "sessionId" TEXT,
        token TEXT NOT NULL,
        "eventType" TEXT NOT NULL,
        "pageUrl" TEXT,
        "pagePath" TEXT,
        "pageTitle" TEXT,
        selector TEXT,
        "elementText" TEXT,
        metadata TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_tracking_events_token ON tracking_events(token)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tracking_events_visitor ON tracking_events("visitorId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tracking_events_type ON tracking_events("eventType")`);

    // Churn metrics table
    await client.query(`
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
    `);

    // Migrations
    await client.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS "pricingPlanId" INTEGER REFERENCES pricing_plans(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS "syncedFromMyStudio" BOOLEAN DEFAULT false`);

    // Expand programType CHECK constraints to support all 14 Dragon Gym programs
    await client.query(`ALTER TABLE members DROP CONSTRAINT IF EXISTS members_programtype_check`);
    await client.query(`ALTER TABLE members DROP CONSTRAINT IF EXISTS members_programType_check`);
    await client.query(`ALTER TABLE members DROP CONSTRAINT IF EXISTS members_programtype_check_v2`);
    await client.query(`ALTER TABLE members DROP CONSTRAINT IF EXISTS members_programtype_check_v3`);
    await client.query(`ALTER TABLE members ADD CONSTRAINT members_programtype_check_v3 CHECK("programType" IN ('No Program Selected', 'Children''s Martial Arts', 'Adult BJJ', 'Adult TKD & HKD', 'DG Barbell', 'Adult Muay Thai & Kickboxing', 'The Ashtanga Club', 'Dragon Gym Learning Center', 'Kids BJJ', 'Kids Muay Thai', 'Young Ladies Yoga', 'DG Workspace', 'Dragon Launch', 'Personal Training', 'DGMT Private Training'))`);

    await client.query(`ALTER TABLE events DROP CONSTRAINT IF EXISTS events_programtype_check`);
    await client.query(`ALTER TABLE events DROP CONSTRAINT IF EXISTS events_programType_check`);
    await client.query(`ALTER TABLE events ADD CONSTRAINT events_programtype_check CHECK("programType" IN ('Children''s Martial Arts', 'Adult BJJ', 'Adult TKD & HKD', 'DG Barbell', 'Adult Muay Thai & Kickboxing', 'The Ashtanga Club', 'Dragon Gym Learning Center', 'Kids BJJ', 'Kids Muay Thai', 'Young Ladies Yoga', 'DG Workspace', 'Dragon Launch', 'Personal Training', 'DGMT Private Training', 'All'))`);

    await client.query(`ALTER TABLE class_skills DROP CONSTRAINT IF EXISTS class_skills_programtype_check`);
    await client.query(`ALTER TABLE class_skills DROP CONSTRAINT IF EXISTS class_skills_programType_check`);
    await client.query(`ALTER TABLE class_skills ADD CONSTRAINT class_skills_programtype_check CHECK("programType" IN ('Children''s Martial Arts', 'Adult BJJ', 'Adult TKD & HKD', 'DG Barbell', 'Adult Muay Thai & Kickboxing', 'The Ashtanga Club', 'Dragon Gym Learning Center', 'Kids BJJ', 'Kids Muay Thai', 'Young Ladies Yoga', 'DG Workspace', 'Dragon Launch', 'Personal Training', 'DGMT Private Training'))`);

    await client.query(`ALTER TABLE belt_requirements DROP CONSTRAINT IF EXISTS belt_requirements_programtype_check`);
    await client.query(`ALTER TABLE belt_requirements DROP CONSTRAINT IF EXISTS belt_requirements_programType_check`);
    await client.query(`ALTER TABLE belt_requirements ADD CONSTRAINT belt_requirements_programtype_check CHECK("programType" IN ('Children''s Martial Arts', 'Adult BJJ', 'Adult TKD & HKD', 'DG Barbell', 'Adult Muay Thai & Kickboxing', 'The Ashtanga Club', 'Dragon Gym Learning Center', 'Kids BJJ', 'Kids Muay Thai', 'Young Ladies Yoga', 'DG Workspace', 'Dragon Launch', 'Personal Training', 'DGMT Private Training'))`);

    await client.query(`ALTER TABLE pricing_plans DROP CONSTRAINT IF EXISTS pricing_plans_programtype_check`);
    await client.query(`ALTER TABLE pricing_plans DROP CONSTRAINT IF EXISTS pricing_plans_programType_check`);
    await client.query(`ALTER TABLE pricing_plans ADD CONSTRAINT pricing_plans_programtype_check CHECK("programType" IN ('Children''s Martial Arts', 'Adult BJJ', 'Adult TKD & HKD', 'DG Barbell', 'Adult Muay Thai & Kickboxing', 'The Ashtanga Club', 'Dragon Gym Learning Center', 'Kids BJJ', 'Kids Muay Thai', 'Young Ladies Yoga', 'DG Workspace', 'Dragon Launch', 'Personal Training', 'DGMT Private Training', 'All'))`);


    // Seed admin user if none exists
    await seedAdminUser(client);

    console.log('Database tables initialized');
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
}

async function seedAdminUser(client: any) {
  const bcrypt = await import('bcryptjs');

  const result = await client.query('SELECT id FROM users WHERE role = $1', ['admin']);

  if (result.rows.length === 0) {
    const hashedPassword = await bcrypt.default.hash('admin123', 10);
    await client.query(
      'INSERT INTO users (username, email, password, role, "firstName", "lastName") VALUES ($1, $2, $3, $4, $5, $6)',
      ['admin', 'admin@dragondesk.com', hashedPassword, 'admin', 'System', 'Administrator']
    );
    console.log('Default admin user created (username: admin, password: admin123)');
  }
}

// List of camelCase column names that need quoting in PostgreSQL
const camelCaseColumns = [
  'firstName', 'lastName', 'accountStatus', 'accountType',
  'programType', 'membershipAge', 'dateOfBirth', 'emergencyContact', 'emergencyPhone',
  'locationId', 'leadSource', 'trialStartDate', 'memberStartDate', 'totalClassesAttended',
  'lastCheckInAt', 'attendanceStreak', 'lastPromotionDate', 'createdAt', 'updatedAt',
  'createdBy', 'audienceId', 'eventType', 'startDateTime', 'endDateTime', 'maxAttendees',
  'currentAttendees', 'requiresRegistration', 'isRecurring', 'recurrencePattern',
  'instructorId', 'imageUrl', 'syncedFromMyStudio', 'lastSyncedAt', 'myStudioId',
  'eventId', 'memberId', 'registeredAt', 'checkedInAt', 'checkInMethod', 'dayOfWeek',
  'startTime', 'endTime', 'specificDate', 'scheduleType', 'syncType', 'recordsImported',
  'errorMessage', 'syncedAt', 'syncedBy', 'isDefault', 'originalName', 'mimeType',
  'uploadedBy', 'uploadedAt', 'accountName', 'accountId', 'pageId', 'pageName',
  'accessToken', 'refreshToken', 'tokenExpiresAt', 'isActive', 'postContent', 'mediaUrls',
  'accountIds', 'scheduledFor', 'publishedAt', 'campaignId', 'platformPostId', 'postUrl',
  'platformCommentId', 'authorName', 'authorId', 'authorProfileUrl', 'authorImageUrl',
  'commentText', 'replyCount', 'parentCommentId', 'isHidden', 'isReplied', 'commentedAt',
  'commentId', 'platformReplyId', 'replyText', 'sentAt', 'sentBy', 'privateKey', 'publicKey',
  'testId', 'engagementTime', 'recordedAt', 'sessionId', 'recipientCount', 'successCount',
  'failureCount', 'phoneNumber', 'messageId', 'deliveredAt', 'stripePublishableKey',
  'stripeSecretKey', 'stripeWebhookSecret', 'defaultTaxRate', 'trialDays', 'gracePeriodDays',
  'autoRetryFailedPayments', 'sendPaymentReceipts', 'sendFailedPaymentAlerts',
  'stripeCustomerId', 'defaultPaymentMethodId', 'stripePriceId', 'stripeProductId',
  'billingInterval', 'intervalCount', 'pricingPlanId', 'stripeSubscriptionId',
  'currentPeriodStart', 'currentPeriodEnd', 'trialStart', 'trialEnd', 'canceledAt',
  'cancelReason', 'cancelAtPeriodEnd', 'stripePaymentMethodId', 'expMonth', 'expYear',
  'billingName', 'billingEmail', 'billingAddress', 'subscriptionId', 'stripeInvoiceId',
  'stripePaymentIntentId', 'stripeChargeId', 'invoiceNumber', 'amountDue', 'amountPaid',
  'amountRemaining', 'invoiceUrl', 'invoicePdfUrl', 'dueDate', 'paidAt', 'periodStart',
  'periodEnd', 'attemptCount', 'nextPaymentAttempt', 'lastPaymentError', 'stripeEventId',
  'eventType', 'invoiceId', 'processedAt', 'qrCode', 'qrCodeData', 'applePassSerialNumber',
  'googlePassId', 'lastUsedAt', 'checkInTime', 'skillId', 'learnedAt', 'proficiencyLevel',
  'instructorNotes', 'fromRanking', 'toRanking', 'minClassAttendance', 'minTimeInRankDays',
  'requiredSkillCategories', 'passType', 'recipientEmail', 'submitButtonText',
  'successMessage', 'redirectUrl', 'formId', 'sourceUrl', 'ipAddress', 'userAgent',
  'zipCode', 'isPrimary', 'allowedLocations', 'isInstructor', 'variantA', 'variantB',
  'pageUrl', 'trafficSplit', 'clickThroughRate', 'openRate', 'beltLevel',
  'visitorId', 'firstSeen', 'lastSeen', 'eventCount', 'pageCount',
  'pagePath', 'pageTitle', 'elementText'
];

// Function to quote camelCase identifiers for PostgreSQL
function quoteCamelCaseColumns(sql: string): string {
  let result = sql;
  for (const col of camelCaseColumns) {
    // Match column name that's not already quoted and not part of a larger word
    // Negative lookbehind for " and negative lookahead for "
    const regex = new RegExp(`(?<!")\\b${col}\\b(?!")`, 'g');
    result = result.replace(regex, `"${col}"`);
  }
  return result;
}

// Helper functions that maintain API compatibility with the old SQLite interface
export const query = async (sql: string, params: any[] = []): Promise<any> => {
  // Convert ? placeholders to $1, $2, etc. for PostgreSQL
  let paramIndex = 0;
  let pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);

  // Quote camelCase column names
  pgSql = quoteCamelCaseColumns(pgSql);

  const result = await pool.query(pgSql, params);
  return result.rows;
};

export const run = async (sql: string, params: any[] = []): Promise<any> => {
  // Convert ? placeholders to $1, $2, etc. for PostgreSQL
  let paramIndex = 0;
  let pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);

  // Quote camelCase column names
  pgSql = quoteCamelCaseColumns(pgSql);

  // Add RETURNING id for INSERT statements to get the last inserted ID
  let finalSql = pgSql;
  if (pgSql.trim().toUpperCase().startsWith('INSERT') && !pgSql.toUpperCase().includes('RETURNING')) {
    finalSql = pgSql.replace(/;?\s*$/, ' RETURNING id');
  }

  const result = await pool.query(finalSql, params);
  return {
    id: result.rows[0]?.id,
    changes: result.rowCount
  };
};

export const get = async (sql: string, params: any[] = []): Promise<any> => {
  // Convert ? placeholders to $1, $2, etc. for PostgreSQL
  let paramIndex = 0;
  let pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);

  // Quote camelCase column names
  pgSql = quoteCamelCaseColumns(pgSql);

  const result = await pool.query(pgSql, params);
  return result.rows[0];
};

// Export db as pool for compatibility (some files might use db directly)
export const db = pool;
