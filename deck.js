/* ============================================================
   Winter Services deck engine
   ------------------------------------------------------------
   SukiRun's deck engine: the same navigation, Short / Full, theme and notes.
   The constellation behind the slides became slow snow, for an aircon shop.

   Keys: ← → Space PgUp/PgDn · Home/End · T theme · N notes · F present · P print
   ============================================================ */

/* ============================================================
   1. NAVIGATION
   ============================================================ */
/* SHORT and FULL. Short is the dozen slides said out loud in a room (data-short); Full
   adds the eight business scenarios and the rest, for reading on your own. Navigation,
   the rail, the counter and deep links all count only the slides in the chosen set. */
const allSlides = [...document.querySelectorAll('.slide')];
let slides  = allSlides;
const rail    = document.getElementById('rail');
const counter = document.getElementById('counter');
const prog    = document.getElementById('prog');
const root    = document.documentElement;
let dots = [], idx = 0;

function buildRail(){
  rail.innerHTML = '';
  slides.forEach((s, i) => {
    const b = document.createElement('button');
    b.dataset.t = String(i + 1).padStart(2, '0') + ' · ' + (s.dataset.title || '');
    b.addEventListener('click', () => go(i));
    rail.appendChild(b);
  });
  dots = [...rail.children];
}

function go(i){
  idx = Math.max(0, Math.min(slides.length - 1, i));
  slides.forEach((s, k) => s.classList.toggle('on', k === idx));
  allSlides.forEach(s => { if (!slides.includes(s)) s.classList.remove('on'); });
  dots.forEach((d, k) => d.classList.toggle('on', k === idx));
  counter.innerHTML = '<b>' + String(idx + 1).padStart(2, '0') + '</b> / ' + slides.length;
  prog.style.width = (slides.length > 1 ? idx / (slides.length - 1) * 100 : 0) + '%';
  slides[idx].scrollTop = 0;
  if (location.hash !== '#' + (idx + 1)) history.replaceState(null, '', location.pathname + location.search + '#' + (idx + 1));
}

function applySet(mode, keepSlide){
  const short = mode === 'short';
  const current = slides[idx];
  allSlides.forEach(s => s.classList.toggle('off-deck', short && !s.hasAttribute('data-short')));
  slides = allSlides.filter(s => !s.classList.contains('off-deck'));
  buildRail();
  document.querySelectorAll('[data-set]').forEach(b => b.classList.toggle('on', b.dataset.set === mode));
  try { localStorage.setItem('ws-deck-set', mode); } catch(e){}
  const at = keepSlide && current ? slides.indexOf(current) : -1;
  go(at >= 0 ? at : 0);
}
document.querySelectorAll('[data-set]').forEach(b =>
  b.addEventListener('click', () => applySet(b.dataset.set, true)));

document.getElementById('nextBtn').onclick = () => go(idx + 1);
document.getElementById('prevBtn').onclick = () => go(idx - 1);

addEventListener('keydown', e => {
  if (e.target.matches('input,textarea')) return;
  const k = e.key;
  if (k === 'ArrowRight' || k === 'PageDown' || k === ' '){ e.preventDefault(); go(idx + 1); }
  else if (k === 'ArrowLeft' || k === 'PageUp'){ e.preventDefault(); go(idx - 1); }
  else if (k === 'Home'){ go(0); }
  else if (k === 'End'){ go(slides.length - 1); }
  else if (k.toLowerCase() === 't'){ toggleTheme(); }
  else if (k.toLowerCase() === 'n'){ document.body.classList.toggle('notes'); }
  else if (k.toLowerCase() === 'f'){ toggleFs(); }
  else if (k.toLowerCase() === 'p'){ e.preventDefault(); print(); }
});

/* touch swipe */
let tx = 0, ty = 0;
addEventListener('touchstart', e => {
  tx = e.changedTouches[0].clientX; ty = e.changedTouches[0].clientY;
}, {passive:true});
addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) go(idx + (dx < 0 ? 1 : -1));
}, {passive:true});

function toggleFs(){
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}
document.getElementById('fsBtn')?.addEventListener('click', toggleFs);
document.getElementById('notesBtn')?.addEventListener('click',
  () => document.body.classList.toggle('notes'));

// ?short or ?full in the address wins, then what this browser chose last, then Full
let startSet = /[?&]short/.test(location.search) ? 'short' : /[?&]full/.test(location.search) ? 'full' : null;
if (!startSet){ try { startSet = localStorage.getItem('ws-deck-set'); } catch(e){} }
// read #n BEFORE applySet(), which goes to slide 1 and rewrites the hash on its way
const startAt = (parseInt(location.hash.slice(1)) - 1) || 0;
applySet(startSet === 'short' ? 'short' : 'full', false);
go(startAt);

