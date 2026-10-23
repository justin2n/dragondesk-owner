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
    return fetch(AEP+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'omit',keepalive:path==='/native-result'});
  }

  /* ── UI ── */
  var C=CFG.accentColor||'#dc2626';
  var host=d.createElement('div');
  host.id='dd-agent';
  host.style.cssText='position:fixed;bottom:0;right:0;width:0;height:0;z-index:2147483645;';
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

  function render(){
    log.innerHTML='';
    state.msgs.forEach(function(m){
      var el=d.createElement('div');
      el.className='m '+(m.r==='v'?'v':m.r==='e'?'err':'a');
      el.textContent=m.t;
      log.appendChild(el);
    });
    if(busy){var t=d.createElement('div');t.className='typing';t.innerHTML='<i></i><i></i><i></i>';log.appendChild(t);}
    log.scrollTop=log.scrollHeight;
    sendBtn.disabled=busy;
  }
  function setOpen(open){
    state.open=open;save();
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

  if(state.open)setOpen(true);
  else if(!state.teased&&CFG.greeting){setTimeout(function(){if(!state.open&&!state.teased)teaser.classList.remove('hide');},8000);}
  (d.body||d.documentElement).appendChild(host);

  /* ── Native form submission ── */
  var FIELD_TYPES='input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=password]):not([type=image]),select,textarea';
  function describe(el,doc){
    var parts=[el.name,el.id,el.getAttribute('autocomplete'),el.getAttribute('placeholder'),el.getAttribute('aria-label'),el.getAttribute('data-name')];
    try{
      if(el.id){var l=doc.querySelector('label[for="'+(w.CSS&&CSS.escape?CSS.escape(el.id):el.id)+'"]');if(l)parts.push(l.textContent);}
      var pl=el.closest('label');if(pl)parts.push(pl.textContent);
    }catch(e){}
    return parts.filter(Boolean).join(' ').toLowerCase();
  }
  var MATCH={
    email:function(el,s){return el.type==='email'||/e-?mail/.test(s);},
    phone:function(el,s){return el.type==='tel'||/phone|mobile|cell|\btel\b/.test(s);},
    firstName:function(el,s){return /given-name/.test(s)||/first|fname|given/.test(s);},
    lastName:function(el,s){return /family-name/.test(s)||/last|lname|surname|family/.test(s);},
    fullName:function(el,s){return el.tagName!=='TEXTAREA'&&el.tagName!=='SELECT'&&/(^|[^a-z])(full ?|your ?)?name([^a-z]|$)/.test(s)&&!/first|last|user|company|business|e-?mail/.test(s);},
    program:function(el,s){return /program|class|interest|service|course|style|discipline/.test(s);},
    message:function(el,s){return el.tagName==='TEXTAREA'||/message|comment|question|note|goal/.test(s);}
  };
  var ORDER=['email','phone','firstName','lastName','fullName','program','message'];
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
  function setValue(el,v,win){
    if(v==null||v==='')return;
    if(el.tagName==='SELECT'){
      var want=String(v).toLowerCase(),opts=[].slice.call(el.options),hit=null;
      for(var i=0;i<opts.length&&!hit;i++){var t=(opts[i].text+' '+opts[i].value).toLowerCase();if(opts[i].value&&(t.indexOf(want)>=0||want.indexOf(opts[i].text.toLowerCase().trim())>=0&&opts[i].text.trim().length>2))hit=opts[i];}
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
    if(m.message){
      var note=['Trial signup via website chat.',f.program?'Program: '+f.program+'.':'',f.notes||''].filter(Boolean).join(' ');
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
