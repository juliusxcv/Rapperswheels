/* ───── Rapperswheels ───── */

const CONFIG = {
  // Adresse, an die Kontakt- und Mitgliedschaftsanfragen gehen.
  email: 'info@rapperswheels.ch',
  // Optional: Formular-Dienst (z.B. https://formspree.io/f/xxxx). Leer = Mailprogramm öffnen.
  formEndpoint: '',
};

const MEDIA = (window.RW_MEDIA || []).map((m, i) => ({ ...m, index: i }));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const rand = (min, max) => min + Math.random() * (max - min);
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* Builds the <img>/<video> preview for a media item */
function preview(item) {
  if (item.type === 'video') {
    const v = document.createElement('video');
    v.src = item.src + '#t=0.1';
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.setAttribute('aria-hidden', 'true');
    return v;
  }
  const img = document.createElement('img');
  img.src = item.thumb || item.src;
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  if (item.w && item.h) { img.width = item.w; img.height = item.h; }
  return img;
}

function aspect(item) {
  return item.w && item.h ? item.w / item.h : 16 / 9;
}

/* Autoplay muted video previews only while visible */
const videoObserver = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting && !reduceMotion) e.target.play().catch(() => {});
    else e.target.pause();
  }
}, { threshold: 0.1 });

/* ───── Floating wall ───── */

const wall = document.getElementById('wall');
let wallCols = 0;

function buildWall() {
  if (!MEDIA.length) return;
  const w = window.innerWidth;
  const h = wall.clientHeight;
  const cols = w >= 1100 ? 5 : w >= 700 ? 4 : 3;
  const rows = w >= 700 ? 3 : 4;
  if (cols === wallCols) return;
  wallCols = cols;
  wall.replaceChildren();

  const cellW = w / cols;
  const cellH = h / rows;
  const total = cols * rows;

  // Fill every cell, cycling through shuffled media
  let pool = [];
  for (let c = 0; c < total; c++) {
    if (!pool.length) pool = shuffle(MEDIA);
    const item = pool.pop();
    const col = c % cols;
    const row = Math.floor(c / cols);

    const ar = aspect(item);
    let tw = cellW * rand(0.6, 0.92);
    if (ar < 1) tw *= 0.72; // portraits a bit narrower
    let th = tw / ar;
    if (th > cellH * 1.15) { th = cellH * 1.15; tw = th * ar; }

    const x = col * cellW + rand(-0.1, 1) * (cellW - tw);
    const y = row * cellH + rand(-0.1, 1) * (cellH - th);
    const depth = rand(0.3, 1);

    const tile = document.createElement('button');
    tile.className = 'tile';
    tile.type = 'button';
    tile.setAttribute('aria-label', item.type === 'video' ? 'Clip öffnen' : 'Foto öffnen');
    tile.dataset.index = item.index;
    tile.style.cssText = `
      left:${x}px; top:${y}px; width:${tw}px;
      z-index:${Math.round(depth * 10)};
      --depth:${depth * 28};
      --speed:${(0.15 + depth * 0.75 + rand(-0.1, 0.1)).toFixed(2)};
      --tilt:${(rand(2, 7) * (Math.random() < 0.5 ? -1 : 1)).toFixed(1)}deg;
      --in-delay:${(c * 0.05).toFixed(2)}s;
    `;

    const float = document.createElement('span');
    float.className = 'tile-float';
    float.style.cssText = `
      --dx:${rand(-22, 22).toFixed(1)}px; --dy:${rand(-26, 26).toFixed(1)}px;
      --rot:${rand(-1.6, 1.6).toFixed(2)}deg;
      --dur:${rand(7, 13).toFixed(1)}s; --delay:${rand(-10, 0).toFixed(1)}s;
    `;
    const el = preview(item);
    float.append(el);
    if (item.type === 'video') {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = '▶ CLIP';
      float.append(b);
      videoObserver.observe(el);
    }
    tile.append(float);
    tile.addEventListener('click', () => {
      if (tile.dragged) { tile.dragged = false; return; } // a drag is not a click
      openLightbox(item.index, tile);
    });
    wall.append(tile);
    makeDraggable(tile, x, y);
  }
  clampTiles();
}

