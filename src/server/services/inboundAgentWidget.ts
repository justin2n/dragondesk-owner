// Browser code for the Outreach website chat agents. Appended to the tracking
// script (routes/tracking.ts) when the agent is enabled, and relies on the
// globals that script exposes: __ddToken, __ddEP, __ddVid.
//
// When the agent signs a visitor up, the server returns the lead fields and
// this code submits the site's own signup form with them. It loads the form
// page in a hidden same-origin iframe (named dd-agent-frame, which the tracking
// script skips), fills the fields the way a person would, and clicks submit, so
// the lead reaches whatever that form already feeds. If the page can't be
// framed, it falls back to a matching form on the current page.

const WIDGET_JS = String.raw`/* DragonDesk Outreach chat agent v1 */
(function(w,d){
  if(w.name==='dd-agent-frame'||w.__ddAgentLoaded)return;
  w.__ddAgentLoaded=1;
  var ALL=__DD_AGENT_CFG__;
  var TOKEN=w.__ddToken,EP=w.__ddEP,VID=w.__ddVid;
  if(!TOKEN||!EP)return;
  /* Pick this site's agent: one listing this domain (or a parent domain),
     else the catch-all with no domains. Same rule as the server. */
  var HOST=location.hostname.toLowerCase().replace(/^www\./,'');
  function covers(a){for(var i=0;i<a.domains.length;i++){var dm=a.domains[i];if(HOST===dm||HOST.slice(-dm.length-1)==='.'+dm)return true;}return false;}
  var CFG=null;
  (ALL.agents||[]).forEach(function(a){if(!CFG&&a.domains&&a.domains.length&&covers(a))CFG=a;});
  if(!CFG)(ALL.agents||[]).forEach(function(a){if(!CFG&&(!a.domains||!a.domains.length))CFG=a;});
  if(!CFG)return;
  var AEP=EP+'/agent';
  var SKEY='_dd_agent_'+CFG.id;

  var state;
  try{state=JSON.parse(sessionStorage.getItem(SKEY)||'{}')||{};}catch(e){state={};}
  state.msgs=state.msgs||[];
  function save(){try{sessionStorage.setItem(SKEY,JSON.stringify(state));}catch(e){}}

  function post(path,body){
    return fetch(AEP+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'omit',keepalive:path!=='/chat'});
  }

  /* ── UI ── */
  var C=CFG.accentColor||'#dc2626';
  var host=d.createElement('div');
  host.id='dd-agent';
  /* Above Optimize promo bars (2147483646): on phones the open chat is full
     screen, and a bar on top would hide its header and close button. Offer
     modals share this level and, added later, still show over the chat. */
  host.style.cssText='position:fixed;bottom:0;right:0;width:0;height:0;z-index:2147483647;';
  var root=host.attachShadow?host.attachShadow({mode:'open'}):host;
  var ICON_CHAT='<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var ICON_X='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var ICON_SEND='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>';
  root.innerHTML='<style>'+
    ':host{all:initial}'+
    '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}'+
    '.launch{position:fixed;right:20px;bottom:20px;width:58px;height:58px;border-radius:50%;border:0;background:'+C+';color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25);transition:transform .15s}'+
    '.launch:hover{transform:scale(1.06)}'+
    '.teaser{position:fixed;right:20px;bottom:90px;max-width:260px;background:#fff;color:#1a1a1a;border-radius:12px;padding:12px 30px 12px 14px;font-size:14px;line-height:1.4;box-shadow:0 6px 24px rgba(0,0,0,.18);cursor:pointer}'+
    '.teaser button{position:absolute;top:6px;right:6px;border:0;background:none;color:#888;cursor:pointer;padding:2px;display:flex}'+
    '.panel{position:fixed;right:20px;bottom:92px;width:370px;height:540px;max-height:calc(100vh - 112px);background:#fff;color:#1a1a1a;border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,.28);display:flex;flex-direction:column;overflow:hidden}'+
    '.head{background:'+C+';color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;font-weight:600;font-size:15px}'+
    '.head button{border:0;background:none;color:#fff;cursor:pointer;display:flex;padding:4px;opacity:.9}'+
    '.log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#f7f7f8}'+
    '.m{max-width:85%;padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}'+
    '.a{align-self:flex-start;background:#fff;border:1px solid #e6e6e9;border-bottom-left-radius:4px}'+
    '.v{align-self:flex-end;background:'+C+';color:#fff;border-bottom-right-radius:4px}'+
    '.err{align-self:center;background:none;color:#a33;font-size:13px;text-align:center}'+
    '.a .btn{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:10px;padding:10px 14px;border-radius:10px;background:'+C+';color:#fff;text-decoration:none;font-weight:600;font-size:14px;line-height:1.3;text-align:center;white-space:normal}'+
    '.a .btn:hover{filter:brightness(1.08)}'+
    '.a .btn svg{flex-shrink:0}'+
    '.a div+.btn{margin-top:12px}'+
    '.typing{align-self:flex-start;display:flex;gap:4px;padding:12px 14px;background:#fff;border:1px solid #e6e6e9;border-radius:14px}'+
    '.typing i{width:6px;height:6px;border-radius:50%;background:#999;animation:b 1s infinite}'+
    '.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}'+
    '@keyframes b{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}'+
    '.bar{display:flex;gap:8px;padding:10px;border-top:1px solid #eee;background:#fff}'+
    '.bar textarea{flex:1;resize:none;border:1px solid #ddd;border-radius:10px;padding:9px 11px;font-size:14px;line-height:1.4;max-height:110px;outline:none;color:#1a1a1a;background:#fff}'+
    '.bar textarea:focus{border-color:'+C+'}'+
    '.bar button{border:0;border-radius:10px;width:42px;background:'+C+';color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}'+
    '.bar button:disabled{opacity:.5;cursor:default}'+
    '.foot{text-align:center;font-size:11px;color:#999;padding:0 0 8px;background:#fff}'+
    '.hide{display:none!important}'+
    '@media (max-width:480px){.panel{right:0;bottom:0;width:100vw;height:100%;max-height:none;border-radius:0}.launch.open{display:none}.teaser{right:12px;left:12px;max-width:none}}'+
    '</style>'+
    '<div class="teaser hide" role="button" tabindex="0"><span class="tt"></span><button class="tx" aria-label="Dismiss">'+ICON_X+'</button></div>'+
    '<button class="launch" aria-label="Open chat" aria-expanded="false">'+ICON_CHAT+'</button>'+
    '<div class="panel hide" role="dialog" aria-label="Chat">'+
      '<div class="head"><span class="name"></span><button class="close" aria-label="Close chat">'+ICON_X+'</button></div>'+
      '<div class="log" aria-live="polite"></div>'+
      '<form class="bar"><textarea rows="1" maxlength="1000" placeholder="Type a message..." aria-label="Message"></textarea><button type="submit" aria-label="Send">'+ICON_SEND+'</button></form>'+
      '<div class="foot">Powered by DragonDesk</div>'+
    '</div>';

  function $(s){return root.querySelector(s);}
  var launch=$('.launch'),panel=$('.panel'),log=$('.log'),form=$('.bar'),input=$('textarea'),sendBtn=$('.bar button'),teaser=$('.teaser');
  $('.name').textContent=CFG.agentName||'Chat';
  $('.tt').textContent=CFG.greeting||'';
  var busy=false;

  /* Agent text with its links pulled out as buttons. The agent writes links
     as [Label](https://...); any bare URL becomes an "Open link" button. */
  var ICON_OUT='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  function agentBody(el,text){
    var links=[];
    /* A labeled link inside a sentence keeps its label as words there; one
       standing on its own (end of a line, after a colon) is just the button. */
    text=text.replace(/\[([^\]\n]{1,80})\]\((https?:\/\/[^\s)]+)\)/g,function(match,label,url,at,all){
      label=label.trim();links.push({label:label,url:url});
      var before=all.slice(all.lastIndexOf('\n',at-1)+1,at).trim();
      var after=all.slice(at+match.length).split('\n')[0];
      return (before&&!/[:.!?]$/.test(before))||/[a-z0-9]/i.test(after)?label:'';
    });
    text=text.replace(/https?:\/\/[^\s<>"')\]]+/g,function(url){
      var trail=(url.match(/[.,;:!?]+$/)||[''])[0];
      links.push({label:'Open link',url:url.slice(0,url.length-trail.length)});return trail;
    });
    /* Tidy what the removed links leave behind: "here: ." or "at ." */
    text=text.replace(/[ \t]+([.,;:!?])/g,'$1').replace(/:\s*([.!?]?)\s*$/,function(_,p){return p||'.';}).replace(/[ \t]{2,}/g,' ').replace(/\n{3,}/g,'\n\n').trim();
    if(text){var t=d.createElement('div');t.textContent=text;el.appendChild(t);}
    var seen={};
    links.forEach(function(l){
      if(seen[l.url])return;seen[l.url]=1;
      var a=d.createElement('a');
      a.className='btn';a.href=l.url;a.target='_blank';a.rel='noopener noreferrer';
      a.addEventListener('click',function(){linkClicked(l.url);});
      var span=d.createElement('span');span.textContent=l.label;a.appendChild(span);
      a.insertAdjacentHTML('beforeend',ICON_OUT);
      el.appendChild(a);
    });
  }
  /* Link clicks: the booking link is the conversion, and starts the clock on
     the follow-up ("were you able to book?"). */
  function sameUrl(a,b){
    function n(u){try{var x=new URL(u);return x.hostname.replace(/^www\./,'').toLowerCase()+x.pathname.replace(/\/+$/,'')+x.search;}catch(e){return '';}}
    var na=n(a);return !!na&&na===n(b);
  }
  function linkClicked(url){
    if(state.chatId)post('/link-click',{token:TOKEN,vid:VID,chatId:state.chatId,url:url}).catch(function(){});
    var booking=!CFG.bookingUrl||sameUrl(url,CFG.bookingUrl);
    if(booking&&CFG.followUpEnabled&&state.chatId&&!state.followUpAt&&!state.followedUp){
      state.followUpAt=Date.now()+Math.max(1,CFG.followUpMinutes||3)*60000;save();
    }
  }
  function checkFollowUp(){
    if(!state.followUpAt||state.followedUp||Date.now()<state.followUpAt)return;
    state.followedUp=1;save();
    post('/followup',{token:TOKEN,vid:VID,chatId:state.chatId})
      .then(function(r){return r.json();})
      .then(function(j){
        if(!j||!j.message)return;
        state.msgs.push({r:'a',t:j.message});save();
        if(state.open){render();return;}
        if(w.innerWidth<=480){$('.tt').textContent=j.message;teaser.classList.remove('hide');}
        else setOpen(true);
      }).catch(function(){});
  }
  function render(){
    log.innerHTML='';
    state.msgs.forEach(function(m){
      var el=d.createElement('div');
      el.className='m '+(m.r==='v'?'v':m.r==='e'?'err':'a');
      if(m.r==='a')agentBody(el,m.t);else el.textContent=m.t;
      log.appendChild(el);
    });
    if(busy){var t=d.createElement('div');t.className='typing';t.innerHTML='<i></i><i></i><i></i>';log.appendChild(t);}
    log.scrollTop=log.scrollHeight;
    sendBtn.disabled=busy;
  }
  function setOpen(open){
    state.open=open;
    if(!open)state.closed=1; /* closed by the visitor: never auto-open again this visit */
    save();
    panel.classList.toggle('hide',!open);
    launch.classList.toggle('open',open);
    launch.setAttribute('aria-expanded',open?'true':'false');
    launch.innerHTML=open?ICON_X:ICON_CHAT;
    if(open){
      teaser.classList.add('hide');state.teased=1;
      if(!state.msgs.length&&CFG.greeting){state.msgs.push({r:'a',t:CFG.greeting});save();}
      render();
      setTimeout(function(){input.focus();},50);
    }
  }
  launch.addEventListener('click',function(){setOpen(!state.open);});
  $('.close').addEventListener('click',function(){setOpen(false);});
  teaser.addEventListener('click',function(){setOpen(true);});
  $('.tx').addEventListener('click',function(e){e.stopPropagation();teaser.classList.add('hide');state.teased=1;save();});

  function grow(){input.style.height='auto';input.style.height=Math.min(input.scrollHeight,110)+'px';}
  input.addEventListener('input',grow);
  input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit?form.requestSubmit():send();}});
  form.addEventListener('submit',function(e){e.preventDefault();send();});

  function send(){
    var text=input.value.trim();
    if(!text||busy)return;
    input.value='';grow();
    state.msgs.push({r:'v',t:text});busy=true;save();render();
    post('/chat',{token:TOKEN,vid:VID,agentId:CFG.id,chatId:state.chatId,message:text,pageUrl:location.href})
      .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});})
      .then(function(res){
        busy=false;
        if(!res.ok){state.msgs.push({r:'e',t:(res.j&&res.j.error)||'Something went wrong. Please try again.'});save();render();return;}
        state.chatId=res.j.chatId;
        if(res.j.reply)state.msgs.push({r:'a',t:res.j.reply});
        save();render();
        if(res.j.action&&res.j.action.type==='submit_native_form')submitNative(res.j.action.fields,state.chatId);
      })
      .catch(function(){busy=false;state.msgs.push({r:'e',t:'Connection problem. Please try again.'});save();render();});
  }

  /* Auto-open after a delay or a scroll depth, at most once per visit. Phones
     get the greeting bubble instead, since the open chat fills the screen. */
  function nudge(){
    if(state.open||state.closed||state.autoDone)return;
    state.autoDone=1;save();
    if(w.innerWidth<=480){if(CFG.greeting){teaser.classList.remove('hide');}}
    else setOpen(true);
  }
  /* Heartbeat while the chat is open and in view, so staff see "Chatting now". */
  function ping(){
    if(state.open&&state.chatId&&!d.hidden)post('/ping',{token:TOKEN,vid:VID,chatId:state.chatId}).catch(function(){});
  }
  setInterval(ping,30000);
  d.addEventListener('visibilitychange',ping);
  launch.addEventListener('click',function(){setTimeout(ping,0);});
  setInterval(checkFollowUp,10000);
  d.addEventListener('visibilitychange',function(){if(!d.hidden)checkFollowUp();});
  w.addEventListener('focus',checkFollowUp);
  setTimeout(checkFollowUp,500);
  var waiting=!state.open&&!state.closed&&!state.autoDone;
  if(state.open)setOpen(true);
  else if(CFG.autoOpen==='time'&&waiting){setTimeout(nudge,Math.max(1,CFG.autoOpenDelay||10)*1000);}
  else if(CFG.autoOpen==='scroll'&&waiting){
    var onScroll=function(){
      var max=d.documentElement.scrollHeight-w.innerHeight;
      if(max>0&&(w.scrollY/max)*100>=(CFG.autoOpenScroll||50)){w.removeEventListener('scroll',onScroll);nudge();}
    };
    w.addEventListener('scroll',onScroll,{passive:true});
  }
  else if(CFG.autoOpen!=='time'&&CFG.autoOpen!=='scroll'&&!state.teased&&CFG.greeting){setTimeout(function(){if(!state.open&&!state.teased)teaser.classList.remove('hide');},8000);}
  (d.body||d.documentElement).appendChild(host);

  /* ── Native form submission ── */
  var FIELD_TYPES='input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=password]):not([type=image]),select,textarea';
  function describe(el,doc){
    var parts=[el.name,el.id,el.getAttribute('autocomplete'),el.getAttribute('placeholder'),el.getAttribute('aria-label'),el.getAttribute('data-name')];
    try{
      if(el.id){var l=doc.querySelector('label[for="'+(w.CSS&&CSS.escape?CSS.escape(el.id):el.id)+'"]');if(l)parts.push(l.textContent);}
      var pl=el.closest('label');if(pl)parts.push(pl.textContent);
      /* A label beside the input but not linked to it (common on hand-built
         forms): the only label in the input's own wrapper. */
      else if(el.parentElement){
        var ls=el.parentElement.querySelectorAll('label'),fs=el.parentElement.querySelectorAll('input,select,textarea');
        if(ls.length===1&&fs.length===1&&!ls[0].htmlFor)parts.push(ls[0].textContent);
      }
      /* A dropdown's placeholder option often names it ("Programs *"). */
      if(el.tagName==='SELECT'&&el.options.length&&!el.options[0].value)parts.push(el.options[0].text);
    }catch(e){}
    return parts.filter(Boolean).join(' ').toLowerCase();
  }
  var MATCH={
    email:function(el,s){return el.type==='email'||/e-?mail/.test(s);},
    phone:function(el,s){return el.type==='tel'||/phone|mobile|cell|\btel\b/.test(s);},
    firstName:function(el,s){return /given-name/.test(s)||/first|fname|given/.test(s);},
    lastName:function(el,s){return /family-name/.test(s)||/last|lname|surname|family/.test(s);},
    fullName:function(el,s){return el.tagName!=='TEXTAREA'&&el.tagName!=='SELECT'&&/(^|[^a-z])(full ?|your ?)?name([^a-z]|$)/.test(s)&&!/first|last|user|company|business|studio|organi[sz]ation|e-?mail/.test(s);},
    program:function(el,s){return el.tagName!=='TEXTAREA'&&/program|class|interest|service|course|style|discipline|practice ?area/.test(s);},
    /* A dropdown of studios is a location; a typed-in studio name is the visitor's business. */
    /* Never a text box: "How many locations?" in a message placeholder isn't a location field. */
    location:function(el,s){return el.tagName!=='TEXTAREA'&&(/location|branch|campus|venue/.test(s)||(el.tagName==='SELECT'&&/studio/.test(s)));},
    company:function(el,s){return el.tagName!=='SELECT'&&el.tagName!=='TEXTAREA'&&/company|business|organi[sz]ation|studio|academy|school name|gym name/.test(s);},
    message:function(el,s){return el.tagName==='TEXTAREA'||/message|comment|question|note|goal/.test(s);}
  };
  var ORDER=['email','phone','firstName','lastName','company','fullName','location','program','message'];
  function mapFields(box,doc){
    var map={},used=[],els=[].slice.call(box.querySelectorAll(FIELD_TYPES));
    var pins=CFG.fieldMap||{};
    Object.keys(pins).forEach(function(k){
      try{var el=box.querySelector(pins[k])||doc.querySelector(pins[k]);if(el){map[k]=el;used.push(el);}}catch(e){}
    });
    ORDER.forEach(function(k){
      if(map[k])return;
      for(var i=0;i<els.length;i++){
        var el=els[i];if(used.indexOf(el)>=0)continue;
        if(MATCH[k](el,describe(el,doc))){map[k]=el;used.push(el);return;}
      }
    });
    return map;
  }
  function findForm(doc){
    if(CFG.formSelector){
      try{var el=doc.querySelector(CFG.formSelector);if(el)return el.tagName==='FORM'?el:(el.querySelector('form')||el);}catch(e){}
      return null;
    }
    var best=null,bestScore=0;
    [].slice.call(doc.querySelectorAll('form')).forEach(function(f){
      if(f.closest('#dd-agent')||f.querySelector('input[type=password]'))return;
      var m=mapFields(f,doc);
      if(!m.email)return;
      var score=3+(m.firstName?1:0)+(m.lastName?1:0)+(m.fullName?1:0)+(m.phone?1:0);
      if(score>bestScore){best=f;bestScore=score;}
    });
    return best;
  }
  /* Pick the dropdown option that best matches what the visitor said:
     shared words count, with common martial-arts shorthand expanded. */
  var SYN={bjj:'jiu jitsu',jj:'jiu jitsu',jiujitsu:'jiu jitsu',tkd:'taekwondo',mma:'mixed martial arts',mt:'muay thai',kickboxing:'kickboxing muay thai',kid:'kids',children:'kids',childrens:'kids',youth:'kids',junior:'kids',juniors:'kids',teen:'teens',adults:'adult',pt:'personal training'};
  function words(t){
    return String(t||'').toLowerCase().replace(/&[a-z#0-9]+;/g,' ').replace(/['’]/g,'').split(/[^a-z0-9]+/).filter(Boolean)
      .map(function(x){return (SYN[x]||x);}).join(' ').split(' ').filter(function(x){return x.length>1&&x!=='and'&&x!=='the'&&x!=='only';});
  }
  function bestOption(el,v){
    var want=words(v),best=null,bestScore=0;
    if(!want.length)return null;
    [].slice.call(el.options).forEach(function(o){
      if(!o.value||o.disabled)return;
      var have=words(o.text),score=0,core=0;
      want.forEach(function(x){if(have.indexOf(x)>=0){score+=1;if(!/^(kids|adult|teens)$/.test(x))core++;}});
      have.forEach(function(x){if(want.indexOf(x)<0)score-=0.3;}); /* extra words make it a looser match */
      /* Kids vs adult programs share names; never cross them. */
      var wk=want.indexOf('kids')>=0,hk=have.indexOf('kids')>=0;
      if(hk&&!wk)score-=1;if(wk&&!hk)score-=0.5;
      if(String(o.text).trim().toLowerCase()===String(v).trim().toLowerCase())score+=10;
      /* Needs a real shared word (not just "kids"), unless it's an exact match. */
      if(!core&&score<10)return;
      if(score>bestScore){best=o;bestScore=score;}
    });
    return bestScore>0?best:null;
  }
  function setValue(el,v,win){
    if(v==null||v==='')return;
    if(el.tagName==='SELECT'){
      var hit=bestOption(el,v);
      if(!hit)return;
      el.value=hit.value;
    }else{
      var proto=el.tagName==='TEXTAREA'?win.HTMLTextAreaElement.prototype:win.HTMLInputElement.prototype;
      var desc=Object.getOwnPropertyDescriptor(proto,'value');
      if(desc&&desc.set)desc.set.call(el,v);else el.value=v;
    }
    ['input','change','blur'].forEach(function(t){el.dispatchEvent(new win.Event(t,{bubbles:true}));});
  }
  function fill(box,doc,win,f){
    var m=mapFields(box,doc);
    var full=(f.firstName+' '+f.lastName).trim();
    if(m.firstName&&m.lastName){setValue(m.firstName,f.firstName,win);setValue(m.lastName,f.lastName,win);}
    else if(m.firstName){setValue(m.firstName,full,win);}
    else if(m.fullName){setValue(m.fullName,full,win);}
    if(m.email)setValue(m.email,f.email,win);
    if(m.phone)setValue(m.phone,f.phone,win);
    if(m.program)setValue(m.program,f.program,win);
    if(m.location)setValue(m.location,f.location,win);
    if(m.company)setValue(m.company,f.company,win);
    /* Any other required dropdown still empty: try the program, then the location. */
    [].slice.call(box.querySelectorAll('select[required]')).forEach(function(sel){
      if(sel.value||sel===m.program||sel===m.location)return;
      var o=bestOption(sel,f.program)||bestOption(sel,f.location);
      if(o)setValue(sel,o.text,win);
    });
    if(m.message){
      var note=['Sent from the website chat.',f.program?'Program: '+f.program+'.':'',f.location?'Location: '+f.location+'.':'',f.notes||''].filter(Boolean).join(' ');
      setValue(m.message,note,win);
    }
    return m;
  }
  function invalidFields(box){
    var bad=[].slice.call(box.querySelectorAll(':invalid')).filter(function(el){return el.tagName!=='FORM'&&el.tagName!=='FIELDSET';});
    return bad.map(function(el){return el.name||el.id||el.type;}).slice(0,5);
  }
  function clickSubmit(box){
    var btn=box.querySelector('button[type=submit],input[type=submit]')||box.querySelector('button:not([type=button]):not([type=reset])');
    if(btn){btn.click();return true;}
    if(box.tagName==='FORM'){if(box.requestSubmit)box.requestSubmit();else box.submit();return true;}
    return false;
  }
  function fillAndSubmit(box,doc,win,f){
    var m=fill(box,doc,win,f);
    if(!m.email)return {ok:false,detail:'no email field found in the form'};
    var bad=invalidFields(box);
    if(bad.length)return {ok:false,detail:'form needs fields the agent could not fill: '+bad.join(', ')};
    if(!clickSubmit(box))return {ok:false,detail:'no submit button found'};
    return {ok:true};
  }

  function submitNative(fields,chatId){
    var done=false;
    function report(status,detail){
      if(done)return;done=true;
      post('/native-result',{token:TOKEN,vid:VID,chatId:chatId,status:status,detail:detail}).catch(function(){});
    }
    var target;
    try{target=new URL(CFG.formPageUrl||location.href,location.href);}catch(e){report('failed','invalid form page URL');return;}
    function onThisPage(reason){
      var box=findForm(d);
      if(!box){report('failed',reason);return;}
      var r=fillAndSubmit(box,d,w,fields);
      report(r.ok?'submitted':'failed',r.ok?'submitted on the current page ('+reason+')':r.detail);
    }
    if(target.origin!==location.origin){onThisPage('form page is on another domain');return;}

    var f=d.createElement('iframe');
    f.name='dd-agent-frame';
    f.setAttribute('aria-hidden','true');f.tabIndex=-1;
    f.style.cssText='position:fixed;left:-10000px;top:0;width:1024px;height:900px;border:0;opacity:0;pointer-events:none;';
    var phase='loading',start=Date.now();
    function cleanup(){setTimeout(function(){try{f.remove();}catch(e){}},3000);}
    function look(){
      if(done)return;
      var doc=null;try{doc=f.contentDocument;}catch(e){}
      if(!doc){f.remove();onThisPage('form page could not be loaded in the background');return;}
      var box=findForm(doc);
      if(!box){
        if(Date.now()-start<15000){setTimeout(look,400);return;}
        f.remove();onThisPage('signup form not found on the form page');return;
      }
      var r=fillAndSubmit(box,doc,f.contentWindow,fields);
      if(!r.ok){report('failed',r.detail);cleanup();return;}
      phase='submitted';
      /* Most forms navigate (load fires below); script-driven ones don't. */
      setTimeout(function(){
        if(done)return;
        var gone=!box.isConnected||box.offsetParent===null;
        report('submitted',gone?'form was replaced after submit':'submitted; the form did not navigate, so success is unconfirmed');
        cleanup();
      },7000);
    }
    f.addEventListener('load',function(){
      if(phase==='submitted'){report('submitted','page navigated after submit');cleanup();return;}
      if(phase!=='loading')return;
      phase='finding';look();
    });
    setTimeout(function(){if(phase==='loading'){phase='timeout';f.remove();onThisPage('form page took too long to load');}},20000);
    f.src=target.href;
    (d.body||d.documentElement).appendChild(f);
  }
})(window,document);
`;

export function buildInboundAgentWidget(publicConfig: object): string {
  // Escape "<" so config text can never close a surrounding <script> tag.
  const json = JSON.stringify(publicConfig).replace(/</g, '\\u003c');
  return WIDGET_JS.replace('__DD_AGENT_CFG__', () => json);
}
