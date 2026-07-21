import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiError, postJson, getJson } from './client';

// client.js es el único punto que toca `fetch` en toda la app: si normaliza mal un error,
// CADA pantalla que llama a la API recibe un ApiError con el código equivocado. Lo crítico
// acá es distinguir "el backend respondió con un error de negocio" (usa `data.error`) de
// "el fetch ni siquiera pudo conectar" (siempre 'sin_conexion'), porque la UI muestra
// mensajes distintos para cada caso.

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

function respuestaOk(data) {
  return { ok: true, status: 200, json: () => Promise.resolve(data) };
}

function respuestaError(status, data) {
  return { ok: false, status, json: () => Promise.resolve(data) };
}

describe('ApiError', () => {
  it('guarda el código de negocio y el status HTTP', () => {
    const err = new ApiError('email_en_uso', 409);
    expect(err.name).toBe('ApiError');
    expect(err.codigo).toBe('email_en_uso');
    expect(err.status).toBe(409);
    expect(err.message).toBe('email_en_uso');
  });

  it('status por defecto es 0 (ni siquiera hubo respuesta)', () => {
    const err = new ApiError('sin_conexion');
    expect(err.status).toBe(0);
  });
});

describe('postJson', () => {
  it('envía POST con headers JSON y el body serializado', async () => {
    fetch.mockResolvedValueOnce(respuestaOk({ token: 'abc' }));
    const data = await postJson('http://x/auth/login', { email: 'a@b.com' });
    expect(fetch).toHaveBeenCalledWith('http://x/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com' }),
    });
    expect(data).toEqual({ token: 'abc' });
  });

  it('agrega Authorization Bearer solo cuando se pasa un token', async () => {
    fetch.mockResolvedValueOnce(respuestaOk({ ok: true }));
    await postJson('http://x/auth/apodo', { apodo: 'Ana' }, { token: 'jwt-123' });
    expect(fetch).toHaveBeenCalledWith('http://x/auth/apodo', expect.objectContaining({
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-123' },
    }));
  });

  it('sin token, no agrega el header Authorization', async () => {
    fetch.mockResolvedValueOnce(respuestaOk({ ok: true }));
    await postJson('http://x/auth/login', {});
    const [, opts] = fetch.mock.calls[0];
    expect(opts.headers).not.toHaveProperty('Authorization');
  });

  it('si fetch rechaza (red caída), lanza ApiError sin_conexion', async () => {
    fetch.mockRejectedValueOnce(new TypeError('failed to fetch'));
    await expect(postJson('http://x/auth/login', {})).rejects.toMatchObject({
      name: 'ApiError',
      codigo: 'sin_conexion',
      status: 0,
    });
  });

  it('si la respuesta no es ok, lanza ApiError con el código del backend', async () => {
    fetch.mockResolvedValueOnce(respuestaError(409, { error: 'email_en_uso' }));
    await expect(postJson('http://x/auth/register', {})).rejects.toMatchObject({
      codigo: 'email_en_uso',
      status: 409,
    });
  });

  it('si la respuesta no es ok y no trae `error`, usa error_desconocido', async () => {
    fetch.mockResolvedValueOnce(respuestaError(500, {}));
    await expect(postJson('http://x/auth/register', {})).rejects.toMatchObject({
      codigo: 'error_desconocido',
      status: 500,
    });
  });
});

describe('getJson', () => {
  it('hace GET y devuelve el JSON de la respuesta', async () => {
    fetch.mockResolvedValueOnce(respuestaOk({ pico_salas: 3 }));
    const data = await getJson('http://x/kpis');
    expect(fetch).toHaveBeenCalledWith('http://x/kpis');
    expect(data).toEqual({ pico_salas: 3 });
  });

  it('si fetch rechaza, lanza ApiError sin_conexion', async () => {
    fetch.mockRejectedValueOnce(new TypeError('network error'));
    await expect(getJson('http://x/kpis')).rejects.toMatchObject({ codigo: 'sin_conexion' });
  });

  it('si la respuesta no es ok, lanza ApiError con el código del backend', async () => {
    fetch.mockResolvedValueOnce(respuestaError(401, { error: 'no_autorizado' }));
    await expect(getJson('http://x/kpis')).rejects.toMatchObject({ codigo: 'no_autorizado', status: 401 });
  });
});
