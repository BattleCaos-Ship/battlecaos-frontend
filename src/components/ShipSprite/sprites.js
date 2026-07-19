// Sprites pixel-art de los barcos v3 — cada tipo con paleta única y distintiva.
// Resolución: 16 px por celda de tablero, 16 px de alto.
// Cada barco tiene su propia identidad cromática para reconocimiento inmediato.

// ── Paletas POR TIPO ──────────────────────────────────────────────────────────

// Portaaviones: grises de cubierta de vuelo + amarillo señalización
const PA_OUT    = '#1c222b';
const PA_HULL   = '#4a5a6e';
const PA_DECK   = '#7a8a9a';
const PA_DECK_L = '#8d9dad';
const PA_CAR    = '#5c6a7a';
const PA_CAR_L  = '#6e7e8e';
const PA_RUN    = '#e8c84a';
const PA_ISL    = '#3a4858';
const PA_PLANE  = '#8a9aaa';

// Acorazado: azul navy intenso + cañones oscuros
const AZ_OUT    = '#121a24';
const AZ_HULL   = '#2a4a6a';
const AZ_DECK   = '#5a7a9a';
const AZ_DECK_L = '#6a8aaa';
const AZ_TUR    = '#1a2a3a';
const AZ_TUR_L  = '#2a3a4a';
const AZ_BAR    = '#0a121a';
const AZ_BOAT   = '#8a9aaa';

// Crucero: gris acorazado medio con detalles cobre
const CR_OUT    = '#1a242e';
const CR_HULL   = '#4a5e72';
const CR_DECK   = '#7a8e9e';
const CR_DECK_L = '#8a9eae';
const CR_TUR    = '#2a3a4a';
const CR_TUR_L  = '#3a4a5a';
const CR_BAR    = '#1a222a';
const CR_SUP    = '#5a6e7e';
const CR_WIN    = '#c8e8f0';
const CR_BOAT   = '#9aaaba';

// Submarino: verde aceituna oscuro / gris verdoso
const SB_OUT    = '#0e161a';
const SB_HULL   = '#3a4a3a';
const SB_DECK_L = '#5a6a52';
const SB_SUB    = '#2a3a2a';
const SB_SUB_L  = '#4a5a42';
const SB_SUB_H  = '#6a7a62';
const SB_PERI   = '#8a8a72';

// Destructor: gris claro rápido + detalles rojos
const DS_OUT    = '#1e2832';
const DS_HULL   = '#5a6e7e';
const DS_DECK   = '#8a9eae';
const DS_DECK_L = '#9aaebe';
const DS_TUR    = '#3a4a5a';
const DS_TUR_L  = '#4a5a6a';
const DS_BAR    = '#1a222a';
const DS_GUN    = '#c83a3a';

const H = 16;
const SEAM = null; // placeholder, we'll skip seams for cleaner look
const OUT  = null;

function painter() {
  const rects = [];
  const add = (x, y, w, h, fill) => { if (w > 0 && h > 0) rects.push({ x, y, w, h, fill }); };
  return { rects, add };
}

