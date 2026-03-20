# DragonDesk: CRM - Features Overview

## 📊 Dashboard
The central hub showing key metrics and quick actions.

**Features:**
- Real-time member statistics
- Lead, Trialer, and Member counts
- Program enrollment breakdown (BJJ, Muay Thai, Taekwondo)
- Quick action cards to common tasks
- Visual statistics with icons

**Statistics Tracked:**
- Total Profiles
- Number of Leads
- Number of Trialers
- Active Members
- Members per program

---

## 👥 Member Management
Complete member lifecycle management from lead to active member.

**Create & Edit Members:**
- Personal Information
  - First & Last Name
  - Email & Phone
  - Date of Birth
- Membership Details
  - Type: Lead, Trialer, or Member
  - Account Tier: Basic, Premium, Elite, Family
  - Program: BJJ, Muay Thai, or Taekwondo
  - Belt/Ranking (program-specific)
  - Age Group: Adult or Kids
- Emergency Information
  - Emergency Contact Name
  - Emergency Contact Phone
- Additional Data
  - Custom Notes
  - Tags (comma-separated)

**Filter Members:**
- By Membership Type
- By Program Type
- By Age Group
- Combined filters for precise targeting

**Member Actions:**
- View detailed member cards
- Edit existing members
- Delete members (with confirmation)
- Search and filter
- See member history (timestamps)

**Belt Ranking Systems:**
- **BJJ**: White, Blue, Brown, Black
- **Muay Thai**: White, Green, Purple, Blue, Red
- **Taekwondo**: White, Yellow, Orange, Green, Purple, Blue, Red, Brown, Il Dan Bo, Black

---

## 🎯 Audience Builder (CDP)
Create targeted segments for marketing campaigns.

**Audience Creation:**
- Name your audience
- Add description
- Select multiple filter criteria:
  - Membership Type (Lead, Trialer, Member)
  - Program Type (BJJ, Muay Thai, Taekwondo)
  - Age Group (Adult, Kids)
  - Account Type (Basic, Premium, Elite, Family)
  - Custom Tags

**Audience Management:**
- View all audiences in sidebar
- Click to see matching members
- Real-time member count
- Edit audience filters
- Delete unused audiences

**Use Cases:**
- "Kids BJJ Leads" - Target kids interested in BJJ
- "Adult Muay Thai Members" - Current adult Muay Thai members
- "Premium Members" - High-value member segment
- "Trial Expiring Soon" - Members with trials ending
- "Competition Team" - Members tagged for competitions

---

## 🌐 DragonDesk: Optimize (Website Personalization)

Transform your website with targeted A/B tests and personalization.

**A/B Test Creation:**
- Name your test
- Select target audience
- Create Variant A (Control):
  - Headline text
  - Call-to-action button text
  - Page title
  - Image URL
- Create Variant B (Test):
  - Alternative headline
  - Different CTA
  - Alternative title
  - Different image
- Set test status: Draft, Running, or Completed

**Test Management:**
- View all active and completed tests
- See which audience each test targets
- Monitor test status with badges
- Preview variant content
- Delete underperforming tests

**Real-World Examples:**
- Test "Join Today" vs "Start Your Journey" CTAs
- Compare "Beginner Class" vs "New Student Program" headlines
- A/B test hero images for different age groups
- Test pricing page layouts for premium members

**Analytics Ready:**
- Structure in place for tracking:
  - Impressions per variant
  - Click-through rates
  - Conversion rates
  - Winner determination

---

## 📧 DragonDesk: Engage (Email Marketing)

MailChimp-style email campaigns designed for martial arts studios.

**Campaign Creation:**
- Campaign name
- Target specific audience
- Custom email subject line
- Full email body content
- Campaign status management

**Campaign States:**
- **Draft**: Work in progress
- **Active**: Currently sending
- **Paused**: Temporarily stopped
- **Completed**: Finished sending

**Campaign Types:**
- Welcome emails for new members
- Class schedule announcements
- Promotion and special offers
- Event invitations
- Re-engagement campaigns
- Renewal reminders

**Email Examples:**

**Welcome Trialer:**
```
Subject: Welcome to [Your Dojo]! 🥋
Body: We're excited to have you start your martial arts journey...
```

**Class Announcement:**
```
Subject: New Kids BJJ Classes Starting Next Week!
Body: We're launching new beginner classes for kids aged 5-12...
```

**Special Promotion:**
```
Subject: Limited Time: 50% Off Premium Membership
Body: Upgrade your training with our premium package...
```

---

## 📞 DragonDesk: Outreach (AI Call Campaigns)

AI-powered outbound calling to automate member outreach.

**Campaign Setup:**
- Campaign name
- Target audience selection
- Define call goal
- Write conversational script
- Add AI instructions for handling:
  - Tone and personality
  - Objection handling
  - Appointment booking
  - Follow-up procedures

**Call Goals:**
- Schedule trial classes
- Answer program questions
- Follow up on expired trials
- Confirm class attendance
- Collect feedback
- Re-engage inactive members
- Promote special events

**Script Examples:**

