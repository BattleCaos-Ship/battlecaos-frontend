// Escenas pixel-art de fondo, ANIMADAS, dibujadas por código en un canvas de baja
// resolución (480×270) que se escala a pantalla completa con `image-rendering: pixelated`.
// Cada frame se redibuja completo con el tiempo `t` (segundos): el RNG sembrado garantiza
// que lo estático no "baile" y solo se mueva lo animado (radar, fogonazos, olas, vapor…).

export const SCENE_W = 480;
export const SCENE_H = 270;

// RNG con semilla fija → la parte estática de la escena es determinista entre frames.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const px = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x | 0, y | 0, w, h); };

// ── Piezas compartidas ───────────────────────────────────────────────────────

function steelWall(c, rng, { base = '#2b3138', y0 = 0, y1 = SCENE_H } = {}) {
  px(c, 0, y0, SCENE_W, y1 - y0, base);
  for (let i = 0; i < 900; i++) {
    const x = rng() * SCENE_W, y = y0 + rng() * (y1 - y0);
    px(c, x, y, 1, 1, rng() < 0.5 ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.03)');
  }
  for (let x = 55; x < SCENE_W; x += 88) {
    px(c, x, y0, 1, y1 - y0, 'rgba(0,0,0,0.35)');
    px(c, x + 1, y0, 1, y1 - y0, 'rgba(255,255,255,0.05)');
    for (let y = y0 + 10; y < y1; y += 22) {
      px(c, x - 3, y, 2, 2, '#454d57');
      px(c, x - 3, y + 1, 2, 1, '#191d22');
    }
  }
  const hy = y0 + Math.round((y1 - y0) * 0.62);
  px(c, 0, hy, SCENE_W, 1, 'rgba(0,0,0,0.3)');
  for (let x = 12; x < SCENE_W; x += 26) px(c, x, hy - 2, 2, 2, '#454d57');
}

function pipe(c, x0, x1, y, { col = '#3a4652', hi = '#55636f' } = {}) {
  px(c, x0, y, x1 - x0, 8, col);
  px(c, x0, y + 1, x1 - x0, 2, hi);
  px(c, x0, y + 7, x1 - x0, 1, 'rgba(0,0,0,0.4)');
  for (let x = x0 + 24; x < x1; x += 68) {
    px(c, x, y - 1, 5, 10, '#2e3843');
    px(c, x + 1, y - 1, 1, 10, hi);
    px(c, x + 1, y - 3, 3, 2, '#232b33');
  }
}

function valve(c, x, y) {
  px(c, x - 1, y - 6, 3, 6, '#2e3843');
  c.strokeStyle = '#8a3d34';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(x + 0.5, y - 8, 4, 0, Math.PI * 2);
  c.stroke();
}

function cable(c, x0, x1, y, sag) {
  c.strokeStyle = '#14171c';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(x0, y);
  c.quadraticCurveTo((x0 + x1) / 2, y + sag, x1, y);
  c.stroke();
}

// Lámpara colgante con halo cálido; `flick` (0..1) modula el brillo (parpadeo).
function lamp(c, x, y, cordFrom = 0, flick = 1) {
  px(c, x, cordFrom, 1, y - cordFrom, '#14171c');
  const g = c.createRadialGradient(x, y + 6, 2, x, y + 6, 46);
  g.addColorStop(0, `rgba(255,196,110,${0.3 * flick})`);
  g.addColorStop(1, 'rgba(255,196,110,0)');
  c.fillStyle = g;
  c.fillRect(x - 46, y - 40, 92, 92);
  px(c, x - 6, y, 13, 2, '#6e5330');
  px(c, x - 4, y - 2, 9, 2, '#8a6a3b');
  px(c, x - 2, y + 2, 5, 3, flick > 0.6 ? '#ffd98a' : '#d9ad60');
  px(c, x - 1, y + 2, 3, 2, flick > 0.6 ? '#fff3cf' : '#e8cf9a');
}