/* ───── Drag & flick ───── */

const FRICTION = 0.995;  // velocity kept per ms of glide
const BOUNCE = 0.45;     // energy kept when hitting the frame edge
const gliding = new Set();
let glideFrame = 0;
let lastGlide = 0;
let topZ = 20;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function bounds(tile) {
  return {
    maxX: Math.max(0, wall.clientWidth - tile.offsetWidth),
    maxY: Math.max(0, wall.clientHeight - tile.offsetHeight),
  };
}

function moveTile(tile) {
  const s = tile.state;
  tile.style.left = s.x + 'px';
  tile.style.top = s.y + 'px';
  // swing into the direction of travel, like a sheet of paper
  tile.style.rotate = `${clamp(s.vx * 7, -12, 12).toFixed(2)}deg`;
}

// Keeps every tile fully inside the wall (also after resizes)
function clampTiles() {
  for (const tile of wall.children) {
    const s = tile.state;
    if (!s) continue;
    const b = bounds(tile);
    s.x = clamp(s.x, 0, b.maxX);
    s.y = clamp(s.y, 0, b.maxY);
    tile.style.left = s.x + 'px';
    tile.style.top = s.y + 'px';
  }
}

function glide(now) {
  const dt = Math.min(40, now - (lastGlide || now)) || 16;
  lastGlide = now;
  for (const tile of gliding) {
    const s = tile.state;
    const b = bounds(tile);
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    // bounce off the frame instead of leaving it
    if (s.x < 0) { s.x = 0; s.vx = Math.abs(s.vx) * BOUNCE; }
    if (s.x > b.maxX) { s.x = b.maxX; s.vx = -Math.abs(s.vx) * BOUNCE; }
    if (s.y < 0) { s.y = 0; s.vy = Math.abs(s.vy) * BOUNCE; }
    if (s.y > b.maxY) { s.y = b.maxY; s.vy = -Math.abs(s.vy) * BOUNCE; }
    const f = Math.pow(FRICTION, dt);
    s.vx *= f;
    s.vy *= f;
    if (Math.hypot(s.vx, s.vy) < 0.01) {
      s.vx = s.vy = 0;
      gliding.delete(tile);
      tile.style.rotate = '';  // settle back into its pinboard tilt
    }
    moveTile(tile);
  }
  glideFrame = gliding.size ? requestAnimationFrame(glide) : 0;
  if (!glideFrame) lastGlide = 0;
}

function makeDraggable(tile, x, y) {
  tile.state = { x, y, vx: 0, vy: 0 };
  const media = tile.querySelector('img, video');
  if (media) media.draggable = false;

  let drag = null;

  tile.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    gliding.delete(tile);
    const s = tile.state;
    s.vx = s.vy = 0;
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: s.x, oy: s.y, lx: e.clientX, ly: e.clientY, lt: e.timeStamp, moved: false };
    tile.setPointerCapture(e.pointerId);
    tile.style.zIndex = ++topZ;
  });

  tile.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    tile.classList.add('dragging');

    const s = tile.state;
    const b = bounds(tile);
    s.x = clamp(drag.ox + dx, 0, b.maxX);
    s.y = clamp(drag.oy + dy, 0, b.maxY);

    // smoothed pointer velocity in px/ms, used for the flick
    const dt = Math.max(1, e.timeStamp - drag.lt);
    s.vx = 0.7 * ((e.clientX - drag.lx) / dt) + 0.3 * s.vx;
    s.vy = 0.7 * ((e.clientY - drag.ly) / dt) + 0.3 * s.vy;
    drag.lx = e.clientX;
    drag.ly = e.clientY;
    drag.lt = e.timeStamp;
    moveTile(tile);
  });

  const release = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const s = tile.state;
    tile.classList.remove('dragging');
    if (drag.moved) {
      // swallow only the click that belongs to this drag
      tile.dragged = true;
      setTimeout(() => { tile.dragged = false; }, 0);
      // holding still before letting go means no throw
      if (e.timeStamp - drag.lt > 80) s.vx = s.vy = 0;
      const speed = Math.hypot(s.vx, s.vy);
      if (speed > 4) { s.vx *= 4 / speed; s.vy *= 4 / speed; } // cap the throw
      gliding.add(tile);
      if (!glideFrame) glideFrame = requestAnimationFrame(glide);
    }
    drag = null;
  };
  tile.addEventListener('pointerup', release);
  tile.addEventListener('pointercancel', release);
}

