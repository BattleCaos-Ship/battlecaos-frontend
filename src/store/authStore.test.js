import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  decodeJwt, getToken, getProfile, isExpired,
  esTokenBienFormado, setSession, clearSession,
} from './authStore';

// clearSession desconecta el socket compartido; aquí solo interesa la sesión, no la red.
vi.mock('../hooks/useSocket', () => ({ disconnectSharedSocket: vi.fn() }));

// Construye un JWT de mentira con el payload pedido. No va firmado de verdad: el store
// solo DECODIFICA (la firma la verifica el servidor), así que basta con la forma correcta.
//
// OJO con el encoding: un JWT real lleva el payload en UTF-8 antes de base64. `btoa` a secas
// interpreta la cadena como Latin-1, así que un apodo con tildes produciría un token que el
// decodificador (que sí espera UTF-8) rechaza — y la prueba fallaría por culpa del helper,
// no del código bajo prueba.
function jwtFalso(payload) {
  const b64 = (o) => {
    const bytes = new TextEncoder().encode(JSON.stringify(o));
    let binario = '';
    bytes.forEach((b) => { binario += String.fromCharCode(b); });
    return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.firmaDePrueba`;
}

beforeEach(() => localStorage.clear());

describe('decodeJwt', () => {
  it('extrae el payload de un JWT bien formado', () => {
    const t = jwtFalso({ sub: 'u-1', name: 'Ana' });
    expect(decodeJwt(t)).toMatchObject({ sub: 'u-1', name: 'Ana' });
  });

  it('soporta caracteres no ASCII en el nombre', () => {
    // El apodo puede llevar tildes o emojis; si el decodificador no maneja UTF-8, aquí se ve.
    const t = jwtFalso({ sub: 'u-2', name: 'Capitán Ñoño' });
    expect(decodeJwt(t).name).toBe('Capitán Ñoño');
  });

  it('devuelve null en vez de lanzar si el token es basura', () => {
    expect(decodeJwt('esto-no-es-un-jwt')).toBeNull();
    expect(decodeJwt('')).toBeNull();
  });
});

describe('esTokenBienFormado', () => {
  it('acepta tres segmentos base64url', () => {
    expect(esTokenBienFormado(jwtFalso({ sub: 'u-1' }))).toBe(true);
  });

  it('rechaza lo que no sea una cadena', () => {
    for (const v of [null, undefined, 42, {}, []]) expect(esTokenBienFormado(v)).toBe(false);
  });

  it('rechaza cadenas sin la estructura de tres segmentos', () => {
    expect(esTokenBienFormado('sinpuntos')).toBe(false);
    expect(esTokenBienFormado('solo.dos')).toBe(false);
  });

  it('rechaza caracteres fuera del alfabeto base64url', () => {
    // El punto clave: nada de <, >, comillas ni espacios, que es por donde entraría
    // contenido inyectado si alguien pega una respuesta manipulada.
    expect(esTokenBienFormado('a.b.<script>')).toBe(false);
    expect(esTokenBienFormado('a.b.c d')).toBe(false);
  });

  it('rechaza tokens desmesuradamente largos', () => {
    expect(esTokenBienFormado(`a.b.${'x'.repeat(5000)}`)).toBe(false);
  });
});

describe('setSession', () => {
  it('guarda el token y avisa del éxito', () => {
    const t = jwtFalso({ sub: 'u-1' });
    expect(setSession(t)).toBe(true);
    expect(localStorage.getItem('token')).toBe(t);
  });

  it('NO guarda nada si el token está mal formado', () => {
    expect(setSession('<img src=x onerror=alert(1)>')).toBe(false);
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('no pisa una sesión válida con una inválida', () => {
    const bueno = jwtFalso({ sub: 'u-1' });
    setSession(bueno);
    setSession('basura');
    expect(localStorage.getItem('token')).toBe(bueno);
  });
});

describe('getToken y getProfile', () => {
  it('devuelven null sin sesión', () => {
    expect(getToken()).toBeNull();
    expect(getProfile()).toBeNull();
  });

  it('devuelven el perfil decodificado cuando hay sesión', () => {
    setSession(jwtFalso({ sub: 'u-9', name: 'Beto' }));
    expect(getProfile()).toMatchObject({ sub: 'u-9', name: 'Beto' });
  });
});

describe('isExpired', () => {
  it('es true si exp ya pasó', () => {
    expect(isExpired({ exp: Math.floor(Date.now() / 1000) - 60 })).toBe(true);
  });

  it('es false si exp está en el futuro', () => {
    expect(isExpired({ exp: Math.floor(Date.now() / 1000) + 3600 })).toBe(false);
  });

  it('es false si el perfil no trae exp (no se asume vencido)', () => {
    expect(isExpired({ sub: 'u-1' })).toBe(false);
    expect(isExpired(null)).toBe(false);
  });

  it('lee la sesión actual si no se le pasa perfil', () => {
    setSession(jwtFalso({ sub: 'u-1', exp: Math.floor(Date.now() / 1000) - 10 }));
    expect(isExpired()).toBe(true);
  });
});

describe('clearSession', () => {
  it('borra el token', () => {
    setSession(jwtFalso({ sub: 'u-1' }));
    clearSession();
    expect(localStorage.getItem('token')).toBeNull();
    expect(getProfile()).toBeNull();
  });
});
