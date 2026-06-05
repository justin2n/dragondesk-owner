import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// ─── Tracking script ────────────────────────────────────────────────────────

// GET /api/tracking/script.js?token=TOKEN
// Served publicly so any website can load it
router.get('/script.js', async (req: Request, res: Response) => {
  const token = req.query.token as string;
  if (!token) {
    res.status(400).send('// DragonDesk Tracking: token parameter required');
    return;
  }

  // Verify token exists
  const config = await pool.query('SELECT id FROM tracking_site_config WHERE token = $1', [token]);
  if (config.rows.length === 0) {
    res.status(404).send('// DragonDesk Tracking: invalid token');
    return;
  }

  const proto = req.get('x-forwarded-proto') || req.protocol;
  const endpoint = `${proto}://${req.get('host')}/api/tracking`;

  const script = buildTrackingScript(token, endpoint);

  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(script);
});

function buildTrackingScript(token: string, endpoint: string): string {
  return `/* DragonDesk Behavior Tracking v1 */
(function(w,d){
  var TOKEN='${token}';
  var EP='${endpoint}';

  /* ── Visitor / session IDs ── */
  function uuid(){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0,v=c=='x'?r:(r&0x3|0x8);return v.toString(16);});}
  function getCookie(n){var v='; '+d.cookie,p=v.split('; '+n+'=');if(p.length===2)return p.pop().split(';').shift();}
  function setCookie(n,v,days){var e=new Date();e.setTime(e.getTime()+(days*864e5));d.cookie=n+'='+v+';expires='+e.toUTCString()+';path=/;SameSite=Lax';}

  var vid=getCookie('_dd_vid');if(!vid){vid=uuid();setCookie('_dd_vid',vid,365);}
  var sid;try{sid=sessionStorage.getItem('_dd_sid')||uuid();sessionStorage.setItem('_dd_sid',sid);}catch(e){sid=uuid();}

  /* ── Event queue ── */
  var queue=[];
  function push(evt){queue.push(Object.assign({ts:Date.now(),url:location.href,path:location.pathname,title:d.title},evt));}

  function flush(){
    if(!queue.length)return;
    var payload=JSON.stringify({token:TOKEN,vid:vid,sid:sid,events:queue.splice(0)});
    try{
      fetch(EP+'/collect',{method:'POST',headers:{'Content-Type':'application/json'},body:payload,keepalive:true,credentials:'omit'});
    }catch(e){}
  }

  /* ── CSS selector generator ── */
  function getSelector(el){
    if(!el||el===d.body)return'body';
    if(el.id)return'#'+el.id;
    var sel=el.tagName.toLowerCase();
    if(el.className){var c=el.className.toString().trim().split(/\\s+/).slice(0,3).join('.');if(c)sel+='.'+c;}
    var p=el.parentElement;
    if(p&&p!==d.body){
      var siblings=Array.from(p.children).filter(function(s){return s.tagName===el.tagName;});
      if(siblings.length>1)sel+=':nth-of-type('+(siblings.indexOf(el)+1)+')';
      return getSelector(p)+' > '+sel;
    }
    return sel;
  }

  /* ── Auto tracking ── */
  push({type:'pageview'});

  d.addEventListener('click',function(e){
    var el=e.target;
    var sel=getSelector(el);
    var txt=(el.innerText||el.value||el.alt||'').slice(0,120).trim();
    push({type:'click',selector:sel,text:txt,tag:el.tagName.toLowerCase()});
  },true);

  d.addEventListener('submit',function(e){
    var f=e.target;
    var emailEl=f.querySelector('input[type="email"],input[name="email"],input[name="Email"],input[id="email"]');
    var email=emailEl?emailEl.value.trim():'';
    push({type:'form_submit',formId:f.id||'',formName:f.name||'',selector:getSelector(f),email:email});
  },true);

  /* Scroll depth — fire at 25/50/75/100% */
  var scrollFired={};
  w.addEventListener('scroll',function(){
    var pct=Math.round((w.scrollY/(d.body.scrollHeight-w.innerHeight||1))*100);
    [25,50,75,100].forEach(function(mark){
      if(pct>=mark&&!scrollFired[mark]){scrollFired[mark]=true;push({type:'scroll_depth',depth:mark});}
    });
  },{passive:true});

  w.addEventListener('beforeunload',flush);
  setInterval(flush,5000);

  /* ── Personalization ── */
  fetch(EP+'/personalize',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({token:TOKEN,vid:vid,url:location.href,path:location.pathname}),
    credentials:'omit'
  }).then(function(r){return r.json();}).then(function(data){
    if(data&&data.changes&&data.changes.length){applyChanges(data.changes);}
  }).catch(function(){});

  function applyChanges(changes){
    changes.forEach(function(c){
      try{
        var els=d.querySelectorAll(c.selector);
        els.forEach(function(el){
          if(c.type==='text')el.textContent=c.value;
          else if(c.type==='style'&&c.property)(el).style.setProperty(c.property,c.value);
          else if(c.type==='attribute')el.setAttribute(c.property,c.value);
        });
      }catch(e){}
    });
  }
})(window,document);
`;
}