// Mouse parallax: tiles shift by depth, opposite to the cursor
if (!reduceMotion) {
  wall.parentElement.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const rect = wall.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width - 0.5) * -2;
    const py = ((e.clientY - rect.top) / rect.height - 0.5) * -2;
    wall.style.setProperty('--px', px.toFixed(3));
    wall.style.setProperty('--py', py.toFixed(3));
  });
}

// Tiles fly in the first time the wall scrolls into view
new IntersectionObserver((entries, obs) => {
  if (entries[0].isIntersecting) {
    wall.classList.add('in');
    obs.disconnect();
  }
}, { threshold: 0.2 }).observe(wall);

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    buildWall();
    clampTiles();
  }, 200);
});

document.getElementById('media-count').textContent =
  String(MEDIA.length).padStart(2, '0') + (MEDIA.length === 1 ? ' Eintrag' : ' Einträge');

/* ───── Torn poster landing ───── */

const poster = document.querySelector('.poster');
const layers = Object.fromEntries(
  [...poster.querySelectorAll('.layer')].map((l) => [l.dataset.layer, l]),
);
const posterLogo = document.querySelector('.logo');
const posterLogoImg = posterLogo.querySelector('img');
const intro = poster.querySelector('.intro');
// Pointer depth per layer (fraction of stage size), as in the poster's preview
const DEPTH = { green: 0.006, upper: 0.012, lower: 0.02 };
let pointer = { x: 0, y: 0, tx: 0, ty: 0 };
let posterFrame = 0;

const easeIn = (t) => t * t;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function drawPoster() {
  posterFrame = 0;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = poster.getBoundingClientRect();
  const range = Math.max(1, rect.height - vh);
  const p = Math.min(1, Math.max(0, -rect.top / range));

  pointer.x += (pointer.tx - pointer.x) * 0.09;
  pointer.y += (pointer.ty - pointer.y) * 0.09;
  const mx = (d) => pointer.x * vw * d;
  const my = (d) => pointer.y * vh * d;

  // the intro fades out early, before the papers are gone
  intro.style.opacity = String(1 - Math.min(1, p * 2.5));

  if (reduceMotion) {
    // No movement: the papers simply fade out
    for (const k of ['green', 'upper', 'lower']) layers[k].style.opacity = String(1 - p);
  } else {
    // Each sheet is torn off in its own direction, slightly staggered
    const g = easeIn(Math.min(1, p * 1.25));
    const u = easeIn(Math.min(1, Math.max(0, p * 1.25 - 0.1)));
    const l = easeIn(Math.min(1, Math.max(0, p * 1.25 - 0.2)));
    layers.green.style.transform =
      `translate(${mx(DEPTH.green) - g * vw * 0.7}px, ${my(DEPTH.green) + g * vh * 0.1}px) rotate(${-g * 14}deg)`;
    layers.upper.style.transform =
      `translate(${mx(DEPTH.upper) - u * vw * 0.15}px, ${my(DEPTH.upper) - u * vh * 0.9}px) rotate(${-u * 10}deg)`;
    layers.lower.style.transform =
      `translate(${mx(DEPTH.lower) + l * vw * 0.35}px, ${my(DEPTH.lower) + l * vh * 0.9}px) rotate(${l * 9}deg)`;
    intro.style.transform = `translateY(${-p * 60}px)`;
  }

  // The logo grows a little while the papers peel, then docks to the top centre
  // as the poster scrolls out (below the nav row on narrow screens).
  const scrolled = -rect.top;
  const dockStart = range * 0.8;
  const d = easeInOut(Math.min(1, Math.max(0, (scrolled - dockStart) / (range + vh * 0.6 - dockStart))));
  const fullW = posterLogoImg.offsetWidth || 1;
  const dockW = Math.min(Math.max(vw * 0.13, 120), 190);
  const dockH = dockW * 0.217;
  const dockY = vw < 720 ? 58 + dockH / 2 : 27;
  const grow = reduceMotion ? 1 : 1 + Math.min(p, 0.8) * 0.12;
  const scale = grow + (dockW / fullW - grow) * d;
  posterLogo.style.transform = `translateY(${(dockY - vh / 2) * d}px) scale(${scale})`;
  posterLogo.classList.toggle('is-docked', d >= 1);

  // Photos float up at their own speeds while the wall scrolls into view
  if (!reduceMotion) {
    const top = wall.getBoundingClientRect().top;
    if (top < vh * 1.5 && top > -vh * 1.5) wall.style.setProperty('--sy', top.toFixed(1));
  }

  if (Math.abs(pointer.tx - pointer.x) + Math.abs(pointer.ty - pointer.y) > 0.001) schedulePoster();
}

