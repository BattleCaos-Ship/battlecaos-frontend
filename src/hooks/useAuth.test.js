import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuth } from './useAuth';
import { setSession } from '../store/authStore';

vi.mock('./useSocket', () => ({ disconnectSharedSocket: vi.fn() }));

// useAuth decide si el usuario está autenticado. Lo importante es que `isAuthenticated`
// exija las TRES condiciones: que haya token, que se pueda decodificar y que no esté
// vencido. Si solo mirara la existencia del token, un token caducado dejaría entrar al
// lobby y luego el gateway rechazaría el socket, con un fallo confuso.

function jwtFalso(payload) {
  const b64 = (o) => {
    const bytes = new TextEncoder().encode(JSON.stringify(o));
    let binario = '';
    bytes.forEach((b) => { binario += String.fromCharCode(b); });
    return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.firma`;
}

const enElFuturo = () => Math.floor(Date.now() / 1000) + 3600;
const enElPasado = () => Math.floor(Date.now() / 1000) - 3600;

beforeEach(() => localStorage.clear());

describe('useAuth', () => {
  it('sin sesión, no está autenticado', () => {
    const { token, profile, isAuthenticated } = useAuth();
    expect(token).toBeNull();
    expect(profile).toBeNull();
    expect(isAuthenticated).toBe(false);
  });

  it('con un token válido y vigente, está autenticado', () => {
    setSession(jwtFalso({ sub: 'u-1', name: 'Ana', exp: enElFuturo() }));
    const { profile, isAuthenticated } = useAuth();
    expect(isAuthenticated).toBe(true);
    expect(profile).toMatchObject({ sub: 'u-1', name: 'Ana' });
  });

  it('con un token VENCIDO, NO está autenticado', () => {
    setSession(jwtFalso({ sub: 'u-1', exp: enElPasado() }));
    expect(useAuth().isAuthenticated).toBe(false);
  });

  it('con un token que no se puede decodificar, NO está autenticado', () => {
    // Se escribe directo en localStorage para saltarse la validación de setSession y
    // simular una sesión corrupta de una versión anterior.
    localStorage.setItem('token', 'a.b.c');
    expect(useAuth().isAuthenticated).toBe(false);
  });

  it('logout borra la sesión', () => {
    setSession(jwtFalso({ sub: 'u-1', exp: enElFuturo() }));
    useAuth().logout();
    expect(useAuth().isAuthenticated).toBe(false);
    expect(localStorage.getItem('token')).toBeNull();
  });
});
