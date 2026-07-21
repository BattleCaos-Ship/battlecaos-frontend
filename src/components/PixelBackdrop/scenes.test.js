import { describe, it, expect } from 'vitest';
import { drawScene, SCENE_W, SCENE_H } from './scenes';

// Las escenas se dibujan por código sobre un canvas. jsdom no implementa el contexto 2D, así
// que se le pasa uno simulado que solo registra las llamadas. No se comprueba el aspecto
// visual —eso no se puede en una prueba unitaria— sino algo que sí importa y que es
// justamente lo que se rompe al editar cientos de líneas de dibujo: que **cada escena se
// dibuje entera sin lanzar**, y que no se salga del lienzo.

function contextoFalso() {
  const llamadas = [];
  const registrar = (nombre) => (...args) => { llamadas.push({ nombre, args }); };
  return {
    llamadas,
    // Degradados: devuelven un objeto con addColorStop, que el código encadena.
    createLinearGradient: () => ({ addColorStop: registrar('addColorStop') }),
    createRadialGradient: () => ({ addColorStop: registrar('addColorStop') }),
    clearRect: registrar('clearRect'),
    fillRect: registrar('fillRect'),
    beginPath: registrar('beginPath'),
    closePath: registrar('closePath'),
    moveTo: registrar('moveTo'),
    lineTo: registrar('lineTo'),
    quadraticCurveTo: registrar('quadraticCurveTo'),
    arc: registrar('arc'),
    ellipse: registrar('ellipse'),
    fill: registrar('fill'),
    stroke: registrar('stroke'),
    clip: registrar('clip'),
    save: registrar('save'),
    restore: registrar('restore'),
    rotate: registrar('rotate'),
    translate: registrar('translate'),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
  };
}

const lienzoFalso = (ctx) => ({ getContext: () => ctx });

const ESCENAS = ['sea', 'warroom', 'workshop'];

describe('drawScene', () => {
  it.each(ESCENAS)('dibuja la escena "%s" sin lanzar', (escena) => {
    const ctx = contextoFalso();
    expect(() => drawScene(lienzoFalso(ctx), escena, 0)).not.toThrow();
    expect(ctx.llamadas.length).toBeGreaterThan(100);
  });

  it('limpia el lienzo antes de pintar', () => {
    // Sin el clearRect, cada frame se acumularía sobre el anterior y el fondo se emborrona.
    const ctx = contextoFalso();
    drawScene(lienzoFalso(ctx), 'sea', 0);
    expect(ctx.llamadas[0].nombre).toBe('clearRect');
  });

  it('cae en una escena por defecto si le dan un nombre desconocido', () => {
    const ctx = contextoFalso();
    expect(() => drawScene(lienzoFalso(ctx), 'no-existe', 0)).not.toThrow();
    expect(ctx.llamadas.length).toBeGreaterThan(100);
  });

  it.each(ESCENAS)('anima la escena "%s": distinto tiempo, distinto dibujo', (escena) => {
    // Si el parámetro `t` no se usara, el fondo estaría congelado. Se comparan dos
    // instantes alejados para que la diferencia no dependa de un redondeo.
    const a = contextoFalso();
    const b = contextoFalso();
    drawScene(lienzoFalso(a), escena, 0);
    drawScene(lienzoFalso(b), escena, 3.7);
    expect(JSON.stringify(a.llamadas)).not.toBe(JSON.stringify(b.llamadas));
  });

  it.each(ESCENAS)('la escena "%s" es determinista para el mismo tiempo', (escena) => {
    // El RNG va sembrado justamente para que la parte estática no "baile" entre frames.
    const a = contextoFalso();
    const b = contextoFalso();
    drawScene(lienzoFalso(a), escena, 1.5);
    drawScene(lienzoFalso(b), escena, 1.5);
    expect(JSON.stringify(a.llamadas)).toBe(JSON.stringify(b.llamadas));
  });

  it('expone las dimensiones del lienzo de baja resolución', () => {
    expect(SCENE_W).toBe(480);
    expect(SCENE_H).toBe(270);
  });

  it('el velo final cubre exactamente todo el lienzo', () => {
    const ctx = contextoFalso();
    drawScene(lienzoFalso(ctx), 'sea', 0);
    const ultimo = ctx.llamadas.filter((l) => l.nombre === 'fillRect').at(-1);
    expect(ultimo.args).toEqual([0, 0, SCENE_W, SCENE_H]);
  });
});
