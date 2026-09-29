#!/usr/bin/env python3
"""
The quotation and the receipt as sharp, zoomable pictures for the portfolio homepage.

    python -m http.server 8151        (in this folder, in another window)
    python doc_shots.py               -> D:\\DeadEyeZJhin.github.io\\assets\\docs\\*.png

Same throwaway headless Chrome and invented demo month as shots.py, but each picture is
only the document itself (the .quote / .receipt element), taken at 3x so it stays crisp
when someone zooms in on it.
"""
import base64, os, sys, time
import shots

OUT = r'D:\DeadEyeZJhin.github.io\assets\docs'
DPR = 3

def doc(t, selector, name):
    """only the document element, at DPR x, wherever it sits on the page"""
    # the app's sticky bars (Back, the title) would sit on top of the page - hide every
    # fixed or sticky thing that is not the document itself
    t.js("const d = document.querySelector('%s');"
         "[...document.querySelectorAll('body *')].forEach(e => { const p = getComputedStyle(e).position;"
         "  if ((p === 'fixed' || p === 'sticky') && !e.contains(d) && !d.contains(e)) e.style.visibility = 'hidden'; });"
         "d.scrollIntoView({block: 'start'});" % selector)
    time.sleep(0.5)
    r = t.js("const b = document.querySelector('%s').getBoundingClientRect();"
             "return {x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height};" % selector)
    data = t.call('Page.captureScreenshot', format='png', captureBeyondViewport=True,
                  clip={'x': r['x'], 'y': r['y'], 'width': r['w'], 'height': r['h'], 'scale': 1})['data']
    with open(os.path.join(OUT, name), 'wb') as f:
        f.write(base64.b64decode(data))
    print('  %s  %dx%d' % (name, r['w'] * DPR, r['h'] * DPR))

def run(t):
    t.size(1000, 1400, DPR, False)
    url = shots.URL
    t.go(url + '?as=guest')
    t.js("Object.keys(localStorage).forEach(k => localStorage.removeItem(k));")
    t.go(url + '?as=guest')

    # the same invented customer as the deck: three aircons, PHP 2,800
    t.js(r"""
      await type('[data-bk="full_name"]', 'Bea Villareal'); await type('[data-bk="contact"]', '0917 555 0321');
      await type('[data-bk="address"]', '9 Rizal Street, Brgy. 22, Bacolod City');
      await type('[data-bk="landmark"]', 'Blue gate beside the water refilling station');
      await tap('[data-act="unitnew"][data-v="Split"]'); await tap('#unitSheet [data-act="unitsvc"][data-v="clean"]');
      await tap('#unitSheet [data-act="unitdone"]');
      await tap('[data-act="unitnew"][data-v="Split"]'); await tap('#unitSheet [data-act="unitsvc"][data-v="clean"]');
      await tap('#unitSheet [data-act="unitdone"]');
      await tap('[data-act="unitnew"][data-v="Window"]'); await tap('#unitSheet [data-act="unitsvc"][data-v="repair"]');
      await tap('#unitSheet [data-act="unitdone"]');
      const days = [...document.querySelectorAll('#bookForm [data-act="bkset"]')].filter(b => /^\d{4}-/.test(b.dataset.v));
      days[1].click(); await W(200); await tap('#bookForm [data-act="bkset"][data-v="am"]');
      [...document.querySelectorAll('#bookForm input[type=checkbox]')].forEach(c => { if (!c.checked) c.click(); });
      await W(200); await tap('#bookForm button', /Send the booking/); await W(1800);
    """)

    # the office opens it and makes the quotation
    t.go(url + '?as=office')
    t.js(r"""await tap('[data-act="tab"][data-v="inbox"]');
             await tap('[data-act="open"][data-kind="booking"]', /Bea Villareal/);
             await tap('[data-act="open"][data-kind="quote"]'); await W(800);""")
    doc(t, '.quote', 'quotation.png')

    # the receipt from the technician's phone: two aircons, and how to pay by GCash
    for who, name in (('Joel Tupas', 'receipt.png'),):
        t.go(url + '?as=tech')
        t.js(r"""await tap('[data-act="open"][data-kind="job"]', /%s/); await tap('[data-act]', /Receipt/); await W(800);""" % who)
        doc(t, '.receipt', name)

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    shots.URL = os.environ.get('DEMO_URL', shots.URL)
    shots.OUT = OUT
    shots.run = run
    shots.main()
