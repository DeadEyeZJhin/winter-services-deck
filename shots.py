#!/usr/bin/env python3
"""
Take the deck's screenshots from the demo, in a throwaway headless Chrome.

    python -m http.server 8151        (in this folder, in another window)
    python shots.py                   -> assets/screens/*.png

Every picture is the real app (demo/, built by make_demo.py) answering from the invented
month in demo-src/fake-server.js. The Chrome profile is a fresh temporary folder, so the
shots never touch a real browser's data, and the demo never reaches a real server.

Phone shots are 375 x 812 at 1.5x (562 px wide). The desktop shot is 1380 x 860.
Needs: pip install websocket-client
"""
import base64, json, os, shutil, subprocess, sys, tempfile, time, urllib.request
import websocket

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'assets', 'screens')
URL = 'http://localhost:8151/demo/'
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
PORT = 9333

# helpers the steps call inside the page
LIB = r'''
window.W = ms => new Promise(r => setTimeout(r, ms));
window.$q = s => document.querySelector(s);
window.byText = (sel, re) => [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null || e.getClientRects().length)
  .find(e => re.test(e.textContent.trim()));
window.tap = async (sel, re) => { const e = re ? byText(sel, re) : $q(sel); if (!e) throw new Error('no ' + sel + ' ' + re); e.click(); await W(450); };
window.see = async (re, block) => {
  const all = [...document.querySelectorAll('h1,h2,h3,h4,div,span,p,button,label,b,strong,summary,a')]
    .filter(e => e.getClientRects().length && re.test(e.textContent.trim()) && ![...e.children].some(c => re.test(c.textContent.trim())));
  const e = all[all.length - 1] && all.find(x => x.closest('.panel,.sheet,[role=dialog]')) || all[0];
  if (!e) throw new Error('not on screen: ' + re);
  e.scrollIntoView({block: block || 'start'}); await W(350);
};
window.type = async (sel, text) => { const e = $q(sel); e.focus(); e.value = text; e.dispatchEvent(new Event('input', {bubbles: true}));
  e.dispatchEvent(new Event('change', {bubbles: true})); await W(120); };
'''

