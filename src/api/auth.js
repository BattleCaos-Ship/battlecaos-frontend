// Llamadas al servicio de autenticación (battlecaos-auth). Cada función devuelve el JSON del
// backend (típicamente { token }) o lanza ApiError con el código de error (lo mapea la UI).
import { AUTH_URL } from './config';
import { postJson } from './client';

// Inicia sesión con el idToken de Google → { token }.
export const loginGoogle = (idToken) => postJson(`${AUTH_URL}/auth/google`, { idToken });

// Registro con email + contraseña + apodo → { token }.
export const registrarLocal = ({ email, password, apodo }) =>
  postJson(`${AUTH_URL}/auth/register`, { email, password, apodo });

// Inicio de sesión local (email + contraseña) → { token }.
export const loginLocal = ({ email, password }) =>
  postJson(`${AUTH_URL}/auth/login`, { email, password });

// Cambia el apodo (requiere el JWT actual) → { token } nuevo con el apodo actualizado.
export const cambiarApodo = (token, apodo) =>
  postJson(`${AUTH_URL}/auth/apodo`, { apodo }, { token });
