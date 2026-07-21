import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { useGameState, clearGameStateCache } from '../hooks/useGameState';
import Board from '../components/Board/Board';
import ShipPlacer from '../components/ShipPlacer/ShipPlacer';
import EnergyBar from '../components/EnergyBar/EnergyBar';
import PowerPanel from '../components/PowerPanel/PowerPanel';
import CountermeasureAlert from '../components/CountermeasureAlert/CountermeasureAlert';
import SalvoBanner from '../components/SalvoBanner/SalvoBanner';
import Timer from '../components/Timer/Timer';
import PlayerList from '../components/PlayerList/PlayerList';
import Chat from '../components/Chat/Chat';
import VoiceChat from '../components/VoiceChat/VoiceChat';
import PixelBackdrop from '../components/PixelBackdrop/PixelBackdrop';
import StormGates from '../components/StormGates/StormGates';
import { FASE_LABEL, GAME_ERRORS } from '../constants/copy';
import styles from './GamePage.module.css';


// Reconstruye FORMAS de barco {key, tipo, size, x, y, horizontal} desde el mapa
// `barcos` del tablero de equipo ({ id: [[x,y],...] }, ids `${playerId}_${tipo}`).
// Con las formas se dibujan los SPRITES pixel-art (nunca cuadros grises).
function shapesFromBarcos(barcos) {
  return Object.entries(barcos ?? {}).map(([id, cells]) => {
    const xs = cells.map((c) => c[0]);
    const ys = cells.map((c) => c[1]);
    const horizontal = cells.length < 2 || new Set(ys).size === 1;
    const tipo = id.slice(id.lastIndexOf('_') + 1); // 'uid_portaaviones' → 'portaaviones'
    return { key: id, id, tipo, size: cells.length, x: Math.min(...xs), y: Math.min(...ys), horizontal };
  });
}

// Mapeo de tamaño de barco a nombre. Los de tamaño 3 tienen dos posibles
// (crucero/submarino), se desambigüan por orden de hundimiento.
const SHIP_NAMES = {
  5: { id: 'portaaviones', label: 'Portaaviones' },
  4: { id: 'acorazado', label: 'Acorazado' },
  3: [
    { id: 'crucero', label: 'Crucero' },
    { id: 'submarino', label: 'Submarino' },
  ],
  2: { id: 'destructor', label: 'Destructor' },
};

// Encuentra un grupo de celdas 'sunk' conectadas (4-direcciones) que contenga
// al menos una celda nueva, y devuelve el tamaño del grupo + sus coordenadas.
function findNewSunkGroup(cells, prevCells) {
  const newSunk = new Set();
  for (const [key, val] of Object.entries(cells)) {
    if (val === 'sunk' && prevCells?.[key] !== 'sunk') {
      newSunk.add(key);
    }
  }
  if (newSunk.size === 0) return null;

  // DFS SOLO sobre las celdas recién hundidas: las celdas que pasan a 'sunk' en una
  // misma actualización pertenecen al barco que se acaba de hundir. Agrupar TODAS las
  // celdas sunk conectadas fusionaba barcos adyacentes ya hundidos en un tamaño inválido
  // (p.ej. 4+3=7) → sin sprite de wreck → "solo estrellas".
  const visited = new Set();
  const groups = [];
  for (const key of newSunk) {
    if (visited.has(key)) continue;
    const group = [];
    const stack = [key];
    while (stack.length) {
      const k = stack.pop();
      if (visited.has(k)) continue;
      visited.add(k);
      group.push(k);
      const [x, y] = k.split(',').map(Number);
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nk = `${x+dx},${y+dy}`;
        if (newSunk.has(nk) && !visited.has(nk)) stack.push(nk);
      }
    }
    groups.push(group);
  }

  // El componente más grande de celdas nuevas = el barco recién hundido.
  const group = groups.sort((a, b) => b.length - a.length)[0];
  const size = group.length;
  const entry = SHIP_NAMES[size];
  let name = `Barco de ${size} celdas`;
  if (entry && Array.isArray(entry)) {
    name = entry[0].label; // placeholder, se resuelve en el useEffect
  } else if (entry) {
    name = entry.label;
  }
  const xs = group.map((k) => +k.split(',')[0]);
  const ys = group.map((k) => +k.split(',')[1]);
  return { size, name, group, x: Math.min(...xs), y: Math.min(...ys) };
}

// Tamaño de tablero por modo (debe coincidir con el backend: BOARD_SIZE_BY_MODE).
const BOARD_SIZE_BY_MODE = { '1v1': 10, '1v1-bot': 10, '2v2': 13 };
// Ritmo de EMISIÓN de la salva desde el cliente. El servidor exige ≥130ms entre disparos
// (SALVO_CADENCIA_MS 180 - tolerancia 50): emitir justo a 180ms hacía que el jitter de red
// comprimiera la separación medida en el servidor por debajo del umbral → rechazos
// "cadencia_no_cumplida" que se sentían como clics perdidos. Emitimos con MARGEN (260ms,
// ~4 disparos/s) para que TODOS los disparos lleguen holgados; los rechazos residuales
// se REENCOLAN (ver onError) — ningún clic se pierde.
const SALVO_EMIT_MS = 260;

