# DragonDesk: CRM - Settings Guide

## Overview

The Settings page provides comprehensive configuration options for administrators to customize and manage their DragonDesk CRM installation. Only users with the **Admin** role can access the Settings page.

## Accessing Settings

1. Log in with an admin account
2. Click **Settings** in the sidebar navigation (only visible to admins)
3. Select the desired configuration tab

## Settings Sections

### 1. MyStudio API Integration

Connect DragonDesk CRM with MyStudio for seamless data synchronization.

**Features**:
- Enable/disable MyStudio integration
- Configure API credentials
- Set custom API endpoint
- Configure sync interval

**Configuration**:
```
API Key: Your MyStudio API key
API Secret: Your MyStudio API secret
Endpoint: https://api.mystudio.io (default)
Sync Interval: 5-1440 minutes (how often to sync data)
```

**Usage**:
1. Toggle "Enable MyStudio Integration"
2. Enter your API credentials from MyStudio dashboard
3. Set sync interval (default: 60 minutes)
4. Click "Save MyStudio Settings"

**Note**: API credentials are stored in browser localStorage. For production use, implement server-side secure storage.

---

### 2. Appearance (Theme)

Customize the visual appearance of DragonDesk CRM.

**Available Themes**:
- **Dark Mode** (default) - Black background with white text
- **Light Mode** - White background with dark text

**Features**:
- Visual theme preview before selecting
- Instant theme switching
- Theme preference saved to browser

**How to Change Theme**:
1. Go to Settings → Appearance
2. Click on desired theme card
3. Theme changes immediately
4. Preference saved automatically

**Color Schemes**:

