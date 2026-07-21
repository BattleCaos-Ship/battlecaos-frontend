import { describe, it, expect, vi } from 'vitest';
import { loginGoogle, registrarLocal, loginLocal, cambiarApodo } from './auth';
import { postJson } from './client';
import { AUTH_URL } from './config';

// auth.js solo debe armar bien la URL y el payload de cada endpoint del servicio de auth y
// delegar en postJson (ya probado en client.test.js). Mockeamos postJson en vez de fetch
// para verificar el "contrato" con el backend: URL correcta, body correcto y, en apodo, que
// el token viaje como opción de auth (no en el body).

vi.mock('./client', () => ({ postJson: vi.fn() }));

describe('loginGoogle', () => {
  it('llama a /auth/google con el idToken', () => {
    loginGoogle('id-token-123');
    expect(postJson).toHaveBeenCalledWith(`${AUTH_URL}/auth/google`, { idToken: 'id-token-123' });
  });
});

describe('registrarLocal', () => {
  it('llama a /auth/register con email, password y apodo', () => {
    registrarLocal({ email: 'a@b.com', password: 'secreta', apodo: 'Ana' });
    expect(postJson).toHaveBeenCalledWith(`${AUTH_URL}/auth/register`, {
      email: 'a@b.com',
      password: 'secreta',
      apodo: 'Ana',
    });
  });
});

describe('loginLocal', () => {
  it('llama a /auth/login con email y password', () => {
    loginLocal({ email: 'a@b.com', password: 'secreta' });
    expect(postJson).toHaveBeenCalledWith(`${AUTH_URL}/auth/login`, {
      email: 'a@b.com',
      password: 'secreta',
    });
  });
});

describe('cambiarApodo', () => {
  it('llama a /auth/apodo con el nuevo apodo y el token como opción de auth', () => {
    cambiarApodo('jwt-abc', 'NuevoApodo');
    expect(postJson).toHaveBeenCalledWith(
      `${AUTH_URL}/auth/apodo`,
      { apodo: 'NuevoApodo' },
      { token: 'jwt-abc' },
    );
  });
});