function schedulePoster() {
  if (!posterFrame) posterFrame = requestAnimationFrame(drawPoster);
}

window.addEventListener('scroll', schedulePoster, { passive: true });
window.addEventListener('resize', schedulePoster);
if (!reduceMotion) {
  poster.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
    schedulePoster();
  });
  poster.addEventListener('pointerleave', () => {
    pointer.tx = pointer.ty = 0;
    schedulePoster();
  });
}
drawPoster();

/* ───── Lightbox ───── */

const lb = document.getElementById('lightbox');
const stage = document.getElementById('lb-stage');
const lbIndex = document.getElementById('lb-index');
let current = -1;
let origin = null;  // element the lightbox was opened from
let mediaEl = null;
let lastFocus = null;

function fitRect(ar) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxW = vw * (vw < 700 ? 0.94 : 0.84);
  const maxH = vh * 0.82;
  let w = maxW;
  let h = w / ar;
  if (h > maxH) { h = maxH; w = h * ar; }
  return { left: (vw - w) / 2, top: (vh - h) / 2, width: w, height: h };
}

function place(el, r) {
  Object.assign(el.style, {
    left: r.left + 'px', top: r.top + 'px',
    width: r.width + 'px', height: r.height + 'px',
  });
}

const angle = (el) => parseFloat(getComputedStyle(el).rotate) || 0;

// Untransformed size, centre and tilt of a tile's image as it is shown right now
function geometry(fromEl) {
  const m = fromEl.querySelector('img, video') || fromEl;
  const r = m.getBoundingClientRect();
  const t = getComputedStyle(m).transform;
  const s = t && t !== 'none' ? new DOMMatrixReadOnly(t).a : 1; // hover zoom
  const float = fromEl.querySelector('.tile-float');
  return {
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
    width: m.offsetWidth * s,
    height: m.offsetHeight * s,
    rot: angle(fromEl) + (float ? angle(float) : 0),
  };
}

// Transform that maps the target rect onto the (tilted) source tile (FLIP)
function invert(from, to) {
  const dx = from.cx - (to.left + to.width / 2);
  const dy = from.cy - (to.top + to.height / 2);
  return `translate(${dx}px, ${dy}px) rotate(${from.rot}deg) scale(${from.width / to.width}, ${from.height / to.height})`;
}