// ─── Event collection (public, no auth) ─────────────────────────────────────

// POST /api/tracking/collect
router.post('/collect', async (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  const { token, vid, sid, events } = req.body;

  if (!token || !vid || !Array.isArray(events) || events.length === 0) {
    res.status(204).end();
    return;
  }

  // Verify token
  const config = await pool.query('SELECT id FROM tracking_site_config WHERE token = $1', [token]);
  if (config.rows.length === 0) {
    res.status(204).end();
    return;
  }

  // Extract requester IP
  const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Upsert visitor (include ipAddress on first insert)
      await client.query(`
        INSERT INTO tracking_visitors ("visitorId", token, "firstSeen", "lastSeen", "eventCount", "pageCount", "ipAddress")
        VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $3, $4, $5)
        ON CONFLICT ("visitorId", token) DO UPDATE SET
          "lastSeen" = CURRENT_TIMESTAMP,
          "eventCount" = tracking_visitors."eventCount" + $3,
          "pageCount" = tracking_visitors."pageCount" + $4,
          "ipAddress" = COALESCE(tracking_visitors."ipAddress", $5)
      `, [
        vid, token,
        events.length,
        events.filter((e: any) => e.type === 'pageview').length,
        ipAddress,
      ]);

      // Insert events
      for (const evt of events) {
        await client.query(`
          INSERT INTO tracking_events
            ("visitorId", "sessionId", token, "eventType", "pageUrl", "pagePath", "pageTitle", selector, "elementText", metadata, "createdAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, to_timestamp($11::bigint / 1000.0))
        `, [
          vid, sid || null, token,
          evt.type || 'unknown',
          evt.url || null,
          evt.path || null,
          evt.title || null,
          evt.selector || null,
          evt.text || null,
          JSON.stringify({ tag: evt.tag, depth: evt.depth, formId: evt.formId, email: evt.email || undefined }),
          evt.ts || Date.now(),
        ]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // After transaction: process identity signals from form_submit events (outside main tx)
    const formSubmits = events.filter((e: any) => e.type === 'form_submit' && e.email && e.email.length > 0);
    for (const evt of formSubmits) {
      const emailVal = evt.email.toLowerCase();
      try {
        await pool.query(`
          INSERT INTO visitor_identities ("visitorId", token, type, value)
          VALUES ($1, $2, 'email', $3)
          ON CONFLICT ("visitorId", token, type) DO UPDATE SET value = EXCLUDED.value
        `, [vid, token, emailVal]);

        // Try to match to a member
        const memberResult = await pool.query(
          `SELECT id FROM members WHERE email = $1 LIMIT 1`,
          [emailVal]
        );
        if (memberResult.rows.length > 0) {
          const memberId = memberResult.rows[0].id;
          await pool.query(
            `UPDATE visitor_identities SET "memberId" = $1 WHERE "visitorId" = $2 AND token = $3 AND type = 'email'`,
            [memberId, vid, token]
          );
        }
      } catch (identityErr) {
        console.error('Identity upsert error:', identityErr);
      }
    }
  } catch (err) {
    console.error('Tracking collect error:', err);
  }

  res.status(204).end();
});

// OPTIONS preflight for collect
router.options('/collect', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.status(204).end();
});

// ─── Personalization endpoint (public) ──────────────────────────────────────