function surfaceHull(p, W, palette, { top = 3, bot = 13 } = {}) {
  const { OUT, HULL, DECK, DECK_L } = palette;
  const mid = (top + bot) / 2;
  const half = (bot - top) / 2;
  const spans = {};
  for (let y = top; y <= bot; y++) {
    const d = Math.abs(y - mid) / half;
    const bowIn = Math.round(11 * Math.pow(d, 1.7));
    const sternIn = d > 0.9 ? 3 : d > 0.6 ? 2 : d > 0.3 ? 1 : 0;
    spans[y] = [1 + sternIn, W - 2 - bowIn];
  }
  for (let y = top; y <= bot; y++) {
    const [x0, x1] = spans[y];
    const col = y <= top + 2 ? DECK_L : y >= bot - 2 ? HULL : DECK;
    p.add(x0, y, x1 - x0 + 1, 1, col);
  }
  for (let y = top; y <= bot; y++) {
    const [x0, x1] = spans[y];
    p.add(x0, y, 1, 1, OUT);
    p.add(x1, y, 1, 1, OUT);
    if (y === top || y === bot) p.add(x0, y, x1 - x0 + 1, 1, OUT);
    else {
      const [px0, px1] = spans[y - 1] ?? [x0, x1];
      if (x1 > px1) p.add(px1, y, x1 - px1, 1, OUT);
      if (x0 < px0) p.add(x0, y, px0 - x0, 1, OUT);
    }
  }
  // Barandillas
  for (let x = 4; x < W - 8; x += 3) {
    const [t0, t1] = spans[top + 1];
    if (x > t0 + 1 && x < t1 - 1) p.add(x, top + 1, 1, 1, '#aeb9c2');
    const [b0, b1] = spans[bot - 1];
    if (x > b0 + 1 && x < b1 - 1) p.add(x, bot - 1, 1, 1, '#aeb9c2');
  }
  // Espuma de proa y estela
  const midR = Math.round(mid);
  p.add(W - 1, midR, 1, 1, 'rgba(233,243,248,0.85)');
  p.add(W - 2, midR - 2, 1, 1, 'rgba(200,220,232,0.45)');
  p.add(W - 2, midR + 2, 1, 1, 'rgba(200,220,232,0.45)');
  p.add(0, midR - 1, 1, 1, 'rgba(200,220,232,0.45)');
  p.add(0, midR + 1, 1, 1, 'rgba(233,243,248,0.85)');
  return spans;
}

function turret(p, cx, cy, dir, palette, barrel = 6) {
  const { TUR, TUR_L, BAR, OUT } = palette;
  p.add(cx - 3, cy - 2, 6, 5, OUT);
  p.add(cx - 2, cy - 1, 4, 3, TUR);
  p.add(cx - 2, cy - 1, 4, 1, TUR_L);
  const bx = dir > 0 ? cx + 3 : cx - 3 - barrel;
  p.add(bx, cy - 1, barrel, 1, BAR);
  p.add(bx, cy + 1, barrel, 1, BAR);
}

function bridge(p, x, w, palette, { y = 4, h = 4 } = {}) {
  const { SUP, WIN, OUT } = palette;
  p.add(x - 1, y - 1, w + 2, h + 2, OUT);
  p.add(x, y, w, h, SUP);
  p.add(x, y, w, 1, '#4d5a64');
  for (let i = 1; i < w - 1; i += 2) p.add(x + i, y + 1, 1, 1, WIN);
}

function funnel(p, x, y, palette) {
  const { FUN, FUNTOP, OUT } = palette;
  p.add(x - 1, y - 1, 5, 5, OUT);
  p.add(x, y, 3, 3, FUN);
  p.add(x, y, 3, 1, FUNTOP);
}

function mast(p, x, y0, y1) {
  p.add(x, y0, 1, y1 - y0 + 1, '#222a32');
  p.add(x - 1, y0 + 1, 3, 1, '#222a32');
}

function boats(p, x, w) {
  p.add(x, 4, w, 1, '#b9c2c9');
  p.add(x, 11, w, 1, '#b9c2c9');
}

// ── PALETAS COMPLETAS ─────────────────────────────────────────────────────────

const PALETTE_DESTRUCTOR = {
  OUT: '#1e2832', HULL: '#5a6e7e', DECK: '#8a9eae', DECK_L: '#9aaebe',
  TUR: '#3a4a5a', TUR_L: '#4a5a6a', BAR: '#1a222a',
  SUP: '#5a6e7e', WIN: '#c8e8f0', FUN: '#4a5a6a', FUNTOP: '#1a222a',
};

const PALETTE_CRUCERO = {
  OUT: '#1a242e', HULL: '#4a5e72', DECK: '#7a8e9e', DECK_L: '#8a9eae',
  TUR: '#2a3a4a', TUR_L: '#3a4a5a', BAR: '#1a222a',
  SUP: '#5a6e7e', WIN: '#c8e8f0', FUN: '#3a4a5a', FUNTOP: '#14181d',
};

const PALETTE_ACORAZADO = {
  OUT: '#121a24', HULL: '#2a4a6a', DECK: '#5a7a9a', DECK_L: '#6a8aaa',
  TUR: '#1a2a3a', TUR_L: '#2a3a4a', BAR: '#0a121a',
  SUP: '#3a4a5a', WIN: '#c8e8f0', FUN: '#1a2a3a', FUNTOP: '#0a121a',
};

