/* Deliberately classic, conservative JavaScript: survives a failed module bootstrap. */
(function () {
  var done = false, timer, banner = document.createElement('section');
  var releaseMeta = document.querySelector('meta[name="ds-release"]');
  var release = releaseMeta ? releaseMeta.content : 'Website release: local development (not a published build)';
  var lines = [], token = new URLSearchParams(location.search).get('startup');
  banner.setAttribute('role', 'status');
  banner.style.cssText = 'margin:1rem;padding:1rem;background:#fff8e8;color:#263644;border:1px solid #bbaa88;font:16px sans-serif';
  var message = document.createElement('p'); message.textContent = 'Starting page…'; banner.appendChild(message);
  var retry = document.createElement('button'); retry.textContent = 'Reload page'; retry.onclick = function () { location.reload(); }; banner.appendChild(retry);
  var copy = document.createElement('button'); copy.textContent = 'Copy startup log'; banner.appendChild(copy);
  var output = document.createElement('textarea'); output.readOnly = true; output.hidden = true; output.style.cssText = 'display:block;width:95%;min-height:10em';
  output.style.display = 'none'; banner.appendChild(output);
  copy.onclick = function () {
    var text = ['Startup log', new Date().toISOString(), release, 'Browser: ' + navigator.userAgent,
      'Platform: ' + navigator.platform, 'Logical processors reported: ' + (navigator.hardwareConcurrency || 'not exposed'),
      'Device memory (approximate GiB): ' + (navigator.deviceMemory || 'not exposed'),
      'Worker: ' + (typeof Worker !== 'undefined') + '; WebAssembly: ' + (typeof WebAssembly !== 'undefined')].concat(lines).join('\n');
    function fallback() { output.hidden = false; output.style.display = 'block'; output.value = text; output.select(); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { copy.textContent = 'Log copied'; }, fallback); else fallback();
  };
  document.body.appendChild(banner);
  function notify(ready, error) { if (window.parent !== window) window.parent.postMessage({type:'diagram-startup',token:token,ready:ready,error:error},location.origin); }
  function fail(detail) {
    if (done) return;
    clearTimeout(timer); lines.push(String(detail));
    message.textContent = 'The page has not started. A script may have failed to download or may not be supported by this browser. You can reload or copy the startup log.';
    notify(false, String(detail));
  }
  window.dsPageStartup = {
    ready: function () { if(done)return; done=true;clearTimeout(timer);banner.parentNode.removeChild(banner);notify(true); },
    fail: fail
  };
  window.addEventListener('error', function (event) {
    if(event.message)fail(event.message + ' (' + (event.filename || 'unknown script') + ':' + (event.lineno || '?') + ')');
    else if(event.target && event.target.tagName === 'SCRIPT' && event.target.type === 'module')fail('Application script could not load: ' + event.target.src);
  }, true);
  window.addEventListener('unhandledrejection', function (event) { fail(String(event.reason || 'Uncaught startup error')); });
  timer = setTimeout(function () { fail('No startup confirmation within 30 seconds.'); },30000);
}());
