import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../../dragondesk.db');

export const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    // Locations table
    db.run(`
      CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        address TEXT,
        city TEXT,
        state TEXT,
        zipCode TEXT,
        country TEXT DEFAULT 'USA',
        phone TEXT,
        email TEXT,
        timezone TEXT DEFAULT 'America/New_York',
        isActive BOOLEAN DEFAULT 1,
        isPrimary BOOLEAN DEFAULT 0,
        settings TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('super_admin', 'admin', 'staff', 'instructor')),
        firstName TEXT NOT NULL,
        lastName TEXT NOT NULL,
        locationId INTEGER,
        allowedLocations TEXT,
        isInstructor BOOLEAN DEFAULT 0,
        certifications TEXT,
        specialties TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (locationId) REFERENCES locations(id)
      )
    `);

    // Members table
    db.run(`
      CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        firstName TEXT NOT NULL,
        lastName TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        membershipType TEXT NOT NULL CHECK(membershipType IN ('lead', 'trialer', 'member')),
        accountType TEXT NOT NULL CHECK(accountType IN ('basic', 'premium', 'elite', 'family')),
        programType TEXT NOT NULL CHECK(programType IN ('BJJ', 'Muay Thai', 'Taekwondo')),
        membershipAge TEXT NOT NULL CHECK(membershipAge IN ('Adult', 'Kids')),
        ranking TEXT NOT NULL,
        dateOfBirth TEXT,
        emergencyContact TEXT,
        emergencyPhone TEXT,
        notes TEXT,
        tags TEXT,
        locationId INTEGER,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (locationId) REFERENCES locations(id)
      )
    `);

    // Audiences table
    db.run(`
      CREATE TABLE IF NOT EXISTS audiences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        filters TEXT NOT NULL,
        createdBy INTEGER NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (createdBy) REFERENCES users(id)
      )
    `);

    // Campaigns table
    db.run(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('email', 'call', 'website')),
        audienceId INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('draft', 'active', 'paused', 'completed')),
        content TEXT,
        settings TEXT,
        locationId INTEGER,
        createdBy INTEGER NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (audienceId) REFERENCES audiences(id),
        FOREIGN KEY (locationId) REFERENCES locations(id),
        FOREIGN KEY (createdBy) REFERENCES users(id)
      )
    `);

    // AB Tests table
    db.run(`
      CREATE TABLE IF NOT EXISTS ab_tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        audienceId INTEGER NOT NULL,
        pageUrl TEXT,
        trafficSplit INTEGER DEFAULT 50,
        variantA TEXT NOT NULL,
        variantB TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('draft', 'running', 'completed')),
        results TEXT,
        createdBy INTEGER NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (audienceId) REFERENCES audiences(id),
        FOREIGN KEY (createdBy) REFERENCES users(id)
      )
    `);

    // Events table
    db.run(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        myStudioId TEXT,
        name TEXT NOT NULL,
        description TEXT,
        eventType TEXT NOT NULL CHECK(eventType IN ('class', 'seminar', 'workshop', 'tournament', 'testing', 'social', 'other')),
        programType TEXT CHECK(programType IN ('BJJ', 'Muay Thai', 'Taekwondo', 'All')),
        startDateTime DATETIME NOT NULL,
        endDateTime DATETIME NOT NULL,
        location TEXT,
        locationId INTEGER,
        maxAttendees INTEGER,
        currentAttendees INTEGER DEFAULT 0,
        price REAL DEFAULT 0,
        requiresRegistration BOOLEAN DEFAULT 0,
        isRecurring BOOLEAN DEFAULT 0,
        recurrencePattern TEXT,
        instructor TEXT,
        instructorId INTEGER,
        tags TEXT,
        imageUrl TEXT,
        status TEXT NOT NULL CHECK(status IN ('scheduled', 'cancelled', 'completed')) DEFAULT 'scheduled',
        syncedFromMyStudio BOOLEAN DEFAULT 0,
        lastSyncedAt DATETIME,
        createdBy INTEGER,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (locationId) REFERENCES locations(id),
        FOREIGN KEY (instructorId) REFERENCES users(id),
        FOREIGN KEY (createdBy) REFERENCES users(id)
      )
    `);

    // Event Attendees table (many-to-many relationship)
    db.run(`
      CREATE TABLE IF NOT EXISTS event_attendees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        eventId INTEGER NOT NULL,
        memberId INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('registered', 'attended', 'no-show', 'cancelled')) DEFAULT 'registered',
        registeredAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (eventId) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE CASCADE,
        UNIQUE(eventId, memberId)
      )
    `);

    // Work Schedules table for instructor and front desk staff availability
    db.run(`
      CREATE TABLE IF NOT EXISTS work_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instructorId INTEGER NOT NULL,
        locationId INTEGER,
        dayOfWeek TEXT NOT NULL CHECK(dayOfWeek IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
        startTime TIME NOT NULL,
        endTime TIME NOT NULL,
        isRecurring BOOLEAN DEFAULT 1,
        specificDate DATE,
        scheduleType TEXT DEFAULT 'instructor' CHECK(scheduleType IN ('instructor', 'front_desk')),
        status TEXT NOT NULL CHECK(status IN ('scheduled', 'completed', 'cancelled')) DEFAULT 'scheduled',
        notes TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (instructorId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (locationId) REFERENCES locations(id)
      )
    `);

    // MyStudio sync log for tracking imports
    db.run(`
      CREATE TABLE IF NOT EXISTS mystudio_sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        syncType TEXT NOT NULL CHECK(syncType IN ('events', 'members', 'schedule')),
        status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'partial')),
        recordsImported INTEGER DEFAULT 0,
        errorMessage TEXT,
        syncedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        syncedBy INTEGER,
        FOREIGN KEY (syncedBy) REFERENCES users(id)
      )
    `);

    // Email templates for DragonDesk: Engage
    db.run(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        subject TEXT,
        body TEXT NOT NULL,
        thumbnail TEXT,
        isDefault BOOLEAN DEFAULT 0,
        createdBy INTEGER,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (createdBy) REFERENCES users(id)
      )
    `);

    // Uploaded images for email campaigns
    db.run(`
      CREATE TABLE IF NOT EXISTS email_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        originalName TEXT NOT NULL,
        mimeType TEXT NOT NULL,
        size INTEGER NOT NULL,
        url TEXT NOT NULL,
        uploadedBy INTEGER,
        uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (uploadedBy) REFERENCES users(id)
      )
    `);

    // Social Accounts table for storing connected social media accounts
    db.run(`
      CREATE TABLE IF NOT EXISTS social_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL CHECK(platform IN ('facebook', 'instagram', 'twitter', 'linkedin')),
        accountName TEXT NOT NULL,
        accountId TEXT NOT NULL,
        pageId TEXT,
        pageName TEXT,
        accessToken TEXT NOT NULL,
        refreshToken TEXT,
        tokenExpiresAt DATETIME,
        isActive BOOLEAN DEFAULT 1,
        locationId INTEGER,
        createdBy INTEGER NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (locationId) REFERENCES locations(id),
        FOREIGN KEY (createdBy) REFERENCES users(id)
      )
    `);

    // Social Campaigns table for managing social media posts
    db.run(`
      CREATE TABLE IF NOT EXISTS social_campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        audienceId INTEGER,
        postContent TEXT NOT NULL,
        mediaUrls TEXT,
        platforms TEXT NOT NULL,
        accountIds TEXT NOT NULL,
        scheduledFor DATETIME,
        status TEXT NOT NULL CHECK(status IN ('draft', 'scheduled', 'published', 'failed')) DEFAULT 'draft',
        publishedAt DATETIME,
        results TEXT,
        locationId INTEGER,
        createdBy INTEGER NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (audienceId) REFERENCES audiences(id),
        FOREIGN KEY (locationId) REFERENCES locations(id),
        FOREIGN KEY (createdBy) REFERENCES users(id)
      )
    `);

    // Social Posts table for storing published posts from platforms
    db.run(`
      CREATE TABLE IF NOT EXISTS social_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaignId INTEGER,
        accountId INTEGER NOT NULL,
        platform TEXT NOT NULL CHECK(platform IN ('facebook', 'instagram', 'twitter', 'linkedin')),
        platformPostId TEXT NOT NULL,
        postContent TEXT NOT NULL,
        mediaUrls TEXT,
        postUrl TEXT,
        likes INTEGER DEFAULT 0,
        shares INTEGER DEFAULT 0,
        comments INTEGER DEFAULT 0,
        impressions INTEGER DEFAULT 0,
        engagement INTEGER DEFAULT 0,
        publishedAt DATETIME,
        lastSyncedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campaignId) REFERENCES social_campaigns(id) ON DELETE SET NULL,
        FOREIGN KEY (accountId) REFERENCES social_accounts(id) ON DELETE CASCADE,
        UNIQUE(platform, platformPostId)
      )
    `);

    // Social Comments table for storing comments on posts
    db.run(`
      CREATE TABLE IF NOT EXISTS social_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        postId INTEGER NOT NULL,
        platform TEXT NOT NULL CHECK(platform IN ('facebook', 'instagram', 'twitter', 'linkedin')),
        platformCommentId TEXT NOT NULL,
        authorName TEXT NOT NULL,
        authorId TEXT NOT NULL,
        authorProfileUrl TEXT,
        authorImageUrl TEXT,
        commentText TEXT NOT NULL,
        likes INTEGER DEFAULT 0,
        replyCount INTEGER DEFAULT 0,
        parentCommentId INTEGER,
        sentiment TEXT CHECK(sentiment IN ('positive', 'negative', 'neutral')),
        isHidden BOOLEAN DEFAULT 0,
        isReplied BOOLEAN DEFAULT 0,
        commentedAt DATETIME NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (postId) REFERENCES social_posts(id) ON DELETE CASCADE,
        FOREIGN KEY (parentCommentId) REFERENCES social_comments(id) ON DELETE CASCADE,
        UNIQUE(platform, platformCommentId)
      )
    `);

    // Social Comment Replies table for storing our replies to comments
    db.run(`
      CREATE TABLE IF NOT EXISTS social_comment_replies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        commentId INTEGER NOT NULL,
        platform TEXT NOT NULL CHECK(platform IN ('facebook', 'instagram', 'twitter', 'linkedin')),
        platformReplyId TEXT,
        replyText TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('draft', 'sent', 'failed')) DEFAULT 'draft',
        sentAt DATETIME,
        sentBy INTEGER,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (commentId) REFERENCES social_comments(id) ON DELETE CASCADE,
        FOREIGN KEY (sentBy) REFERENCES users(id)
      )
    `);

    // DKIM Configuration table for email authentication
    db.run(`
      CREATE TABLE IF NOT EXISTS dkim_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL UNIQUE,
        selector TEXT NOT NULL DEFAULT 'dragondesk',
        privateKey TEXT NOT NULL,
        publicKey TEXT NOT NULL,
        isActive BOOLEAN DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // A/B Test Analytics table for tracking performance metrics
    db.run(`
      CREATE TABLE IF NOT EXISTS ab_test_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        testId INTEGER NOT NULL,
        variant TEXT NOT NULL CHECK(variant IN ('A', 'B')),
        views INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        leads INTEGER DEFAULT 0,
        engagementTime INTEGER DEFAULT 0,
        bounces INTEGER DEFAULT 0,
        recordedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (testId) REFERENCES ab_tests(id) ON DELETE CASCADE
      )
    `);

    // A/B Test Events table for detailed event tracking
    db.run(`
      CREATE TABLE IF NOT EXISTS ab_test_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        testId INTEGER NOT NULL,
        variant TEXT NOT NULL CHECK(variant IN ('A', 'B')),
        eventType TEXT NOT NULL CHECK(eventType IN ('view', 'click', 'lead', 'engagement', 'bounce')),
        sessionId TEXT,
        metadata TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (testId) REFERENCES ab_tests(id) ON DELETE CASCADE
      )
    `);

    // Programs table for managing martial arts programs
    db.run(`
      CREATE TABLE IF NOT EXISTS programs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        isActive BOOLEAN DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default programs if table is empty
    db.get("SELECT COUNT(*) as count FROM programs", (err, row: any) => {
      if (!err && row && row.count === 0) {
        db.run(`
          INSERT INTO programs (name, description) VALUES
          ('BJJ', 'Brazilian Jiu Jitsu'),
          ('Muay Thai', 'Muay Thai'),
          ('Taekwondo', 'Taekwondo')
        `, (err) => {
          if (err) {
            console.error('Error inserting default programs:', err);
          } else {
            console.log('Inserted default programs');
          }
        });
      }
    });

    // SMS Campaigns table for managing SMS marketing
    db.run(`
      CREATE TABLE IF NOT EXISTS sms_campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        audienceId INTEGER NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')) DEFAULT 'draft',
        scheduledFor DATETIME,
        sentAt DATETIME,
        recipientCount INTEGER DEFAULT 0,
        successCount INTEGER DEFAULT 0,
        failureCount INTEGER DEFAULT 0,
        cost REAL DEFAULT 0,
        provider TEXT DEFAULT 'twilio',
        locationId INTEGER,
        createdBy INTEGER NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (audienceId) REFERENCES audiences(id),
        FOREIGN KEY (locationId) REFERENCES locations(id),
        FOREIGN KEY (createdBy) REFERENCES users(id)
      )
    `);

    // SMS Campaign Recipients table for tracking individual message status
    db.run(`
      CREATE TABLE IF NOT EXISTS sms_campaign_recipients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaignId INTEGER NOT NULL,
        memberId INTEGER NOT NULL,
        phoneNumber TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'sent', 'delivered', 'failed', 'unsubscribed')) DEFAULT 'pending',
        messageId TEXT,
        errorMessage TEXT,
        sentAt DATETIME,
        deliveredAt DATETIME,
        cost REAL DEFAULT 0,
        FOREIGN KEY (campaignId) REFERENCES sms_campaigns(id) ON DELETE CASCADE,
        FOREIGN KEY (memberId) REFERENCES members(id)
      )
    `);

    // Billing Settings table - Location-level Stripe configuration
    db.run(`
      CREATE TABLE IF NOT EXISTS billing_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        locationId INTEGER,
        stripePublishableKey TEXT,
        stripeSecretKey TEXT,
        stripeWebhookSecret TEXT,
        currency TEXT DEFAULT 'usd',
        defaultTaxRate REAL DEFAULT 0,
        trialDays INTEGER DEFAULT 7,
        gracePeriodDays INTEGER DEFAULT 3,
        autoRetryFailedPayments BOOLEAN DEFAULT 1,
        sendPaymentReceipts BOOLEAN DEFAULT 1,
        sendFailedPaymentAlerts BOOLEAN DEFAULT 1,
        isActive BOOLEAN DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (locationId) REFERENCES locations(id)
      )
    `);

    // Stripe Customers table - Link members to Stripe customers
    db.run(`
      CREATE TABLE IF NOT EXISTS stripe_customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memberId INTEGER NOT NULL UNIQUE,
        stripeCustomerId TEXT NOT NULL UNIQUE,
        defaultPaymentMethodId TEXT,
        email TEXT,
        name TEXT,
        metadata TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE CASCADE
      )
    `);

    // Pricing Plans table - Subscription pricing tiers
    db.run(`
      CREATE TABLE IF NOT EXISTS pricing_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        stripePriceId TEXT,
        stripeProductId TEXT,
        accountType TEXT NOT NULL CHECK(accountType IN ('basic', 'premium', 'elite', 'family')),
        programType TEXT CHECK(programType IN ('BJJ', 'Muay Thai', 'Taekwondo', 'All')),
        membershipAge TEXT CHECK(membershipAge IN ('Adult', 'Kids', 'All')),
        amount INTEGER NOT NULL,
        currency TEXT DEFAULT 'usd',
        billingInterval TEXT NOT NULL CHECK(billingInterval IN ('month', 'year', 'week')),
        intervalCount INTEGER DEFAULT 1,
        trialDays INTEGER DEFAULT 0,
        locationId INTEGER,
        isActive BOOLEAN DEFAULT 1,
        metadata TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (locationId) REFERENCES locations(id)
      )
    `);

    // Subscriptions table - Member subscriptions
    db.run(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memberId INTEGER NOT NULL,
        pricingPlanId INTEGER NOT NULL,
        stripeSubscriptionId TEXT UNIQUE,
        stripeCustomerId TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid', 'paused')),
        currentPeriodStart DATETIME,
        currentPeriodEnd DATETIME,
        trialStart DATETIME,
        trialEnd DATETIME,
        canceledAt DATETIME,
        cancelReason TEXT,
        cancelAtPeriodEnd BOOLEAN DEFAULT 0,
        metadata TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE CASCADE,
        FOREIGN KEY (pricingPlanId) REFERENCES pricing_plans(id)
      )
    `);

    // Payment Methods table - Stored payment methods
    db.run(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memberId INTEGER NOT NULL,
        stripePaymentMethodId TEXT NOT NULL UNIQUE,
        stripeCustomerId TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('card', 'bank_account', 'us_bank_account')),
        brand TEXT,
        last4 TEXT,
        expMonth INTEGER,
        expYear INTEGER,
        isDefault BOOLEAN DEFAULT 0,
        billingName TEXT,
        billingEmail TEXT,
        billingAddress TEXT,
        metadata TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE CASCADE
      )
    `);

    // Invoices table - Payment history
    db.run(`
      CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memberId INTEGER NOT NULL,
        subscriptionId INTEGER,
        stripeInvoiceId TEXT UNIQUE,
        stripePaymentIntentId TEXT,
        stripeChargeId TEXT,
        invoiceNumber TEXT,
        status TEXT NOT NULL CHECK(status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
        amountDue INTEGER NOT NULL,
        amountPaid INTEGER DEFAULT 0,
        amountRemaining INTEGER DEFAULT 0,
        subtotal INTEGER,
        tax INTEGER DEFAULT 0,
        total INTEGER,
        currency TEXT DEFAULT 'usd',
        description TEXT,
        invoiceUrl TEXT,
        invoicePdfUrl TEXT,
        dueDate DATETIME,
        paidAt DATETIME,
        periodStart DATETIME,
        periodEnd DATETIME,
        attemptCount INTEGER DEFAULT 0,
        nextPaymentAttempt DATETIME,
        lastPaymentError TEXT,
        metadata TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE CASCADE,
        FOREIGN KEY (subscriptionId) REFERENCES subscriptions(id) ON DELETE SET NULL
      )
    `);

    // Billing Events table - Webhook event log for auditing
    db.run(`
      CREATE TABLE IF NOT EXISTS billing_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stripeEventId TEXT UNIQUE,
        eventType TEXT NOT NULL,
        memberId INTEGER,
        subscriptionId INTEGER,
        invoiceId INTEGER,
        data TEXT NOT NULL,
        processed BOOLEAN DEFAULT 0,
        processedAt DATETIME,
        error TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE SET NULL,
        FOREIGN KEY (subscriptionId) REFERENCES subscriptions(id) ON DELETE SET NULL,
        FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE SET NULL
      )
    `);

    // Member QR Codes table - QR code management for check-ins
    db.run(`
      CREATE TABLE IF NOT EXISTS member_qr_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memberId INTEGER NOT NULL UNIQUE,
        qrCode TEXT NOT NULL UNIQUE,
        qrCodeData TEXT,
        applePassSerialNumber TEXT,
        googlePassId TEXT,
        isActive BOOLEAN DEFAULT 1,
        lastUsedAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE CASCADE
      )
    `);

    // Check-ins table - Daily check-in records
    db.run(`
      CREATE TABLE IF NOT EXISTS check_ins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memberId INTEGER NOT NULL,
        locationId INTEGER NOT NULL,
        checkInTime DATETIME DEFAULT CURRENT_TIMESTAMP,
        checkInMethod TEXT NOT NULL CHECK(checkInMethod IN ('qr_scan', 'manual', 'name_search', 'phone_lookup')),
        eventId INTEGER,
        notes TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE CASCADE,
        FOREIGN KEY (locationId) REFERENCES locations(id),
        FOREIGN KEY (eventId) REFERENCES events(id)
      )
    `);

    // Class Skills table - Skills/techniques taught in classes
    db.run(`
      CREATE TABLE IF NOT EXISTS class_skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT,
        programType TEXT NOT NULL CHECK(programType IN ('BJJ', 'Muay Thai', 'Taekwondo')),
        beltLevel TEXT,
        description TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Member Skills Learned table - Track skills per member
    db.run(`
      CREATE TABLE IF NOT EXISTS member_skills_learned (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memberId INTEGER NOT NULL,
        skillId INTEGER NOT NULL,
        eventId INTEGER,
        learnedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        proficiencyLevel TEXT DEFAULT 'introduced' CHECK(proficiencyLevel IN ('introduced', 'practiced', 'proficient')),
        instructorNotes TEXT,
        FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE CASCADE,
        FOREIGN KEY (skillId) REFERENCES class_skills(id) ON DELETE CASCADE,
        FOREIGN KEY (eventId) REFERENCES events(id),
        UNIQUE(memberId, skillId)
      )
    `);

    // Belt Requirements table - Belt promotion requirements per program
    db.run(`
      CREATE TABLE IF NOT EXISTS belt_requirements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        programType TEXT NOT NULL CHECK(programType IN ('BJJ', 'Muay Thai', 'Taekwondo')),
        fromRanking TEXT NOT NULL,
        toRanking TEXT NOT NULL,
        minClassAttendance INTEGER DEFAULT 0,
        minTimeInRankDays INTEGER DEFAULT 0,
        requiredSkillCategories TEXT,
        notes TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(programType, fromRanking, toRanking)
      )
    `);

    // Wallet Pass Logs table - Pass generation/send logs
    db.run(`
      CREATE TABLE IF NOT EXISTS wallet_pass_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memberId INTEGER NOT NULL,
        passType TEXT NOT NULL CHECK(passType IN ('apple', 'google')),
        action TEXT NOT NULL CHECK(action IN ('generated', 'sent', 'downloaded', 'updated', 'revoked')),
        recipientEmail TEXT,
        status TEXT DEFAULT 'success' CHECK(status IN ('success', 'failed', 'pending')),
        errorMessage TEXT,
        metadata TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE CASCADE
      )
    `);

    // Kiosk Activity Logs table - Audit trail for kiosk operations
    db.run(`
      CREATE TABLE IF NOT EXISTS kiosk_activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        locationId INTEGER NOT NULL,
        action TEXT NOT NULL,
        memberId INTEGER,
        metadata TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (locationId) REFERENCES locations(id),
        FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE SET NULL
      )
    `);

    // Seed default belt requirements if empty
    db.get("SELECT COUNT(*) as count FROM belt_requirements", (err, row: any) => {
      if (!err && row && row.count === 0) {
        const beltRequirements = [
          // BJJ belt requirements
          ['BJJ', 'White', 'Blue', 100, 365, null],
          ['BJJ', 'Blue', 'Purple', 150, 730, null],
          ['BJJ', 'Purple', 'Brown', 150, 730, null],
          ['BJJ', 'Brown', 'Black', 150, 730, null],
          // Taekwondo belt requirements
          ['Taekwondo', 'White', 'Yellow', 30, 90, null],
          ['Taekwondo', 'Yellow', 'Orange', 40, 120, null],
          ['Taekwondo', 'Orange', 'Green', 40, 120, null],
          ['Taekwondo', 'Green', 'Purple', 50, 150, null],
          ['Taekwondo', 'Purple', 'Blue', 50, 150, null],
          ['Taekwondo', 'Blue', 'Red', 60, 180, null],
          ['Taekwondo', 'Red', 'Brown', 60, 180, null],
          ['Taekwondo', 'Brown', 'Il Dan Bo', 80, 270, null],
          ['Taekwondo', 'Il Dan Bo', 'Black', 100, 365, null],
          // Muay Thai armband requirements
          ['Muay Thai', 'White', 'Green', 50, 180, null],
          ['Muay Thai', 'Green', 'Purple', 60, 180, null],
          ['Muay Thai', 'Purple', 'Blue', 80, 270, null],
          ['Muay Thai', 'Blue', 'Red', 100, 365, null],
        ];

        const stmt = db.prepare(`INSERT INTO belt_requirements (programType, fromRanking, toRanking, minClassAttendance, minTimeInRankDays, requiredSkillCategories) VALUES (?, ?, ?, ?, ?, ?)`);
        beltRequirements.forEach(req => stmt.run(req));
        stmt.finalize();
        console.log('Inserted default belt requirements');
      }
    });

    // Migration: Add attendance tracking columns to members table
    db.all("PRAGMA table_info(members)", (err, columns) => {
      if (!err && columns) {
        const attendanceColumns = [
          { name: 'totalClassesAttended', type: 'INTEGER DEFAULT 0' },
          { name: 'lastCheckInAt', type: 'DATETIME' },
          { name: 'attendanceStreak', type: 'INTEGER DEFAULT 0' },
          { name: 'lastPromotionDate', type: 'DATETIME' }
        ];

        attendanceColumns.forEach(col => {
          const hasColumn = columns.some((c: any) => c.name === col.name);
          if (!hasColumn) {
            db.run(`ALTER TABLE members ADD COLUMN ${col.name} ${col.type}`, (err) => {
              if (err && !err.message.includes('duplicate column')) {
                console.error(`Error adding ${col.name} column to members:`, err);
              }
            });
          }
        });
      }
    });

    // Migration: Add check-in columns to event_attendees table
    db.all("PRAGMA table_info(event_attendees)", (err, columns) => {
      if (!err && columns) {
        const checkInColumns = [
          { name: 'checkedInAt', type: 'DATETIME' },
          { name: 'checkInMethod', type: 'TEXT' }
        ];

        checkInColumns.forEach(col => {
          const hasColumn = columns.some((c: any) => c.name === col.name);
          if (!hasColumn) {
            db.run(`ALTER TABLE event_attendees ADD COLUMN ${col.name} ${col.type}`, (err) => {
              if (err && !err.message.includes('duplicate column')) {
                console.error(`Error adding ${col.name} column to event_attendees:`, err);
              }
            });
          }
        });
      }
    });

    // Migration: Add pageUrl and trafficSplit columns to ab_tests if they don't exist
    db.all("PRAGMA table_info(ab_tests)", (err, columns) => {
      if (!err && columns) {
        const hasPageUrl = columns.some((col: any) => col.name === 'pageUrl');
        const hasTrafficSplit = columns.some((col: any) => col.name === 'trafficSplit');

        if (!hasPageUrl) {
          db.run("ALTER TABLE ab_tests ADD COLUMN pageUrl TEXT", (err) => {
            if (err) {
              console.error('Error adding pageUrl column:', err);
            } else {
              console.log('Added pageUrl column to ab_tests table');
            }
          });
        }

        if (!hasTrafficSplit) {
          db.run("ALTER TABLE ab_tests ADD COLUMN trafficSplit INTEGER DEFAULT 50", (err) => {
            if (err) {
              console.error('Error adding trafficSplit column:', err);
            } else {
              console.log('Added trafficSplit column to ab_tests table');
            }
          });
        }
      }
    });

    // Migration: Add analytics columns to campaigns table if they don't exist
    db.all("PRAGMA table_info(campaigns)", (err, columns) => {
      if (!err && columns) {
        const analyticsColumns = [
          { name: 'sent', type: 'INTEGER DEFAULT 0' },
          { name: 'delivered', type: 'INTEGER DEFAULT 0' },
          { name: 'opens', type: 'INTEGER DEFAULT 0' },
          { name: 'clicks', type: 'INTEGER DEFAULT 0' },
          { name: 'openRate', type: 'REAL DEFAULT 0' },
          { name: 'clickThroughRate', type: 'REAL DEFAULT 0' },
          { name: 'leads', type: 'INTEGER DEFAULT 0' },
          { name: 'trialers', type: 'INTEGER DEFAULT 0' },
          { name: 'members', type: 'INTEGER DEFAULT 0' }
        ];

        analyticsColumns.forEach(col => {
          const hasColumn = columns.some((c: any) => c.name === col.name);
          if (!hasColumn) {
            db.run(`ALTER TABLE campaigns ADD COLUMN ${col.name} ${col.type}`, (err) => {
              if (err) {
                console.error(`Error adding ${col.name} column to campaigns:`, err);
              } else {
                console.log(`Added ${col.name} column to campaigns table`);
              }
            });
          }
        });
      }
    });

    console.log('Database tables initialized');

    // Auto-seed admin user if none exists
    seedAdminUser();
  });
}

async function seedAdminUser() {
  const bcrypt = await import('bcryptjs');

  db.get('SELECT id FROM users WHERE role = ?', ['admin'], async (err, row) => {
    if (err) {
      console.error('Error checking for admin user:', err);
      return;
    }

    if (!row) {
      const hashedPassword = await bcrypt.default.hash('admin123', 10);
      db.run(
        'INSERT INTO users (username, email, password, role, firstName, lastName) VALUES (?, ?, ?, ?, ?, ?)',
        ['admin', 'admin@dragondesk.com', hashedPassword, 'admin', 'System', 'Administrator'],
        (err) => {
          if (err) {
            console.error('Error creating admin user:', err);
          } else {
            console.log('Default admin user created (username: admin, password: admin123)');
          }
        }
      );
    }
  });
}

export const query = (sql: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

export const run = (sql: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
};

export const get = (sql: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
};