const PALETTE_PORTAAVIONES = {
  OUT: '#1c222b', HULL: '#4a5a6e', DECK: '#7a8a9a', DECK_L: '#8d9dad',
  TUR: null, TUR_L: null, BAR: null,
  SUP: '#3a4858', WIN: '#c8e8f0', FUN: '#3a4858', FUNTOP: '#14181d',
};

function destructor() {
  const W = 32, p = painter();
  surfaceHull(p, W, PALETTE_DESTRUCTOR);
  bridge(p, 12, 6, PALETTE_DESTRUCTOR, { y: 4, h: 3 });
  funnel(p, 15, 8, PALETTE_DESTRUCTOR);
  mast(p, 19, 1, 4);
  turret(p, 24, 8, 1, PALETTE_DESTRUCTOR, 5);
  turret(p, 6, 8, -1, PALETTE_DESTRUCTOR, 4);
  // Banda roja distintiva en el casco
  const midR = 8;
  p.add(3, midR + 3, 6, 1, '#c83a3a');
  p.add(22, midR + 3, 6, 1, '#c83a3a');
  return { w: W, h: H, rects: p.rects };
}

function crucero() {
  const W = 48, p = painter();
  surfaceHull(p, W, PALETTE_CRUCERO);
  bridge(p, 18, 9, PALETTE_CRUCERO, { y: 4, h: 4 });
  funnel(p, 29, 5, PALETTE_CRUCERO);
  funnel(p, 34, 5, PALETTE_CRUCERO);
  mast(p, 27, 0, 3);
  boats(p, 20, 5);
  turret(p, 40, 8, 1, PALETTE_CRUCERO, 6);
  turret(p, 8, 8, -1, PALETTE_CRUCERO, 5);
  // Banda cobre
  const midR = 8;
  p.add(4, midR + 3, 8, 1, '#b87a3a');
  p.add(36, midR + 3, 8, 1, '#b87a3a');
  return { w: W, h: H, rects: p.rects };
}

function acorazado() {
  const W = 64, p = painter();
  surfaceHull(p, W, PALETTE_ACORAZADO);
  bridge(p, 24, 12, PALETTE_ACORAZADO, { y: 3, h: 5 });
  funnel(p, 38, 5, PALETTE_ACORAZADO);
  funnel(p, 43, 5, PALETTE_ACORAZADO);
  mast(p, 35, 0, 2);
  boats(p, 26, 7);
  turret(p, 50, 8, 1, PALETTE_ACORAZADO, 7);
  turret(p, 57, 8, 1, PALETTE_ACORAZADO, 5);
  turret(p, 14, 8, -1, PALETTE_ACORAZADO, 6);
  turret(p, 7, 8, -1, PALETTE_ACORAZADO, 5);
  // Banda azul marino oscuro
  const midR = 8;
  p.add(2, midR + 3, W - 4, 1, '#1a2a4a');
  return { w: W, h: H, rects: p.rects };
}

