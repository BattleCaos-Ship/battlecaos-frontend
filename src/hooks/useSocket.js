import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:3000';

// Socket COMPARTIDO a nivel de módulo: sobrevive la navegación entre páginas.
// Antes cada página creaba su propio socket y lo desconectaba al desmontar →
// al pasar de Lobby a Game AMBOS jugadores se "desconectaban" un instante y el
// servicio room veía a todos desconectados y DESTRUÍA la sala (los modos 1v1 y
// 2v2 morían justo al arrancar; 1v1-bot sobrevivía porque el bot nunca se
// desconecta). Ahora el socket se crea una vez por sesión (token) y solo se
// cierra al hacer logout o cambiar de cuenta.
let shared = { socket: null, token: null };

// Cierre explícito (logout / cambio de cuenta) — lo usa useAuth.logout().
export function disconnectSharedSocket() {
  shared.socket?.disconnect();
  shared.socket = null;
  shared.token = null;
}

function getSharedSocket(token) {
  if (shared.socket && shared.token === token) return shared.socket;
  shared.socket?.disconnect();
  shared.socket = io(GATEWAY_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    // Reintentos INFINITOS: el socket es compartido y vive toda la sesión — con un
    // tope (antes 5) una mala racha de red (Azure reciclando la conexión tras
    // inactividad/reescalado) lo dejaba muerto PARA SIEMPRE ("desconectado del
    // gateway" hasta recargar). El backoff (hasta 5s) evita martillar el servidor.
    reconnectionAttempts: Infinity,
    reconnectionDelayMax: 5000,
    timeout: 8000,
  });
  shared.token = token;
  return shared.socket;
}

// Conexión Socket.io autenticada con el JWT. Devuelve { socket, connected, error }
// para que la UI pueda mostrar claramente si NO hay conexión (backends caídos, token
// vencido, etc.) en vez de dejar botones deshabilitados sin explicación.
export function useSocket(token) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) {
      // Logout / sesión cerrada: aquí SÍ se desconecta de verdad.
      disconnectSharedSocket();
      setSocket(null);
      setConnected(false);
      return;
    }
    const s = getSharedSocket(token);

    const onConnect = () => { setConnected(true); setError(null); };
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err) => {
      setConnected(false);
      // 'token_invalido' / 'sin_token' → sesión inválida; el resto → backend inalcanzable.
      setError(err.message === 'token_invalido' || err.message === 'sin_token'
        ? 'sesion_invalida'
        : 'sin_conexion');
    };

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onConnectError);

    setSocket(s);
    setConnected(s.connected); // ya puede estar conectado si venimos de otra página

    // Al desmontar la página NO se desconecta el socket (persiste para la
    // siguiente página) — solo se quitan los listeners de ESTE componente.
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('connect_error', onConnectError);
    };
  }, [token]);

  return { socket, connected, error };
}
