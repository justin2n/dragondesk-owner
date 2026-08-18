import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { parseUtms } from '../utils/attribution';

const router = Router();

// ─── Email open tracking ────────────────────────────────────────────────────
// 1x1 transparent GIF returned for every campaign open pixel. Records the open
// (unique via openedAt) and recomputes the campaign's opens + open rate. Always
// returns the image — never errors — so mail clients render it.
const OPEN_PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

router.get('/open/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  try {
    // Record the open on the recipient row. Campaign opens/open-rate are computed
    // live from these rows on read (see routes/campaigns.ts), so nothing else to do.
    await pool.query(
      `UPDATE campaign_recipients
         SET "openCount" = "openCount" + 1,
             "openedAt" = COALESCE("openedAt", CURRENT_TIMESTAMP)
       WHERE token = $1`,
      [token]
    );
  } catch {
    // swallow — the pixel must always render
  }
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.end(OPEN_PIXEL);
});

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

  /* ── Expose IDs for lead form identity stitching ── */
  w.__ddVid=vid;w.__ddToken=TOKEN;w.__ddEP=EP;

  /* ── First-touch attribution cookie (read by embedded lead forms) ── */
  try{
    if(!getCookie('_dd_attr')){
      var qp=new URLSearchParams(location.search),attr={};
      ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid'].forEach(function(k){var v=qp.get(k);if(v)attr[k]=v;});
      if(d.referrer)attr.referrer=d.referrer;
      if(Object.keys(attr).length){setCookie('_dd_attr',encodeURIComponent(JSON.stringify(attr)),90);}
    }
  }catch(e){}

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
  push({type:'pageview',ref:d.referrer});

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
    if(data&&data.enrollments&&data.enrollments.length){setupEnrollments(data.enrollments);}
    if(data&&data.experiences&&data.experiences.length){renderExperiences(data.experiences);}
  }).catch(function(){});

  /* Enrollment: one view per assigned test (both arms), plus goal watchers that
     record a conversion ('lead') when the visitor completes the chosen goal. */
  function setupEnrollments(list){
    list.forEach(function(en){trackExp(en.testId,en.variant,'view');});
    var goals=list.filter(function(en){return en.goal&&en.goal.type;});
    if(!goals.length)return;
    function convert(en){
      var k='_dd_conv_'+en.testId;
      try{if(localStorage.getItem(k)==='1')return;localStorage.setItem(k,'1');}catch(e){}
      trackExp(en.testId,en.variant,'lead');
    }
    d.addEventListener('click',function(e){
      var el=e.target;if(!el||!el.closest)return;
      goals.forEach(function(en){
        var g=en.goal,hit=false;
        try{
          if(g.type==='tel_click')hit=!!el.closest('a[href^="tel:"]');
          else if(g.type==='email_click')hit=!!el.closest('a[href^="mailto:"]');
          else if(g.type==='selector_click'&&g.selector)hit=!!el.closest(g.selector);
        }catch(_){}
        if(hit)convert(en);
      });
    },true);
    d.addEventListener('submit',function(){
      goals.forEach(function(en){if(en.goal.type==='form_submit')convert(en);});
    },true);
  }

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

  /* ── Injected experiences: promo bars & offer modals ── */
  var AB=EP.replace('/tracking','/ab-analytics');
  function trackExp(testId,variant,type){
    try{fetch(AB+'/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({testId:testId,variant:variant,eventType:type,sessionId:sid}),keepalive:true,credentials:'omit'});}catch(e){}
  }
  /* Frequency cap. 'once' persists across sessions, 'session' per tab, 'always' never caps. */
  function seen(testId,freq){
    if(freq==='always')return false;
    var k='_dd_exp_'+testId;
    try{return (freq==='session'?sessionStorage:localStorage).getItem(k)==='1';}catch(e){return false;}
  }
  function markSeen(testId,freq){
    if(freq==='always')return;
    var k='_dd_exp_'+testId;
    try{(freq==='session'?sessionStorage:localStorage).setItem(k,'1');}catch(e){}
  }
  /* Run fn on the configured trigger (offer modals). Promo bars show immediately. */
  function onTrigger(trig,fn){
    trig=trig||{};var t=trig.type||'load';
    if(t==='load'){setTimeout(fn,Math.max(0,(trig.delaySeconds||0)*1000));return;}
    if(t==='exit'){
      var fired=false;
      var h=function(e){if(!fired&&e.clientY<=0){fired=true;d.removeEventListener('mouseout',h);fn();}};
      d.addEventListener('mouseout',h);return;
    }
    if(t==='scroll'){
      var pct=trig.scrollPct||50,fired2=false;
      var s=function(){var p=Math.round((w.scrollY/((d.body.scrollHeight-w.innerHeight)||1))*100);if(!fired2&&p>=pct){fired2=true;w.removeEventListener('scroll',s);fn();}};
      w.addEventListener('scroll',s,{passive:true});return;
    }
    setTimeout(fn,0);
  }
  function renderExperiences(list){
    list.forEach(function(exp){
      try{
        if(!exp||!exp.config)return;
        if(seen(exp.testId,exp.config.frequency))return;
        if(exp.kind==='promoBar')renderPromoBar(exp);
        else if(exp.kind==='offerModal')onTrigger(exp.config.trigger,function(){renderOfferModal(exp);});
      }catch(e){}
    });
  }
  function ctaClick(exp,href){
    trackExp(exp.testId,exp.variant,'click');
    if(href){try{w.open(href,'_self');}catch(e){location.href=href;}}
  }
  function renderPromoBar(exp){
    var c=exp.config;
    var bar=d.createElement('div');
    bar.className='dd-exp-bar';
    var pos=(c.position==='bottom')?'bottom:0;':'top:0;';
    bar.style.cssText='position:fixed;left:0;right:0;'+pos+'z-index:2147483646;display:flex;align-items:center;justify-content:center;gap:14px;padding:12px 44px 12px 16px;font:600 15px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;box-sizing:border-box;box-shadow:0 2px 8px rgba(0,0,0,.15);background:'+(c.bgColor||'#c0392b')+';color:'+(c.textColor||'#ffffff')+';';
    var msg=d.createElement('span');msg.textContent=c.message||'';bar.appendChild(msg);
    if(c.ctaLabel){
      var a=d.createElement('a');a.textContent=c.ctaLabel;a.href=c.ctaLink||'#';
      a.style.cssText='display:inline-block;padding:7px 16px;border-radius:6px;background:'+(c.textColor||'#fff')+';color:'+(c.bgColor||'#c0392b')+';text-decoration:none;font-weight:700;white-space:nowrap;';
      a.addEventListener('click',function(e){e.preventDefault();ctaClick(exp,c.ctaLink);});
      bar.appendChild(a);
    }
    if(c.dismissible!==false){
      var x=d.createElement('button');x.textContent='\\u00d7';x.setAttribute('aria-label','Dismiss');
      x.style.cssText='position:absolute;right:12px;top:50%;transform:translateY(-50%);background:transparent;border:none;color:inherit;font-size:22px;line-height:1;cursor:pointer;opacity:.8;';
      x.addEventListener('click',function(){bar.remove();markSeen(exp.testId,c.frequency);});
      bar.appendChild(x);
    }
    d.body.appendChild(bar);
    /* view is recorded once per enrollment (setupEnrollments), not here. */
    markSeen(exp.testId,c.frequency);
  }
  function renderOfferModal(exp){
    var c=exp.config;
    var ov=d.createElement('div');ov.className='dd-exp-overlay';
    ov.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
    var card=d.createElement('div');
    card.style.cssText='position:relative;max-width:440px;width:100%;background:'+(c.bgColor||'#fff')+';color:'+(c.textColor||'#1a1a2e')+';border-radius:12px;padding:28px;box-sizing:border-box;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.35);text-align:center;';
    if(c.imageUrl){var img=d.createElement('img');img.src=c.imageUrl;img.style.cssText='max-width:100%;border-radius:8px;margin-bottom:14px;';card.appendChild(img);}
    if(c.heading){var h=d.createElement('h2');h.textContent=c.heading;h.style.cssText='margin:0 0 10px;font-size:22px;font-weight:700;';card.appendChild(h);}
    if(c.body){var p=d.createElement('p');p.textContent=c.body;p.style.cssText='margin:0 0 18px;opacity:.9;';card.appendChild(p);}
    if(c.ctaLabel){
      var a=d.createElement('a');a.textContent=c.ctaLabel;a.href=c.ctaLink||'#';
      a.style.cssText='display:inline-block;padding:12px 24px;border-radius:8px;background:'+(c.accentColor||'#c0392b')+';color:#fff;text-decoration:none;font-weight:700;';
      a.addEventListener('click',function(e){e.preventDefault();ctaClick(exp,c.ctaLink);});
      card.appendChild(a);
    }
    function close(){ov.remove();markSeen(exp.testId,c.frequency);}
    if(c.dismissible!==false){
      var x=d.createElement('button');x.textContent='\\u00d7';x.setAttribute('aria-label','Close');
      x.style.cssText='position:absolute;right:12px;top:10px;background:transparent;border:none;color:inherit;font-size:24px;line-height:1;cursor:pointer;opacity:.6;';
      x.addEventListener('click',close);card.appendChild(x);
      ov.addEventListener('click',function(e){if(e.target===ov)close();});
    }
    ov.appendChild(card);d.body.appendChild(ov);
    /* view is recorded once per enrollment (setupEnrollments), not here. */
    markSeen(exp.testId,c.frequency);
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

      // First-touch attribution: capture UTMs/referrer from the pageview URL,
      // only filling columns that are still null (never overwrite first touch).
      const pv = events.find((e: any) => e.type === 'pageview' && e.url);
      if (pv) {
        const u = parseUtms(pv.url);
        await client.query(`
          UPDATE tracking_visitors SET
            "utmSource" = COALESCE("utmSource", $3),
            "utmMedium" = COALESCE("utmMedium", $4),
            "utmCampaign" = COALESCE("utmCampaign", $5),
            "utmTerm" = COALESCE("utmTerm", $6),
            "utmContent" = COALESCE("utmContent", $7),
            gclid = COALESCE(gclid, $8),
            fbclid = COALESCE(fbclid, $9),
            "landingPage" = COALESCE("landingPage", $10),
            referrer = COALESCE(referrer, $11)
          WHERE "visitorId" = $1 AND token = $2
        `, [vid, token, u.utmSource, u.utmMedium, u.utmCampaign, u.utmTerm, u.utmContent, u.gclid, u.fbclid, u.landingPage, pv.ref || null]);
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

  const { token, vid, path, url } = req.body;
  if (!token || !vid) { res.json({ changes: [] }); return; }

  try {
    // Get running A/B tests for this token (match on pageUrl path)
    const tests = await pool.query(`
      SELECT t.id, t."variantA", t."variantB", t."trafficSplit", t."experienceType", t.goal,
             a.filters as "audienceFilters"
      FROM ab_tests t
      LEFT JOIN audiences a ON a.id = t."audienceId"
      WHERE t.status = 'running'
    `);

    if (tests.rows.length === 0) { res.json({ changes: [], experiences: [], enrollments: [] }); return; }

    const changes: any[] = [];
    // Promo bars / offer modals: injected UI (not element edits), so they ride a
    // separate list the snippet renders.
    const experiences: any[] = [];
    // Every assigned running test the visitor is in — BOTH arms — so the snippet
    // can fire a view and watch the goal for each. Control (A) must be enrolled
    // too, or a "show it vs not" test has nothing to compare the treatment to.
    const enrollments: any[] = [];

    for (const test of tests.rows) {
      // Check if visitor matches any behavior audience rules
      const variantA = typeof test.variantA === 'string' ? JSON.parse(test.variantA) : test.variantA;
      const variantB = typeof test.variantB === 'string' ? JSON.parse(test.variantB) : test.variantB;
      const filters = test.audienceFilters ? (typeof test.audienceFilters === 'string' ? JSON.parse(test.audienceFilters) : test.audienceFilters) : {};
      const goal = test.goal ? (typeof test.goal === 'string' ? JSON.parse(test.goal) : test.goal) : null;

      let inAudience = true;

      // Check behavior rules if present
      if (filters.behaviorRules && filters.behaviorRules.length > 0) {
        inAudience = await checkBehaviorAudience(vid, token, filters.behaviorRules, filters.behaviorOperator || 'any');
      }

      if (!inAudience) continue;

      // Deterministic bucket from the visitor id.
      const hash = vid.split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
      const bucket = hash % 100;
      const expType = test.experienceType || 'page_edit';

      if (expType === 'page_edit') {
        // Unchanged: trafficSplit is the share that sees variant A.
        const isA = bucket < test.trafficSplit;
        const variant = isA ? variantA : variantB;
        if (variant && variant.changes) {
          changes.push(...variant.changes.map((c: any) => ({
            selector: c.selector,
            type: c.type,
            property: c.property,
            value: c.newValue,
          })));
        }
        enrollments.push({ testId: test.id, variant: isA ? 'A' : 'B', goal });
        continue;
      }

      // Promo bar / offer modal. URL targeting gates the experience on this page
      // for BOTH arms — off-target pages enroll no one.
      if (!matchesUrlTarget(variantB?.targeting, path, url)) continue;
      // trafficSplit is the treatment share: bucket < split → treatment (B, sees
      // it); otherwise control (A, sees nothing). 100% = everyone treated.
      const isTreatment = bucket < test.trafficSplit;
      enrollments.push({ testId: test.id, variant: isTreatment ? 'B' : 'A', goal });
      if (isTreatment) {
        const config = expType === 'promo_bar' ? variantB?.promoBar : variantB?.offerModal;
        if (config) {
          experiences.push({
            testId: test.id,
            variant: 'B',
            kind: expType === 'promo_bar' ? 'promoBar' : 'offerModal',
            config,
          });
        }
      }
    }

    res.json({ changes, experiences, enrollments });
  } catch (err) {
    res.json({ changes: [] });
  }
});

// Does the visitor's current page satisfy an experience's URL targeting?
// scope 'site' (or missing) matches everywhere; 'page' matches the configured
// path/URL by exact / starts-with / contains. Missing value = whole site.
function matchesUrlTarget(
  targeting: { scope?: string; matchType?: string; value?: string } | undefined,
  path?: string,
  url?: string,
): boolean {
  if (!targeting || targeting.scope !== 'page') return true;
  const value = (targeting.value || '').trim();
  if (!value) return true;
  // Match against the path by default; if the target looks like a full URL, use it.
  const hay = /^https?:\/\//i.test(value) ? (url || '') : (path || '');
  const v = value.toLowerCase();
  const h = hay.toLowerCase();
  switch (targeting.matchType) {
    case 'exact': return h === v;
    case 'startsWith': return h.startsWith(v);
    default: return h.includes(v); // 'contains'
  }
}

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