/* deep links: index.html#7 jumps to slide 7 without a reload */
addEventListener('hashchange', () => {
  const n = parseInt(location.hash.slice(1));
  if (!isNaN(n) && n - 1 !== idx) go(n - 1);
});

/* ============================================================
   2. THEME
   ============================================================ */
const themeIcon  = document.getElementById('themeIcon');
const themeLabel = document.getElementById('themeLabel');
function applyTheme(t){
  root.dataset.theme = t;
  if (themeIcon)  themeIcon.src = t === 'dark' ? 'assets/sun.png' : 'assets/moon.png';
  if (themeLabel) themeLabel.textContent = t === 'dark' ? 'Light' : 'Dark';
  try { localStorage.setItem('ws-deck-theme', t); } catch(e){}
}
function toggleTheme(){ applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'); }
document.getElementById('themeBtn')?.addEventListener('click', toggleTheme);
let saved = null;
try { saved = localStorage.getItem('ws-deck-theme'); } catch(e){}
applyTheme(saved || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));

/* ============================================================
   3. SNOW BACKGROUND
   ------------------------------------------------------------
   Slow flakes drifting down and swaying; one in six is ice blue with a halo.
   ============================================================ */
(function(){
  const cv = document.getElementById('stars');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  let W, H, dpr, flakes = [];
  const css = v => getComputedStyle(root).getPropertyValue(v).trim();
  const flake = top => ({
    x: Math.random() * W, y: top ? -10 * dpr : Math.random() * H,
    r: (Math.random() * 1.7 + .45) * dpr,
    vy: (.12 + Math.random() * .38) * dpr,
    sway: (.15 + Math.random() * .45) * dpr,
    ph: Math.random() * Math.PI * 2,
    sp: .4 + Math.random() * .9,
    hot: Math.random() < .16,
  });

  function resize(){
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = cv.width  = innerWidth  * dpr;
    H = cv.height = innerHeight * dpr;
    cv.style.width  = innerWidth  + 'px';
    cv.style.height = innerHeight + 'px';
    const n = Math.round(innerWidth * innerHeight / 9500);
    flakes = Array.from({length: Math.min(n, 170)}, () => flake(false));
  }
  resize();
  addEventListener('resize', resize);

  function draw(t){
    ctx.clearRect(0, 0, W, H);
    const base = css('--star') || '#E6F2FF', acc = css('--accent') || '#5AA9E6';
    const light = root.dataset.theme === 'light';
    for (const f of flakes){
      const x = f.x + Math.sin(f.ph + t * f.sp) * f.sway * 18;
      ctx.globalAlpha = light ? .34 : .7;
      ctx.fillStyle = f.hot ? acc : base;
      ctx.beginPath(); ctx.arc(x, f.y, f.r, 0, 6.2832); ctx.fill();
      if (f.hot){
        ctx.globalAlpha = .14;
        ctx.beginPath(); ctx.arc(x, f.y, f.r * 4.5, 0, 6.2832); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  if (matchMedia('(prefers-reduced-motion: reduce)').matches){ draw(0); return; }

  let t = 0;
  (function loop(){
    t += .016;
    for (let i = 0; i < flakes.length; i++){
      const f = flakes[i];
      f.y += f.vy;
      if (f.y > H + 10 * dpr) flakes[i] = flake(true);
    }
    draw(t);
    requestAnimationFrame(loop);
  })();
})();

/* ============================================================
   4. SCREENSHOTS
   ------------------------------------------------------------
   Every slot is written as a dashed placeholder naming the file it wants. Drop that
   file into assets/screens/ and it swaps itself in — no editing index.html.
   In the bundled presentation.html the same paths resolve through the ASSETS map.
   ============================================================ */
document.querySelectorAll('[data-shot]').forEach(el => {
  const path = 'assets/screens/' + el.dataset.shot;
  const url  = (typeof ASSETS !== 'undefined' && ASSETS[path]) || path;
  const img  = new Image();
  img.alt = el.dataset.shot.replace(/\.png$/, '').replace(/-/g, ' ');
  img.onload = () => {
    el.classList.remove('todo');
    el.textContent = '';
    el.appendChild(img);
  };
  img.src = url;          // still missing? the placeholder simply stays
});
