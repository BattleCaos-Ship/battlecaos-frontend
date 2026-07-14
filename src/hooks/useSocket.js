import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:3000';

// Conexión Socket.io autenticada con el JWT. Devuelve { socket, connected, error }
// para que la UI pueda mostrar claramente si NO hay conexión (backends caídos, token
// vencido, etc.) en vez de dejar botones deshabilitados sin explicación.
export function useSocket(token) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) {
      setSocket(null);
      setConnected(false);
      return;
    }
    const s = io(GATEWAY_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      timeout: 8000,
    });

    s.on('connect', () => { setConnected(true); setError(null); });
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (err) => {
      setConnected(false);
      // 'token_invalido' / 'sin_token' → sesión inválida; el resto → backend inalcanzable.
      setError(err.message === 'token_invalido' || err.message === 'sin_token'
        ? 'sesion_invalida'
        : 'sin_conexion');
    });

    setSocket(s);
    return () => s.disconnect();
  }, [token]);

  return { socket, connected, error };
}
