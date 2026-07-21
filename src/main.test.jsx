import { describe, it, expect, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';

// main.jsx monta la app en el DOM en cuanto se importa (sin guardas). Lo único que vale la
// pena verificar acá es que arranca sin explotar cuando existe el <div id="root">: probar
// más (p.ej. contenido real de App) sería redundante con App.test.jsx. El montaje de
// React 18 (createRoot) es asíncrono, así que hay que esperar (waitFor) en vez de leer el
// DOM apenas resuelve el import.

vi.mock('./App', () => ({ default: () => <div>app-montada</div> }));

describe('main', () => {
  it('monta la app en el <div id="root"> sin lanzar errores', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    await act(async () => {
      await expect(import('./main.jsx')).resolves.toBeDefined();
    });
    await waitFor(() => {
      expect(document.getElementById('root').textContent).toBe('app-montada');
    });
  });
});
