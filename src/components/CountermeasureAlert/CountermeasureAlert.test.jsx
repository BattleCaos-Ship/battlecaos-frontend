import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import CountermeasureAlert from './CountermeasureAlert';

// Ventana de contramedida: 5s (o lo que diga el backend) para anular el poder rival antes de
// que expire sola. Cubrimos el ciclo completo: aparece con el evento, cuenta hacia abajo,
// desaparece sola al agotarse y desaparece también al reaccionar (emitiendo el evento correcto).

function fakeSocket() {
  const handlers = {};
  return {
    on: vi.fn((evt, cb) => { handlers[evt] = cb; }),
    off: vi.fn((evt) => { delete handlers[evt]; }),
    emit: vi.fn(),
    fire: (evt, payload) => act(() => { handlers[evt]?.(payload); }),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('CountermeasureAlert', () => {
  it('no muestra nada mientras no hay ventana de contramedida activa', () => {
    const socket = fakeSocket();
    const { container } = render(<CountermeasureAlert socket={socket} codigo="P1" energia={5} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sin socket, no se suscribe a nada y no revienta', () => {
    const { container } = render(<CountermeasureAlert socket={null} codigo="P1" energia={5} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('al recibir el evento, aparece con el nombre del poder y la cuenta regresiva', () => {
    const socket = fakeSocket();
    render(<CountermeasureAlert socket={socket} codigo="P1" energia={5} />);
    expect(socket.on).toHaveBeenCalledWith('poder:contramedida-disponible', expect.any(Function));

    socket.fire('poder:contramedida-disponible', { powerType: 'bombardeo', remaining: 5000 });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Bombardeo/)).toBeInTheDocument();
    expect(screen.getByText('5.0s')).toBeInTheDocument();
  });

  it('el sonar se muestra con su propio nombre', () => {
    const socket = fakeSocket();
    render(<CountermeasureAlert socket={socket} codigo="P1" energia={5} />);
    socket.fire('poder:contramedida-disponible', { powerType: 'sonar', remaining: 5000 });
    expect(screen.getByText(/Sonar/)).toBeInTheDocument();
  });

  it('sin remaining explícito, usa 5s por defecto', () => {
    const socket = fakeSocket();
    render(<CountermeasureAlert socket={socket} codigo="P1" energia={5} />);
    socket.fire('poder:contramedida-disponible', { powerType: 'bombardeo' });
    expect(screen.getByText('5.0s')).toBeInTheDocument();
  });

  it('la cuenta regresiva baja con el tiempo', () => {
    const socket = fakeSocket();
    render(<CountermeasureAlert socket={socket} codigo="P1" energia={5} />);
    socket.fire('poder:contramedida-disponible', { powerType: 'bombardeo', remaining: 5000 });

    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText('3.0s')).toBeInTheDocument();
    expect(screen.queryByText('5.0s')).not.toBeInTheDocument();
  });

  it('expira sola cuando se acaba el tiempo, sin intervención del jugador', () => {
    const socket = fakeSocket();
    render(<CountermeasureAlert socket={socket} codigo="P1" energia={5} />);
    socket.fire('poder:contramedida-disponible', { powerType: 'bombardeo', remaining: 5000 });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(5100); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('con energía suficiente, el botón de anular está habilitado y emite el evento al pulsarlo', () => {
    const socket = fakeSocket();
    render(<CountermeasureAlert socket={socket} codigo="P1" energia={5} />);
    socket.fire('poder:contramedida-disponible', { powerType: 'bombardeo', remaining: 5000 });

    const btn = screen.getByRole('button', { name: /Anular/ });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);

    expect(socket.emit).toHaveBeenCalledWith('contramedida:activar', { codigo: 'P1' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sin energía suficiente, el botón se deshabilita y se explica cuánta falta', () => {
    const socket = fakeSocket();
    render(<CountermeasureAlert socket={socket} codigo="P1" energia={1} />);
    socket.fire('poder:contramedida-disponible', { powerType: 'bombardeo', remaining: 5000 });

    expect(screen.getByRole('button', { name: /Anular/ })).toBeDisabled();
    expect(screen.getByText(/Necesitas 3E \(tienes 1E\)/)).toBeInTheDocument();
  });

  it('al desmontar, se desuscribe del socket', () => {
    const socket = fakeSocket();
    const { unmount } = render(<CountermeasureAlert socket={socket} codigo="P1" energia={5} />);
    unmount();
    expect(socket.off).toHaveBeenCalledWith('poder:contramedida-disponible', expect.any(Function));
  });
});
