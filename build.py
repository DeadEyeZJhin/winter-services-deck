#!/usr/bin/env python3
"""
Bundle index.html + deck.css + deck.js + assets/ into single self-contained files.

Same script as the SukiRun deck, pointed at Winter's icon.

  presentation.html  full standalone page (open offline, e-mail it, drop it anywhere)
  artifact.html      body-only fragment for publishing as a hosted Artifact

Each asset is embedded exactly once in an ASSETS map and resolved at load time,
so an icon used twelve times still costs one copy.
"""
import base64, io, mimetypes, os, re, json

ROOT = os.path.dirname(os.path.abspath(__file__))
read = lambda p: io.open(os.path.join(ROOT, p), encoding='utf-8').read()

html = read('index.html')
css  = read('deck.css')
js   = read('deck.js')

# ---- 1. collect every referenced asset, once ------------------------------
# literal paths written out in the html/js...
refs = set(re.findall(
    r'assets/(?:[A-Za-z0-9._\-]+/)*[A-Za-z0-9._\-]+\.(?:png|svg|jpe?g|webp|gif)',
    html + js))
# ...plus the device icons, whose paths are assembled at runtime by assetURL()
for sub in ('screens',):
    d = os.path.join(ROOT, 'assets', sub)
    if os.path.isdir(d):
        refs |= {'assets/%s/%s' % (sub, f) for f in os.listdir(d)
                 if f.lower().endswith('.png')}
refs = sorted(refs)
table = {}
for rel in refs:
    path = os.path.join(ROOT, rel.replace('/', os.sep))
    if not os.path.exists(path):
        print('  !! missing asset:', rel); continue
    mime = mimetypes.guess_type(path)[0] or 'application/octet-stream'
    with open(path, 'rb') as f:
        table[rel] = 'data:%s;base64,%s' % (mime, base64.b64encode(f.read()).decode())
print('embedding %d unique assets' % len(table))

# ---- 2. HTML: defer image sources so nothing 404s before the map loads ----
html = re.sub(r'(<img\b[^>]*?)\bsrc="(assets/[^"]+)"', r'\1data-src="\2"', html)
html = re.sub(r'<link rel="icon" href="assets/[^"]+">', '', html, count=1)

# ---- 3. JS: resolve the two runtime-swapped icons through the map ---------
js = js.replace("'assets/sun.png'", "ASSETS['assets/sun.png']")
js = js.replace("'assets/moon.png'", "ASSETS['assets/moon.png']")
# device icons resolve through assetURL(), which reads the same ASSETS map

boot = (
  '<script>\n'
  'const ASSETS = ' + json.dumps(table) + ';\n'
  '(function(){\n'
  "  document.querySelectorAll('img[data-src]').forEach(function(i){\n"
  "    var u = ASSETS[i.dataset.src]; if(u) i.src = u;\n"
  '  });\n'
  "  var l = document.createElement('link');\n"
  "  l.rel = 'icon'; l.href = ASSETS['assets/app/logo-icon.png'] || '';\n"
  '  document.head.appendChild(l);\n'
  '})();\n'
  '</script>'
)

html = re.sub(r'<link rel="stylesheet" href="deck\.css[^"]*">',
              lambda m: '<style>\n' + css + '\n</style>', html, count=1)
html = re.sub(r'<script src="deck\.js[^"]*"></script>',
              lambda m: boot + '\n<script>\n' + js + '\n</script>', html, count=1)

io.open(os.path.join(ROOT, 'presentation.html'), 'w',
        encoding='utf-8', newline='\n').write(html)

# ---- 4. artifact build: content only (host supplies doctype/html/head/body)
title = re.search(r'<title>.*?</title>', html, re.S).group(0)
fonts = re.findall(r'<link href="https://fonts\.googleapis\.com[^>]*>', html)
style = re.search(r'<style>.*?</style>', html, re.S).group(0)
body  = re.search(r'<body>(.*)</body>', html, re.S).group(1)

io.open(os.path.join(ROOT, 'artifact.html'), 'w', encoding='utf-8',
        newline='\n').write('\n'.join([title] + fonts + [style, body]))

for f in ('presentation.html', 'artifact.html'):
    print('%-20s %8.1f KB' % (f, os.path.getsize(os.path.join(ROOT, f)) / 1024))
