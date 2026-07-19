import { useEffect, useState } from 'react';

// Normaliza las DOS formas posibles de game:state (ver Frontend_idea.md §3.6):
//  - Forma normal (sanitizada): trae `tableroPublico` con solo hit/miss/sunk.
//  - Forma cruda (solo al reconectar): trae `tableros` con posiciones reales de barcos.
// Devolvemos siempre `boards` con la misma forma, y NUNCA exponemos 'ship' de un
// tablero ajeno: cualquier valor que no sea hit/miss/sunk se colapsa a fog.
function normalize(raw) {
  if (!raw) return null;
  const source = raw.tableroPublico ?? raw.tableros ?? {};
  const boards = {};
  for (const [playerId, board] of Object.entries(source)) {
    const cells = {};
    for (const [key, val] of Object.entries(board?.cells ?? {})) {
      cells[key] = val === 'hit' || val === 'miss' || val === 'sunk' ? val : 'fog';
    }
    boards[playerId] = { size: board?.size ?? 10, cells };
  }
  return { ...raw, boards };
}

// Caché del ÚLTIMO game:state por socket (a nivel de módulo): el socket es
// compartido entre páginas, así que el estado que disparó la navegación
// Lobby→Game (consumido por el Lobby) sigue disponible cuando GamePage monta.
// Sin esto, GamePage arrancaba en null y esperaba al SIGUIENTE broadcast —
// el jugador quedaba "cargando" hasta que el rival hacía algo (asimetría al
// entrar a COLOCACION). Se guarda el socket junto al estado para no filtrar
// un estado viejo a una sesión/socket nuevo.
let cache = { socket: null, state: null };

// El Lobby escucha game:state con su propio listener (para navegar a /game);
// con esto guarda ese estado en el caché ANTES de navegar, y GamePage lo
// encuentra al montar — ambos jugadores entran a COLOCACION al mismo tiempo.
export function primeGameStateCache(socket, raw) {
  cache = { socket, state: normalize(raw) };
}

// Invalida el caché. Se llama al llegar a la pantalla de resultado: si no,
// al "jugar de nuevo" el caché viejo (fase FIN) haría que GamePage navegara
// de vuelta al resultado apenas montar.
export function clearGameStateCache() {
  cache = { socket: null, state: null };
}

export function useGameState(socket) {
  const [gameState, setGameState] = useState(
    () => (socket && cache.socket === socket ? cache.state : null),
  );

  useEffect(() => {
    if (!socket) return;
    // Estado ya recibido por otra página con este mismo socket → úsalo ya.
    if (cache.socket === socket && cache.state) setGameState(cache.state);
    const handler = (raw) => {
      const norm = normalize(raw);
      cache = { socket, state: norm };
      setGameState(norm);
    };
    socket.on('game:state', handler);
    return () => socket.off('game:state', handler);
  }, [socket]);

  return gameState;
}