// Monitor CRT con traza; `t` mueve un punto brillante y hace parpadear el LED.
function crtMonitor(c, rng, x, y, w, h, t = 0) {
  px(c, x - 3, y - 3, w + 6, h + 6, '#1d2126');
  px(c, x - 2, y - 2, w + 4, h + 4, '#454d57');
  px(c, x, y, w, h, '#0c1d14');
  for (let yy = y + 1; yy < y + h; yy += 3) px(c, x, yy, w, 1, 'rgba(80,190,120,0.06)');
  c.strokeStyle = '#2e8f5b';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x + 2, y + h * 0.7);
  for (let xx = x + 2; xx < x + w - 2; xx += 4) c.lineTo(xx, y + h * (0.3 + rng() * 0.5));
  c.stroke();
  for (let i = 0; i < 4; i++) px(c, x + 3 + rng() * (w - 6), y + 3 + rng() * (h - 6), 1, 1, '#46d178');
  // punto de barrido recorriendo la traza
  const dx = x + 2 + ((t * 26 + x) % (w - 6));
  px(c, dx, y + h * 0.5 + Math.sin(t * 5 + x) * h * 0.18, 2, 2, '#7dffb0');
  if ((t % 1) < 0.5) px(c, x + w - 5, y + 2, 2, 2, '#c0392b');
}

// Radar con barrido giratorio (`ang` en radianes).
function radar(c, x, y, r, ang = -0.6) {
  px(c, x - r - 3, y - r - 3, r * 2 + 6, r * 2 + 6, '#454d57');
  px(c, x - r - 2, y - r - 2, r * 2 + 4, r * 2 + 4, '#1d2126');
  c.save();
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.clip();
  px(c, x - r, y - r, r * 2, r * 2, '#0c1a12');
  c.strokeStyle = '#1d4a2d';
  for (const rr of [r * 0.33, r * 0.66, r * 0.95]) {
    c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.stroke();
  }
  // estela del barrido (tres cuñas con alpha decreciente)
  for (let i = 0; i < 3; i++) {
    c.fillStyle = `rgba(70,209,120,${0.28 - i * 0.09})`;
    c.beginPath();
    c.moveTo(x, y);
    c.arc(x, y, r, ang - 0.3 - i * 0.28, ang - i * 0.28);
    c.closePath();
    c.fill();
  }
  // blips fijos que "brillan" cuando pasa el barrido
  for (const [ba, br] of [[1.1, 0.55], [3.6, 0.4], [5.2, 0.75]]) {
    const diff = ((ang - ba) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const glow = diff < 1.2 ? 1 - diff / 1.2 : 0;
    c.fillStyle = `rgba(70,209,120,${0.25 + glow * 0.75})`;
    c.fillRect(x + Math.cos(ba) * r * br - 1, y + Math.sin(ba) * r * br - 1, 2, 2);
  }
  c.restore();
}

function gauge(c, x, y, r, angle) {
  c.fillStyle = '#6e5330';
  c.beginPath(); c.arc(x, y, r + 2, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#d8d2c0';
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#3a3a34';
  c.lineWidth = 1;
  for (let a = -2.3; a <= 0.8; a += 0.45) {
    c.beginPath();
    c.moveTo(x + Math.cos(a) * (r - 2), y + Math.sin(a) * (r - 2));
    c.lineTo(x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4));
    c.stroke();
  }
  c.strokeStyle = '#a1281e';
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + Math.cos(angle) * (r - 3), y + Math.sin(angle) * (r - 3));
  c.stroke();
}