function portaaviones() {
  const W = 80, p = painter();
  const top = 2, bot = 13;
  p.add(1, top, W - 4, bot - top + 1, PA_CAR);
  p.add(1, top, W - 4, 1, PA_CAR_L);
  p.add(W - 3, top + 3, 2, bot - top - 5, PA_CAR);
  // contorno
  p.add(0, top, 1, bot - top + 1, PA_OUT);
  p.add(1, top - 1, W - 4, 1, PA_OUT);
  p.add(1, bot + 1, W - 4, 1, PA_OUT);
  p.add(W - 3, top + 2, 1, 1, PA_OUT);
  p.add(W - 2, top + 3, 1, bot - top - 5, PA_OUT);
  p.add(W - 3, bot - 1, 1, 1, PA_OUT);
  // Línea de pista amarilla
  p.add(2, top + 1, W - 6, 1, '#8d99a6');
  p.add(2, bot - 1, W - 6, 1, '#5d6874');
  for (let x = 6; x < W - 12; x += 6) p.add(x, 7, 3, 1, PA_RUN);
  p.add(W - 10, top + 3, 1, bot - top - 5, PA_RUN);
  p.add(W - 8, top + 3, 1, bot - top - 5, PA_RUN);
  // catapultas
  p.add(W - 22, 5, 10, 1, '#97a3ae');
  p.add(W - 22, 10, 10, 1, '#97a3ae');
  // elevadores
  p.add(12, top + 2, 6, 3, PA_CAR_L);
  p.add(30, bot - 4, 6, 3, PA_CAR_L);
  // isla
  p.add(44, top + 1, 14, 4, PA_OUT);
  p.add(45, top + 2, 12, 2, PA_ISL);
  for (let i = 46; i < 56; i += 2) p.add(i, top + 2, 1, 1, '#c8e8f0');
  p.add(55, top, 1, 2, '#222a32');
  p.add(48, top, 3, 1, '#5d6b78');
  // aviones
  for (const [ax, ay] of [[5, 10], [11, 11], [7, 4]]) {
    p.add(ax, ay - 1, 1, 3, PA_PLANE);
    p.add(ax - 1, ay, 3, 1, PA_PLANE);
    p.add(ax, ay + 1, 1, 1, '#7c8791');
  }
  // grúa
  p.add(2, 4, 1, 3, '#222a32');
  p.add(2, 4, 4, 1, '#222a32');
  // espuma
  p.add(W - 1, 7, 1, 2, 'rgba(233,243,248,0.85)');
  p.add(0, 6, 1, 1, 'rgba(200,220,232,0.45)');
  p.add(0, 9, 1, 1, 'rgba(233,243,248,0.85)');
  return { w: W, h: H, rects: p.rects };
}

function submarino() {
  const W = 48, p = painter();
  const top = 4, bot = 12, mid = 8, half = (bot - top) / 2;
  const spans = {};
  for (let y = top; y <= bot; y++) {
    const d = Math.abs(y - mid) / half;
    const inset = Math.round(9 * Math.pow(d, 1.5));
    spans[y] = [1 + Math.round(inset * 0.8), W - 2 - inset];
  }
  for (let y = top; y <= bot; y++) {
    const [x0, x1] = spans[y];
    const col = y <= top + 1 ? SB_SUB_L : y === top + 2 ? SB_SUB_H : y >= bot - 1 ? '#2a3a2a' : SB_SUB;
    p.add(x0, y, x1 - x0 + 1, 1, col);
    p.add(x0, y, 1, 1, SB_OUT);
    p.add(x1, y, 1, 1, SB_OUT);
    if (y === top || y === bot) p.add(x0, y, x1 - x0 + 1, 1, SB_OUT);
  }
  // línea de cubierta
  for (let x = 10; x < W - 10; x += 5) p.add(x, mid, 2, 1, SB_SUB_H);
  // vela con periscopio
  p.add(19, 1, 9, 5, SB_OUT);
  p.add(20, 2, 7, 3, SB_SUB);
  p.add(20, 2, 7, 1, SB_SUB_L);
  p.add(22, 0, 1, 2, SB_OUT);
  p.add(25, 0, 1, 1, SB_OUT);
  // Periscopio dorado
  p.add(24, 0, 1, 1, SB_PERI);
  // timones
  p.add(W - 6, 5, 2, 1, SB_OUT);
  p.add(W - 6, 11, 2, 1, SB_OUT);
  // remaches
  for (let x = 8; x < W - 10; x += 6) p.add(x, mid + 2, 1, 1, SB_OUT);
  // espuma + burbujas
  p.add(W - 1, mid, 1, 1, 'rgba(233,243,248,0.85)');
  p.add(W - 3, top - 1, 2, 1, 'rgba(200,220,232,0.45)');
  p.add(0, mid - 1, 1, 1, 'rgba(200,220,232,0.45)');
  p.add(1, mid + 2, 1, 1, 'rgba(200,220,232,0.45)');
  return { w: W, h: H, rects: p.rects };
}

export const SPRITES = {
  destructor:   destructor(),
  crucero:      crucero(),
  submarino:    submarino(),
  acorazado:    acorazado(),
  portaaviones: portaaviones(),
};