class Tab:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, suppress_origin=True)
        self.n = 0
    def call(self, method, **params):
        self.n += 1
        self.ws.send(json.dumps({'id': self.n, 'method': method, 'params': params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get('id') == self.n:
                if 'error' in m:
                    raise RuntimeError('%s: %s' % (method, m['error']))
                return m.get('result', {})
    def js(self, code):
        r = self.call('Runtime.evaluate', expression='(async () => {' + code + '})()', awaitPromise=True, returnByValue=True)
        if r.get('exceptionDetails'):
            raise RuntimeError('page: ' + json.dumps(r['exceptionDetails'].get('exception', {}).get('description', r['exceptionDetails']))[:400])
        return r.get('result', {}).get('value')
    def size(self, w, h, dpr, mobile):
        self.call('Emulation.setDeviceMetricsOverride', width=w, height=h, deviceScaleFactor=dpr, mobile=mobile)
    def go(self, url, settle=2.6):
        self.call('Page.navigate', url=url)
        time.sleep(settle)
        self.js(LIB)
    def shot(self, name):
        self.js("document.getElementById('demo-strip') && (document.getElementById('demo-strip').style.display = 'none');"
                "document.activeElement && document.activeElement.blur();")
        time.sleep(0.35)
        data = self.call('Page.captureScreenshot', format='png')['data']
        with open(os.path.join(OUT, name), 'wb') as f:
            f.write(base64.b64decode(data))
        self.js("document.getElementById('demo-strip') && (document.getElementById('demo-strip').style.display = '');")
        print('  ', name)

def phone(t):   t.size(375, 812, 1.5, True)
def desktop(t): t.size(1380, 860, 1, False)

def run(t):
    phone(t)
    # a clean invented month
    t.go(URL + '?as=guest')
    t.js("Object.keys(localStorage).forEach(k => localStorage.removeItem(k));")
    t.go(URL + '?as=guest')

    # ---- the public booking page
    t.shot('book-form.png')
    t.js(r"""
      await type('[data-bk="full_name"]', 'Bea Villareal'); await type('[data-bk="contact"]', '0917 555 0321');
      await type('[data-bk="address"]', '9 Rizal Street, Brgy. 22, Bacolod City');
      await type('[data-bk="landmark"]', 'Blue gate beside the water refilling station');
      await tap('[data-act="unitnew"][data-v="Split"]'); await tap('#unitSheet [data-act="unitsvc"][data-v="clean"]');
      await tap('#unitSheet [data-act="unitdone"]');
      await tap('[data-act="unitnew"][data-v="Split"]'); await tap('#unitSheet [data-act="unitsvc"][data-v="clean"]');
      await tap('#unitSheet [data-act="unitdone"]');
      await tap('[data-act="unitnew"][data-v="Window"]'); await tap('#unitSheet [data-act="unitsvc"][data-v="repair"]');
    """)
    t.shot('book-sheet.png')
    t.js(r"""
      await tap('#unitSheet [data-act="unitdone"]');
      const days = [...document.querySelectorAll('#bookForm [data-act="bkset"]')].filter(b => /^\d{4}-/.test(b.dataset.v));
      days[1].click(); await W(200); await tap('#bookForm [data-act="bkset"][data-v="am"]');
      await see(/^Aircon & Other Appliances$/);
    """)
    t.shot('book-cart.png')
    t.js(r"""
      [...document.querySelectorAll('#bookForm input[type=checkbox]')].forEach(c => { if (!c.checked) c.click(); });
      await W(200); await tap('#bookForm button', /Send the booking/); await W(1800); window.scrollTo(0, 0); await W(300);
    """)
    t.shot('book-done.png')
    ref = t.js("return document.getElementById('doneRef').textContent;")
    t.js(r"""
      const f = document.getElementById('trackForm'); f.code.value = '%s'; f.contact.value = '0917 555 0321';
      f.querySelector('button').click(); await W(1500); f.scrollIntoView({block: 'start'}); window.scrollBy(0, -80); await W(300);
    """ % ref)
    t.shot('track.png')

    # ---- the office
    t.go(URL + '?as=office')
    t.js("await tap('[data-act=\"tab\"][data-v=\"inbox\"]'); window.scrollTo(0, 0);")
    t.shot('office-inbox.png')
    t.js(r"""await tap('[data-act="open"][data-kind="booking"]', /Bea Villareal/);""")
    t.shot('office-booking.png')
    t.js(r"""await see(/^Accept\b/, 'center');""")
    t.shot('office-accept.png')
    t.js(r"""await tap('[data-act="open"][data-kind="quote"]'); await W(600);""")
    t.shot('office-quote.png')
    t.go(URL + '?as=office')
    t.js("await tap('[data-act=\"tab\"][data-v=\"jobs\"]'); window.scrollTo(0, 0);")
    t.shot('office-jobs.png')
    t.js(r"""await tap('[data-act="open"][data-kind="job"]', /Ramon Villanueva/); await see(/What has happened to it/);""")
    t.shot('office-job-status.png')
    t.go(URL + '?as=office')
    t.js("await tap('[data-act=\"tab\"][data-v=\"people\"]'); window.scrollTo(0, 0);")
    t.shot('office-customers.png')
    t.js(r"""await tap('[data-act="open"][data-kind="customer"]', /Ramon Villanueva/);""")
    t.shot('office-customer.png')
    t.go(URL + '?as=office')
    t.js("await tap('[data-act=\"tab\"][data-v=\"checkups\"]'); window.scrollTo(0, 0);")
    t.shot('office-checkups.png')
    t.js("await tap('[data-act=\"tab\"][data-v=\"team\"]'); window.scrollTo(0, 0);")
    t.shot('office-users.png')
    t.js("await tap('[data-act=\"tab\"][data-v=\"admin\"]'); window.scrollTo(0, 0);")
    t.shot('office-prices.png')
    t.js("await tap('button,[data-act]', /^Appliances$/); window.scrollTo(0, 0);")
    t.shot('office-appliances.png')
    t.js("await tap('button,[data-act]', /^Numbers$/); window.scrollTo(0, 0);")
    t.shot('office-numbers.png')
    t.js("await tap('button,[data-act]', /^Closed days$/); window.scrollTo(0, 0);")
    t.shot('office-closed.png')

    # ---- the technician
    t.go(URL + '?as=tech')
    t.js("window.scrollTo(0, 0);")
    t.shot('tech-today.png')
    t.js(r"""await tap('[data-act="open"][data-kind="job"]', /Ramon Villanueva/);""")
    t.shot('tech-job.png')
    t.js(r"""await tap('[data-act]', /Receipt/); await W(600);""")
    t.shot('tech-receipt.png')

    # ---- the customer
    t.go(URL + '?as=cust')
    t.js(r"""await see(/^My bookings$/);""")
    t.shot('cust-bookings.png')
    t.js(r"""await tap('[data-act]', /^Full status/); await W(900);""")
    t.shot('cust-status.png')

    # ---- the page on a PC
    desktop(t)
    t.go(URL + '?as=guest')
    t.js("window.scrollTo(0, 0);")
    t.shot('page-desktop.png')

def main():
    os.makedirs(OUT, exist_ok=True)
    try:
        urllib.request.urlopen(URL, timeout=3)
    except Exception:
        raise SystemExit('serve this folder first:  python -m http.server 8151')
    prof = tempfile.mkdtemp(prefix='ws-shots-')
    chrome = subprocess.Popen([CHROME, '--headless=new', '--remote-debugging-port=%d' % PORT, '--user-data-dir=' + prof,
                               '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--window-size=1400,900',
                               'about:blank'])
    try:
        for _ in range(50):
            try:
                pages = json.load(urllib.request.urlopen('http://127.0.0.1:%d/json' % PORT, timeout=1))
                page = next(p for p in pages if p['type'] == 'page')
                break
            except Exception:
                time.sleep(0.2)
        else:
            raise SystemExit('Chrome did not start')
        t = Tab(page['webSocketDebuggerUrl'])
        t.call('Page.enable'); t.call('Runtime.enable')
        only = sys.argv[1:]  # not used yet: every shot runs, in order, because each builds on the last
        run(t)
    finally:
        chrome.terminate()
        try: chrome.wait(5)
        except Exception: chrome.kill()
        shutil.rmtree(prof, ignore_errors=True)

if __name__ == '__main__':
    main()
