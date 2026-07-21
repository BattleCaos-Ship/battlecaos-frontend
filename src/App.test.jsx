import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import App from './App';

// App solo arma el router raíz. Lo que importa cubrir es que la ruta "/" sirva la pantalla
// de login y que cualquier ruta desconocida redirija ahí (evita una pantalla en blanco si
// alguien entra a una URL vieja o mal escrita). Las demás rutas (lobby/game/admin) requieren
// sesión y sockets — se prueban en sus propios archivos, no acá.

// jsdom no implementa matchMedia; LoginPage renderiza PixelBackdrop, que lo usa para
// respetar prefers-reduced-motion. Sin este stub, ErrorBoundary atraparía el TypeError y
// las pruebas verían "Algo salió mal" en vez de la pantalla de login real.
beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

afterEach(cleanup);

describe('App', () => {
  it('en "/" muestra la pantalla de login', () => {
    window.history.pushState({}, '', '/');
    render(<App />);
    expect(screen.getByText('BattleCaos-Ship')).toBeInTheDocument();
  });

  it('una ruta desconocida redirige a "/" (login)', () => {
    window.history.pushState({}, '', '/esto-no-existe');
    render(<App />);
    expect(screen.getByText('BattleCaos-Ship')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });
});