function createMedia(item) {
  let el;
  if (item.type === 'video') {
    el = document.createElement('video');
    el.src = item.src;
    el.controls = true;
    el.playsInline = true;
    el.loop = true;
    el.autoplay = true;
    el.addEventListener('loadedmetadata', () => {
      item.w = el.videoWidth;
      item.h = el.videoHeight;
      if (mediaEl === el) place(el, fitRect(aspect(item)));
    }, { once: true });
  } else {
    el = document.createElement('img');
    el.alt = '';
    el.src = item.thumb || item.src;
    // swap in the full-resolution image once loaded
    const full = new Image();
    full.onload = () => { el.src = item.src; };
    full.src = item.src;
    el.addEventListener('click', closeLightbox);
  }
  el.className = 'lb-media';
  return el;
}

function show(index, fromEl) {
  const item = MEDIA[index];
  current = index;
  lbIndex.textContent = `${String(index + 1).padStart(2, '0')} / ${String(MEDIA.length).padStart(2, '0')}`;

  const old = mediaEl;
  mediaEl = createMedia(item);
  const target = fitRect(aspect(item));
  place(mediaEl, target);

  if (fromEl && !reduceMotion) {
    // Grow from the clicked thumbnail
    mediaEl.style.transform = invert(geometry(fromEl), target);
    stage.append(mediaEl);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      mediaEl.classList.add('animating');
      mediaEl.style.transform = '';
    }));
  } else {
    mediaEl.style.opacity = '0';
    stage.append(mediaEl);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      mediaEl.classList.add('animating');
      mediaEl.style.opacity = '1';
    }));
  }

  if (old) {
    if (old.pause) old.pause();
    old.classList.add('animating');
    old.style.opacity = '0';
    setTimeout(() => old.remove(), 400);
  }
}

let closing = null;  // close animation in flight

function finishClose() {
  if (!closing) return;
  clearTimeout(closing.timer);
  closing.el.remove();
  if (closing.origin) closing.origin.classList.remove('is-hidden');
  lb.classList.remove('is-closing');
  closing = null;
}

function openLightbox(index, fromEl) {
  finishClose();
  lastFocus = document.activeElement;
  origin = fromEl;
  origin.classList.add('is-hidden');
  lb.classList.add('is-open');
  lb.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  show(index, fromEl);
  lb.querySelector('.lb-close').focus({ preventScroll: true });
}

function closeLightbox() {
  if (current < 0) return;
  const el = mediaEl;
  const item = MEDIA[current];
  if (el.pause) el.pause();

  // Shrink back into the origin tile if it still shows the same item
  const back = origin && Number(origin.dataset.index) === item.index && !reduceMotion;
  if (back) {
    el.classList.add('animating');
    el.style.transform = invert(geometry(origin), fitRect(aspect(item)));
  } else {
    el.style.opacity = '0';
    if (origin) origin.classList.remove('is-hidden');
  }

  // Keep the lightbox visible (but inert) until the photo has landed back on the wall
  lb.classList.remove('is-open');
  lb.classList.add('is-closing');
  lb.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  closing = { el, origin: back ? origin : null };
  closing.timer = setTimeout(finishClose, back ? 620 : 360);

  current = -1;
  mediaEl = null;
  if (lastFocus) {
    // Return focus without flashing a focus ring around the tile
    const f = lastFocus;
    f.classList.add('no-ring');
    f.addEventListener('blur', () => f.classList.remove('no-ring'), { once: true });
    f.focus({ preventScroll: true });
  }
}

function step(dir) {
  if (current < 0 || MEDIA.length < 2) return;
  if (origin) origin.classList.remove('is-hidden');
  origin = null;
  show((current + dir + MEDIA.length) % MEDIA.length, null);
}

lb.querySelector('.lb-backdrop').addEventListener('click', closeLightbox);
lb.querySelector('.lb-close').addEventListener('click', closeLightbox);
lb.querySelector('.lb-prev').addEventListener('click', () => step(-1));
lb.querySelector('.lb-next').addEventListener('click', () => step(1));

