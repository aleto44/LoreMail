(function(){const o=document.createElement("link").relList;if(o&&o.supports&&o.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))d(n);new MutationObserver(n=>{for(const r of n)if(r.type==="childList")for(const i of r.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&d(i)}).observe(document,{childList:!0,subtree:!0});function s(n){const r={};return n.integrity&&(r.integrity=n.integrity),n.referrerPolicy&&(r.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?r.credentials="include":n.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function d(n){if(n.ep)return;n.ep=!0;const r=s(n);fetch(n.href,r)}})();const h={},w="https://loremail-worker.amix.workers.dev",C="https://aleto44.github.io/LoreMail".replace(/\/$/,""),e={step:1,worldFlavour:"",gmStyle:"",githubToken:"",modelToken:"",githubUser:null,founderCharacterName:"",founderCharacterBio:"",founderCharacterLocation:"",founderCharacterGender:"",model:"gpt-4o",availableModels:[],modelsVerified:!1,customGameId:"",customPassphrase:"",gameId:null,passphrase:null,repoUrl:null,inviteLinks:[]},S=["worldFlavour","gmStyle","founderCharacterName","founderCharacterBio","founderCharacterLocation","founderCharacterGender","model","customGameId","customPassphrase"];function T(){for(const t of S){const o=h[t];o!=null&&o!==""&&(e[t]=o)}}async function E(){if(T(),h.githubToken)try{const t=await fetch("https://api.github.com/user",{headers:{Authorization:`Bearer ${h.githubToken}`,"User-Agent":"loremail"}});t.ok?(e.githubToken=h.githubToken,e.githubUser=await t.json(),console.info(`[dev-config] GitHub token verified as @${e.githubUser.login}`)):console.warn(`[dev-config] GitHub token rejected (HTTP ${t.status}) — step 2 will show the input form`)}catch(t){console.warn("[dev-config] GitHub token check failed:",t.message)}if(h.modelToken)try{const t=await fetch(`${w}/models/list`,{headers:{Authorization:`Bearer ${h.modelToken}`}});if(t.ok){const s=(await t.json()).models??[];s.length>0&&(e.modelToken=h.modelToken,e.availableModels=s,e.modelsVerified=!0,h.model&&s.includes(h.model)?e.model=h.model:e.model=s[0],console.info(`[dev-config] Model token verified — ${s.length} models available, selected: ${e.model}`))}else console.warn(`[dev-config] Model token rejected (HTTP ${t.status}) — step 3 will show the input form`)}catch(t){console.warn("[dev-config] Model token check failed:",t.message)}}const L=8;function m(){var n;const t=document.getElementById("app");t.innerHTML="";const o=[G,M,q,A,P,I,R,N],s=(n=o[e.step-1])==null?void 0:n.call(o);s&&t.appendChild(s);const d=document.createElement("div");d.className="step-indicator";for(let r=1;r<=L;r++){const i=document.createElement("div");i.className=`step-dot${r===e.step?" active":""}`,d.appendChild(i)}t.appendChild(d)}function $(t,{backStep:o,onBack:s,hideBack:d=!1}={}){if(d)return;const n=document.createElement("div");n.className="nav-back-row";const r=document.createElement("button");r.className="btn-ghost-back",r.textContent="← Back",r.addEventListener("click",()=>{if(s){s();return}o!=null&&(e.step=o,m())}),n.appendChild(r),t.insertBefore(n,t.firstChild)}function G(){const t=f("Describe your world",`
    <div class="field">
      <label>What is this world?</label>
      <textarea id="flavour" placeholder="a crumbling empire where magic is contraband..." rows="4">${e.worldFlavour}</textarea>
      <details class="info-note hint-box" style="margin-top:8px;">
        <summary style="cursor:pointer;font-weight:600;">Not sure what to write? Here are some things to consider ▾</summary>
        <ul style="margin:8px 0 0 0;padding-left:18px;line-height:1.9;font-size:13px;">
          <li><strong>Era or time period</strong> — ancient, medieval, age of sail, industrial, or something invented</li>
          <li><strong>Tone or mood</strong> — hopeful, melancholic, mysterious, gritty, dangerous</li>
          <li><strong>Political climate</strong> — empire in decline, occupied territory, city-state rivalry, a fragile peace</li>
          <li><strong>Magic or technology</strong> — is magic common or forbidden? what technology exists?</li>
          <li><strong>Geography or landmarks</strong> — major cities, roads, borders, or wildernesses</li>
          <li><strong>Recent history</strong> — a war just ended, a plague swept through, a king died without an heir</li>
        </ul>
      </details>
    </div>
    <div class="field">
      <label>The GM</label>
      <div class="chip-group" id="gm-chips">
        ${[["Gentle","soft hands"],["Medium","weight and consequence"],["Dramatic","the world bites back"]].map(([o,s])=>`<div class="chip${e.gmStyle===o?" selected":""}" data-gm="${o}">${o} — ${s}</div>`).join("")}
      </div>
    </div>
    <button class="btn-primary" id="step1-next">Continue →</button>
  `);return t.querySelector("#flavour").addEventListener("input",o=>{e.worldFlavour=o.target.value}),t.querySelectorAll("[data-gm]").forEach(o=>o.addEventListener("click",()=>{e.gmStyle=o.dataset.gm,m()})),t.querySelector("#step1-next").addEventListener("click",()=>{if(!e.worldFlavour||!e.gmStyle){g(t,"Please describe your world and choose a GM style.");return}e.step=2,m()}),t}function M(){var s,d,n;const t=f("Connect GitHub",`
    <p style="margin-bottom:16px;color:var(--faded);font-size:14px;">
      Loremail creates a private GitHub repo for your game world. This token is shared with players
      so they can commit letters — keep its permissions narrow.
    </p>
    ${e.githubToken?`
      <div class="verified-badge">
        ✓ Connected as <strong>${((s=e.githubUser)==null?void 0:s.login)??"GitHub user"}</strong>
      </div>
      <div id="scope-results" style="margin-bottom:16px;"></div>
      <button class="btn-secondary" id="switch-token" style="margin-bottom:16px;">Use a different token</button>
      <button class="btn-primary" id="step2-next">Continue →</button>
    `:`
      <div class="field">
        <label>Repo token (classic or fine-grained PAT)</label>
        <input type="password" id="gh-token" placeholder="github_pat_..." />
        <details class="info-note" style="margin-top:6px;">
          <summary style="cursor:pointer;font-weight:600;">Which token type do I need? ▾</summary>
          <div style="margin-top:8px;line-height:1.7;">
            <strong>Option A — Classic PAT (easiest)</strong><br/>
            Go to <a href="https://github.com/settings/tokens/new" target="_blank" style="color:var(--accent)">Settings → Developer settings → Personal access tokens → Tokens (classic)</a>
            and tick <code>repo</code> and <code>workflow</code>. Classic PATs can create new repos without any extra configuration.<br/><br/>
            <strong>Option B — Fine-grained PAT</strong><br/>
            Go to <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" style="color:var(--accent)">Settings → Developer settings → Fine-grained tokens</a>.<br/>
            ⚠ <strong>Repository access must be set to "All repositories"</strong> — you cannot pre-select a repo that doesn't exist yet.<br/>
            Required permissions:<br/>
            &nbsp;• <strong>Administration: Read &amp; Write</strong> — needed to <em>create</em> the game repo<br/>
            &nbsp;• <strong>Contents: Read &amp; Write</strong> — to commit letters<br/>
            &nbsp;• <strong>Actions: Read &amp; Write</strong> — to trigger the GM workflow
          </div>
        </details>
        <p class="info-note" style="margin-top:6px;color:#c07000;">
          ⚠ This token will be stored on every player's device. Do <strong>not</strong> give it model access.
        </p>
      </div>
      <div id="scope-results" style="margin-bottom:8px;"></div>
      <button class="btn-primary" id="verify-token">Verify & Continue →</button>
    `}
  `);$(t,{backStep:1});function o(r){const i=t.querySelector("#scope-results");i&&(i.innerHTML=r.map(({label:l,status:a,detail:c})=>`<div style="font-size:12px;margin-bottom:4px;color:${a==="pass"?"green":a==="warn"?"#c07000":"#c0392b"};">
        ${a==="pass"?"✅":a==="warn"?"⚠️":"❌"} <strong>${l}</strong>${c?` — ${c}`:""}
      </div>`).join(""))}return e.githubToken?(o([{label:"Token verified",status:"pass",detail:`@${(d=e.githubUser)==null?void 0:d.login}`}]),(n=t.querySelector("#switch-token"))==null||n.addEventListener("click",()=>{e.githubToken="",e.githubUser=null,e.modelToken="",e.availableModels=[],e.modelsVerified=!1,m()}),t.querySelector("#step2-next").addEventListener("click",()=>{e.step=3,m()})):t.querySelector("#verify-token").addEventListener("click",async()=>{const r=t.querySelector("#gh-token").value.trim();if(!r){g(t,"Enter a token.");return}const i=t.querySelector("#verify-token");i.disabled=!0,i.textContent="Verifying…";const l=[];try{const a=await fetch("https://api.github.com/user",{headers:{Authorization:`Bearer ${r}`,"User-Agent":"loremail"}});if(!a.ok)throw new Error(`GitHub rejected the token (HTTP ${a.status})`);const c=await a.json();l.push({label:"Token is valid",status:"pass",detail:`authenticated as @${c.login}`});const y=a.headers.get("x-oauth-scopes")??"";if(y===""){l.push({label:"Token type",status:"pass",detail:"fine-grained PAT detected"});const p=await fetch("https://api.github.com/user/repos?per_page=1",{headers:{Authorization:`Bearer ${r}`,"User-Agent":"loremail"}});p.ok?l.push({label:"Repository access",status:"pass",detail:"token can access the repos API"}):l.push({label:"Repository access",status:"fail",detail:`HTTP ${p.status} — token cannot access repos. Add Contents: Read & Write + Actions: Write permissions.`}),l.push({label:'"All repositories" access required',status:"warn",detail:'fine-grained PATs must be set to "All repositories" — the game repo does not exist yet so it cannot be pre-selected'}),l.push({label:"Administration: Write required",status:"warn",detail:"needed to create the new game repo — make sure this is ticked alongside Contents & Actions"}),l.push({label:"Contents & Actions write",status:"warn",detail:"cannot verify Contents: Write or Actions: Write until the game repo is created — make sure you granted them"})}else{const p=y.split(",").map(x=>x.trim());l.push({label:"Token type",status:"pass",detail:`classic PAT — scopes: ${p.join(", ")}`});const b=p.includes("repo")||p.includes("public_repo"),k=p.includes("workflow");if(l.push({label:"repo scope (Contents + API access)",status:b?"pass":"fail",detail:b?"present":"MISSING — token cannot create or write to repos"}),l.push({label:"workflow scope (Actions dispatch)",status:k?"pass":"fail",detail:k?"present":"MISSING — token cannot trigger the GM workflow"}),!b||!k){o(l),g(t,"Token is missing required scopes. See the checks above."),i.disabled=!1,i.textContent="Verify & Continue →";return}}o(l),e.githubUser=c,e.githubToken=r,e.modelToken="",e.availableModels=[],e.modelsVerified=!1,m()}catch(a){l.push({label:"Token is valid",status:"fail",detail:a.message}),o(l),g(t,a.message),i.disabled=!1,i.textContent="Verify & Continue →"}}),t}function q(){const t=e.modelsVerified&&e.availableModels.length>0,o=t?e.availableModels.map(n=>`<option value="${n}"${e.model===n?" selected":""}>${n}</option>`).join(""):'<option value="" disabled selected>— verify your token first —</option>',s=f("AI Configuration",`
    <p style="color:var(--faded);font-size:13px;margin-bottom:16px;">
      This token is used <strong>only</strong> by your world's GM running inside GitHub Actions.
      It is <strong>never</strong> sent to player devices — only stored as a GitHub Actions secret.
    </p>
    <div class="field">
      <label>Model token (fine-grained PAT)</label>
      <input type="password" id="model-token-input" placeholder="github_pat_…" value="${e.modelToken}" autocomplete="off" />
      <p class="info-note">
        Needs <strong>Account permissions → Models: Read</strong> only.
        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" style="color:var(--accent)">Generate one here</a>
      </p>
      <p class="info-note" style="margin-top:6px;color:green;">
        ✓ Safe to give full model access — this token never touches a player's device.
      </p>
    </div>
    <div class="field">
      <button class="btn-secondary" id="verify-models" style="width:100%;">
        ${t?"↻ Re-check available models":"🔍 Verify & load available models"}
      </button>
      <div id="models-status" class="info-note" style="margin-top:8px;min-height:18px;">
        ${t?`✓ Found ${e.availableModels.length} model${e.availableModels.length!==1?"s":""}`:"Enter your model token above, then click to verify."}
      </div>
    </div>
    <div class="field">
      <div class="model-label-row">
        <label style="margin-bottom:0;">Model</label>
        <button class="btn-model-hint" id="model-hint-btn" title="Model selection guide">Which model should I pick?</button>
      </div>
      <select id="model-select" class="model-select" style="margin-top:8px;" ${t?"":"disabled"}>
        ${o}
      </select>
    </div>
    <button class="btn-primary" id="step3-next" ${t?"":"disabled"} style="${t?"":"opacity:0.45;cursor:not-allowed;"}">Continue →</button>
  `);$(s,{backStep:2}),s.querySelector("#model-token-input").addEventListener("input",n=>{const r=n.target.value;if(r!==e.modelToken){e.modelToken=r,e.modelsVerified=!1,e.availableModels=[];const i=s.querySelector("#model-select"),l=s.querySelector("#step3-next");i.disabled=!0,i.innerHTML='<option value="" disabled selected>— verify your token first —</option>',l.disabled=!0,l.style.opacity="0.45",l.style.cursor="not-allowed",s.querySelector("#models-status").textContent="Enter your model token above, then click to verify.",s.querySelector("#models-status").style.color="",s.querySelector("#verify-models").textContent="🔍 Verify & load available models"}});async function d(){const n=s.querySelector("#model-token-input").value.trim();if(!n){s.querySelector("#models-status").textContent="⚠ Enter a model token first.",s.querySelector("#models-status").style.color="#c0392b";return}e.modelToken=n;const r=s.querySelector("#verify-models"),i=s.querySelector("#models-status"),l=s.querySelector("#step3-next"),a=s.querySelector("#model-select");r.disabled=!0,r.textContent="⏳ Checking…",i.textContent="Contacting GitHub Models API…",i.style.color="var(--faded)";try{const c=await fetch(`${w}/models/list`,{headers:{Authorization:`Bearer ${e.modelToken}`}});if(!c.ok){const v=await c.json().catch(()=>({}));throw new Error(v.error??`API returned ${c.status}`)}const u=(await c.json()).models??[];if(u.length===0)throw new Error("No models returned — token may lack Models: Read permission");i.textContent=`Found ${u.length} model${u.length!==1?"s":""}. Probing inference access…`;const b=["openai/gpt-4o","openai/gpt-4o-mini","meta/llama-3.3-70b-instruct"].find(v=>u.includes(v))??u[0],x=await(await fetch(`${w}/models/probe`,{method:"POST",headers:{Authorization:`Bearer ${e.modelToken}`,"Content-Type":"application/json"},body:JSON.stringify({model:b})})).json();if(!x.ok)throw new Error(x.error??"Inference probe failed");e.availableModels=u,e.modelsVerified=!0,u.includes(e.model)||(e.model=u[0]),a.disabled=!1,a.innerHTML=u.map(v=>`<option value="${v}"${e.model===v?" selected":""}>${v}</option>`).join(""),i.textContent=`✓ ${u.length} model${u.length!==1?"s":""} available — inference confirmed`,i.style.color="green",r.textContent="↻ Re-check available models",l.disabled=!1,l.style.opacity="",l.style.cursor=""}catch(c){e.modelsVerified=!1,e.availableModels=[],a.disabled=!0,a.innerHTML='<option value="" disabled selected>— verify your token first —</option>',l.disabled=!0,l.style.opacity="0.45",l.style.cursor="not-allowed",i.textContent=`⚠ Could not load models: ${c.message}`,i.style.color="#c0392b",r.textContent="🔍 Retry"}finally{r.disabled=!1}}return s.querySelector("#verify-models").addEventListener("click",d),s.querySelector("#model-hint-btn").addEventListener("click",()=>B()),s.querySelector("#model-select").addEventListener("change",n=>{e.model=n.target.value}),s.querySelector("#step3-next").addEventListener("click",()=>{e.modelsVerified&&(e.step=4,m())}),s}function A(){const t=f("Who are you in this world?",`
    <p style="margin-bottom:16px;color:var(--faded);font-size:14px;">
      Before you can write, we need to know who you are.
    </p>
    <div class="field">
      <label>Your name in this world</label>
      <input type="text" id="char-name" value="${e.founderCharacterName}" placeholder="Maren Voss" />
    </div>
    <div class="field">
      <label>Who are you, in one sentence?</label>
      <textarea id="char-bio" rows="2" placeholder="A disgraced cartographer mapping roads that no longer exist.">${e.founderCharacterBio}</textarea>
    </div>
    <div class="field">
      <label>Where are you in the world right now?</label>
      <textarea id="char-location" rows="2" placeholder="Somewhere on the road between two cities I'd rather not name.">${e.founderCharacterLocation}</textarea>
    </div>
    <div class="field">
      <label>Gender (optional)</label>
      <input type="text" id="char-gender" value="${e.founderCharacterGender}" placeholder="e.g. woman, man, non-binary" />
    </div>
    <button class="btn-primary" id="step4-next">Continue →</button>
  `);return $(t,{backStep:3}),t.querySelector("#char-name").addEventListener("input",o=>{e.founderCharacterName=o.target.value}),t.querySelector("#char-bio").addEventListener("input",o=>{e.founderCharacterBio=o.target.value}),t.querySelector("#char-location").addEventListener("input",o=>{e.founderCharacterLocation=o.target.value}),t.querySelector("#char-gender").addEventListener("input",o=>{e.founderCharacterGender=o.target.value}),t.querySelector("#step4-next").addEventListener("click",()=>{if(!e.founderCharacterName||!e.founderCharacterBio||!e.founderCharacterLocation){g(t,"Please fill in all three fields.");return}e.step=5,m()}),t}function P(){const t=f("Name your game",`
    <p style="margin-bottom:16px;color:var(--faded);font-size:14px;">
      Choose a Game ID and passphrase. Share the passphrase with your players — they will need it to restore their session on new devices.
    </p>
    <div class="field">
      <label>Game ID</label>
      <input type="text" id="game-id-input" value="${e.customGameId}"
        placeholder="iron-vale" maxlength="40" />
      <p class="info-note" style="margin-top:4px;">
        Lowercase letters, numbers, and hyphens only. Players will see this ID.
      </p>
    </div>
    <div class="field">
      <label>Passphrase</label>
      <input type="text" id="passphrase-input" value="${e.customPassphrase}"
        placeholder="wolf · runs · midnight" />
      <p class="info-note" style="margin-top:4px;">
        Write it down — it cannot be recovered once the game is created.
      </p>
    </div>
    <button class="btn-primary" id="step5-next">Create World →</button>
  `);return $(t,{backStep:4}),t.querySelector("#game-id-input").addEventListener("input",o=>{const s=o.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"");s!==o.target.value&&(o.target.value=s),e.customGameId=s}),t.querySelector("#passphrase-input").addEventListener("input",o=>{e.customPassphrase=o.target.value}),t.querySelector("#step5-next").addEventListener("click",async()=>{if(!e.customGameId){g(t,"Please enter a Game ID.");return}if(!e.customPassphrase){g(t,"Please enter a passphrase.");return}e.step=6,m(),await O()}),t}function I(){return f("Creating your world…",`
    <div class="loading">
      <div style="font-size:28px;margin-bottom:12px;">〄</div>
      The repo is being scaffolded. The GM is composing the world seed.<br/>
      <span style="font-size:12px;">This takes a moment.</span>
    </div>
  `)}function R(){const t=f("Your world is ready",`
    <p style="color:var(--faded);font-size:14px;margin-bottom:16px;">
      Your game has been created. Share the passphrase with your players so they can restore their session on new devices.
    </p>
    <label>Game ID</label>
    <div class="passphrase-display" style="font-size:14px;">${e.gameId}</div>
    <label style="margin-top:12px;display:block;">Passphrase</label>
    <div class="passphrase-display">${e.passphrase}</div>
    <p class="info-note">Write it down. It cannot be recovered.</p>
    ${e.repoUrl?`<p style="margin-top:8px;font-size:13px;color:var(--faded);">Repo: <a href="${e.repoUrl}" target="_blank" style="color:var(--accent);">${e.repoUrl}</a></p>`:""}
    <button class="btn-primary" id="step7-next" style="margin-top:20px;">Write your first letter →</button>
  `);return t.querySelector("#step7-next").addEventListener("click",()=>{e.step=8,m()}),t}function N(){const t=f("Invite players",`
    <div class="field">
      <label>Write your first letter to a player</label>
      <p style="font-size:12px;color:var(--faded);margin:-8px 0 10px;">
        The letter will be addressed to <em>-unknown-</em> — the player will choose their own name when they open the link.
      </p>
    </div>
    <div class="field">
      <label>Your letter</label>
      <textarea id="letter-body" rows="6" placeholder="The roads have grown strange since the edict..."></textarea>
    </div>
    <button class="btn-primary" id="gen-invite">Generate Invite Link</button>
    <div id="invite-output"></div>
    <div class="row-btns" style="margin-top:24px;">
      <button class="btn-secondary" id="another-player">Invite Another Player</button>
      <button class="btn-primary" id="open-pwa">Open App →</button>
    </div>
  `);return t.querySelector("#gen-invite").addEventListener("click",async()=>{const o=t.querySelector("#letter-body").value.trim();if(!o){g(t,"Write a letter first.");return}try{const s=await fetch(`${w}/game/invite`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({gameId:e.gameId,passphrase:e.passphrase,letterBody:o})}),d=await s.json();if(!s.ok)throw new Error(d.error);const n=t.querySelector("#invite-output"),r=document.createElement("div");r.className="invite-link-box",r.innerHTML=`
        <span>${d.inviteLink}</span>
        <button onclick="navigator.clipboard.writeText('${d.inviteLink}')">Copy</button>
      `,n.appendChild(r),e.inviteLinks.push(d.inviteLink)}catch(s){g(t,s.message)}}),t.querySelector("#another-player").addEventListener("click",()=>{t.querySelector("#letter-body").value="",t.querySelector("#invite-output").innerHTML=""}),t.querySelector("#open-pwa").addEventListener("click",()=>{window.open(`${C}?game=${e.gameId}`,"_blank")}),t}async function O(){try{const t=await fetch(`${w}/game/create`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({founderGithubToken:e.githubToken,copilotToken:e.modelToken,worldFlavour:e.worldFlavour,gmStyle:e.gmStyle,model:e.model,founderCharacterName:e.founderCharacterName,founderCharacterBio:e.founderCharacterBio,founderCharacterLocation:e.founderCharacterLocation,founderCharacterGender:e.founderCharacterGender,gameId:e.customGameId,passphrase:e.customPassphrase})}),o=await t.json();if(!t.ok)throw new Error(o.error??"Creation failed");e.gameId=o.gameId,e.passphrase=o.passphrase??e.customPassphrase,e.repoUrl=o.repoUrl,e.step=7,m()}catch(t){e.step=5,m();const o=document.querySelector(".step-card");o&&g(o,`Error: ${t.message}`)}}function B(){var l;(l=document.getElementById("model-guide-overlay"))==null||l.remove();const t=[{section:"Recommended",entries:[{id:"openai/gpt-4.1-mini",tag:"Build & Test",summary:"Best for development and prompt tuning. Reliable JSON output, fast runs, very low cost. If you're just getting started or want to try things out, start here and switch to a stronger model once your game is ready.",pros:["Fraction of the cost of gpt-4o","Fast — GM runs finish quickly"],cons:["Prose quality noticeably lower than larger models","Historian voice can drift at low temperature"],costs:[["2 players / mo","~$0.04"],["4 players / mo","~$0.09"],["8 players / mo","~$0.17"]]},{id:"openai/gpt-4.1",tag:"Gift Game",summary:"The sweet spot for a real game. Better instruction following than gpt-4o, longer context window, more reliable at holding the GM's complex rules in mind over time.",pros:["Strictly better than gpt-4o on most axes","Excellent at multi-rule system prompts"],cons:["Slightly more expensive than gpt-4o","Newer — fewer known quirks documented"],costs:[["2 players / mo","~$0.22"],["4 players / mo","~$0.43"],["8 players / mo","~$0.86"]]}]},{section:"All Options",entries:[{id:"openai/gpt-5",tag:"Best Prose",summary:"The finest historian voice on the list. Worth it for players who want exceptional creative writing and don't mind paying a small premium.",pros:["Best creative writing quality by a wide margin","Holds complex rule systems better than any other model"],cons:["Most expensive option","Overkill for short early-game sessions when canon is still small"],costs:[["2 players / mo","~$1.00"],["4 players / mo","~$2.00"],["8 players / mo","~$4.00"]]},{id:"openai/gpt-4o",tag:"Reliable",summary:"Proven and dependable. The original design target for this engine. Solid creative prose, consistent JSON output, no surprises.",pros:["Best all-round reliability for this exact task","Well-documented behavior — no surprises"],cons:["Higher cost than gpt-4.1 for less capability","No longer the strongest creative writer on the list"],costs:[["2 players / mo","~$0.27"],["4 players / mo","~$0.54"],["8 players / mo","~$1.08"]]},{id:"openai/gpt-4o-mini",tag:"Budget",summary:"Cheapest reliable option. Good for very active games where cost adds up, or for casual play. Prose will feel thinner and world events more generic.",pros:["Cheapest in the OpenAI family","Reliable JSON output"],cons:["Historian voice feels thin","World events tend to feel generic"],costs:[["2 players / mo","~$0.02"],["4 players / mo","~$0.03"],["8 players / mo","~$0.06"]]},{id:"meta/llama-3.3-70b-instruct",tag:"Open Weight",summary:"Best open-weight option on the list. Genuinely good narrative writing and long context handling. Requires more robust JSON parsing on the engine side — retry logic is important.",pros:["Likely cheapest capable option overall","Genuinely good at narrative tasks"],cons:["Less reliable JSON output than OpenAI models — needs retry logic","Historian voice less consistent without careful prompt tuning"],costs:[["2 players / mo","~$0.03"],["4 players / mo","~$0.06"],["8 players / mo","~$0.11"]]},{id:"mistral-ai/mistral-medium-2505",tag:"Literary",summary:"Underrated for creative writing. Mistral models handle literary prose well and follow instructions cleanly. Less tested for long-context world-building specifically.",pros:["Strong creative writing quality relative to cost","Good JSON reliability"],cons:["Less community testing for this specific use case","Less predictable than OpenAI models on edge cases"],costs:[["2 players / mo","~$0.05"],["4 players / mo","~$0.10"],["8 players / mo","~$0.20"]]}]}],o=[{label:"Reasoning models",detail:"o1, o3, o4-mini, DeepSeek R1, phi-4-reasoning — designed for logic and math, not narrative generation. Slow and expensive for this task."},{label:"Coding models",detail:"Codestral — wrong fit entirely."},{label:"Small models",detail:"phi-4-mini, ministral-3b, llama-3.1-8b, llama-4-scout — insufficient capacity for long-context world-building with complex rule following."},{label:"Vision models",detail:"llama-3.2-11b/90b-vision, phi-4-multimodal — vision capability adds nothing here."},{label:"Embedding models",detail:"text-embedding-3-large/small — not generative, cannot be used."}];function s(a,c){const y=a.costs.map(([p])=>`<th>${p}</th>`).join(""),u=a.costs.map(([,p])=>`<td>${p}</td>`).join("");return`
      <div class="mgd-entry${c?" mgd-entry--recommended":""}">
        <div class="mgd-entry-header">
          <span class="mgd-model-id">${a.id}</span>
          <span class="mgd-model-tag">${a.tag}</span>
        </div>
        <p class="mgd-summary">${a.summary}</p>
        <div class="mgd-pros-cons">
          <div class="mgd-pros">
            <div class="mgd-pc-label">Pros</div>
            <ul>${a.pros.map(p=>`<li>${p}</li>`).join("")}</ul>
          </div>
          <div class="mgd-cons">
            <div class="mgd-pc-label">Cons</div>
            <ul>${a.cons.map(p=>`<li>${p}</li>`).join("")}</ul>
          </div>
        </div>
        <table class="mgd-cost-table">
          <thead><tr>${y}</tr></thead>
          <tbody><tr>${u}</tr></tbody>
        </table>
      </div>`}const d=t.map(({section:a,entries:c})=>`
    <div class="mgd-section">
      <h3 class="mgd-section-title">${a}</h3>
      ${c.map(y=>s(y,a==="Recommended")).join("")}
    </div>`).join(""),n=o.map(({label:a,detail:c})=>`<li><strong>${a}</strong> — ${c}</li>`).join(""),r=document.createElement("div");r.id="model-guide-overlay",r.className="mgd-overlay",r.innerHTML=`
    <div class="mgd-panel" role="dialog" aria-modal="true" aria-label="Model Selection Guide">
      <div class="mgd-panel-header">
        <div class="mgd-panel-title">Model Selection Guide</div>
        <button class="mgd-close" id="mgd-close-btn" aria-label="Close">✕</button>
      </div>
      <div class="mgd-body">
        <p class="mgd-intro">Choose the model your world's GM will use. You can change this at any time from the founder control panel — it takes effect on the next GM run.</p>
        <p class="mgd-intro mgd-intro--note">Cost estimates assume one letter per person every 3 days (~5,200 tokens per GM run).</p>
        ${d}
        <div class="mgd-section mgd-section--avoid">
          <h3 class="mgd-section-title mgd-section-title--avoid">Models to Avoid for This Use Case</h3>
          <p class="mgd-avoid-intro">These models are available but not well-suited to the GM role:</p>
          <ul class="mgd-avoid-list">${n}</ul>
        </div>
        <p class="mgd-footer-note">You can change your model at any time from the founder control panel. The change takes effect on the next GM run — no restart required.</p>
      </div>
    </div>`,document.body.appendChild(r);const i=()=>r.remove();r.querySelector("#mgd-close-btn").addEventListener("click",i),r.addEventListener("click",a=>{a.target===r&&i()}),document.addEventListener("keydown",function a(c){c.key==="Escape"&&(i(),document.removeEventListener("keydown",a))})}function f(t,o){const s=document.createElement("div");return s.className="step-card",s.innerHTML=`
    <div class="step-header">
      <div class="loremail-title">L O R E M A I L</div>
    </div>
    <h2 style="font-family:'IM Fell English',serif;font-size:18px;font-weight:normal;margin-bottom:20px;">${t}</h2>
    ${o}
  `,s}function g(t,o){let s=t.querySelector(".error-msg");s||(s=document.createElement("div"),s.className="error-msg",t.appendChild(s)),s.textContent=o}(async()=>(await E(),m()))();