**Trial Scheduling:**
```
Goal: Schedule trial class
Script: "Hi [Name], this is [AI] calling from [Your Dojo].
I wanted to reach out because you expressed interest in our
Brazilian Jiu Jitsu program. I'd love to help you schedule
a free trial class. Do you have a few minutes to chat?"

AI Instructions: Be friendly and conversational. If they're
busy, offer to call back at a better time. Have class schedule
ready to book immediately.
```

**Follow-Up:**
```
Goal: Follow up after trial
Script: "Hi [Name], this is [AI] from [Your Dojo]. I wanted
to follow up on your trial class last week. How did you enjoy
the experience?"

AI Instructions: Listen for positive or negative feedback.
If positive, present membership options. If negative, address
concerns and offer another trial or different program.
```

---

## 🔐 User Management & Security

**User Roles:**

**Admin Users:**
- Full system access
- Can create/edit/delete users
- Access to all features
- Can modify system settings
- Can view all data

**Staff Users:**
- Can manage members
- Can create audiences
- Can create campaigns
- Cannot manage users
- Cannot access system settings

**Security Features:**
- Password hashing (bcrypt)
- JWT authentication (24-hour tokens)
- Role-based access control
- Session management
- Secure API endpoints

---

## 🎨 User Interface Features

**Design:**
- Black, Grey, and Red color scheme
- Professional martial arts aesthetic
- Clean, modern interface
- Intuitive navigation

**Navigation:**
- Collapsible sidebar
- Icon + text labels
- Active page highlighting
- User profile display
- Quick logout button

**Components:**
- Modal forms for data entry
- Confirmation dialogs for deletions
- Filter dropdowns
- Status badges (color-coded)
- Loading states
- Empty states with helpful messages
- Hover effects for interactivity

**Responsive:**
- Desktop optimized
- Tablet friendly
- Grid layouts that adapt
- Scrollable content areas

---

## 🔄 Workflows

### New Lead Workflow
1. Lead fills out contact form on website
2. Staff creates member profile (Type: Lead)
3. Create "New Leads" audience
4. Send welcome email via DragonDesk: Engage
5. Schedule follow-up call via DragonDesk: Outreach
6. Update to "Trialer" when they book trial
7. Update to "Member" when they join

### Trial Campaign Workflow
1. Create "Current Trialers" audience
2. Send "Welcome Trialer" email
3. Schedule trial class
4. 3 days later: Send "How's it going?" email
5. After trial ends: AI call to discuss membership
6. A/B test membership page for this audience
7. Convert to member or follow up

### Re-engagement Workflow
1. Tag inactive members as "inactive"
2. Create "Inactive Members" audience
3. A/B test different email subject lines
4. Send personalized re-engagement email
5. Follow up with AI call offering special promotion
6. Schedule return visit
7. Update tags based on response

### Event Promotion Workflow
1. Create relevant audience (e.g., "Adult BJJ Members")
2. A/B test event invitation email
3. Send to audience via DragonDesk: Engage
4. Follow-up calls to confirm attendance
5. Send reminder email 1 day before
6. Collect attendance at event
7. Post-event thank you email

---

## 📈 Analytics & Reporting (Ready for Integration)

**Current Capabilities:**
- Real-time member counts
- Audience size calculations
- Program distribution
- Membership type breakdown

**Ready for Extension:**
- Email open rates
- Click-through rates
- A/B test results
- Call campaign outcomes
- Conversion tracking
- Revenue reporting
- Attendance tracking
- Retention rates

---

## 🚀 Integration Possibilities

**Email Services:**
- SendGrid for transactional emails
- Mailgun for bulk sending
- AWS SES for cost-effective delivery

**SMS/Calling:**
- Twilio for SMS and voice
- Vonage for international calls
- Plivo for AI voice integration

**Payments:**
- Stripe for subscriptions
- Square for in-person payments
- PayPal for flexibility

**Website:**
- WordPress plugin
- React widget
- JavaScript snippet
- API integration

**Calendar:**
- Google Calendar sync
- Outlook integration
- iCal export
- Class scheduling

**Analytics:**
- Google Analytics
- Mixpanel
- Segment
- Custom dashboards

---

## 🎯 Target Users

**Martial Arts Schools:**
- Single-location dojos
- Multi-location studios
- Franchises
- Training centers

**Programs Supported:**
- Brazilian Jiu Jitsu
- Muay Thai
- Taekwondo
- Extensible to other martial arts

**Team Sizes:**
- Solo instructors
- Small teams (2-5 staff)
- Medium studios (5-15 staff)
- Large organizations (15+ staff)

---

## ✨ Competitive Advantages

**Martial Arts Specific:**
- Belt ranking systems built-in
- Program-specific features
- Industry terminology
- Martial arts color scheme

**All-in-One Platform:**
- CRM + CDP + Marketing in one place
- No need for multiple subscriptions
- Unified member data
- Single login

**Modern Technology:**
- Fast, responsive interface
- Real-time updates
- Modern design
- Easy to use

**Cost-Effective:**
- Self-hosted option
- No per-member fees
- Unlimited campaigns
- Unlimited audiences

---

Built for martial artists, by developers who understand the industry. 🥋