// Silueta pixel de acorazado en el horizonte; `flash` enciende el fogonazo del cañón.
function shipSilhouette(c, rng, x, y, len, col, { flash = false } = {}) {
  px(c, x + 2, y, len - 4, 3, col);
  px(c, x, y + 1, len, 2, col);
  px(c, x + len * 0.35, y - 4, len * 0.22, 4, col);
  px(c, x + len * 0.42, y - 7, len * 0.07, 3, col);
  px(c, x + len * 0.44, y - 10, 1, 3, col);
  px(c, x + len * 0.62, y - 3, len * 0.1, 3, col);
  px(c, x + len * 0.78, y - 2, 6, 2, col);
  px(c, x + len * 0.78 + 6, y - 2, 7, 1, col);
  px(c, x + len * 0.15, y - 2, 6, 2, col);
  for (let i = 0; i < 3; i++) px(c, x + len * (0.38 + i * 0.04), y - 3, 1, 1, '#e8b667');
  if (flash) {
    const fx = x + len * 0.78 + 13, fy = y - 2;
    px(c, fx, fy - 2, 4, 5, '#ffd27a');
    px(c, fx + 3, fy - 1, 4, 3, '#ff9a3d');
    px(c, fx - 1, fy, 2, 1, '#fff3cf');
    for (let i = 0; i < 4; i++) px(c, fx - 2 + rng() * 6, y + 4 + i * 2, 2, 1, 'rgba(255,154,61,0.3)');
  }
}

