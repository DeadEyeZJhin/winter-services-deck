#!/usr/bin/env python3
"""
Build demo/: the real Winter Services page and app, cut off from its server and filled
with an invented month.

    python make_demo.py [path/to/Winter Services/web]

It takes web/ exactly as it ships and changes five things:

  1. the server address and its key point at https://demo.invalid, which
     demo-src/fake-server.js answers inside the browser
  2. the shop's phone number becomes 0900 000 0000, so nobody rings the real shop
  3. no service worker and no update check -- a demo must never cache itself stale
  4. demo-src/fake-server.js runs before the app
  5. a strip along the bottom: who you are, switch person, Reset, back to the deck

It REFUSES to write anything if the real server address survives in any file it copies.
"""
import io, os, re, shutil, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else r'D:\Winter Services\web'
OUT = os.path.join(ROOT, 'demo')
FAKE = 'https://demo.invalid'
# Real people the app's own code comments mention by name. The demo is public: they go.
# The list lives in a git-ignored file, one name a line, so it is never published itself.
_names = os.path.join(ROOT, 'demo-src', 'real-names.txt')
REAL_NAMES = [l.strip() for l in io.open(_names, encoding='utf-8') if l.strip()] if os.path.exists(_names) else []
if not REAL_NAMES:
    print('warning: demo-src/real-names.txt is missing or empty -- no names scrubbed')

html = io.open(os.path.join(SRC, 'index.html'), encoding='utf-8').read()
# the real server's project ref, read from the page itself so it is never written in this repo
m = re.search(r"const SUPABASE_URL = 'https://([a-z0-9]+)\.supabase\.co'", html)
if not m:
    raise SystemExit('could not find the server address in the page')
SERVER_REF = m.group(1)
for name in REAL_NAMES:
    html = re.sub(re.escape(name), 'a customer', html, flags=re.I)

def swap(pattern, repl, what):
    global html
    html, n = re.subn(pattern, repl, html)
    if n != 1:
        raise SystemExit('expected exactly one %s in the page, found %d' % (what, n))

# 1. no server
swap(r"const SUPABASE_URL = '[^']*';", "const SUPABASE_URL = '%s';" % FAKE, 'SUPABASE_URL')
swap(r"const SUPABASE_KEY = '[^']*';", "const SUPABASE_KEY = 'demo-anon-key';", 'SUPABASE_KEY')
# 2. no real phone number
swap(r"const SHOP_PHONE = '[^']*';", "const SHOP_PHONE = '0900 000 0000';", 'SHOP_PHONE')
# 3. no service worker
swap(r"if \('serviceWorker' in navigator", "if (false && 'serviceWorker' in navigator", 'service worker registration')
swap(r'<title>[^<]*</title>', u'<title>Winter Services demo \u2014 invented data</title>', 'title')

