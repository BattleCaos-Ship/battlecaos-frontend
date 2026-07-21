import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import PixelBackdrop from './PixelBackdrop';
import { SCENE_W, SCENE_H } from './scenes';

// jsdom no implementa el contexto 2D del canvas ni requestAnimationFrame de verdad, así que
// se mockean ambos. El objetivo NO es comprobar píxeles: es comprobar que se monta un canvas
// del tamaño esperado y que el pipeline de dibujo (scenes.js) se ejecuta sin reventar, tanto
// en el modo animado normal como en el modo estático (prefers-reduced-motion).

function fakeCtx() {
  const gradient = { addColorStop: vi.fn() };
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    fillRect: vi.fn(), strokeRect: vi.fn(), clearRect: vi.fn(),
    beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(), bezierCurveTo: vi.fn(), arc: vi.fn(), ellipse: vi.fn(),
    fill: vi.fn(), stroke: vi.fn(), clip: vi.fn(), save: vi.fn(), restore: vi.fn(),
    translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    createLinearGradient: vi.fn(() => gradient),
  };
}

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches,
    media: query,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

let ctx;
let rafCb;

beforeEach(() => {
  ctx = fakeCtx();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  rafCb = null;
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => { rafCb = cb; return 1; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  mockMatchMedia(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PixelBackdrop', () => {
  it('monta un canvas oculto para lectores de pantalla con el tamaño de la escena', () => {
    const { container } = render(<PixelBackdrop scene="workshop" />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute('width', String(SCENE_W));
    expect(canvas).toHaveAttribute('height', String(SCENE_H));
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
  });

  it('en modo animado, programa el primer frame con requestAnimationFrame', () => {
    render(<PixelBackdrop scene="sea" />);
    expect(requestAnimationFrame).toHaveBeenCalled();
    expect(rafCb).toBeInstanceOf(Function);
  });

  it('al ejecutar un frame, dibuja la escena en el canvas sin reventar', () => {
    render(<PixelBackdrop scene="sea" />);
    expect(() => rafCb(40)).not.toThrow();
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, SCENE_W, SCENE_H);
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it('funciona igual con las otras dos escenas (warroom, workshop)', () => {
    const { rerender } = render(<PixelBackdrop scene="warroom" />);
    expect(() => rafCb(40)).not.toThrow();
    expect(ctx.clearRect).toHaveBeenCalled();

    rerender(<PixelBackdrop scene="workshop" />);
    expect(requestAnimationFrame).toHaveBeenCalled();
  });

  it('con prefers-reduced-motion, dibuja una vez de forma estática y no anima', () => {
    mockMatchMedia(true);
    render(<PixelBackdrop scene="workshop" />);

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, SCENE_W, SCENE_H);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('al desmontar, cancela el frame animado pendiente', () => {
    const { unmount } = render(<PixelBackdrop scene="sea" />);
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
