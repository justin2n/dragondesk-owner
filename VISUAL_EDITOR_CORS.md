# Visual Editor - CORS Limitations & Solutions

## Understanding the Issue

The DragonDesk Visual Editor uses an iframe to load and edit web pages. However, most external websites implement security measures (CORS, X-Frame-Options, Content Security Policy) that prevent their pages from being loaded in iframes on other domains.

### Why This Happens

This is a **browser security feature**, not a bug. It protects websites from:
- Clickjacking attacks
- Cross-site scripting (XSS)
- Unauthorized content manipulation
- Data theft via malicious iframes

## When the Visual Editor Works

✅ **The visual editor works perfectly when:**
- Testing pages on your own domain
- Using local/staging environments
- Loading pages from the same origin (same domain, protocol, and port)
- Testing our provided test page: `http://localhost:5173/test-page.html`

## When You'll See CORS Errors

❌ **You'll encounter CORS restrictions with:**
- External websites (Google, Facebook, etc.)
- Third-party domains you don't control
- Pages with strict X-Frame-Options headers
- Sites with Content Security Policy (CSP) restrictions

## Recommended Solutions

### 1. **Use Your Own Domain** (Best Practice)
The visual editor is designed for testing pages on your own website:
```
✅ https://yourdojo.com/landing-page
✅ https://staging.yourdojo.com/promo
✅ http://localhost:3000/homepage
```

### 2. **Development/Staging Environment**
Set up a development or staging environment where you can:
- Test changes safely before production
- Have full control over security headers
- Iterate quickly on designs

### 3. **Local Development**
For maximum control:
```bash
# Serve your website locally
npm run dev
# or
python -m http.server 8000

# Then use:
http://localhost:8000/your-page.html
```

### 4. **Test Page**
We've provided a test page to demonstrate the visual editor:
```
http://localhost:5173/test-page.html
```

This page includes:
- Hero section with headline and CTA
- Feature cards
- Testimonial section
- Multiple text and image elements to edit

## Alternative Workflows

If you can't use the visual editor due to CORS restrictions:

### Option A: Manual Implementation
1. Use the visual editor with our test page to design changes
2. Document the CSS selectors and new values
3. Apply changes directly to your live site's code

### Option B: Screenshot-Based Planning
1. Take screenshots of the page you want to test
2. Use design tools (Figma, Sketch) to mock up changes
3. Implement changes in your site's codebase

### Option C: CORS Proxy (Development Only)
For testing purposes only, you can set up a CORS proxy:

**⚠️ Warning:** Only use this in development, never in production!

```javascript
// Example CORS proxy setup (Node.js)
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

app.get('/proxy', async (req, res) => {
  const url = req.query.url;
  const response = await axios.get(url);
  res.send(response.data);
});

app.listen(3001);
```

## Technical Details

### CORS Headers Explained
```
X-Frame-Options: DENY
→ Page cannot be loaded in any iframe

X-Frame-Options: SAMEORIGIN
→ Page can only be loaded in iframes from the same origin

Content-Security-Policy: frame-ancestors 'self'
→ Only allows framing from the same origin
```

### How the Visual Editor Works
1. Loads page in an iframe
2. Accesses `iframe.contentDocument` to inject editing scripts
3. Adds event listeners for element selection
4. Applies CSS changes to selected elements
5. Tracks all modifications

The **critical step #2** fails when CORS restrictions are in place.

## Best Practices

### For DragonDesk Users
✅ **DO:**
- Test on your own domain
- Use staging/development environments
- Try our test page first
- Document changes for manual implementation if needed

❌ **DON'T:**
- Expect to edit external websites (Google, Facebook, etc.)
- Try to bypass CORS for production use
- Test on domains you don't control

### For Developers
If you're building on DragonDesk:
- Set appropriate CORS headers on your pages
- Allow `http://localhost:5173` for development
- Consider implementing a backend proxy for visual editing

## Future Enhancements

Possible solutions we're exploring:
- Screenshot-based editing mode
- Browser extension for bypassing CORS
- Proxy server integration
- CSS-only change tracking without iframe access
- Direct integration with popular CMSs

## Support

If you're having trouble:
1. Verify you're testing your own domain
2. Check browser console for specific errors
3. Try our test page to confirm the editor works
4. Contact support with your specific use case

## Example: Setting Up Your Site

To enable visual editing on your website:

```html
<!-- In your HTML <head> section -->
<meta http-equiv="Content-Security-Policy" 
      content="frame-ancestors 'self' http://localhost:5173">
```

Or via HTTP headers:
```
Content-Security-Policy: frame-ancestors 'self' http://localhost:5173
X-Frame-Options: ALLOW-FROM http://localhost:5173
```

This allows DragonDesk to load your pages while maintaining security.