# 4 + 5. the pretend server, and the strip
# A pill in the bottom-left corner, always above whatever the app has along the bottom
# (the tab bar, the booking bar): the app's own controls are never covered.
strip = u'''<style>
  #demo-strip{position:fixed;left:8px;bottom:calc(8px + env(safe-area-inset-bottom));z-index:99999;
    font:600 12.5px/1 Inter,system-ui,sans-serif;color:#EAF1FA}
  #demo-strip .pill{display:flex;align-items:center;gap:7px;padding:8px 12px;border-radius:999px;cursor:pointer;
    background:rgba(8,20,36,.94);border:1px solid rgba(124,196,245,.45);box-shadow:0 6px 22px rgba(0,0,0,.35);
    color:inherit;font:inherit;backdrop-filter:blur(8px)}
  #demo-strip .pill b{color:#7CC4F5;letter-spacing:.08em;font-size:11px}
  #demo-strip .menu{position:absolute;left:0;bottom:calc(100% + 6px);min-width:230px;padding:6px;border-radius:14px;
    background:rgba(8,20,36,.97);border:1px solid rgba(255,255,255,.16);box-shadow:0 12px 36px rgba(0,0,0,.45)}
  #demo-strip .menu[hidden]{display:none}
  #demo-strip .menu p{margin:4px 8px 8px;font:500 11.5px/1.4 Inter,system-ui,sans-serif;color:#A3B3C8}
  #demo-strip .menu button,#demo-strip .menu a{display:block;width:100%;text-align:left;font:inherit;color:inherit;
    background:transparent;border:0;border-radius:9px;padding:9px 10px;cursor:pointer;text-decoration:none}
  #demo-strip .menu small{display:block;margin-top:3px;font-weight:500;font-size:11px;color:#A3B3C8}
  #demo-strip .menu button:hover,#demo-strip .menu a:hover{background:rgba(255,255,255,.08)}
  #demo-strip .menu button.on{background:#5AA9E6;color:#081623}
  #demo-strip .menu button.on small{color:#0d2b45}
  #demo-strip hr{border:0;border-top:1px solid rgba(255,255,255,.12);margin:6px 4px}
  @media print{#demo-strip{display:none}}
</style>
<script src="fake-server.js"></script>
'''
bar = u'''<div id="demo-strip">
  <div class="menu" id="demo-menu" hidden>
    <p>An invented shop month. Nothing you do here leaves this browser.</p>
    <button type="button" data-as="guest">Booking page<small>A stranger booking a job \u2014 no login</small></button>
    <button type="button" data-as="office">Office<small>Inbox, Jobs, Customers, Numbers, Admin</small></button>
    <button type="button" data-as="tech">Technician<small>Jun \u2014 every job with a day on it</small></button>
    <button type="button" data-as="cust">Customer<small>Carmela \u2014 her own bookings, every step</small></button>
    <hr>
    <button type="button" id="demo-reset">\u21bb Reset the demo<small>Put the invented data back</small></button>
    <a href="../">\u2190 Back to the presentation</a>
  </div>
  <button type="button" class="pill" id="demo-pill" aria-expanded="false"><b>DEMO</b><span id="demo-who"></span> \u25b4</button>
</div>
<script>
(function(){
  var NAMES = {guest: 'Booking page', office: 'Office', tech: 'Technician', cust: 'Customer', other: 'Your account'};
  var who = wsDemoWho(), strip = document.getElementById('demo-strip'), menu = document.getElementById('demo-menu'),
      pill = document.getElementById('demo-pill');
  document.getElementById('demo-who').textContent = NAMES[who] || '';
  document.querySelectorAll('#demo-strip [data-as]').forEach(function(b){
    b.classList.toggle('on', b.dataset.as === who);
    b.addEventListener('click', function(){ if (b.dataset.as !== wsDemoWho()) wsDemoAs(b.dataset.as); else toggle(false); });
  });
  document.getElementById('demo-reset').addEventListener('click', function(){
    if (confirm('Put the invented data back as it was?')) wsDemoReset();
  });
  function toggle(open){ menu.hidden = !open; pill.setAttribute('aria-expanded', String(open)); }
  pill.addEventListener('click', function(e){ e.stopPropagation(); toggle(menu.hidden); });
  document.addEventListener('click', function(e){ if (!strip.contains(e.target)) toggle(false); });
  // sit above the tab bar, the booking bar, or anything else fixed along the bottom-left
  function place(){
    var lift = 0, h = innerHeight;
    document.querySelectorAll('body *').forEach(function(el){
      if (el === strip || strip.contains(el) || !el.offsetHeight) return;
      var s = getComputedStyle(el);
      if (s.position !== 'fixed' || s.display === 'none' || s.visibility === 'hidden') return;
      var r = el.getBoundingClientRect();
      if (r.left < 170 && r.bottom >= h - 4 && r.top > h * 0.5 && r.width > 150) lift = Math.max(lift, h - r.top);
    });
    strip.style.bottom = 'calc(' + (8 + lift) + 'px + env(safe-area-inset-bottom))';
  }
  place(); setInterval(place, 600); addEventListener('resize', place);
})();
</script>
</body>'''
if html.count('<head>') != 1 or html.count('</body>') != 1:
    raise SystemExit('unexpected page shape')
html = html.replace('<head>', '<head>\n' + strip, 1)
html = html.replace('</body>', bar, 1)

# version.js: the version and notes stay; the update address goes
ver = io.open(os.path.join(SRC, 'version.js'), encoding='utf-8').read()
ver, n = re.subn(r'"updateUrl":\s*"[^"]*"', '"updateUrl": ""', ver)
if n != 1:
    raise SystemExit('updateUrl not found in version.js')

fake = io.open(os.path.join(ROOT, 'demo-src', 'fake-server.js'), encoding='utf-8').read()

for name, text in (('index.html', html), ('version.js', ver), ('fake-server.js', fake)):
    if SERVER_REF in text or 'sb_publishable_' in text or 'supabase.co' in text:
        raise SystemExit('the real server address is still in %s -- refusing to write the demo' % name)
    if any(n.lower() in text.lower() for n in REAL_NAMES):
        raise SystemExit('a real name is still in %s -- refusing to write the demo' % name)

# the pictures and the map library, as they ship
if os.path.isdir(OUT):
    shutil.rmtree(OUT)
os.makedirs(OUT)
for sub in ('icons', 'img', 'vendor'):
    shutil.copytree(os.path.join(SRC, sub), os.path.join(OUT, sub))
for dirpath, _, files in os.walk(OUT):
    for f in files:
        if f.endswith(('.js', '.css', '.html', '.txt', '.json')):
            if SERVER_REF in io.open(os.path.join(dirpath, f), encoding='utf-8', errors='ignore').read():
                shutil.rmtree(OUT)
                raise SystemExit('the real server address is in %s -- refusing' % f)

for name, text in (('index.html', html), ('version.js', ver), ('fake-server.js', fake)):
    io.open(os.path.join(OUT, name), 'w', encoding='utf-8', newline='\n').write(text)

m = re.search(r'"versionName":\s*"([^"]+)"', ver)
size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(OUT) for f in fs)
print('wrote demo/  (Winter Services %s, %.1f MB, no server)' % (m.group(1) if m else '?', size / 1048576))
