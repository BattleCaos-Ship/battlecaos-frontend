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

export function useGameState(socket) {
  const [gameState, setGameState] = useState(null);

  useEffect(() => {
    if (!socket) return;
    const handler = (raw) => setGameState(normalize(raw));
    socket.on('game:state', handler);
    return () => socket.off('game:state', handler);
  }, [socket]);

  return gameState;
}
