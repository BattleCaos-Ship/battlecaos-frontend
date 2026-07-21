import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

// config.js lee import.meta.env al cargarse, así que para probar los distintos casos hay
// que stubear las env vars ANTES de importar y resetear el módulo entre pruebas (si no,
// vitest reusa la primera evaluación y las variables quedan "pegadas"). Lo importante acá
// es la lógica derivada: los fallbacks de URL y que `googleConfigurado` distinga un
// client_id real de un placeholder ('tu-client-id...') que dejaría el botón de Google roto.

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('config', () => {
  it('sin env vars, usa las URLs por defecto de desarrollo local', async () => {
    vi.stubEnv('VITE_AUTH_URL', undefined);
    vi.stubEnv('VITE_GATEWAY_URL', undefined);
    const { AUTH_URL, GATEWAY_URL } = await import('./config');
    expect(AUTH_URL).toBe('http://localhost:3001');
    expect(GATEWAY_URL).toBe('http://localhost:3000');
  });

  it('con env vars definidas, las usa en vez del fallback', async () => {
    vi.stubEnv('VITE_AUTH_URL', 'https://auth.prod');
    vi.stubEnv('VITE_GATEWAY_URL', 'https://gw.prod');
    const { AUTH_URL, GATEWAY_URL } = await import('./config');
    expect(AUTH_URL).toBe('https://auth.prod');
    expect(GATEWAY_URL).toBe('https://gw.prod');
  });

  it('sin GOOGLE_CLIENT_ID, googleConfigurado es false', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', undefined);
    const { googleConfigurado } = await import('./config');
    expect(googleConfigurado).toBe(false);
  });

  it('con el placeholder "tu-client-id...", googleConfigurado es false', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'tu-client-id-de-ejemplo');
    const { googleConfigurado } = await import('./config');
    expect(googleConfigurado).toBe(false);
  });

  it('con un client_id real, googleConfigurado es true', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '123-real.apps.googleusercontent.com');
    const { googleConfigurado, GOOGLE_CLIENT_ID } = await import('./config');
    expect(googleConfigurado).toBe(true);
    expect(GOOGLE_CLIENT_ID).toBe('123-real.apps.googleusercontent.com');
  });
});
