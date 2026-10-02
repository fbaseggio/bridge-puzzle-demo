import{p as l,S,a as k,s as L,r as E,l as j,b as C,i as z,J as P,j as $}from"./playback-B7-ifvwU.js";import{i as N}from"./engine-V58Gowr5.js";function g(e){let o=e.source.kind==="encap"?e.source.value:"";if(!o)try{o=N({hands:e.hands,turn:e.leader})}catch{}return{encap:o,nsew:S.map(a=>k.map(i=>e.hands[a][i].join("")||"-").join(", ")).join(`;
`),unk:e.source.kind==="unk"?e.source.value:"",jrl:e.source.kind==="jrl"?e.source.value:""}}function R(e,o,a){const i=new URLSearchParams({[o]:a});if(!e)return i;const d=g(e)[o];if(d&&a.replace(/\s/g,"")===d.replace(/\s/g,"")){if(o===e.source.kind){const c=l(e);return c.set(o,a),c}i.set("lead",e.leader),i.set("trumps",e.strain),o==="nsew"&&i.set("p",e.play)}return i}const D=document.querySelector("#movie");D.innerHTML=`
  <header><a class="brand" href="/">DeepSqueeze</a><span class="eyebrow">CARDPLAY EXPLORER</span></header>
  <div class="heading"><div><h1>Movie</h1><p class="subtitle" id="source-caption">Play and explore a bridge position.</p></div>
  </div>
  <p id="error" role="alert" hidden></p>
  <p id="notice" role="status"></p>
  <div id="jrl-choices" hidden><label for="jrl-entry">JRL source entry</label><select id="jrl-entry"></select></div>
  <section id="live" hidden>
    <iframe id="diagram" title="Interactive bridge diagram"></iframe>
    <div class="diagram-zoom" role="group" aria-label="Diagram zoom">
      <label for="zoom">Diagram size</label>
      <button id="zoom-out" aria-label="Zoom diagram out">−</button>
      <input id="zoom" type="range" min="50" max="200" step="10" value="100" aria-label="Diagram zoom" aria-valuetext="100%">
      <button id="zoom-in" aria-label="Zoom diagram in">+</button>
      <output id="zoom-value" for="zoom">100%</output>
      <button id="zoom-reset">Reset zoom</button>
    </div>
    <section class="abstraction"><span class="eyebrow" id="abstract-label">ENCAPSULATION</span><code id="encapsulation"></code><p id="abstract-note" class="help"></p></section>
    <p class="help">Use the widget’s Hint button for DDS guidance. You control all four hands.</p>
    <p id="playback-note" class="help" role="status"></p>
  </section>
  <p id="source-citation" hidden><a id="source-link" target="_blank" rel="noopener noreferrer">View original on JRL’s website</a><span class="help"> · section link · opens in a new tab</span></p>
  <details id="source-material" hidden><summary>Exact JRL source material</summary>
    <div class="source-content"><p class="help" id="source-date"></p><pre id="source-text"></pre></div>
  </details>
  <details id="import-material" hidden><summary>Imported source and details</summary>
    <div class="source-content"><p class="help" id="import-notes"></p><pre id="import-text"></pre></div>
  </details>
  <div class="editors">
    <details id="position-editor"><summary>Position</summary>
      <form id="position-form"><label>Input <select id="kind"><option value="encap">Encapsulation</option><option value="nsew">Exact cards · N/S/E/W</option><option value="jrl">JRL position</option><option value="unk">Paste link / LIN / PBN</option></select></label>
        <label for="source">Position</label><textarea id="source" rows="2" spellcheck="false"></textarea>
        <p class="help" id="input-help"></p>
        <button type="submit" class="primary">Load position</button>
      </form>
    </details>
    <details id="play-editor"><summary>Initial play</summary>
      <form id="play-form">
        <label id="source-play-label" hidden>Source play sequence <select id="source-play"></select></label>
        <label for="play">Play sequence</label><textarea id="play" rows="2" spellcheck="false"></textarea>
        <p class="help">For example: CA HJ S8 s0. Step through with &gt;; s0 means any spade. Leave blank for free exploration. Applying a sequence restarts play.</p>
        <button type="submit">Apply play sequence</button>
      </form>
    </details>
    <details id="settings"><summary>Settings</summary>
      <form id="settings-form"><div class="settings-fields">
        <label>Opening lead <select id="lead"><option value="N">North</option><option value="E">East</option><option value="S">South</option><option value="W">West</option></select></label>
        <label>Trumps <select id="trumps"><option value="NT">No-trump</option><option value="S">♠ Spades</option><option value="H">♥ Hearts</option><option value="D">♦ Diamonds</option><option value="C">♣ Clubs</option></select></label>
      </div><p class="help">Changing settings restarts play.</p><button type="submit">Apply settings</button></form>
    </details>
  </div>
  <button id="copy">Copy starting-position link</button>`;function t(e){return document.getElementById(e)}let n,u="encap",s={encap:"",nsew:"",jrl:"",unk:""};function f(e){u=e,t("kind").value=e;const o=t("source");o.value=s[e],o.rows=e==="unk"?6:e==="nsew"?4:2,o.placeholder=e==="jrl"?"Enter a JRL number or source label":e==="encap"&&n&&!s.encap?"Encapsulation unavailable for this position":"",t("input-help").textContent=e==="unk"?"Paste one LIN or PBN deal, or a link containing the cards. Check the diagram and imported settings. Links requiring a remote lookup are not fetched.":e==="nsew"?"One hand per line: North, South, East, West. Suits are ♠ ♥ ♦ ♣; semicolons separate hands. A hyphen is a void.":e==="jrl"?"Enter a number or source label, such as 100210, UVWW11, UU1, or UU1a.":"Loading an encapsulation binds canonical cards. These may differ from the original exact cards."}t("kind").addEventListener("change",()=>{s[u]=t("source").value,f(t("kind").value)});let y=new URLSearchParams;function v(e,o=""){t("jrl-choices").hidden=e.length<2;const a=t("jrl-entry");a.replaceChildren(new Option("Choose a source entry…",""));for(const i of e)a.add(new Option(i.label,i.value));a.value=o}function b(e){t("source-citation").hidden=!e,t("source-material").hidden=!e,t("source-text").textContent=e?.rawText??"",e?(t("source-link").href=e.sourceUrl,t("source-link").title=e.title):t("source-link").removeAttribute("href"),t("source-date").textContent=e?`John R. Lee · saved ${$} · ${e.section}, occurrence ${e.occurrence}`:""}let r=100;function w(){n&&t("diagram").contentWindow?.postMessage({type:"movie-diagram-zoom",key:l(n).toString(),percent:r},location.origin)}function h(e){r=Math.max(50,Math.min(200,e)),t("zoom").value=String(r),t("zoom").setAttribute("aria-valuetext",`${r}%`),t("zoom-value").textContent=`${r}%`,t("zoom-out").disabled=r===50,t("zoom-in").disabled=r===200,w()}t("zoom").addEventListener("input",()=>h(Number(t("zoom").value)));t("zoom-out").addEventListener("click",()=>h(r-10));t("zoom-in").addEventListener("click",()=>h(r+10));t("zoom-reset").addEventListener("click",()=>h(100));t("diagram").addEventListener("load",w);function p(e,o=!0){if(y=new URLSearchParams(e),t("error").hidden=!0,v([]),b(),t("import-material").hidden=!e.has("unk"),t("import-text").textContent=e.get("unk")??"",t("import-notes").textContent="",e.has("jrl"))try{b(L(e.get("jrl").trim(),e.get("entry")))}catch{}try{const a=E(e);n=a,s=g(a),f(a.source.kind),t("lead").value=a.leader,t("trumps").value=a.strain,t("source-caption").textContent=a.jrl?`JRL ${a.source.value} · ${a.jrl.entry.title}`:a.source.kind==="encap"?a.source.value:a.imported?`Imported ${a.imported.format} position`:"Exact-card position",v(a.jrl?j(a.source.value).options:[],a.jrl?.entry.id),b(a.jrl?.entry),t("import-notes").textContent=a.imported?[...Object.entries(a.imported.metadata).map(([c,m])=>`${c}: ${m}.`),...a.imported.notes].join(" "):"",t("import-material").open=!!a.imported,t("play").value=a.play,t("playback-note").textContent=C(a).note,t("source-play-label").hidden=!a.jrl?.scripts.length;const i=t("source-play");i.replaceChildren(new Option("Choose a source sequence…","")),a.jrl?.scripts.forEach((c,m)=>i.add(new Option(`Lead ${m+1}: ${c||"(blank)"}`,String(m))));const d=l(a).toString();o&&history.replaceState(null,"",`${location.pathname}?${d}`),t("notice").textContent="",t("encapsulation").textContent=z(a.hands,a.leader),t("abstract-label").textContent="Encapsulation",t("abstract-note").textContent=a.strain==="NT"?"":"Inversion describes suit structure; play and DDS use the selected trumps.",t("live").hidden=!1,t("copy").disabled=!1,t("diagram").src=`/movie/widget.html?${d}`}catch(a){a instanceof P&&v(a.options),t("error").textContent=a instanceof Error?a.message:String(a),t("error").hidden=!1,t("position-editor").open=!0,n=void 0,t("live").hidden=!0,t("copy").disabled=!0}}window.addEventListener("message",e=>{const o=t("diagram");if(e.origin!==location.origin||e.source!==o.contentWindow||!n)return;const a=e.data;!a||a.key!==l(n).toString()||(a.type==="movie-widget-size"&&Number.isFinite(a.height)&&(o.style.height=`${Math.max(180,Math.min(1800,a.height))}px`),a.type==="movie-widget-state"&&typeof a.encapsulation=="string"&&typeof a.label=="string"&&(t("encapsulation").textContent=a.encapsulation,t("abstract-label").textContent=a.label,t("notice").textContent=a.complete?`All cards played. N/S ${a.tricks.NS} · E/W ${a.tricks.EW}.`:""))});t("jrl-entry").addEventListener("change",()=>{const e=t("jrl-entry").value;if(!e)return;const o=new URLSearchParams(y);o.set("entry",e),p(o)});t("source-play").addEventListener("change",()=>{const e=t("source-play").value;e&&n?.jrl&&(t("play").value=n.jrl.scripts[Number(e)])});t("play-form").addEventListener("submit",e=>{if(e.preventDefault(),!n)return;const o=l(n);o.set("p",t("play").value),p(o)});t("position-form").addEventListener("submit",e=>{e.preventDefault(),s[u]=t("source").value,p(R(n,u,s[u]))});t("settings-form").addEventListener("submit",e=>{if(e.preventDefault(),!n)return;const o=l(n);o.set("lead",t("lead").value),o.set("trumps",t("trumps").value),p(o)});t("copy").addEventListener("click",async()=>{if(!n)return;const e=new URL(location.pathname,location.origin);e.search=l(n).toString();try{await navigator.clipboard.writeText(e.href),t("notice").textContent="Starting-position link copied."}catch{t("notice").textContent=`Copy this link: ${e.href}`}});function x(){n=void 0;const e=new URLSearchParams(location.search);!e.has("encap")&&!e.has("nsew")&&!location.search&&e.set("encap","Wa, a > w");const o=e.has("unk")?"unk":e.has("jrl")?"jrl":e.has("nsew")?"nsew":"encap";s={encap:"",nsew:"",jrl:"",unk:""},s[o]=e.get(o)??"",f(o),p(e,!1)}window.addEventListener("popstate",x);x();
