# DragonDesk: CRM Quick Start Guide

## Initial Setup (5 minutes)

### 1. Start the Application

```bash
cd dojodesk-crm
npm run dev
```

This starts:
- Backend API on http://localhost:5000
- Frontend UI on http://localhost:3000

### 2. Create Admin User (First Time Only)

Run this command once to create your admin account:

```bash
curl -X POST http://localhost:5000/api/auth/init-admin
```

### 3. Login

Open http://localhost:3000 in your browser and login with:
- **Username**: `admin`
- **Password**: `admin123`

⚠️ **Change this password immediately after first login!**

## Basic Workflow

### Adding Your First Members

1. Click **Members** in the sidebar
2. Click **+ Add Member**
3. Fill in the member details:
   - Name, email, phone
   - Membership Type (Lead/Trialer/Member)
   - Program (BJJ/Muay Thai/Taekwondo)
   - Ranking (based on program)
   - Account Tier (Basic/Premium/Elite/Family)
4. Click **Create**

### Creating Audiences

1. Click **Audiences** in the sidebar
2. Click **+ Create Audience**
3. Give your audience a name (e.g., "Kids BJJ Members")
4. Select filters:
   - Membership Type: Member
   - Program Type: BJJ
   - Age Group: Kids
5. Click **Create Audience**
6. Click on the audience to see matching members

### Email Campaign (DragonDesk: Engage)

1. First, create an audience (see above)
2. Click **DragonDesk: Engage** in the sidebar
3. Click **+ Create Campaign**
4. Fill in:
   - Campaign name
   - Target audience
   - Email subject
   - Email body
5. Set status (Draft/Active)
6. Click **Create Campaign**

### A/B Test (DragonDesk: Optimize)

1. Create an audience first
2. Click **DragonDesk: Optimize** in the sidebar
3. Click **+ Create A/B Test**
4. Fill in:
   - Test name
   - Target audience
   - Variant A (control): headline, CTA
   - Variant B (test): headline, CTA
5. Click **Create Test**

### Call Campaign (DragonDesk: Outreach)

1. Create an audience first
2. Click **DragonDesk: Outreach** in the sidebar
3. Click **+ Create Campaign**
4. Fill in:
   - Campaign name
   - Target audience
   - Call goal (e.g., "Schedule trial class")
   - Call script
   - AI instructions
5. Click **Create Campaign**

## Common Use Cases

### Use Case 1: Welcome Email for New Trialers

1. **Create Audience**:
   - Name: "New Trialers"
   - Filter: Membership Type = Trialer

2. **Create Email Campaign**:
   - Subject: "Welcome to [Your Dojo]!"
   - Body: Welcome message with trial schedule

### Use Case 2: Promote New Kids Class

1. **Create Audience**:
   - Name: "Kids Program Leads"
   - Filters: Age Group = Kids, Membership Type = Lead

2. **Create Email Campaign**:
   - Subject: "New Kids Martial Arts Classes Starting!"
   - Body: Class details and registration link

### Use Case 3: Re-engagement Call Campaign

1. **Create Audience**:
   - Name: "Inactive Members"
   - Add tag filter for "inactive" members

2. **Create Call Campaign**:
   - Goal: "Re-engage and schedule return visit"
   - Script: Friendly check-in, offer special promotion

## Tips & Best Practices

### Member Management
- Use **Tags** to segment members (e.g., "needs-followup", "vip", "competition-team")
- Keep emergency contact info up to date
- Add notes for important member information

### Audience Building
- Start with broad audiences, then narrow down
- Test audience filters to see member counts
- Name audiences clearly (e.g., "Adult BJJ - Blue Belt+")

### Campaigns
- Always start campaigns in "Draft" status
- Review audience size before activating
- Keep email subject lines under 50 characters
- Test with a small audience first

### A/B Testing
- Only change one element at a time
- Run tests long enough to get meaningful data
- Document winning variants for future use

## Troubleshooting

### Can't Login
- Ensure server is running: `npm run dev`
- Check credentials: admin/admin123 (default)
- Check browser console for errors

### No Members Showing
- Check filters are not too restrictive
- Verify members exist in database
- Refresh the page

### API Errors
- Check server logs in terminal
- Verify database file exists (dojodesk.db)
- Restart server: Stop with Ctrl+C, then `npm run dev`

## Next Steps

1. **Add Staff Users**: Create accounts for your team members
2. **Import Members**: Add your existing member database
3. **Set Up Audiences**: Create standard audience segments
4. **Launch First Campaign**: Start with a simple welcome email
5. **Customize**: Adapt workflows to your studio's needs

## Need Help?

- Check the full [README.md](README.md) for detailed documentation
- Review API endpoints for integration possibilities
- Contact support for technical assistance

---

Happy training! 🥋
