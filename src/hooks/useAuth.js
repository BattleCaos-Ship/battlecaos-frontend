// Hook de sesión. La lógica vive en el store (src/store/authStore.js); aquí solo se expone
// a los componentes. `decodeJwt` se re-exporta para no romper imports existentes.
import { getToken, getProfile, isExpired, clearSession, decodeJwt } from '../store/authStore';

export { decodeJwt };

export function useAuth() {
  const token = getToken();
  const profile = getProfile();
  const valid = !!token && !!profile && !isExpired(profile);

  return {
    token,
    profile,
    isAuthenticated: valid,
    logout: clearSession,
  };
}
