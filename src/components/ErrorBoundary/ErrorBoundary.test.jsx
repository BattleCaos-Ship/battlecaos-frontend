import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

// La red de seguridad de la app: si un componente revienta durante el render, en vez de
// dejar la pantalla en blanco muestra un mensaje y una salida. Vale la pena probarlo porque
// es justo el código que NUNCA se ejecuta en un día normal, y por eso puede pudrirse sin
// que nadie se entere.

function Explota() {
  throw new Error('boom');
}

afterEach(() => vi.restoreAllMocks());

describe('ErrorBoundary', () => {
  it('deja pasar a los hijos cuando no hay error', () => {
    render(<ErrorBoundary><p>todo bien</p></ErrorBoundary>);
    expect(screen.getByText('todo bien')).toBeInTheDocument();
  });

  it('muestra el mensaje de error en vez de una pantalla en blanco', () => {
    // React escribe el error en consola aunque lo capturemos; se silencia para no
    // ensuciar la salida de las pruebas con un fallo que es esperado.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Explota /></ErrorBoundary>);

    expect(screen.getByText('Algo salió mal')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('ofrece una salida para volver al inicio', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // window.location.assign no existe en jsdom; se sustituye para comprobar la navegación.
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign },
      writable: true,
    });

    render(<ErrorBoundary><Explota /></ErrorBoundary>);
    fireEvent.click(screen.getByRole('button', { name: /Volver al inicio/i }));

    expect(assign).toHaveBeenCalledWith('/');
  });
});
