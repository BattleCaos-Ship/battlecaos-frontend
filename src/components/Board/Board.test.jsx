import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Board from './Board';

// Hay dos elementos con gridTemplateColumns inline: la fila de coordenadas (primera)
// y la rejilla de celdas (última). Las celdas son los hijos directos de la rejilla.
const getGrid = (container) => {
  const grids = container.querySelectorAll('[style*="grid-template-columns"]');
  return grids[grids.length - 1];
};
const getCells = (container) => [...getGrid(container).children];

describe('Board', () => {
  it('renderiza size*size celdas', () => {
    const { container } = render(<Board size={10} />);
    expect(getCells(container).length).toBe(100);
  });

  it('aplica la clase del estado de cada celda', () => {
    const { container } = render(<Board size={2} cells={{ '0,0': 'hit', '1,1': 'miss' }} />);
    const classNames = getCells(container).map((c) => c.className);
    expect(classNames.some((c) => c.includes('hit'))).toBe(true);
    expect(classNames.some((c) => c.includes('miss'))).toBe(true);
  });

  it('preview tiene prioridad sobre cells', () => {
    const { container } = render(
      <Board size={2} cells={{ '0,0': 'ship' }} preview={{ '0,0': 'selected' }} />,
    );
    const first = getCells(container)[0];
    expect(first.className).toContain('selected');
    expect(first.className).not.toContain('ship');
  });

  it('dispara onCellClick solo si es interactivo', () => {
    const onClick = vi.fn();
    const { container, rerender } = render(<Board size={2} onCellClick={onClick} interactive={false} />);
    getCells(container)[0].click();
    expect(onClick).not.toHaveBeenCalled();

    rerender(<Board size={2} onCellClick={onClick} interactive />);
    getCells(container)[0].click();
    expect(onClick).toHaveBeenCalledWith(0, 0);
  });

  it('hundir un barco de 4 celdas dispara explosión en cada celda + wreck', async () => {
    // El acorazado (4 celdas) empieza tocado y luego se hunde completo.
    const hit = { '0,0': 'hit', '1,0': 'hit', '2,0': 'hit', '3,0': 'hit' };
    const sunk = { '0,0': 'sunk', '1,0': 'sunk', '2,0': 'sunk', '3,0': 'sunk' };
    const { container, rerender } = render(<Board size={10} cells={hit} />);
    rerender(<Board size={10} cells={sunk} />);

    // Una ráfaga de hundimiento por celda (4), no solo el wreck en silencio.
    await waitFor(() => {
      const bursts = container.querySelectorAll('[class*="fxBurst_sunk"]');
      expect(bursts.length).toBe(4);
    });

    // El sprite del wreck (acorazado) se dibuja como SVG sobre las celdas.
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('barcos adyacentes hundidos = un wreck por barco (no "solo estrellas")', async () => {
    // Acorazado (4, fila 0) tocando un crucero (3, fila 1): comparten borde.
    // Antes el DFS los fusionaba en tamaño 7 → sin sprite → solo estrellas.
    const mk = (val) => ({
      '0,0': val, '1,0': val, '2,0': val, '3,0': val,
      '0,1': val, '1,1': val, '2,1': val,
    });
    const { container, rerender } = render(<Board size={10} cells={mk('hit')} />);
    rerender(<Board size={10} cells={mk('sunk')} />);
    await waitFor(() => {
      const wrecks = container.querySelectorAll('[class*="wreckOverlay"] svg');
      expect(wrecks.length).toBe(2);
    });
  });
});
