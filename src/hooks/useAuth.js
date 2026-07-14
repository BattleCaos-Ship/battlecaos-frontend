// Decodifica (NO verifica — eso ya lo hizo el servidor al emitirlo) el payload del JWT.
// Necesario porque el backend no devuelve name/picture por separado: hay que sacarlos
// del propio token, y el `name` se envía manualmente al crear/unirse a una sala.
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

export function useAuth() {
  const token = localStorage.getItem('token');
  const profile = token ? decodeJwt(token) : null;

  // Considera expirado si exp (segundos) ya pasó.
  const expired = profile?.exp ? profile.exp * 1000 < Date.now() : false;
  const valid = !!token && !!profile && !expired;

  return {
    token,
    profile,
    isAuthenticated: valid,
    logout: () => localStorage.removeItem('token'),
  };
}