document.addEventListener('keydown', (e) => {
  if (current < 0) return;
  if (e.key === 'Escape') closeLightbox();
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
});

// Swipe left/right on touch devices
let touchX = null;
lb.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
lb.addEventListener('touchend', (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
  touchX = null;
});

window.addEventListener('resize', () => {
  if (mediaEl && current >= 0) place(mediaEl, fitRect(aspect(MEDIA[current])));
});

/* ───── Contact / membership form ───── */

const form = document.getElementById('contact-form');
const status = document.getElementById('form-status');
const memberOnly = form.querySelectorAll('.member-only');
const messageLabel = document.getElementById('message-label');
const submitBtn = document.getElementById('submit-btn');

function setMode(mode) {
  const member = mode === 'member';
  memberOnly.forEach((el) => { el.hidden = !member; });
  messageLabel.textContent = member ? 'Bemerkungen (optional)' : 'Nachricht';
  submitBtn.textContent = member ? 'Anmeldung senden →' : 'Senden →';
  status.textContent = '';
}

form.addEventListener('change', (e) => {
  if (e.target.name === 'mode') setMode(e.target.value);
  const f = e.target.closest('.field, .check');
  if (f) f.classList.remove('invalid');
});

// Jump straight to the membership form via #mitglied
if (location.hash === '#mitglied') {
  form.querySelector('input[value=member]').checked = true;
  setMode('member');
}

function validate(data, member) {
  const invalid = [];
  const req = ['firstname', 'lastname', 'email'];
  if (member) req.push('birthdate', 'address', 'city');
  else req.push('message');
  for (const name of req) if (!String(data.get(name) || '').trim()) invalid.push(name);
  const email = String(data.get('email') || '');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid.push('email');
  if (member && !data.get('statutes')) invalid.push('statutes');

  form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
  for (const name of invalid) {
    const input = form.elements[name];
    const wrap = input && (input.closest ? input.closest('.field, .check') : null);
    if (wrap) wrap.classList.add('invalid');
  }
  return invalid.length === 0;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = new FormData(form);
  const member = data.get('mode') === 'member';

  if (!validate(data, member)) {
    status.textContent = 'Bitte die markierten Felder ausfüllen.';
    return;
  }

  const name = `${data.get('firstname')} ${data.get('lastname')}`.trim();
  const subject = member ? `Mitgliedschaft: ${name}` : `Kontakt: ${name}`;
  const lines = member
    ? [
        'Anmeldung Mitgliedschaft Rapperswheels',
        '',
        `Name: ${name}`,
        `E-Mail: ${data.get('email')}`,
        `Telefon: ${data.get('phone') || '-'}`,
        `Geburtsdatum: ${data.get('birthdate')}`,
        `Adresse: ${data.get('address')}, ${data.get('city')}`,
        `Mitgliedschaft: ${data.get('membership')}`,
        'Statuten akzeptiert: ja',
        '',
        String(data.get('message') || ''),
      ]
    : [String(data.get('message')), '', `— ${name}, ${data.get('email')}`];
  const body = lines.join('\n');

  if (CONFIG.formEndpoint) {
    status.textContent = 'Wird gesendet …';
    try {
      data.append('_subject', subject);
      const res = await fetch(CONFIG.formEndpoint, {
        method: 'POST', body: data, headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(res.status);
      form.reset();
      setMode('message');
      status.textContent = member ? 'Danke! Wir melden uns bald bei dir.' : 'Danke für deine Nachricht!';
    } catch {
      status.textContent = `Hat nicht geklappt — schreib uns direkt an ${CONFIG.email}.`;
    }
    return;
  }

  location.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  status.textContent = 'Dein Mailprogramm öffnet sich mit der fertigen Nachricht.';
});

/* ───── Misc ───── */

document.getElementById('year').textContent = new Date().getFullYear();
const mailLink = document.getElementById('contact-mail');
mailLink.href = `mailto:${CONFIG.email}`;
mailLink.textContent = CONFIG.email;

buildWall();