// POST /api/tracking/personalize
router.post('/personalize', async (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  const { token, vid, path } = req.body;
  if (!token || !vid) { res.json({ changes: [] }); return; }

  try {
    // Get running A/B tests for this token (match on pageUrl path)
    const tests = await pool.query(`
      SELECT t.id, t."variantA", t."variantB", t."trafficSplit",
             a.filters as "audienceFilters"
      FROM ab_tests t
      LEFT JOIN audiences a ON a.id = t."audienceId"
      WHERE t.status = 'running'
    `);

    if (tests.rows.length === 0) { res.json({ changes: [] }); return; }

    const changes: any[] = [];

    for (const test of tests.rows) {
      // Check if visitor matches any behavior audience rules
      const variantA = typeof test.variantA === 'string' ? JSON.parse(test.variantA) : test.variantA;
      const variantB = typeof test.variantB === 'string' ? JSON.parse(test.variantB) : test.variantB;
      const filters = test.audienceFilters ? (typeof test.audienceFilters === 'string' ? JSON.parse(test.audienceFilters) : test.audienceFilters) : {};

      let inAudience = true;

      // Check behavior rules if present
      if (filters.behaviorRules && filters.behaviorRules.length > 0) {
        inAudience = await checkBehaviorAudience(vid, token, filters.behaviorRules, filters.behaviorOperator || 'any');
      }

      if (!inAudience) continue;

      // Deterministic variant assignment based on visitor ID hash
      const hash = vid.split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
      const variant = (hash % 100) < test.trafficSplit ? variantA : variantB;

      if (variant && variant.changes) {
        changes.push(...variant.changes.map((c: any) => ({
          selector: c.selector,
          type: c.type,
          property: c.property,
          value: c.newValue,
        })));
      }
    }

    res.json({ changes });
  } catch (err) {
    res.json({ changes: [] });
  }
});

async function checkBehaviorAudience(
  visitorId: string,
  token: string,
  rules: any[],
  operator: 'any' | 'all'
): Promise<boolean> {
  const results = await Promise.all(rules.map(async (rule) => {
    if (rule.type === 'clicked_selector') {
      const r = await pool.query(
        `SELECT 1 FROM tracking_events WHERE "visitorId"=$1 AND token=$2 AND "eventType"='click' AND selector LIKE $3 LIMIT 1`,
        [visitorId, token, `%${rule.value}%`]
      );
      return r.rows.length > 0;
    }
    if (rule.type === 'visited_page') {
      const r = await pool.query(
        `SELECT 1 FROM tracking_events WHERE "visitorId"=$1 AND token=$2 AND "eventType"='pageview' AND "pagePath" ILIKE $3 LIMIT 1`,
        [visitorId, token, `%${rule.value}%`]
      );
      return r.rows.length > 0;
    }
    if (rule.type === 'submitted_form') {
      const r = await pool.query(
        `SELECT 1 FROM tracking_events WHERE "visitorId"=$1 AND token=$2 AND "eventType"='form_submit' LIMIT 1`,
        [visitorId, token]
      );
      return r.rows.length > 0;
    }
    if (rule.type === 'min_pages') {
      const r = await pool.query(
        `SELECT COUNT(*) as cnt FROM tracking_events WHERE "visitorId"=$1 AND token=$2 AND "eventType"='pageview'`,
        [visitorId, token]
      );
      return parseInt(r.rows[0].cnt) >= parseInt(rule.value);
    }
    return false;
  }));

  return operator === 'all' ? results.every(Boolean) : results.some(Boolean);
}

// ─── Authenticated management endpoints ─────────────────────────────────────

// GET /api/tracking/config — get or create site token
router.get('/config', authenticateToken, async (req: AuthRequest, res: Response) => {
  let config = await pool.query('SELECT token FROM tracking_site_config LIMIT 1');
  if (config.rows.length === 0) {
    const token = uuidv4().replace(/-/g, '');
    await pool.query('INSERT INTO tracking_site_config (token, "createdBy") VALUES ($1, $2)', [token, req.user!.id]);
    config = await pool.query('SELECT token FROM tracking_site_config LIMIT 1');
  }
  res.json({ token: config.rows[0].token });
});

