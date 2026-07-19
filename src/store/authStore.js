// Store de SESIÓN: fuente única de verdad del JWT. Antes la lógica estaba dispersa
// (localStorage.setItem('token') en LoginPage y AccountMenu, decode en useAuth, remove en
// logout). Ahora TODO el acceso a la sesión pasa por aquí — un solo lugar que sabe leer,
// validar, guardar y limpiar el token.
import { disconnectSharedSocket } from '../hooks/useSocket';

// Decodifica (NO verifica — eso ya lo hizo el servidor al firmarlo) el payload del JWT.
export function decodeJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(json); // { sub, name, picture, iat, exp }
  } catch {
    return null;
  }
}

export const getToken = () => localStorage.getItem('token');

export function getProfile() {
  const t = getToken();
  return t ? decodeJwt(t) : null;
}

// ¿El perfil está vencido? (exp en segundos ya pasó).
export function isExpired(profile = getProfile()) {
  return profile?.exp ? profile.exp * 1000 < Date.now() : false;
}

// Guarda el token de una nueva sesión (login/registro/cambio de apodo).
export function setSession(token) {
  localStorage.setItem('token', token);
}

// Cierra la sesión: borra el token y desconecta el socket compartido (persiste entre páginas).
export function clearSession() {
  localStorage.removeItem('token');
  disconnectSharedSocket();
}