// (La flota propia se dibuja como sprites pixel-art vía Board ships={myFleet}; las celdas
// 'ship' por relleno solo se usan como fallback cuando no conocemos las formas — §3.6.)

// Los tableros vienen keyed por EQUIPO ('A'/'B'). El rival es el del equipo contrario.
function rivalBoardCells(gameState, miId) {
  const boards = gameState?.boards ?? {};
  const miEquipo = gameState?.jugadores?.find((j) => j.id === miId)?.equipo;
  const enemigo = miEquipo === 'A' ? 'B' : 'A';
  return boards[enemigo]?.cells ?? {};
}

export default function GamePage() {
  const { token, profile, isAuthenticated } = useAuth();
  const { socket, connected } = useSocket(token);
  const gameState = useGameState(socket);
  const navigate = useNavigate();
  const miId = profile?.sub;

  const [myFleet, setMyFleet] = useState([]);
  const [fleetCells, setFleetCells] = useState([]); // celdas de tu flota enviadas por el servidor
  const [teamShips, setTeamShips] = useState([]); // FORMAS de la flota del EQUIPO (sprites)
  const [previewShips, setPreviewShips] = useState([]); // barcos del compañero AÚN sin confirmar (preview en vivo)
  const [espShips, setEspShips] = useState({ A: [], B: [] }); // espectador: flotas de ambos equipos
  const [timer, setTimer] = useState({ tipo: null, remaining: null });
  const [selectedPower, setSelectedPower] = useState(null);
  const [toast, setToast] = useState(null);
  const [salvoNotice, setSalvoNotice] = useState(null);
  const [poderMsg, setPoderMsg] = useState(null);
  const [sonarReveal, setSonarReveal] = useState([]); // celdas reveladas por sonar (temporal)
  const [pendingShots, setPendingShots] = useState(new Set()); // clics de disparo aún sin confirmar
  const [sunkShipMsg, setSunkShipMsg] = useState(null); // notificación de barco hundido
  const [sunkenShips, setSunkenShips] = useState([]); // barcos hundidos acumulados [{ name, size, cells }]
  const [storm, setStorm] = useState({ trigger: 0, by: null }); // animación de compuertas de tormenta
  const [powerCast, setPowerCast] = useState(null); // { type, x, y, id } animación de lanzamiento de poder
  const prevRivalCellsRef = useRef(null); // para detectar nuevos hundidos en tablero rival
  const prevMyCellsRef = useRef(null); // para detectar nuevos hundidos en tablero propio
  const size3SunkCountRef = useRef(0); // para desambiguar crucero vs submarino
  const mySize3SunkCountRef = useRef(0); // para desambiguar crucero vs submarino (propio)
  const miEquipoRef = useRef(null); // mi equipo actual, para filtrar la animación de tormenta
  const toastTimer = useRef(null);
  const sonarTimer = useRef(null);
  const fleetConfirmed = useRef(false);
  // Cola de reintentos de la salva: cuando el backend rechaza un disparo por cadencia, se encola
  // aquí y el intervalo de drenado lo reintenta al ritmo de la cadencia. NINGÚN clic se pierde.
  const salvoQueue = useRef([]);
  const lastSalvoEmit = useRef(0); // solo lo usa el intervalo de drenado (reintentos)

  useEffect(() => {
    if (!isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  // Restaurar la flota guardada (localStorage) al conocer el código de sala — para que
  // tu propio tablero muestre tus barcos aunque recargues o reconectes a mitad de partida.
  useEffect(() => {
    const codigo = gameState?.codigo;
    if (!codigo || myFleet.length > 0) return;
    try {
      const guardada = localStorage.getItem(`fleet:${codigo}`);
      if (guardada) setMyFleet(JSON.parse(guardada));
    } catch { /* ignore */ }
  }, [gameState?.codigo, myFleet.length]);

  // timer:tick → estado del temporizador visible
  useEffect(() => {
    if (!socket) return;
    const onTick = ({ tipo, remaining }) => setTimer({ tipo, remaining });
    socket.on('timer:tick', onTick);
    return () => socket.off('timer:tick', onTick);
  }, [socket]);

  // Drenado de la cola de la salva: mientras dure la salva, envía un disparo encolado cada
  // vez que se cumple la cadencia. Así los clics rápidos se disparan en secuencia (ninguno
  // rechazado). Fuera de la salva, se vacía la cola.
  useEffect(() => {
    const enSalva = gameState?.fase === 'SALVA';
    if (!socket || !enSalva) {
      // Al salir de la salva, limpiar los pendientes de disparos que quedaron en la cola sin
      // enviarse (la ventana terminó) — si no, se verían "en progreso" hasta caducar.
      if (salvoQueue.current.length) {
        const pend = salvoQueue.current.map((c) => `${c.x},${c.y}`);
        setPendingShots((prev) => { const n = new Set(prev); pend.forEach((k) => n.delete(k)); return n; });
        salvoQueue.current = [];
      }
      return;
    }
    const codigo = gameState.codigo;
    const id = setInterval(() => {
      if (salvoQueue.current.length === 0) return;
      const ahora = Date.now();
      if (ahora - lastSalvoEmit.current < SALVO_EMIT_MS) return;
      const next = salvoQueue.current.shift();
      lastSalvoEmit.current = ahora;
      socket.emit('salva:disparo', { codigo, x: next.x, y: next.y });
    }, 40);
    return () => clearInterval(id);
  }, [socket, gameState?.fase, gameState?.codigo]);

  // tu:flota → el servidor manda las celdas de tu propia flota (para verla aunque fuera
  // auto-colocada al agotarse el tiempo, o al reconectar sin la flota en localStorage).
  useEffect(() => {
    if (!socket) return;
    const onFleet = ({ cells, barcos }) => {
      if (Array.isArray(cells)) setFleetCells(cells.map(([x, y]) => `${x},${y}`));
      if (barcos) {
        setTeamShips(shapesFromBarcos(barcos)); // sprites de TODA la flota del equipo
        setPreviewShips([]); // lo confirmado reemplaza el preview del compañero
      }
    };
    socket.on('tu:flota', onFleet);
    return () => socket.off('tu:flota', onFleet);
  }, [socket]);

  // Preview EN VIVO del compañero (2v2): cada barco que acomoda (antes de confirmar)
  // llega aquí y se dibuja con su sprite — así el equipo se pone de acuerdo.
  useEffect(() => {
    if (!socket) return;
    const onPreview = ({ ships }) => { if (Array.isArray(ships)) setPreviewShips(ships); };
    socket.on('equipo:preview', onPreview);
    return () => socket.off('equipo:preview', onPreview);
  }, [socket]);

  // Sin estado al montar → pedir re-sincronización al gateway. Cubre la carrera de la
  // reconexión (el game:state directo del gateway llegaba antes de adjuntar listeners)
  // — sin esto el jugador quedaba "Conectando a la partida…" hasta el siguiente
  // broadcast de la sala (parecía "espectador" hasta que su equipo interactuaba).
  useEffect(() => {
    if (!socket || !connected || gameState) return;
    socket.emit('game:sync');
    const retry = setInterval(() => socket.emit('game:sync'), 2500);
    return () => clearInterval(retry);
  }, [socket, connected, gameState]);

  // Reconexión: el estado CRUDO del gateway trae `tableros` con posiciones reales.
  // De ahí recuperamos la flota de NUESTRO equipo (formas para sprites + celdas)
  // aunque localStorage esté vacío (otro navegador/equipo).
  useEffect(() => {
    const tableros = gameState?.tableros;
    if (!tableros) return;
    const equipo = gameState?.jugadores?.find((j) => j.id === miId)?.equipo;
    const ships = tableros[equipo]?.ships;
    if (ships && teamShips.length === 0) {
      setFleetCells(Object.values(ships).flat().map(([x, y]) => `${x},${y}`));
      setTeamShips(shapesFromBarcos(ships));
    }
    // Espectador: guarda las flotas de AMBOS equipos (los sprites persisten aunque
    // los siguientes broadcasts sean sanitizados — los barcos no se mueven).
    if (!gameState?.jugadores?.some((j) => j.id === miId)) {
      setEspShips({
        A: shapesFromBarcos(tableros.A?.ships),
        B: shapesFromBarcos(tableros.B?.ships),
      });
    }
  }, [gameState, teamShips.length, miId]);

  // Espectador sin flotas aún (entró y solo recibe estados sanitizados): re-pide el
  // estado completo hasta obtener los tableros con posiciones.
  useEffect(() => {
    if (!socket || !connected || !gameState) return;
    const soyJugador = gameState.jugadores?.some((j) => j.id === miId);
    if (soyJugador || gameState.tableros) return;
    if (espShips.A.length || espShips.B.length) return;
    const codigo = gameState.codigo;
    if (!codigo || gameState.fase === 'COLOCACION') return; // aún no hay flotas completas
    socket.emit('room:espectar', { codigo });
    const t = setInterval(() => socket.emit('room:espectar', { codigo }), 3000);
    return () => clearInterval(t);
  }, [socket, connected, gameState, espShips, miId]);

  // game:error → toast (o aviso de salva) + limpia el marcador "pendiente" de la celda
  // rechazada al instante (así no queda "en progreso" hasta caducar sin registrarse).
  useEffect(() => {
    if (!socket) return;
    const onError = ({ error, x, y }) => {
      // Cadencia: el disparo NO se pierde — se REENCOLA y el drenado lo reintenta con la
      // separación correcta (antes se descartaba y el jugador sentía que "no registraba").
      // El marcador 'pendiente' se conserva: sigue en curso, no falló.
      if (error === 'cadencia_no_cumplida') {
        if (x != null && y != null && salvoQueue.current.length < 20
            && !salvoQueue.current.some((c) => c.x === x && c.y === y)) {
          salvoQueue.current.push({ x, y });
        }
        return;
      }
      if (x != null && y != null) {
        const key = `${x},${y}`;
        setPendingShots((prev) => { if (!prev.has(key)) return prev; const n = new Set(prev); n.delete(key); return n; });
        salvoQueue.current = salvoQueue.current.filter((c) => !(c.x === x && c.y === y));
      }
      if (error === 'celda_ya_tomada') {
        setSalvoNotice('Un compañero ya tomó esa celda.');
        setTimeout(() => setSalvoNotice(null), 1800);
        return;
      }
      // no_es_tu_turno al hacer clics rápidos en tu turno no merece un toast molesto.
      if (error === 'no_es_tu_turno' || error === 'celda_ya_disparada') return;
      showToast(GAME_ERRORS[error] ?? error);
    };
    socket.on('game:error', onError);
    return () => socket.off('game:error', onError);
  }, [socket]);

  // poder:resultado → feedback visual del poder usado (sonar revela celdas, etc.)
  useEffect(() => {
    if (!socket) return;
    const onResult = ({ powerType, result, target }) => {
      if (powerType === 'sonar') {
        const cells = Array.isArray(result) ? result : [];
        setSonarReveal(cells);
        clearTimeout(sonarTimer.current);
        sonarTimer.current = setTimeout(() => setSonarReveal([]), 6000);
        setPoderMsg(cells.length ? `Sonar: ${cells.length} celda(s) con barco reveladas` : 'Sonar: sin barcos en esa zona');
        if (target) setPowerCast({ type: 'sonar', x: target.x, y: target.y, id: Date.now() });
      } else if (powerType === 'escudo') {
        setPoderMsg('🛡 Escudo activado — tu flota está protegida del próximo impacto');
      } else if (powerType === 'bombardeo') {
        setPoderMsg('💣 ¡Bombardeo lanzado sobre el área!');
        if (target) setPowerCast({ type: 'bombardeo', x: target.x, y: target.y, id: Date.now() });
      } else if (powerType === 'tormenta') {
        setPoderMsg('🌩 Tormenta lanzada sobre el rival — pierde sus turnos');
      }
      setTimeout(() => setPoderMsg(null), 3800);
    };
    socket.on('poder:resultado', onResult);
    return () => socket.off('poder:resultado', onResult);
  }, [socket]);

  // poder:tormenta → animación de compuertas SOLO para el enemigo (el que pierde los turnos).
  // Quien la lanza (y su equipo) NO ve "se avecina una tormenta": la sufre el rival.
  useEffect(() => {
    if (!socket) return;
    const onStorm = ({ porId, porNombre, equipo }) => {
      const soyElLanzador = porId != null && porId === miId;
      const soyDelEquipoLanzador =
        equipo != null && miEquipoRef.current != null && equipo === miEquipoRef.current;
      if (soyElLanzador || soyDelEquipoLanzador) return; // el lanzador/su equipo no ven las compuertas
      setStorm((s) => ({ trigger: s.trigger + 1, by: porNombre ?? null }));
    };
    socket.on('poder:tormenta', onStorm);
    return () => socket.off('poder:tormenta', onStorm);
  }, [socket, miId]);

  // Limpia los disparos "pendientes" (feedback optimista) en cuanto el servidor confirma
  // el resultado de esa celda, para no dejar marcas fantasma si el disparo se rechazó.
  useEffect(() => {
    setPendingShots((prev) => {
      if (prev.size === 0) return prev;
      const rb = rivalBoardCells(gameState, profile?.sub);
      const next = new Set([...prev].filter((k) => !['hit', 'miss', 'sunk'].includes(rb[k])));
      // Además caducar a los 4s por si el disparo fue rechazado (no cambia la celda).
      return next.size === prev.size ? prev : next;
    });
  }, [gameState, profile?.sub]);

  // Detectar nuevos barcos hundidos en el tablero rival e identificarlos
  useEffect(() => {
    const boards = gameState?.boards ?? {};
    const miEquipo = gameState?.jugadores?.find((j) => j.id === profile?.sub)?.equipo;
    const enemigo = miEquipo === 'A' ? 'B' : 'A';
    const cells = boards[enemigo]?.cells ?? {};
    const prev = prevRivalCellsRef.current;
    prevRivalCellsRef.current = cells;

    if (!prev) return;
    const sunkInfo = findNewSunkGroup(cells, prev);
    if (!sunkInfo) return;

    // Desambiguar barcos de tamaño 3 y obtener id del sprite
    let name = sunkInfo.name;
    let shipId = '';
    if (sunkInfo.size === 3) {
      const idx = size3SunkCountRef.current;
      size3SunkCountRef.current = idx + 1;
      const shipEntry = SHIP_NAMES[3][Math.min(idx, SHIP_NAMES[3].length - 1)];
      name = shipEntry.label;
      shipId = shipEntry.id;
    } else {
      const shipEntry = SHIP_NAMES[sunkInfo.size];
      if (shipEntry) { name = shipEntry.label; shipId = shipEntry.id; }
    }

    // Determinar orientación del barco hundido desde las celdas
    const xs = sunkInfo.group.map((k) => +k.split(',')[0]);
    const ys = sunkInfo.group.map((k) => +k.split(',')[1]);
    const horizontal = new Set(ys).size === 1;
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);

    // Acumular en la lista de barcos hundidos (con datos para dibujar el sprite)
    const newSunk = { name, size: sunkInfo.size, cells: sunkInfo.group, id: shipId, x: minX, y: minY, horizontal };
    setSunkenShips((prev) => [...prev, newSunk]);

    const coords = `${String.fromCharCode(65 + sunkInfo.x)}${sunkInfo.y + 1}`;
    const msg = `🔥 ¡HUNDISTE EL ${name.toUpperCase()}! (${sunkInfo.size} celdas, pos: ${coords})`;
    setSunkShipMsg(msg);
    setTimeout(() => setSunkShipMsg(null), 4000);
  }, [gameState, profile?.sub]);

  // Detectar barcos hundidos en el TABLERO PROPIO (cuando el rival te hunde un barco)
  useEffect(() => {
    const boards = gameState?.boards ?? {};
    const miEquipo = gameState?.jugadores?.find((j) => j.id === profile?.sub)?.equipo;
    const cells = boards[miEquipo]?.cells ?? {};
    const prev = prevMyCellsRef.current;
    prevMyCellsRef.current = cells;

    if (!prev) return;
    const sunkInfo = findNewSunkGroup(cells, prev);
    if (!sunkInfo) return;

    let name = sunkInfo.name;
    if (sunkInfo.size === 3) {
      const idx = mySize3SunkCountRef.current;
      mySize3SunkCountRef.current = idx + 1;
      name = SHIP_NAMES[3][Math.min(idx, SHIP_NAMES[3].length - 1)].label;
    }

    // No acumular en sunkenShips (son barcos propios, no del rival)
    // Solo mostrar notificación
    const msg = `💥 ¡HUNDIERON TU ${name.toUpperCase()}!`;
    setSunkShipMsg(msg);
    setTimeout(() => setSunkShipMsg(null), 4000);
  }, [gameState, profile?.sub]);

  // Fin de la partida: se muestra un OVERLAY dentro de la propia partida (más abajo) con el
  // resultado y la opción de REVANCHA en la misma sala. Así no se pierde el socket ni la sala.
  // Al pedir revancha el estado vuelve a COLOCACION y el overlay se oculta solo (depende de
  // fase === 'FIN').
  //
  // Antes existía además una pantalla /result aparte ("Ver resultado y salir") que repetía lo
  // mismo —quién ganó— y añadía un segundo menú de botones. Se eliminó: el overlay ya dice el
  // resultado, y el paso extra solo servía para sacar al jugador de la sala.

  // "Volver a la sala": navega al LOBBY de la MISMA sala. El LobbyPage, al montar con
  // rejoinCodigo, emite room:volver → el jugador reingresa (o reinicia la sala si es el primero).
  // NO se reinicia el juego aquí: solo se inicia cuando el anfitrión pulse "Comenzar" en el lobby.
  function volverASala() {
    const codigo = gameState?.codigo;
    try { localStorage.removeItem(`fleet:${codigo}`); } catch { /* ignore */ }
    clearGameStateCache();
    navigate('/lobby', { state: { rejoinCodigo: codigo, modo: gameState?.modo } });
  }

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  // Abandonar la partida: única salida cuando la sala quedó zombi (el rival se
  // fue, reconexión a una partida muerta, etc.). El servidor quita al jugador,
  // limpia su índice y destruye la sala si queda vacía (handleSalir en room).
  function abandonar() {
    const codigo = gameState?.codigo;
    if (codigo) {
      const soyJugador = gameState?.jugadores?.some((j) => j.id === miId);
      if (soyJugador) {
        socket?.emit('room:salir', { codigo });
        try { localStorage.removeItem(`fleet:${codigo}`); } catch { /* ignore */ }
      } else {
        socket?.emit('room:dejar-espectar', { codigo }); // espectador: solo deja de recibir la sala
      }
    }
    clearGameStateCache();
    navigate('/lobby', { replace: true });
  }

  if (!socket || !gameState) {
    return (
      <main className={styles.centered}>
        <p>Conectando a la partida…</p>
      </main>
    );
  }

  const { fase, turno, jugadores = [], colocados = [], boards = {}, contramedidaActiva, modo } = gameState;
  const miJugador = jugadores.find((j) => j.id === miId);
  // ESPECTADOR: no soy jugador de esta sala — solo miro (tableros públicos A vs B,
  // sin colocar, disparar ni usar poderes). Entró con el código desde el lobby.
  const esEspectador = !miJugador;
  const miEquipo = miJugador?.equipo ?? 'A'; // espectador: ve A como "izquierda" y B como rival
  miEquipoRef.current = miJugador?.equipo ?? null; // el handler de tormenta lo lee para saber si soy el rival
  const esMiTurno = !esEspectador && turno?.jugadorActual === miId;
  const yaColoque = esEspectador || colocados.includes(miId);
  const esModoBot = modo === '1v1-bot';
  const boardSize = BOARD_SIZE_BY_MODE[modo] ?? 10;
  const equipoEnemigo = miEquipo === 'A' ? 'B' : 'A';

  // Energía de equipo (compartida en 2v2).
  const energia = gameState.energia?.[miEquipo] ?? 0;

  // Tableros COMPARTIDOS por equipo. El propio es el de mi equipo (con mi flota recordada
  // + escudos); el rival es el del equipo contrario. En 2v2, mi tablero también contiene
  // la flota de mi compañero (solo veo la mía por localStorage; el resto llega como hit/miss).
  const myBoard = boards[miEquipo] ?? { size: boardSize, cells: {} };
  const myCells = { ...myBoard.cells };
  // La flota del EQUIPO completo se dibuja con SPRITES (teamShips: la mía + la de mi
  // compañero, enviadas por el servidor con sus formas). myFleet (localStorage) es el
  // respaldo si aún no llegan; el relleno gris de celdas queda como ÚLTIMO fallback.
  const ownBoardShips = esEspectador ? espShips[miEquipo] : (teamShips.length ? teamShips : myFleet);
  if (!esEspectador && ownBoardShips.length === 0) {
    for (const k of fleetCells) {
      if (!['hit', 'miss', 'sunk'].includes(myCells[k])) myCells[k] = 'ship';
    }
  }
  // Escudo de equipo: protege TODA la flota (no una celda). Se muestra como badge, no en el tablero.
  const escudoPropioActivo = !!gameState.escudos?.[miEquipo];

  // Tablero rival. Prioridad visual (de mayor a menor): resultado del servidor
  // (hit/miss/sunk) > disparo optimista (pending) > revelado por sonar. El sonar es la
  // capa MÁS BAJA: solo marca celdas aún sin explorar y nunca tapa un ataque en curso o
  // resuelto (antes el sonar pisaba los disparos, por eso "solo se veía el ataque al acabar el sonar").
  const rivalBoard = boards[equipoEnemigo] ?? { size: boardSize, cells: {} };
  const rivalCells = { ...rivalBoard.cells };
  // Disparos optimistas aún sin confirmar del servidor.
  for (const k of pendingShots) {
    if (!['hit', 'miss', 'sunk'].includes(rivalCells[k])) rivalCells[k] = 'pending';
  }
  // Revelado por sonar: solo sobre celdas sin explorar (no pisa hit/miss/sunk/pending).
  for (const c of sonarReveal) {
    const k = `${c.x},${c.y}`;
    if (!rivalCells[k] || rivalCells[k] === 'fog') rivalCells[k] = 'sonar';
  }

  // Poder ofensivo en curso lanzado por MI equipo (mostrar "esperando reacción del rival").
  const poderEnCurso = contramedidaActiva && contramedidaActiva.targetEquipo !== miEquipo;

  // ── Colocación ──────────────────────────────────────────────────────────────
  function confirmarFlota(ships) {
    setMyFleet(ships);
    fleetConfirmed.current = true;
    // Persistir la flota por sala: el servidor nunca reenvía las posiciones de tus
    // propios barcos (estado sanitizado), así que la guardamos para poder seguir
    // dibujándola en tu tablero durante toda la partida, incluso tras recargar o reconectar.
    try { localStorage.setItem(`fleet:${gameState.codigo}`, JSON.stringify(ships)); } catch { /* ignore */ }
    socket.emit('colocacion:set', { codigo: gameState.codigo, ships });
  }

  // ── Poderes ─────────────────────────────────────────────────────────────────
  function elegirPoder(power) {
    // Escudo y Tormenta no necesitan objetivo: se activan de inmediato.
    if (power.id === 'tormenta' || power.id === 'escudo') {
      socket.emit('poder:usar', { codigo: gameState.codigo, powerType: power.id, target: null });
      setSelectedPower(null);
      return;
    }
    setSelectedPower((prev) => (prev === power.id ? null : power.id));
  }

  // ── Clic en el tablero rival ─────────────────────────────────────────────────
  function clickRival(x, y) {
    const codigo = gameState.codigo;
    // Bombardeo y Sonar apuntan a una celda del tablero rival (ambos operan sobre un área 3×3).
    if (selectedPower === 'bombardeo' || selectedPower === 'sonar') {
      socket.emit('poder:usar', { codigo, powerType: selectedPower, target: { x, y } });
      setSelectedPower(null);
      return;
    }
    // Disparo normal / salva. Marca la celda como "pendiente" al instante (feedback
    // optimista) para que el clic se sienta registrado aunque el servidor tarde.
    const key = `${x},${y}`;
    if (rivalCells[key] && ['hit', 'miss', 'sunk', 'pending'].includes(rivalCells[key])) return;
    if (fase === 'SALVA') {
      // Se encola el disparo. El intervalo de drenado lo envía al ritmo de la cadencia.
      if (salvoQueue.current.length >= 20) return; // límite de seguridad
      const ahora = Date.now();
      if (ahora - lastSalvoEmit.current < SALVO_EMIT_MS) {
        salvoQueue.current.push({ x, y });
        marcarPendiente(key, 9000); // el marcador aguanta toda la ventana de salva
        return;
      }
      lastSalvoEmit.current = ahora;
      socket.emit('salva:disparo', { codigo, x, y });
      marcarPendiente(key, 9000);
    } else if (fase === 'TURNOS' && esMiTurno && pendingShots.size === 0) {
      // Solo se permite UN disparo por turno: si ya hay uno pendiente, se ignoran los clics
      // extra (evita mandar disparos que el servidor rechazaría por "no es tu turno").
      socket.emit('disparo:realizar', { codigo, x, y });
      marcarPendiente(key);
    }
  }

  function marcarPendiente(key, ms = 4000) {
    setPendingShots((prev) => new Set(prev).add(key));
    // Caducar el marcador por si el disparo fue rechazado (sin cambiar la celda).
    setTimeout(() => setPendingShots((prev) => {
      const n = new Set(prev); n.delete(key); return n;
    }), ms);
  }

  const rivalInteractive = fase === 'SALVA' || (fase === 'TURNOS' && esMiTurno);
  const propioInteractive = false; // el tablero propio ya no es interactivo (escudo es global)
  // Chat/Voz solo con OTRO humano en la sala (no 1v1-bot ni espectador).
  const hayOtroHumano = !esEspectador && jugadores.some((j) => j.id !== miId && !j.esBot);

  // Etiqueta de turno consciente de equipo / bot / compañero.
  const jugadorEnTurno = jugadores.find((j) => j.id === turno?.jugadorActual);
  function etiquetaTurno() {
    if (turno?.pausado) {
      const p = jugadores.find((j) => j.id === turno.pausadoPor);
      return { txt: `En pausa — ${p?.name ?? 'jugador'} desconectado`, cls: 'turnPaused' };
    }
    if (esMiTurno) return { txt: '¡Es tu turno! Dispara al tablero rival', cls: 'turnMine' };
    if (!jugadorEnTurno) return { txt: 'Esperando…', cls: 'turnOther' };
    if (jugadorEnTurno.esBot) return { txt: 'Turno del Bot…', cls: 'turnOther' };
    if (miEquipo && jugadorEnTurno.equipo === miEquipo)
      return { txt: `Turno de tu compañero (${jugadorEnTurno.name})`, cls: 'turnMate' };
    return { txt: `Turno del rival (${jugadorEnTurno.name})`, cls: 'turnOther' };
  }
  const turnoInfo = etiquetaTurno();

  return (
    <main className={styles.wrap}>
      <PixelBackdrop scene="workshop" />
      <CountermeasureAlert socket={socket} codigo={gameState.codigo} energia={energia} />
      <StormGates trigger={storm.trigger} porNombre={storm.by} />

      <header className={styles.header}>
        <div className={styles.phaseInfo}>
          {gameState.nombre && <span className={styles.roomName}>⚓ {gameState.nombre}</span>}
          <span className={styles.phase}>{FASE_LABEL[fase] ?? fase}</span>
          {fase === 'TURNOS' && (
            <span key={turno?.jugadorActual ?? fase} className={`${styles.turn} ${styles[turnoInfo.cls]}`}>{turnoInfo.txt}</span>
          )}
          {fase === 'SALVA' && <span className={`${styles.turn} ${styles.turnMine}`}>¡Todos disparan!</span>}
        </div>
        <div className={styles.headerActions}>
          <Timer tipo={timer.tipo} remaining={timer.remaining} />
          {fase !== 'FIN' && (
            <button className={styles.leaveBtn} onClick={abandonar} title="Salir de esta partida y volver al lobby">
              {esEspectador ? '🚪 Dejar de ver' : '🚪 Abandonar'}
            </button>
          )}
        </div>
      </header>

      {sunkShipMsg && <p className={styles.sunkMsg}>{sunkShipMsg}</p>}
      {toast && <p role="alert" className={styles.toast}>{toast}</p>}
      {poderMsg && <p className={styles.poderMsg}>{poderMsg}</p>}
      {poderEnCurso && (
        <p className={styles.poderEnCurso}>
          Poder <strong>{contramedidaActiva.powerType}</strong> lanzado — esperando la reacción del rival…
        </p>
      )}
      {fase === 'SALVA' && <SalvoBanner remaining={timer.tipo === 'SALVA' ? timer.remaining : null} notice={salvoNotice} />}

      {/* ── Layout HORIZONTAL (sin scroll):
           arriba jugadores (izq) + energía/poderes (der);
           centro TU tablero (izq) y el RIVAL para disparar (der);
           abajo chat de texto (izq) y chat de voz (der). ── */}
      <div className={styles.layout}>
        <section className={styles.topRow}>
          <div className={`${styles.playersBox} metal`}>
            <PlayerList jugadores={jugadores} miId={miId} miEquipo={miJugador?.equipo} activeId={turno?.jugadorActual} />
          </div>
          <div className={`${styles.powersBox} metal`}>
            {!esEspectador && (fase === 'TURNOS' || fase === 'SALVA') && <EnergyBar energia={energia} />}
            {fase === 'TURNOS' && esMiTurno ? (
              <PowerPanel
                energia={energia}
                tormentaUsada={!!gameState.tormentaUsada?.[miId]}
                selectedPower={selectedPower}
                onChoose={elegirPoder}
              />
            ) : (
              <p className={styles.powersIdle}>
                {esEspectador ? '👁 Modo espectador' :
                 fase === 'COLOCACION' ? 'Los poderes se habilitan en tu turno.' :
                 fase === 'SALVA' ? '¡Salva! Dispara en el tablero rival.' :
                 'Poderes disponibles en tu turno.'}
              </p>
            )}
          </div>
        </section>

        {/* Fila de juego: tableros (izq) + columna de chats (der). El chat de texto va al
            LADO DERECHO de los tableros y la voz (solo botones, compacta) DEBAJO del chat —
            así los tableros se ven en horizontal junto con los chats, sin scroll. */}
        <div className={styles.gameRow}>
        <section className={styles.mainCol}>
          {fase === 'COLOCACION' && !yaColoque ? (
            <ShipPlacer
              onConfirm={confirmarFlota}
              size={boardSize}
              teammateShips={[
                ...teamShips, // flota del compañero YA confirmada
                ...previewShips.map((s) => ({ ...s, key: `prev_${s.id}`, tipo: s.id })), // en vivo, sin confirmar
              ]}
              onPreview={(ships) => socket.emit('colocacion:preview', { codigo: gameState.codigo, ships })}
            />
          ) : (
            <div className={styles.boards}>
              {/* IZQUIERDA: tu tablero (flota posicionada) — DERECHA: rival (dispara aquí). */}
              <div className={styles.myBoardWrap}>
                <Board
                  size={myBoard.size}
                  cells={myCells}
                  interactive={false}
                  label={esEspectador ? 'Equipo A' : 'Tu tablero (flota del equipo)'}
                  variant="map"
                  ships={ownBoardShips}
                />
                {!esEspectador && escudoPropioActivo && <span className={styles.shieldBadge}>🛡 Escudo activo — tu flota está protegida del próximo impacto</span>}
              </div>
              <Board
                size={rivalBoard.size}
                cells={rivalCells}
                interactive={rivalInteractive}
                onCellClick={clickRival}
                label={esEspectador ? 'Equipo B' : 'Tablero rival (dispara aquí)'}
                variant="screen"
                sunkenShips={sunkenShips}
                powerCast={powerCast}
                ships={esEspectador ? espShips[equipoEnemigo] : []}
              />
            </div>
          )}

          {fase === 'COLOCACION' && yaColoque && !esEspectador && (
            <p className={styles.waiting}>Flota confirmada. Esperando al resto de jugadores…</p>
          )}
          {esEspectador && (
            <p className={styles.waiting}>👁 Estás viendo esta partida como espectador.</p>
          )}

          {(selectedPower === 'sonar' || selectedPower === 'bombardeo') && (
            <p className={styles.powerHint}>
              {selectedPower === 'sonar' ? 'Sonar' : 'Bombardeo'}: haz clic en el tablero rival (derecha) para elegir el centro del área 3×3.
            </p>
          )}
        </section>

        {/* Columna derecha: chat de texto arriba, voz COMPACTA (solo botones) debajo. */}
        {hayOtroHumano && (
          <aside className={styles.chatCol}>
            <Chat
              socket={socket}
              codigo={gameState.codigo}
              titulo="Chat"
              conCanales={modo === '2v2'}
              jugadores={jugadores}
              miId={miId}
            />
            <VoiceChat
              socket={socket}
              codigo={gameState.codigo}
              jugadores={jugadores}
              miId={miId}
              titulo="Voz"
              conCanales={modo === '2v2'}
              compact
            />
          </aside>
        )}
        </div>
      </div>

      {/* Overlay de FIN: resultado + REVANCHA en la misma sala (sin volver al lobby). */}
      {fase === 'FIN' && (
        <div className={styles.finOverlay} role="dialog" aria-modal="true">
          <div className={`${styles.finCard} metal`}>
            <h2 className={styles.finTitle}>
              {!gameState.winner ? 'Partida terminada'
                : miEquipo === gameState.winner ? '🏆 ¡Ganaste!'
                : esEspectador ? `Gana el equipo ${gameState.winner}`
                : '💥 Derrota'}
            </h2>
            <p className={styles.finSub}>
              {esEspectador ? 'La partida ha terminado.' : '¿Otra ronda en esta misma sala?'}
            </p>
            <div className={styles.finActions}>
              {!esEspectador && (
                <button className={styles.finPrimary} onClick={volverASala}>
                  🔄 Jugar otra vez
                </button>
              )}
              <button className={styles.finSecondary} onClick={abandonar}>
                🚪 Elegir otro modo
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