// GET /api/tracking/summary
router.get('/summary', authenticateToken, async (req: AuthRequest, res: Response) => {
  const config = await pool.query('SELECT token FROM tracking_site_config LIMIT 1');
  if (config.rows.length === 0) { res.json({ totalVisitors: 0, totalEvents: 0, totalPageviews: 0, totalClicks: 0 }); return; }
  const token = config.rows[0].token;

  const [visitors, events] = await Promise.all([
    pool.query(`SELECT COUNT(DISTINCT "visitorId") as total FROM tracking_visitors WHERE token=$1`, [token]),
    pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN "eventType"='pageview' THEN 1 ELSE 0 END) as pageviews,
        SUM(CASE WHEN "eventType"='click' THEN 1 ELSE 0 END) as clicks,
        SUM(CASE WHEN "eventType"='form_submit' THEN 1 ELSE 0 END) as form_submits
      FROM tracking_events WHERE token=$1
    `, [token]),
  ]);

  res.json({
    totalVisitors: parseInt(visitors.rows[0].total) || 0,
    ...events.rows[0],
  });
});

// GET /api/tracking/events?limit=50&type=click
router.get('/events', authenticateToken, async (req: AuthRequest, res: Response) => {
  const config = await pool.query('SELECT token FROM tracking_site_config LIMIT 1');
  if (config.rows.length === 0) { res.json([]); return; }
  const token = config.rows[0].token;

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const type = req.query.type as string;

  let sql = `SELECT id, "visitorId", "eventType", "pageUrl", "pagePath", "pageTitle", selector, "elementText", "createdAt"
             FROM tracking_events WHERE token=$1`;
  const params: any[] = [token];

  if (type) {
    params.push(type);
    sql += ` AND "eventType"=$${params.length}`;
  }

  params.push(limit);
  sql += ` ORDER BY "createdAt" DESC LIMIT $${params.length}`;

  const result = await pool.query(sql, params);
  res.json(result.rows);
});

// GET /api/tracking/top-elements
router.get('/top-elements', authenticateToken, async (req: AuthRequest, res: Response) => {
  const config = await pool.query('SELECT token FROM tracking_site_config LIMIT 1');
  if (config.rows.length === 0) { res.json([]); return; }
  const token = config.rows[0].token;

  const result = await pool.query(`
    SELECT selector, "elementText", COUNT(*) as clicks,
           COUNT(DISTINCT "visitorId") as "uniqueVisitors"
    FROM tracking_events
    WHERE token=$1 AND "eventType"='click' AND selector IS NOT NULL AND selector != ''
    GROUP BY selector, "elementText"
    ORDER BY clicks DESC
    LIMIT 20
  `, [token]);

  res.json(result.rows);
});

// GET /api/tracking/top-pages
router.get('/top-pages', authenticateToken, async (req: AuthRequest, res: Response) => {
  const config = await pool.query('SELECT token FROM tracking_site_config LIMIT 1');
  if (config.rows.length === 0) { res.json([]); return; }
  const token = config.rows[0].token;

  const result = await pool.query(`
    SELECT "pagePath", "pageTitle", COUNT(*) as views,
           COUNT(DISTINCT "visitorId") as "uniqueVisitors"
    FROM tracking_events
    WHERE token=$1 AND "eventType"='pageview' AND "pagePath" IS NOT NULL
    GROUP BY "pagePath", "pageTitle"
    ORDER BY views DESC
    LIMIT 20
  `, [token]);

  res.json(result.rows);
});

// GET /api/tracking/visitor/:visitorId — full visitor profile with geo + identity
router.get('/visitor/:visitorId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { visitorId } = req.params;
    const configResult = await pool.query('SELECT token FROM tracking_site_config LIMIT 1');
    if (configResult.rows.length === 0) { res.status(404).json({ error: 'No config' }); return; }
    const token = configResult.rows[0].token;

    const [visitorResult, eventsResult, identitiesResult] = await Promise.all([
      pool.query(`SELECT * FROM tracking_visitors WHERE "visitorId" = $1 AND token = $2 LIMIT 1`, [visitorId, token]),
      pool.query(`SELECT * FROM tracking_events WHERE "visitorId" = $1 AND token = $2 ORDER BY "createdAt" DESC LIMIT 50`, [visitorId, token]),
      pool.query(`SELECT * FROM visitor_identities WHERE "visitorId" = $1 AND token = $2`, [visitorId, token]),
    ]);

    const visitor = visitorResult.rows[0] || null;
    const events = eventsResult.rows;
    const identities = identitiesResult.rows;

    // Geo-resolve if needed
    if (visitor && visitor.ipAddress && !visitor.geoResolved) {
      const ip = visitor.ipAddress;
      const isLocal = ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.');
      if (!isLocal) {
        try {
          const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=country,city,status`);
          const geoData = await geoRes.json() as any;
          if (geoData.status === 'success') {
            await pool.query(
              `UPDATE tracking_visitors SET country = $1, city = $2, "geoResolved" = true WHERE "visitorId" = $3 AND token = $4`,
              [geoData.country || null, geoData.city || null, visitorId, token]
            );
            visitor.country = geoData.country || null;
            visitor.city = geoData.city || null;
            visitor.geoResolved = true;
          }
        } catch (_) {}
      }
    }

    // Find matched member from email identity
    let matchedMember = null;
    const emailIdentity = identities.find((i: any) => i.type === 'email');
    if (emailIdentity) {
      const memberRes = await pool.query(
        `SELECT id, email, "firstName", "lastName", "accountStatus", "programType", phone FROM members WHERE email = $1 LIMIT 1`,
        [emailIdentity.value]
      );
      if (memberRes.rows.length > 0) {
        matchedMember = memberRes.rows[0];
      }
    }

    res.json({ visitor, events, identities, matchedMember });
  } catch (err) {
    console.error('Visitor profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/tracking/visitors — list of unique visitors with identity info
router.get('/visitors', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const configResult = await pool.query('SELECT token FROM tracking_site_config LIMIT 1');
    if (configResult.rows.length === 0) { res.json([]); return; }
    const token = configResult.rows[0].token;

    const result = await pool.query(`
      SELECT tv.*, vi.type as "identityType", vi.value as "identityValue", vi."memberId",
             m."firstName", m."lastName", m."accountStatus"
      FROM tracking_visitors tv
      LEFT JOIN visitor_identities vi ON vi."visitorId" = tv."visitorId" AND vi.token = tv.token AND vi.type = 'email'
      LEFT JOIN members m ON m.id = vi."memberId"
      WHERE tv.token = $1
      ORDER BY tv."lastSeen" DESC LIMIT 100
    `, [token]);

    res.json(result.rows);
  } catch (err) {
    console.error('Visitors list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/tracking/identity-settings
router.get('/identity-settings', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    let result = await pool.query('SELECT * FROM identity_settings LIMIT 1');
    if (result.rows.length === 0) {
      await pool.query(
        `INSERT INTO identity_settings (priority, "autoResolve") VALUES ($1, $2)`,
        [JSON.stringify(['email', 'phone', 'name']), true]
      );
      result = await pool.query('SELECT * FROM identity_settings LIMIT 1');
    }
    const row = result.rows[0];
    res.json({
      id: row.id,
      priority: typeof row.priority === 'string' ? JSON.parse(row.priority) : row.priority,
      autoResolve: row.autoResolve,
    });
  } catch (err) {
    console.error('Identity settings GET error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/tracking/identity-settings
router.put('/identity-settings', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { priority, autoResolve } = req.body;
    const existing = await pool.query('SELECT id FROM identity_settings LIMIT 1');
    let row;
    if (existing.rows.length > 0) {
      const updated = await pool.query(
        `UPDATE identity_settings SET priority = $1, "autoResolve" = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *`,
        [JSON.stringify(priority), autoResolve, existing.rows[0].id]
      );
      row = updated.rows[0];
    } else {
      const inserted = await pool.query(
        `INSERT INTO identity_settings (priority, "autoResolve") VALUES ($1, $2) RETURNING *`,
        [JSON.stringify(priority), autoResolve]
      );
      row = inserted.rows[0];
    }
    res.json({
      id: row.id,
      priority: typeof row.priority === 'string' ? JSON.parse(row.priority) : row.priority,
      autoResolve: row.autoResolve,
    });
  } catch (err) {
    console.error('Identity settings PUT error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/tracking/audiences — create a behavior-based audience
router.post('/audiences', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { name, description, rules, operator } = req.body;

  if (!name || !rules || !Array.isArray(rules) || rules.length === 0) {
    res.status(400).json({ error: 'name and rules are required' });
    return;
  }

  const filters = JSON.stringify({
    behaviorRules: rules,
    behaviorOperator: operator || 'any',
  });

  const result = await pool.query(
    `INSERT INTO audiences (name, description, filters, "createdBy") VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, description || `Behavior audience: ${name}`, filters, req.user!.id]
  );

  res.status(201).json(result.rows[0]);
});

export default router;