// ── Escena: MAR NOCTURNO (login) ─────────────────────────────────────────────
function drawSea(c, rng, t) {
  const bands = ['#0a0f1c', '#0c1322', '#0e1728', '#101b2e'];
  bands.forEach((col, i) => px(c, 0, i * 38, SCENE_W, 38, col));
  px(c, 0, 152, SCENE_W, 4, '#13203a');

  // estrellas titilando con variación de brillo
  for (let i = 0; i < 120; i++) {
    const sx = rng() * SCENE_W, sy = rng() * 130;
    const bright = rng() < 0.2;
    const pulse = Math.sin(t * (1.5 + rng() * 1.5) + i * 3.1);
    if (pulse > -0.5) {
      const a = 0.3 + Math.max(0, pulse) * 0.7;
      const col = bright ? `rgba(180,200,230,${a})` : `rgba(100,130,170,${a * 0.6})`;
      px(c, sx, sy, bright ? 1 : 1, 1, col);
    }
  }
  // estrella fugaz ocasional
  if ((t * 2) % 12 < 0.15) {
    const sx = (t * 2 * 37) % SCENE_W;
    const sy = 20 + ((t * 2 * 13) % 60);
    px(c, sx, sy, 1, 1, '#fff');
    px(c, sx + 1, sy - 1, 1, 1, 'rgba(200,220,255,0.6)');
    px(c, sx - 1, sy + 1, 1, 1, 'rgba(200,220,255,0.4)');
    // estela
    for (let i = 2; i < 6; i++) {
      px(c, sx - i, sy + i, 1, 1, `rgba(200,220,255,${0.3 - i * 0.05})`);
    }
  }

  // luna llena brillante con halo luminoso y cráteres detallados
  const moonX = 404, moonY = 44;
  const halo = c.createRadialGradient(moonX, moonY, 8, moonX, moonY, 48);
  halo.addColorStop(0, `rgba(220,228,240,${0.32 + 0.05 * Math.sin(t * 0.8)})`);
  halo.addColorStop(1, 'rgba(220,228,240,0)');
  c.fillStyle = halo;
  c.fillRect(moonX - 48, moonY - 48, 96, 96);
  // Disco lunar principal
  c.fillStyle = '#e8edf4';
  c.beginPath(); c.arc(moonX, moonY, 15, 0, Math.PI * 2); c.fill();
  // Sombra de fase lunar (leve cuarto creciente)
  c.fillStyle = '#d0d8e8';
  c.beginPath(); c.arc(moonX + 2, moonY, 13, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#e8edf4';
  c.beginPath(); c.arc(moonX + 1, moonY, 12, 0, Math.PI * 2); c.fill();
  // Cráteres detallados
  c.fillStyle = '#b8c4d4';
  c.beginPath(); c.arc(moonX - 4, moonY - 3, 2.5, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(moonX + 5, moonY + 4, 2, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(moonX - 2, moonY + 7, 1.5, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(moonX + 8, moonY - 5, 1.5, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(moonX + 3, moonY - 7, 1, 0, Math.PI * 2); c.fill();
  // Reflejo de luz en el mar bajo la luna
  const reflect = c.createLinearGradient(moonX - 20, 152, moonX + 20, 162);
  reflect.addColorStop(0, `rgba(200,215,235,${0.10 + 0.04 * Math.sin(t * 0.8)})`);
  reflect.addColorStop(0.5, `rgba(200,215,235,${0.18 + 0.05 * Math.sin(t * 0.8)})`);
  reflect.addColorStop(1, 'rgba(200,215,235,0)');
  c.fillStyle = reflect;
  c.fillRect(moonX - 20, 152, 40, 20);

  // nubes que derivan lentamente
  const cloudDefs = [[36, 70], [58, 90], [24, 56], [96, 60]];
  cloudDefs.forEach(([cy2, cw], i) => {
    const cx2 = ((i * 123 + t * (3 + i)) % (SCENE_W + 140)) - 70;
    px(c, cx2, cy2, cw, 4, 'rgba(30,42,62,0.85)');
    px(c, cx2 + 8, cy2 - 3, cw - 22, 3, 'rgba(38,52,74,0.8)');
    px(c, cx2 + 14, cy2 + 4, cw - 30, 2, 'rgba(24,34,52,0.9)');
  });

  // gaviotas aleteando
  [[150, 70], [170, 62], [255, 88]].forEach(([gx2, gy2], i) => {
    const bob = Math.sin(t * 2.2 + i * 2) * 2;
    const wing = Math.sin(t * 7 + i) > 0 ? -1 : 0;
    px(c, gx2, gy2 + bob, 2, 1, '#7e8ba2');
    px(c, gx2 + 3, gy2 + bob, 2, 1, '#7e8ba2');
    px(c, gx2 + 2, gy2 + bob + wing, 1, 1, '#7e8ba2');
  });

  // resplandores de batalla pulsando
  [[60, 0], [300, 1.4], [430, 2.6]].forEach(([gx, ph]) => {
    const a = 0.16 + 0.08 * Math.sin(t * 2.4 + ph);
    const g = c.createRadialGradient(gx, 152, 2, gx, 152, 40);
    g.addColorStop(0, `rgba(255,140,60,${a})`);
    g.addColorStop(1, 'rgba(255,140,60,0)');
    c.fillStyle = g;
    c.fillRect(gx - 40, 112, 80, 60);
  });

  // mar con olas en movimiento
  px(c, 0, 156, SCENE_W, SCENE_H - 156, '#0b1a2e');
  px(c, 0, 200, SCENE_W, 40, '#0a1626');
  px(c, 0, 240, SCENE_W, 30, '#081220');
  for (let i = 0; i < 130; i++) {
    const baseX = rng() * SCENE_W;
    const y = 158 + rng() * 105;
    const speed = y < 200 ? 9 : 5;
    const wx = (baseX + t * speed) % SCENE_W;
    px(c, wx, y, 3 + rng() * 6, 1, y < 200 ? 'rgba(90,130,170,0.14)' : 'rgba(70,105,140,0.10)');
  }

  // flota en tres planos, disparando por turnos
  shipSilhouette(c, rng, 10, 150, 90, '#171f2b');
  shipSilhouette(c, rng, 350, 149, 80, '#171f2b', { flash: (t % 3.1) < 0.22 });
  shipSilhouette(c, rng, 40, 190, 150, '#1e2836', { flash: ((t + 1.2) % 2.6) < 0.22 });
  shipSilhouette(c, rng, 320, 205, 140, '#232e3e');
  shipSilhouette(c, rng, 150, 238, 190, '#28344a', { flash: ((t + 2) % 3.4) < 0.25 });

  // trazadoras: proyectil recorriendo el arco + estela punteada
  const arcs = [
    [95, 185, 250, 90, 360, 152, 0],
    [230, 240, 320, 130, 445, 205, 0.33],
    [430, 205, 300, 120, 120, 150, 0.66],
  ];
  for (const [ax, ay, cxq, cyq, bx, by, off] of arcs) {
    const bez = (u) => {
      const v = 1 - u;
      return [v * v * ax + 2 * v * u * cxq + u * u * bx, v * v * ay + 2 * v * u * cyq + u * u * by];
    };
    // estela tenue del recorrido
    for (let u = 0.05; u < 1; u += 0.09) {
      const [xx, yy] = bez(u);
      px(c, xx, yy, 1, 1, 'rgba(255,176,102,0.18)');
    }
    // proyectil brillante
    const u = (t * 0.4 + off) % 1;
    const [xx, yy] = bez(u);
    px(c, xx - 1, yy - 1, 3, 3, '#ffd27a');
    const [tx, ty] = bez(Math.max(0, u - 0.05));
    px(c, tx, ty, 2, 2, 'rgba(255,154,61,0.6)');
  }

  // cadenas colgando (marco del panel)
  for (const chx of [150, 330]) {
    for (let y = 0; y < 46; y += 6) {
      px(c, chx, y, 2, 4, '#3a4149');
      px(c, chx - 1, y + 3, 4, 2, '#2a3037');
    }
  }
}

// ── Escena: SALA DE GUERRA (lobby) ───────────────────────────────────────────
function drawWarroom(c, rng, t) {
  steelWall(c, rng, { base: '#272d34' });
  pipe(c, 0, SCENE_W, 14);
  valve(c, 120, 14); valve(c, 340, 14);
  cable(c, 0, 130, 26, 22);
  cable(c, 130, 300, 26, 30);
  cable(c, 300, 480, 26, 18);

  // mesa de mapa central
  const mx = 130, my = 66, mw = 220, mh = 130;
  px(c, mx - 6, my - 6, mw + 12, mh + 12, '#5b4426');
  px(c, mx - 3, my - 3, mw + 6, mh + 6, '#8a6a3b');
  px(c, mx, my, mw, mh, '#143a41');
  for (let x = mx; x <= mx + mw; x += 14) px(c, x, my, 1, mh, '#1d4f57');
  for (let y = my; y <= my + mh; y += 14) px(c, mx, y, mw, 1, '#1d4f57');
  c.fillStyle = '#1c5747';
  for (const [bx, by, bw, bh] of [[mx + 18, my + 14, 40, 22], [mx + 120, my + 60, 58, 34], [mx + 60, my + 96, 30, 18]]) {
    c.beginPath();
    c.ellipse(bx + bw / 2, by + bh / 2, bw / 2, bh / 2, 0.4, 0, Math.PI * 2);
    c.fill();
  }
  // ruta punteada "marchando"
  const phase = Math.floor(t * 6);
  for (let s = 0; s < 18; s++) {
    if ((s + phase) % 3 !== 0) continue;
    const u = s / 18;
    px(c, mx + 30 + u * 150, my + 30 + Math.sin(u * 5) * 14, 2, 1, 'rgba(215,230,225,0.75)');
  }
  // fichas de barcos con balanceo sutil
  [[mx + 40, my + 40], [mx + 100, my + 26], [mx + 150, my + 80], [mx + 70, my + 70], [mx + 180, my + 40]].forEach(([sx, sy], i) => {
    const bob = Math.round(Math.sin(t * 1.6 + i * 1.3) * 1);
    px(c, sx, sy + bob, 5, 2, '#4e5a64');
    px(c, sx + 1, sy - 1 + bob, 2, 1, '#4e5a64');
    px(c, sx - 1, sy + 3 + bob, 7, 1, 'rgba(0,0,0,0.3)');
  });
  for (const [rx, ry] of [[mx + 55, my + 20], [mx + 130, my + 50], [mx + 90, my + 90]]) {
    px(c, rx, ry - 3, 1, 3, '#8a3d34');
    px(c, rx, ry - 4, 2, 2, '#c0392b');
  }

  // monitores + radares girando
  crtMonitor(c, rng, 18, 70, 64, 48, t);
  crtMonitor(c, rng, 398, 64, 62, 44, t + 3);
  radar(c, 429, 160, 22, t * 1.3);
  radar(c, 52, 168, 16, -t * 1.7);

  // reloj de pared andando
  c.fillStyle = '#6e5330';
  c.beginPath(); c.arc(30, 44, 12, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#d8d2c0';
  c.beginPath(); c.arc(30, 44, 10, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#3a3a34';
  c.lineWidth = 1;
  for (let a = 0; a < 6.28; a += Math.PI / 6) {
    c.beginPath();
    c.moveTo(30 + Math.cos(a) * 8, 44 + Math.sin(a) * 8);
    c.lineTo(30 + Math.cos(a) * 9, 44 + Math.sin(a) * 9);
    c.stroke();
  }
  const secAng = -Math.PI / 2 + (t % 60) * (Math.PI / 30) * 4; // segundero ×4 (visible)
  const minAng = -Math.PI / 2 + t * 0.05;
  c.beginPath(); c.moveTo(30, 44); c.lineTo(30 + Math.cos(minAng) * 5, 44 + Math.sin(minAng) * 5); c.stroke();
  c.strokeStyle = '#a1281e';
  c.beginPath(); c.moveTo(30, 44); c.lineTo(30 + Math.cos(secAng) * 7, 44 + Math.sin(secAng) * 7); c.stroke();

  // cartas fijadas con chinchetas
  for (const [pxr, pyr, pw2, ph2, rot] of [[368, 92, 22, 28, -0.06], [372, 128, 20, 24, 0.08]]) {
    c.save();
    c.translate(pxr + pw2 / 2, pyr + ph2 / 2);
    c.rotate(rot);
    px(c, -pw2 / 2, -ph2 / 2, pw2, ph2, '#cfc4a4');
    px(c, -pw2 / 2 + 2, -ph2 / 2 + 3, pw2 - 4, 1, '#8a7d5c');
    px(c, -pw2 / 2 + 2, -ph2 / 2 + 7, pw2 - 8, 1, '#8a7d5c');
    c.strokeStyle = '#6a5f42';
    c.beginPath(); c.moveTo(-6, 2); c.quadraticCurveTo(0, -3, 7, 5); c.stroke();
    px(c, -1, -ph2 / 2 - 1, 2, 2, '#c0392b');
    c.restore();
  }

  // lámparas con parpadeo ocasional
  const flick1 = Math.sin(t * 13.7) > 0.97 ? 0.55 : 1;
  const flick2 = Math.sin(t * 11.3 + 2) > 0.97 ? 0.55 : 1;
  lamp(c, 100, 34, 0, flick1);
  lamp(c, 384, 30, 0, flick2);

  // escritorio inferior
  px(c, 0, 226, SCENE_W, 44, '#1a1f26');
  px(c, 0, 226, SCENE_W, 2, '#3a424b');
  for (let x = 20; x < SCENE_W; x += 60) {
    px(c, x, 236, 40, 24, '#22282f');
    px(c, x + 16, 246, 8, 2, '#454d57');
  }
  // taza de café con vapor subiendo
  px(c, 300, 232, 8, 7, '#a1493f');
  px(c, 308, 234, 2, 3, '#a1493f');
  px(c, 301, 233, 6, 1, '#3b2318');
  for (let i = 0; i < 3; i++) {
    const rise = (t * 9 + i * 8) % 22;
    const sway = Math.sin(t * 3 + i * 2) * 2;
    px(c, 302 + i * 2 + sway, 230 - rise, 1, 3, `rgba(220,220,220,${0.3 * (1 - rise / 22)})`);
  }
  // portapapeles
  px(c, 150, 231, 12, 9, '#5b4426');
  px(c, 151, 232, 10, 7, '#cfc4a4');
  px(c, 152, 234, 8, 1, '#8a7d5c');
  px(c, 152, 236, 6, 1, '#8a7d5c');
}

// ── Escena: TALLER NAVAL (juego / resultado) ─────────────────────────────────
function drawWorkshop(c, rng, t) {
  steelWall(c, rng, { base: '#31363c' });
  for (let i = 0; i < 26; i++) {
    const x = rng() * SCENE_W, y = rng() * SCENE_H, w = 4 + rng() * 16, h = 2 + rng() * 8;
    px(c, x, y, w, h, i % 2 ? 'rgba(90,64,40,0.18)' : 'rgba(74,52,32,0.22)');
  }
  pipe(c, 0, SCENE_W, 10);
  valve(c, 210, 10);
  px(c, 452, 10, 8, 190, '#3a4652');
  px(c, 453, 10, 2, 190, '#55636f');
  px(c, 450, 88, 12, 6, '#2e3843');
  cable(c, 40, 200, 22, 26);
  cable(c, 200, 420, 22, 34);

  // vapor de la válvula subiendo en bocanadas
  for (let i = 0; i < 3; i++) {
    const rise = (t * 7 + i * 6) % 16;
    const o = 0.3 * (1 - rise / 16);
    px(c, 212 + i * 3 + Math.sin(t * 2 + i) * 2, 4 - Math.min(rise, 4) + (rise > 4 ? 0 : 0), 3, 2, `rgba(210,218,224,${o})`);
    px(c, 214 + i * 3, Math.max(0, 2 - rise * 0.4), 2, 2, `rgba(210,218,224,${o * 0.7})`);
  }

  // bombillas cálidas balanceándose suavemente
  [[80, 40, 0], [215, 58, 1.7], [300, 34, 3.1], [415, 48, 4.4]].forEach(([lx, ly, ph]) => {
    const sway = Math.sin(t * 0.9 + ph) * 3;
    const flick = Math.sin(t * 12.3 + ph * 5) > 0.965 ? 0.5 : 1;
    lamp(c, lx + sway, ly, 18, flick);
  });

  // ojo de buey con mar tormentoso y lluvia cayendo
  const ox = 52, oy = 130;
  c.fillStyle = '#6e5330';
  c.beginPath(); c.arc(ox, oy, 26, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#8a6a3b';
  c.beginPath(); c.arc(ox, oy, 23, 0, Math.PI * 2); c.fill();
  c.save();
  c.beginPath(); c.arc(ox, oy, 19, 0, Math.PI * 2); c.clip();
  px(c, ox - 20, oy - 20, 40, 22, '#18222e');
  px(c, ox - 20, oy + 2, 40, 18, '#0d1826');
  // olas desplazándose
  const w1 = (t * 7) % 40;
  px(c, ox - 14 + w1 - 40, oy + 1, 9, 1, '#3d5a74');
  px(c, ox - 14 + w1, oy + 1, 9, 1, '#3d5a74');
  const w2 = (t * 4.5) % 40;
  px(c, ox + 2 - w2, oy + 4, 8, 1, '#2c455c');
  px(c, ox + 2 - w2 + 40, oy + 4, 8, 1, '#2c455c');
  // barco lejano cabeceando
  px(c, ox - 8, oy - 8 + Math.round(Math.sin(t * 1.4) * 1), 4, 2, '#232f3d');
  // relámpago ocasional
  if ((t % 7) < 0.14) px(c, ox - 20, oy - 20, 40, 40, 'rgba(190,210,235,0.25)');
  // lluvia cayendo
  for (let i = 0; i < 10; i++) {
    const fall = (t * 55 + i * 13) % 38;
    px(c, ox - 18 + ((i * 37) % 36), oy - 19 + fall, 1, 3, 'rgba(160,190,215,0.3)');
  }
  c.restore();
  for (let a = 0; a < 6.28; a += 1.05) px(c, ox + Math.cos(a) * 24 - 1, oy + Math.sin(a) * 24 - 1, 2, 2, '#454d57');

  // manómetros con agujas vibrando
  gauge(c, 385, 120, 11, -1.1 + Math.sin(t * 2.2) * 0.07);
  gauge(c, 413, 118, 9, 0.4 + Math.sin(t * 3.1 + 1) * 0.05);
  gauge(c, 438, 124, 10, -0.3 + Math.sin(t * 1.7 + 2) * 0.08);

  // banderas náuticas ondeando
  c.strokeStyle = '#14171c';
  c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(330, 60); c.quadraticCurveTo(400, 78, 470, 64); c.stroke();
  const flagCols = ['#a1493f', '#3c6e9e', '#d9c37e', '#3e7a54', '#c07840'];
  for (let i = 0; i < 5; i++) {
    const u = 0.12 + i * 0.18;
    const v = 1 - u;
    const fx = v * v * 330 + 2 * v * u * 400 + u * u * 470;
    const fy = v * v * 60 + 2 * v * u * 78 + u * u * 64;
    const wave = Math.round(Math.sin(t * 4 + i * 1.4) * 1.4);
    px(c, fx, fy, 7, 6, flagCols[i]);
    px(c, fx + 5, fy + 1 + wave, 3, 4, flagCols[i]);
    px(c, fx, fy + 6, 7, 1, 'rgba(0,0,0,0.3)');
  }

  // tablero de herramientas
  px(c, 18, 60, 70, 40, '#3a3026');
  px(c, 20, 62, 66, 36, '#4a3d2e');
  px(c, 28, 68, 3, 22, '#6f7880');
  px(c, 26, 66, 7, 4, '#6f7880');
  px(c, 28, 67, 3, 2, '#4a3d2e');
  px(c, 44, 68, 3, 22, '#7a5b34');
  px(c, 40, 66, 11, 5, '#5d6870');
  px(c, 60, 70, 2, 14, '#5d6870');
  px(c, 59, 84, 4, 6, '#a1493f');
  px(c, 74, 66, 2, 3, '#20262d');
  px(c, 74, 80, 2, 3, '#20262d');

  // timón
  const wx = 430, wy = 236, wr = 26;
  c.strokeStyle = '#5b3a1e';
  c.lineWidth = 5;
  c.beginPath(); c.arc(wx, wy, wr, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 2.5;
  for (let a = 0; a < 6.28; a += Math.PI / 4) {
    c.beginPath();
    c.moveTo(wx + Math.cos(a) * (wr + 7), wy + Math.sin(a) * (wr + 7));
    c.lineTo(wx, wy);
    c.stroke();
  }
  c.fillStyle = '#6e4a26';
  c.beginPath(); c.arc(wx, wy, 6, 0, Math.PI * 2); c.fill();

  // banco de trabajo con cajas y cuerda
  px(c, 0, 244, SCENE_W, 26, '#20262d');
  px(c, 0, 244, SCENE_W, 2, '#3d454e');
  for (const [bx2, bw2] of [[14, 40], [58, 34]]) {
    px(c, bx2, 220, bw2, 24, '#4a3d2e');
    px(c, bx2, 220, bw2, 2, '#5d4d3a');
    px(c, bx2, 231, bw2, 1, '#332a20');
    px(c, bx2 + 2, 220, 1, 24, '#332a20');
    px(c, bx2 + bw2 - 3, 220, 1, 24, '#332a20');
    px(c, bx2 + 8, 224, bw2 - 16, 4, '#2b241b');
    px(c, bx2 + 10, 225, 4, 2, '#8a7d5c');
    px(c, bx2 + 16, 225, 4, 2, '#8a7d5c');
  }
  c.strokeStyle = '#7a6a4a';
  c.lineWidth = 2;
  for (const r2 of [5, 8]) {
    c.beginPath(); c.arc(116, 234, r2, 0, Math.PI * 2); c.stroke();
  }
}

// ── Render principal ─────────────────────────────────────────────────────────
export function drawScene(canvas, scene, t = 0) {
  const c = canvas.getContext('2d');
  const rng = makeRng(scene === 'sea' ? 7 : scene === 'warroom' ? 21 : 42);
  c.clearRect(0, 0, SCENE_W, SCENE_H);
  if (scene === 'sea') drawSea(c, rng, t);
  else if (scene === 'warroom') drawWarroom(c, rng, t);
  else drawWorkshop(c, rng, t);
  // velo oscuro sutil: la UI tiene sus propios paneles opacos, el fondo debe verse
  px(c, 0, 0, SCENE_W, SCENE_H, 'rgba(6,10,16,0.18)');
}
