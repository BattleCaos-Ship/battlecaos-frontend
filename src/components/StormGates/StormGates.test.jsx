import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import StormGates from './StormGates';

// Animación disparada por `trigger` (un id incremental, no un booleano): idle → closing →
// warning → opening → idle otra vez, con tiempos fijos. `porNombre` solo se ve durante el
// aviso central.

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('StormGates', () => {
  it('sin trigger, no pinta nada', () => {
    const { container } = render(<StormGates trigger={0} porNombre="Rival" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('al incrementar el trigger, arranca la animación (compuertas cerrándose) de inmediato', () => {
    const { rerender } = render(<StormGates trigger={0} />);
    rerender(<StormGates trigger={1} />);

    // El overlay ya está montado; el letrero de aviso todavía no (esa es la fase 'warning').
    expect(document.querySelector('[aria-live="assertive"]')).toBeInTheDocument();
    expect(screen.queryByText(/PRECAUCIÓN/)).not.toBeInTheDocument();
  });

  it('tras 620ms aparece el letrero de aviso, con el nombre de quien la lanzó', () => {
    const { rerender } = render(<StormGates trigger={0} porNombre="Almirante" />);
    rerender(<StormGates trigger={1} porNombre="Almirante" />);

    act(() => { vi.advanceTimersByTime(620); });

    expect(screen.getByText(/PRECAUCIÓN/)).toBeInTheDocument();
    expect(screen.getByText(/SE AVECINA UNA TORMENTA/)).toBeInTheDocument();
    expect(screen.getByText('Almirante desató la tormenta')).toBeInTheDocument();
  });

  it('sin porNombre, el letrero se muestra igual pero sin la atribución', () => {
    const { rerender } = render(<StormGates trigger={0} />);
    rerender(<StormGates trigger={1} />);
    act(() => { vi.advanceTimersByTime(620); });

    expect(screen.getByText(/PRECAUCIÓN/)).toBeInTheDocument();
    expect(screen.queryByText(/desató la tormenta/)).not.toBeInTheDocument();
  });

  it('a los 2500ms el letrero se retira (fase opening) pero el overlay sigue', () => {
    const { rerender } = render(<StormGates trigger={0} />);
    rerender(<StormGates trigger={1} />);
    act(() => { vi.advanceTimersByTime(2500); });

    expect(screen.queryByText(/PRECAUCIÓN/)).not.toBeInTheDocument();
    expect(document.querySelector('[aria-live="assertive"]')).toBeInTheDocument();
  });

  it('a los 3300ms toda la animación termina y no queda overlay', () => {
    const { rerender } = render(<StormGates trigger={0} />);
    rerender(<StormGates trigger={1} />);
    act(() => { vi.advanceTimersByTime(3300); });

    expect(document.querySelector('[aria-live="assertive"]')).not.toBeInTheDocument();
  });

  it('un nuevo trigger reinicia la animación aunque la anterior no haya terminado', () => {
    const { rerender } = render(<StormGates trigger={0} porNombre="Uno" />);
    rerender(<StormGates trigger={1} porNombre="Uno" />);
    act(() => { vi.advanceTimersByTime(620); }); // ya en 'warning'
    expect(screen.getByText(/PRECAUCIÓN/)).toBeInTheDocument();

    // Llega una segunda tormenta antes de que la primera termine de abrirse.
    rerender(<StormGates trigger={2} porNombre="Dos" />);
    // Reinicia a 'closing': el letrero desaparece de nuevo hasta los próximos 620ms.
    expect(screen.queryByText(/PRECAUCIÓN/)).not.toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(620); });
    expect(screen.getByText('Dos desató la tormenta')).toBeInTheDocument();
  });
});
