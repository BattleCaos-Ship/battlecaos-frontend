import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ShipPlacer from './ShipPlacer';

// Colocación de flota (fase COLOCACION): 5 barcos exactos (Frontend_idea.md §2.3), clic para
// colocar en la celda bajo el cursor, R/←→ para rotar, evita solapamientos y fuera de tablero
// localmente (el backend es quien valida de verdad), y solo deja confirmar con la flota
// completa, con el payload exacto { id, size, x, y, horizontal }.

const celda = (x, y) => screen.getByRole('button', { name: `Celda ${x},${y}` });
const girar = () => screen.getByRole('button', { name: /Girar/ });
const confirmar = () => screen.getByRole('button', { name: 'Confirmar flota' });
const reiniciar = () => screen.getByRole('button', { name: 'Reiniciar' });

describe('ShipPlacer', () => {
  it('arranca pidiendo el primer barco de la flota, con confirmar y reiniciar deshabilitados', () => {
    render(<ShipPlacer onConfirm={vi.fn()} />);
    expect(screen.getByText(/Coloca:/)).toHaveTextContent('Coloca: Portaaviones (5 celdas)');
    expect(confirmar()).toBeDisabled();
    expect(reiniciar()).toBeDisabled();
    // Toda la flota aparece listada, pendiente.
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveAttribute('data-state', 'current');
    expect(items[1]).toHaveAttribute('data-state', 'pending');
  });

  it('notifica el preview vacío al montar, antes de colocar nada', () => {
    const onPreview = vi.fn();
    render(<ShipPlacer onConfirm={vi.fn()} onPreview={onPreview} />);
    expect(onPreview).toHaveBeenCalledWith([]);
  });

  it('clic en una celda coloca el barco actual y avanza al siguiente', () => {
    const onPreview = vi.fn();
    render(<ShipPlacer onConfirm={vi.fn()} onPreview={onPreview} />);
    fireEvent.click(celda(0, 0));

    expect(screen.getByText(/Coloca:/)).toHaveTextContent('Coloca: Acorazado (4 celdas)');
    expect(onPreview).toHaveBeenCalledWith([
      { id: 'portaaviones', size: 5, x: 0, y: 0, horizontal: true },
    ]);
    expect(reiniciar()).toBeEnabled();
  });

  it('el botón Girar alterna la orientación mostrada', () => {
    render(<ShipPlacer onConfirm={vi.fn()} />);
    expect(girar()).toHaveTextContent('Girar (Horizontal)');
    fireEvent.click(girar());
    expect(girar()).toHaveTextContent('Girar (Vertical)');
    fireEvent.click(girar());
    expect(girar()).toHaveTextContent('Girar (Horizontal)');
  });

  it('las teclas R y flechas también rotan la orientación', () => {
    render(<ShipPlacer onConfirm={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'r' });
    expect(girar()).toHaveTextContent('Girar (Vertical)');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(girar()).toHaveTextContent('Girar (Horizontal)');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(girar()).toHaveTextContent('Girar (Vertical)');
  });

  it('coloca un barco vertical cuando se rota antes de hacer clic', () => {
    const onConfirm = vi.fn();
    render(<ShipPlacer onConfirm={onConfirm} />);
    fireEvent.click(girar());
    fireEvent.click(celda(0, 0)); // portaaviones vertical: (0,0)-(0,4)

    // Completar el resto horizontal en filas libres para poder confirmar y leer el payload.
    fireEvent.click(girar()); // volver a horizontal
    fireEvent.click(celda(1, 0));
    fireEvent.click(celda(1, 1));
    fireEvent.click(celda(1, 2));
    fireEvent.click(celda(1, 3));
    fireEvent.click(confirmar());

    expect(onConfirm).toHaveBeenCalledWith([
      { id: 'portaaviones', size: 5, x: 0, y: 0, horizontal: false },
      { id: 'acorazado', size: 4, x: 1, y: 0, horizontal: true },
      { id: 'crucero', size: 3, x: 1, y: 1, horizontal: true },
      { id: 'submarino', size: 3, x: 1, y: 2, horizontal: true },
      { id: 'destructor', size: 2, x: 1, y: 3, horizontal: true },
    ]);
  });

  it('rechaza colocar un barco que se saldría del tablero', () => {
    render(<ShipPlacer onConfirm={vi.fn()} />);
    // Portaaviones (5) horizontal desde x=8 en un tablero de 10 se sale (8..12).
    fireEvent.click(celda(8, 0));
    expect(screen.getByText(/Coloca:/)).toHaveTextContent('Coloca: Portaaviones (5 celdas)');
    expect(reiniciar()).toBeDisabled();
  });

  it('rechaza colocar un barco que se solapa con uno ya puesto', () => {
    render(<ShipPlacer onConfirm={vi.fn()} />);
    fireEvent.click(celda(0, 0)); // portaaviones: (0,0)-(4,0)
    expect(screen.getByText(/Coloca:/)).toHaveTextContent('Acorazado');

    fireEvent.click(celda(2, 0)); // se solapa con el portaaviones en esa misma fila
    expect(screen.getByText(/Coloca:/)).toHaveTextContent('Acorazado'); // no avanzó

    fireEvent.click(celda(0, 1)); // fila libre: sí se coloca
    expect(screen.getByText(/Coloca:/)).toHaveTextContent('Crucero');
  });

  it('rechaza colocar sobre celdas ocupadas por el compañero de equipo (2v2)', () => {
    const teammateShips = [{ id: 'destructor', size: 2, x: 0, y: 0, horizontal: true }];
    render(<ShipPlacer onConfirm={vi.fn()} teammateShips={teammateShips} />);
    expect(screen.getByText(/Los barcos de tu compañero/)).toBeInTheDocument();

    fireEvent.click(celda(0, 0)); // se solapa con el barco del compañero en (0,0)-(1,0)
    expect(screen.getByText(/Coloca:/)).toHaveTextContent('Portaaviones'); // no avanzó

    fireEvent.click(celda(0, 5)); // celda libre
    expect(screen.getByText(/Coloca:/)).toHaveTextContent('Acorazado');
  });

  it('reiniciar borra todo lo colocado y vuelve a pedir el primer barco', () => {
    const onPreview = vi.fn();
    render(<ShipPlacer onConfirm={vi.fn()} onPreview={onPreview} />);
    fireEvent.click(celda(0, 0));
    fireEvent.click(reiniciar());

    expect(screen.getByText(/Coloca:/)).toHaveTextContent('Portaaviones');
    expect(reiniciar()).toBeDisabled();
    expect(onPreview).toHaveBeenLastCalledWith([]);
  });

  it('con la flota completa, habilita confirmar y envía el payload exacto al backend', () => {
    const onConfirm = vi.fn();
    render(<ShipPlacer onConfirm={onConfirm} />);
    fireEvent.click(celda(0, 0)); // portaaviones (5) fila 0
    fireEvent.click(celda(0, 1)); // acorazado (4) fila 1
    fireEvent.click(celda(0, 2)); // crucero (3) fila 2
    fireEvent.click(celda(0, 3)); // submarino (3) fila 3
    fireEvent.click(celda(0, 4)); // destructor (2) fila 4

    expect(screen.getByText('Flota completa. Confírmala para empezar.')).toBeInTheDocument();
    expect(confirmar()).toBeEnabled();

    fireEvent.click(confirmar());
    expect(onConfirm).toHaveBeenCalledWith([
      { id: 'portaaviones', size: 5, x: 0, y: 0, horizontal: true },
      { id: 'acorazado', size: 4, x: 0, y: 1, horizontal: true },
      { id: 'crucero', size: 3, x: 0, y: 2, horizontal: true },
      { id: 'submarino', size: 3, x: 0, y: 3, horizontal: true },
      { id: 'destructor', size: 2, x: 0, y: 4, horizontal: true },
    ]);

    const items = screen.getAllByRole('listitem');
    expect(items.every((it) => it.getAttribute('data-state') === 'done')).toBe(true);
  });

  it('una vez completa la flota, el tablero deja de ser interactivo', () => {
    render(<ShipPlacer onConfirm={vi.fn()} />);
    fireEvent.click(celda(0, 0));
    fireEvent.click(celda(0, 1));
    fireEvent.click(celda(0, 2));
    fireEvent.click(celda(0, 3));
    fireEvent.click(celda(0, 4));

    // Sin `interactive`, Board deja de exponer las celdas como botones con aria-label.
    expect(screen.queryByRole('button', { name: /^Celda/ })).not.toBeInTheDocument();
  });
});
