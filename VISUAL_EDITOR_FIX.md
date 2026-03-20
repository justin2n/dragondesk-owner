# Visual Editor - Fix Summary

## Issue
The Visual Page Editor was showing "Unable to load page content" error even with the test page due to two problems:

1. **Incorrect public folder location** - Test page was in `/public/` but Vite root is `/src/client/`
2. **Sandbox attribute blocking access** - The iframe `sandbox="allow-same-origin allow-scripts"` attribute was preventing `contentDocument` access
3. **Wrong port in documentation** - Vite serves on port 3000, not 5173

## Fixes Applied

### 1. Moved Test Page to Correct Location
**Before:** `/public/test-page.html`
**After:** `/src/client/public/test-page.html`

Since `vite.config.ts` sets `root: './src/client'`, Vite serves public files from `src/client/public/`.

### 2. Removed Sandbox Attribute
**File:** `src/client/components/VisualPageEditor.tsx`

**Before:**
```tsx
<iframe
  sandbox="allow-same-origin allow-scripts"
  src={pageUrl}
/>
```

**After:**
```tsx
<iframe
  src={pageUrl}
/>
```

**Reason:** The `sandbox` attribute, even with `allow-same-origin`, can still restrict access to `contentDocument`. For same-origin pages (like our test page), we don't need sandbox restrictions.

### 3. Updated Port References
Changed all references from `http://localhost:5173` to `http://localhost:3000` to match the actual Vite server port configured in `vite.config.ts`.

## Testing the Fix

1. **Navigate to DragonDesk: Optimize**
   ```
   http://localhost:3000
   ```

2. **Create a new A/B test**

3. **Enter the test page URL:**
   ```
   http://localhost:3000/test-page.html
   ```

4. **Visual editor should load successfully**
   - Page displays in iframe
   - Elements become selectable on hover
   - Click to edit text, images, buttons
   - Changes are tracked

## Technical Explanation

### Why Sandbox Was the Problem
The HTML5 `sandbox` attribute creates a sandboxed browsing context. Even with `allow-same-origin`, the sandbox can impose additional restrictions:

```
sandbox=""                           → Most restrictive
sandbox="allow-same-origin"          → Allows same-origin access but still sandboxed
sandbox="allow-same-origin allow-scripts" → Allows scripts too but still limited
[no sandbox attribute]               → No restrictions (full access)
```

For our use case:
- We're loading pages from the same origin (localhost:3000)
- We need full access to `iframe.contentDocument`
- We need to inject scripts and styles
- Sandbox restrictions were blocking legitimate same-origin access

### Alternative Approach for Production
If sandbox is needed for security in production:

```tsx
const isSameOrigin = new URL(pageUrl).origin === window.location.origin;

<iframe
  src={pageUrl}
  sandbox={isSameOrigin ? undefined : "allow-same-origin allow-scripts"}
/>
```

## Current Behavior

### ✅ Working Scenarios
- Test page: `http://localhost:3000/test-page.html`
- Any page served from `localhost:3000`
- Pages on same domain without restrictive headers

### ❌ Still Won't Work (Expected)
- External websites (Google, Facebook, etc.) - **CORS blocked by those sites**
- Pages with X-Frame-Options: DENY
- Pages with strict CSP headers

## Files Modified

1. **VisualPageEditor.tsx**
   - Removed `sandbox` attribute from iframe
   - Updated port from 5173 to 3000

2. **Test Page Location**
   - Moved from `/public/` to `/src/client/public/`

## Verification

```bash
# Check test page is accessible
curl http://localhost:3000/test-page.html

# Should return HTML content

# Check in browser
# 1. Open http://localhost:3000
# 2. Go to DragonDesk: Optimize
# 3. Create A/B test
# 4. Enter: http://localhost:3000/test-page.html
# 5. Should see page load and be editable
```

## Next Steps

If users still encounter issues:
1. Verify they're using `http://localhost:3000/test-page.html`
2. Check browser console for specific errors
3. Ensure dev server is running (`npm run dev`)
4. Try refreshing the page
5. Check that the URL is exactly as shown (no typos)

## Security Considerations

### Why Removing Sandbox is Safe Here
1. **Same-Origin Policy**: Browser still enforces same-origin security
2. **Controlled Environment**: This is a development tool, not a public-facing app
3. **User Trust**: Users are loading their own pages, not arbitrary external content
4. **CORS Protection**: External malicious sites still can't be loaded due to CORS

### For Production Deployment
Consider adding:
- URL whitelist validation
- Same-origin checks before loading
- User warnings for external URLs
- Optional sandbox for cross-origin pages (with understanding they won't be editable)

## Documentation Updates

Updated all references in:
- Error messages
- Documentation files
- Code comments

From: `http://localhost:5173/test-page.html`
To: `http://localhost:3000/test-page.html`