**Dark Mode**:
- Background: Black (#000000)
- Cards: Dark Grey (#1a1a1a)
- Text: White (#ffffff)
- Accents: Red (#dc2626)

**Light Mode**:
- Background: White (#ffffff)
- Cards: Light Grey (#f5f5f5)
- Text: Black (#000000)
- Accents: Red (#dc2626)

---

### 3. User Management

Manage staff users and their permissions.

**Features**:
- View all system users
- Change user roles (Admin/Staff)
- Delete users (except yourself)
- See user creation dates

**User Roles**:

**Admin**:
- Full system access
- Can access Settings
- Can manage users
- Can modify all data
- Can configure integrations

**Staff**:
- Can manage members
- Can create audiences
- Can create campaigns
- Cannot access Settings
- Cannot manage users

**Managing Users**:

1. **View Users**: All users displayed with name, email, username, and role
2. **Change Role**: Use dropdown to change between Admin/Staff
3. **Delete User**: Click "Delete" button (cannot delete yourself)

**Adding New Users**:
- Use the registration endpoint: `POST /api/auth/register`
- Or create via Settings → User Management (future feature)

**Endpoint**: `POST /api/auth/register`
```json
{
  "username": "staffuser",
  "email": "staff@example.com",
  "password": "securepassword",
  "role": "staff",
  "firstName": "John",
  "lastName": "Doe"
}
```

---

### 4. Database Settings

Configure database backup and maintenance options.

**Features**:
- Automatic backup configuration
- Backup interval settings
- Maximum backup retention
- Query logging toggle

**Options**:

**Automatic Backups**:
- Enable/disable automatic backups
- Set backup interval (1-168 hours)
- Default: 24 hours

**Maximum Backups**:
- Number of backups to keep (1-30)
- Older backups automatically deleted
- Default: 7 backups

**Query Logging**:
- Enable/disable database query logging
- Useful for debugging
- May impact performance when enabled

**Configuration**:
1. Toggle "Enable Automatic Backups"
2. Set backup interval in hours
3. Set maximum backups to retain
4. Enable/disable query logging
5. Click "Save Database Settings"

**Note**: Actual backup functionality requires server-side implementation. Settings are saved for future use.

---

### 5. API Integrations

Connect third-party services to extend DragonDesk functionality.

**Available Integrations**:

#### SendGrid (Email)
- Send transactional emails
- Deliver email campaigns
- Track email metrics

**Configuration**:
```
API Key: Your SendGrid API key
```

#### Twilio (SMS/Voice)
- Send SMS messages
- Make voice calls
- Verify phone numbers

**Configuration**:
```
API Key: Your Twilio Account SID
API Secret: Your Twilio Auth Token
```

#### Stripe (Payments)
- Process payments
- Manage subscriptions
- Track revenue

**Configuration**:
```
API Key: Your Stripe publishable key
API Secret: Your Stripe secret key
```

#### Google Analytics
- Track website visitors
- Monitor user behavior
- Generate reports

**Configuration**:
```
API Key: Your Google Analytics tracking ID
```

**How to Configure**:
1. Toggle integration to enable
2. Enter required API credentials
3. Click "Save Integrations"

**Note**: Integration credentials are stored in browser localStorage. Implement server-side storage for production.

---

## Security Considerations

### Current Implementation

**Storage**:
- Settings stored in browser localStorage
- User preferences are client-side only
- No server-side persistence for settings

**Recommendations for Production**:

1. **Move to Server-Side Storage**:
   - Store API keys in environment variables or secure vault
   - Never expose API secrets in frontend code
   - Use server-side encryption for sensitive data

2. **Add Settings API Endpoints**:
   ```
   GET /api/settings - Retrieve settings
   PUT /api/settings - Update settings
   ```

3. **Implement Encryption**:
   - Encrypt API keys and secrets
   - Use secure key management service
   - Rotate credentials regularly

4. **Add Audit Logging**:
   - Log all settings changes
   - Track who made changes
   - Record timestamps

5. **Validate Permissions**:
   - Verify admin role server-side
   - Implement rate limiting
   - Add CSRF protection

---

## API Endpoints for Settings

### User Management

**Get All Users** (Admin Only):
```
GET /api/users
Authorization: Bearer <token>
```

**Update User Role** (Admin Only):
```
PUT /api/users/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "role": "admin" | "staff"
}
```

**Delete User** (Admin Only):
```
DELETE /api/users/:id
Authorization: Bearer <token>
```

---

## Troubleshooting

### Settings Not Saving
- Check browser console for errors
- Verify you're logged in as admin
- Clear browser localStorage and try again

### Users Not Loading
- Check if server is running
- Verify admin authentication token
- Check network tab for API errors

### Theme Not Changing
- Refresh the page
- Check browser localStorage for 'theme' key
- Try clearing cache

### Cannot Delete User
- Cannot delete yourself
- User must exist in database
- Must have admin role

---

## Best Practices

1. **Regular Backups**: Even with automatic backups enabled, manually backup database regularly

2. **User Management**:
   - Limit number of admin users
   - Use staff role for most users
   - Review users periodically

3. **API Keys**:
   - Never share API keys
   - Rotate keys regularly
   - Use environment-specific keys

4. **Theme**:
   - Choose theme based on user preference
   - Dark mode reduces eye strain
   - Light mode better for bright environments

5. **MyStudio Sync**:
   - Start with longer sync intervals
   - Monitor API rate limits
   - Test with small data sets first

---

## Future Enhancements

Planned improvements for Settings:

1. **Server-Side Storage**: Move all settings to database
2. **Settings Export/Import**: Backup and restore settings
3. **Email Configuration**: SMTP server settings
4. **Webhook Management**: Configure outgoing webhooks
5. **Activity Logs**: View settings change history
6. **Bulk User Import**: CSV upload for users
7. **API Key Generation**: Generate API keys for integrations
8. **Notification Settings**: Email/SMS preferences
9. **Custom Branding**: Logo and color customization
10. **Multi-language**: Interface language selection

---

## Support

For issues with Settings:
1. Check this guide for configuration help
2. Review browser console for errors
3. Check API logs on server
4. Contact system administrator

---

*Settings guide last updated: January 7, 2026*
