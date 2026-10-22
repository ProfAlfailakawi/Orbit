/*! ORBIT sensor — tiny, dependency-free. Sends anonymous error notes (no URLs with queries, no user data) to ORBIT. Never throws. */
(function () {
  try {
    var ENDPOINT = 'https://orbitq8.web.app/api/public-sensor';
    var sent = 0, MAX = 8, queue = [], timer = 0, seen = {};
    var session = (function () {
      try { var k = 'orbit-s', v = sessionStorage.getItem(k); if (!v) { v = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); sessionStorage.setItem(k, v); } return v; }
      catch (e) { return 'anon' + Math.random().toString(36).slice(2, 10); }
    })();
    function clean(s) { return String(s == null ? '' : s).replace(/[?#][^\s)'"]*/g, '').slice(0, 160); }
    function flush() {
      timer = 0;
      if (!queue.length || sent >= MAX) { queue = []; return; }
      var batch = queue.splice(0, 5); sent += 1;
      var body = JSON.stringify({ s: session, r: batch });
      try { if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return; } catch (e) {}
      try { fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, mode: 'cors', headers: { 'Content-Type': 'text/plain' } }).catch(function () {}); } catch (e) {}
    }
    function note(kind, message) {
      try {
        var m = clean(message); if (!m) return;
        var key = kind + m; if (seen[key]) return; seen[key] = 1;
        queue.push({ k: kind, m: m, p: location.pathname });
        if (!timer) timer = setTimeout(flush, 3000);
      } catch (e) {}
    }
    addEventListener('error', function (e) {
      try {
        var t = e.target;
        if (t && t !== window && (t.src || t.href)) return note('resource', 'تعذر تحميل ' + (t.src || t.href));
        note('error', (e.message || 'error') + (e.filename ? ' @' + e.filename : ''));
      } catch (x) {}
    }, true);
    addEventListener('unhandledrejection', function (e) { try { var r = e.reason; note('rejection', r && r.message ? r.message : r); } catch (x) {} });
    if (window.fetch) {
      var f = window.fetch;
      window.fetch = function () {
        var a = arguments, u = a[0] && a[0].url ? a[0].url : a[0];
        var p = f.apply(this, a);
        try { p.then(function (r) { if (r && r.status >= 500) note('request', 'HTTP ' + r.status + ' ' + clean(u)); }, function () { note('request', 'فشل الاتصال ' + clean(u)); }); } catch (x) {}
        return p;
      };
    }
    addEventListener('pagehide', flush);
  } catch (e) { /* the sensor must never break the page */ }
})();
