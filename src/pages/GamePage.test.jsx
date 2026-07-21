import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// GamePage es el corazón del juego: coordina fases, disparos, poderes y salva. Se prueba
// mockeando sus hooks de conexión (useAuth/useSocket/useGameState) y los componentes hijos
// más pesados (Board, ShipPlacer, chat/voz, decorativos) para aislar la lógica PROPIA de
// GamePage — sus reglas de fase, sus guardas de disparo y sus handlers de eventos de socket —
// de la de esos hijos, que ya se prueban aparte.

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../hooks/useSocket', () => ({ useSocket: vi.fn() }));
vi.mock('../hooks/useGameState', () => ({ useGameState: vi.fn(), clearGameStateCache: vi.fn() }));

// Board real dibuja un grid de celdas con sprites; aquí solo necesitamos poder "hacer clic"
// en celdas concretas y ver qué props le llegan (label, ships, interactive).
vi.mock('../components/Board/Board', () => ({
  default: ({ label, interactive, onCellClick, ships }) => (
    <div data-testid="board" data-label={label} data-ships={ships?.length ?? 0}>
      <span>{label}</span>
      {interactive && (
        <>
          <button onClick={() => onCellClick(3, 4)}>{`disparar-${label}`}</button>
          <button onClick={() => onCellClick(5, 6)}>{`disparar2-${label}`}</button>
        </>
      )}
    </div>
  ),
}));

vi.mock('../components/ShipPlacer/ShipPlacer', () => ({
  default: ({ onConfirm, teammateShips }) => (
    <div>
      <span data-testid="teammate-count">{teammateShips?.length ?? 0}</span>
      <button onClick={() => onConfirm([{ id: 'yo_destructor', size: 2, x: 0, y: 0, horizontal: true }])}>
        confirmar-flota
      </button>
    </div>
  ),
}));

vi.mock('../components/CountermeasureAlert/CountermeasureAlert', () => ({
  default: (props) => <div data-testid="countermeasure-alert" data-energia={props.energia} />,
}));
vi.mock('../components/StormGates/StormGates', () => ({
  default: (props) => (
    <div data-testid="storm-gates" data-trigger={props.trigger} data-por={props.porNombre ?? ''} />
  ),
}));
vi.mock('../components/Chat/Chat', () => ({ default: () => <div data-testid="chat" /> }));
vi.mock('../components/VoiceChat/VoiceChat', () => ({ default: () => <div data-testid="voice-chat" /> }));
vi.mock('../components/PixelBackdrop/PixelBackdrop', () => ({ default: () => <div data-testid="pixel-backdrop" /> }));

import GamePage, { shapesFromBarcos, findNewSunkGroup, rivalBoardCells } from './GamePage';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { useGameState, clearGameStateCache } from '../hooks/useGameState';

// ── Funciones puras (sin renderizar nada) ─────────────────────────────────────────────

describe('shapesFromBarcos', () => {
  it('sin barcos, no arma ninguna forma', () => {
    expect(shapesFromBarcos(undefined)).toEqual([]);
    expect(shapesFromBarcos({})).toEqual([]);
  });

  it('arma la forma de un barco horizontal desde sus celdas', () => {
    const [shape] = shapesFromBarcos({ p1_destructor: [[2, 3], [3, 3]] });
    expect(shape).toMatchObject({ id: 'p1_destructor', tipo: 'destructor', size: 2, x: 2, y: 3, horizontal: true });
  });

  it('arma la forma de un barco vertical', () => {
    const [shape] = shapesFromBarcos({ p1_submarino: [[4, 1], [4, 2], [4, 3]] });
    expect(shape).toMatchObject({ tipo: 'submarino', horizontal: false });
  });

  it('un barco de una sola celda se considera horizontal', () => {
    expect(shapesFromBarcos({ p1_x: [[0, 0]] })[0].horizontal).toBe(true);
  });
});

describe('findNewSunkGroup', () => {
  it('sin celdas nuevas hundidas, no devuelve nada', () => {
    expect(findNewSunkGroup({ '0,0': 'hit' }, { '0,0': 'hit' })).toBeNull();
  });

  it('detecta un grupo nuevo de 2 celdas conectadas (Destructor)', () => {
    const r = findNewSunkGroup(
      { '0,0': 'sunk', '1,0': 'sunk', '2,0': 'hit' },
      { '0,0': 'hit', '1,0': 'hit', '2,0': 'hit' },
    );
    expect(r).toMatchObject({ size: 2, name: 'Destructor', x: 0, y: 0 });
    expect(r.group.slice().sort()).toEqual(['0,0', '1,0']);
  });

  it('un grupo de 4 celdas se identifica como Acorazado', () => {
    const r = findNewSunkGroup({ '0,0': 'sunk', '1,0': 'sunk', '2,0': 'sunk', '3,0': 'sunk' }, {});
    expect(r).toMatchObject({ size: 4, name: 'Acorazado' });
  });

  it('un grupo de 3 usa el placeholder Crucero (la desambiguación pasa afuera)', () => {
    const r = findNewSunkGroup({ '0,0': 'sunk', '0,1': 'sunk', '0,2': 'sunk' }, {});
    expect(r).toMatchObject({ size: 3, name: 'Crucero' });
  });

  it('un tamaño sin nombre conocido usa el genérico', () => {
    const r = findNewSunkGroup({ '0,0': 'sunk' }, {});
    expect(r.name).toBe('Barco de 1 celdas');
  });

  it('con dos grupos nuevos a la vez, elige el más grande', () => {
    const r = findNewSunkGroup(
      { '0,0': 'sunk', '1,0': 'sunk', '5,5': 'sunk', '5,6': 'sunk', '5,7': 'sunk' },
      {},
    );
    expect(r.size).toBe(3);
  });
});

describe('rivalBoardCells', () => {
  it('devuelve las celdas del equipo CONTRARIO al mío', () => {
    const gameState = {
      boards: { A: { cells: { '0,0': 'hit' } }, B: { cells: { '1,1': 'miss' } } },
      jugadores: [{ id: 'yo', equipo: 'A' }],
    };
    expect(rivalBoardCells(gameState, 'yo')).toEqual({ '1,1': 'miss' });
  });

  it('sin gameState o sin tableros, no revienta', () => {
    expect(rivalBoardCells(null, 'yo')).toEqual({});
    expect(rivalBoardCells({}, 'yo')).toEqual({});
  });
});

// ── Componente ─────────────────────────────────────────────────────────────────────────

function crearSocketFalso() {
  const handlers = {};
  return {
    emit: vi.fn(),
    on: vi.fn((evt, cb) => { (handlers[evt] ??= []).push(cb); }),
    off: vi.fn((evt, cb) => { handlers[evt] = (handlers[evt] ?? []).filter((h) => h !== cb); }),
    // Los handlers de GamePage llaman a setState fuera del sistema de eventos de React
    // (no pasan por fireEvent), así que hay que envolver la entrega en act() para que RTL
    // espere a que el estado se propague antes de que la aserción lea el DOM.
    disparar(evt, payload) {
      act(() => { (handlers[evt] ?? []).slice().forEach((h) => h(payload)); });
    },
  };
}

function crearGameState(overrides = {}) {
  return {
    codigo: 'ABC123',
    nombre: 'Sala de prueba',
    modo: '1v1',
    fase: 'TURNOS',
    turno: { jugadorActual: 'yo', numeroTurno: 1, pausado: false },
    jugadores: [
      { id: 'yo', name: 'Ana', equipo: 'A', esBot: false, conectado: true },
      { id: 'rival', name: 'Beto', equipo: 'B', esBot: false, conectado: true },
    ],
    colocados: ['yo', 'rival'],
    boards: { A: { size: 10, cells: {} }, B: { size: 10, cells: {} } },
    contramedidaActiva: null,
    energia: { A: 3, B: 3 },
    escudos: { A: false, B: false },
    winner: null,
    tormentaUsada: {},
    ...overrides,
  };
}

let socket;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  socket = crearSocketFalso();
  useAuth.mockReturnValue({ token: 'tok', profile: { sub: 'yo', name: 'Ana' }, isAuthenticated: true });
  useSocket.mockReturnValue({ socket, connected: true });
  useGameState.mockReturnValue(crearGameState());
});

function renderPage() {
  return render(<MemoryRouter><GamePage /></MemoryRouter>);
}

describe('estado de carga', () => {
  it('sin socket, muestra el mensaje de conexión', () => {
    useSocket.mockReturnValue({ socket: null, connected: false });
    renderPage();
    expect(screen.getByText(/conectando a la partida/i)).toBeInTheDocument();
  });

  it('con socket pero sin gameState aún, también espera', () => {
    useGameState.mockReturnValue(null);
    renderPage();
    expect(screen.getByText(/conectando a la partida/i)).toBeInTheDocument();
  });
});

describe('fase COLOCACION', () => {
  it('si aún no coloqué, muestra el colocador de barcos', () => {
    useGameState.mockReturnValue(crearGameState({ fase: 'COLOCACION', colocados: [] }));
    renderPage();
    expect(screen.getByText('confirmar-flota')).toBeInTheDocument();
  });

  it('confirmar la flota emite colocacion:set y la persiste en localStorage', () => {
    useGameState.mockReturnValue(crearGameState({ fase: 'COLOCACION', colocados: [] }));
    renderPage();
    fireEvent.click(screen.getByText('confirmar-flota'));
    expect(socket.emit).toHaveBeenCalledWith(
      'colocacion:set',
      expect.objectContaining({ codigo: 'ABC123' }),
    );
    expect(localStorage.getItem('fleet:ABC123')).toBeTruthy();
  });

  it('si ya coloqué, muestra el aviso de espera en vez del colocador', () => {
    useGameState.mockReturnValue(crearGameState({ fase: 'COLOCACION', colocados: ['yo'] }));
    renderPage();
    expect(screen.queryByText('confirmar-flota')).not.toBeInTheDocument();
    expect(screen.getByText(/flota confirmada/i)).toBeInTheDocument();
  });

  it('equipo:preview actualiza la vista previa de los barcos del compañero', () => {
    useGameState.mockReturnValue(crearGameState({ fase: 'COLOCACION', colocados: [] }));
    renderPage();
    expect(screen.getByTestId('teammate-count')).toHaveTextContent('0');
    socket.disparar('equipo:preview', { ships: [{ id: 'compa_destructor', size: 2, x: 0, y: 0, horizontal: true }] });
    expect(screen.getByTestId('teammate-count')).toHaveTextContent('1');
  });
});

describe('fase TURNOS', () => {
  it('en mi turno, muestra el aviso y el panel de poderes', () => {
    renderPage();
    expect(screen.getByText(/es tu turno/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bombardeo/i })).toBeInTheDocument();
  });

  it('un disparo normal en el tablero rival emite disparo:realizar', () => {
    renderPage();
    fireEvent.click(screen.getByText(/^disparar-/));
    expect(socket.emit).toHaveBeenCalledWith('disparo:realizar', { codigo: 'ABC123', x: 3, y: 4 });
  });

  it('no deja mandar un segundo disparo mientras el primero sigue pendiente', () => {
    renderPage();
    const boton = screen.getByText(/^disparar-/);
    fireEvent.click(boton);
    fireEvent.click(boton);
    expect(socket.emit.mock.calls.filter(([evt]) => evt === 'disparo:realizar')).toHaveLength(1);
  });

  it('elegir escudo o tormenta emite el poder de inmediato, sin pedir objetivo', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /escudo/i }));
    expect(socket.emit).toHaveBeenCalledWith('poder:usar', { codigo: 'ABC123', powerType: 'escudo', target: null });
  });

  it('elegir bombardeo/sonar pide objetivo: el siguiente clic en el rival lo dispara', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /bombardeo/i }));
    fireEvent.click(screen.getByText(/^disparar-/));
    expect(socket.emit).toHaveBeenCalledWith(
      'poder:usar',
      { codigo: 'ABC123', powerType: 'bombardeo', target: { x: 3, y: 4 } },
    );
    expect(socket.emit).not.toHaveBeenCalledWith('disparo:realizar', expect.anything());
  });

  it('si no es mi turno, no se muestra el panel de poderes', () => {
    useGameState.mockReturnValue(crearGameState({ turno: { jugadorActual: 'rival', numeroTurno: 1 } }));
    renderPage();
    expect(screen.queryByRole('button', { name: /bombardeo/i })).not.toBeInTheDocument();
  });

  it('una celda ya marcada hit/miss/sunk no se puede volver a disparar', () => {
    useGameState.mockReturnValue(crearGameState({ boards: { A: { size: 10, cells: {} }, B: { size: 10, cells: { '3,4': 'miss' } } } }));
    renderPage();
    fireEvent.click(screen.getByText(/^disparar-/));
    expect(socket.emit).not.toHaveBeenCalledWith('disparo:realizar', expect.anything());
  });
});

describe('fase SALVA', () => {
  function estadoSalva(overrides = {}) {
    return crearGameState({ fase: 'SALVA', turno: { jugadorActual: null, numeroTurno: 6 }, ...overrides });
  }

  it('muestra el aviso de fuego libre y permite disparar sin esperar turno', () => {
    useGameState.mockReturnValue(estadoSalva());
    renderPage();
    expect(screen.getByText('¡Todos disparan!')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/^disparar-/));
    expect(socket.emit).toHaveBeenCalledWith('salva:disparo', { codigo: 'ABC123', x: 3, y: 4 });
  });

  it('un segundo disparo a OTRA celda casi al instante se encola en vez de mandarse ya', () => {
    useGameState.mockReturnValue(estadoSalva());
    renderPage();
    fireEvent.click(screen.getByText(/^disparar-/));   // celda (3,4): se emite (cadencia inicial libre)
    fireEvent.click(screen.getByText(/^disparar2-/));  // celda (5,6): mismo instante → dentro del margen
    const disparos = socket.emit.mock.calls.filter(([evt]) => evt === 'salva:disparo');
    expect(disparos).toHaveLength(1);
    expect(disparos[0][1]).toEqual({ codigo: 'ABC123', x: 3, y: 4 });
  });
});

describe('fase FIN', () => {
  it('si mi equipo ganó, muestra el mensaje de victoria', () => {
    useGameState.mockReturnValue(crearGameState({ fase: 'FIN', winner: 'A' }));
    renderPage();
    expect(screen.getByText(/ganaste/i)).toBeInTheDocument();
  });

  it('si ganó el rival, muestra derrota', () => {
    useGameState.mockReturnValue(crearGameState({ fase: 'FIN', winner: 'B' }));
    renderPage();
    expect(screen.getByText(/derrota/i)).toBeInTheDocument();
  });

  it('"Jugar otra vez" limpia la flota guardada y navega al lobby de la MISMA sala', () => {
    localStorage.setItem('fleet:ABC123', '[]');
    useGameState.mockReturnValue(crearGameState({ fase: 'FIN', winner: 'A' }));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /jugar otra vez/i }));
    expect(localStorage.getItem('fleet:ABC123')).toBeNull();
    expect(clearGameStateCache).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/lobby', { state: { rejoinCodigo: 'ABC123', modo: '1v1' } });
  });

  it('"Elegir otro modo" abandona la sala y navega reemplazando el historial', () => {
    useGameState.mockReturnValue(crearGameState({ fase: 'FIN', winner: 'A' }));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /elegir otro modo/i }));
    expect(socket.emit).toHaveBeenCalledWith('room:salir', { codigo: 'ABC123' });
    expect(navigateMock).toHaveBeenCalledWith('/lobby', { replace: true });
  });

  it('el botón de abandonar del header se oculta en fase FIN (ya hay salida en el overlay)', () => {
    useGameState.mockReturnValue(crearGameState({ fase: 'FIN', winner: 'A' }));
    renderPage();
    expect(screen.queryByTitle(/salir de esta partida/i)).not.toBeInTheDocument();
  });
});

describe('espectador', () => {
  function estadoEspectador(overrides = {}) {
    return crearGameState({
      jugadores: [
        { id: 'humano1', name: 'Ana', equipo: 'A', esBot: false, conectado: true },
        { id: 'humano2', name: 'Beto', equipo: 'B', esBot: false, conectado: true },
      ],
      ...overrides,
    });
  }

  it('si no soy ninguno de los jugadores, entro en modo espectador', () => {
    useGameState.mockReturnValue(estadoEspectador());
    renderPage();
    expect(screen.getByText(/modo espectador/i)).toBeInTheDocument();
  });

  it('espectador ve "Equipo A" / "Equipo B" en vez de "tu tablero"', () => {
    useGameState.mockReturnValue(estadoEspectador());
    renderPage();
    expect(screen.getByText('Equipo A')).toBeInTheDocument();
    expect(screen.getByText('Equipo B')).toBeInTheDocument();
  });

  it('abandonar como espectador emite room:dejar-espectar, no room:salir', () => {
    useGameState.mockReturnValue(estadoEspectador());
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /dejar de ver/i }));
    expect(socket.emit).toHaveBeenCalledWith('room:dejar-espectar', { codigo: 'ABC123' });
    expect(socket.emit).not.toHaveBeenCalledWith('room:salir', expect.anything());
  });
});

describe('etiqueta de turno', () => {
  it('en pausa por desconexión', () => {
    useGameState.mockReturnValue(crearGameState({
      turno: { jugadorActual: 'yo', numeroTurno: 1, pausado: true, pausadoPor: 'rival' },
    }));
    renderPage();
    expect(screen.getByText(/en pausa — beto desconectado/i)).toBeInTheDocument();
  });

  it('turno del bot', () => {
    useGameState.mockReturnValue(crearGameState({
      jugadores: [
        { id: 'yo', name: 'Ana', equipo: 'A', esBot: false, conectado: true },
        { id: 'bot', name: 'Bot', equipo: 'B', esBot: true, conectado: true },
      ],
      turno: { jugadorActual: 'bot', numeroTurno: 2 },
    }));
    renderPage();
    expect(screen.getByText(/turno del bot/i)).toBeInTheDocument();
  });

  it('turno del compañero de equipo (2v2)', () => {
    useGameState.mockReturnValue(crearGameState({
      modo: '2v2',
      jugadores: [
        { id: 'yo', name: 'Ana', equipo: 'A', esBot: false, conectado: true },
        { id: 'compa', name: 'Cata', equipo: 'A', esBot: false, conectado: true },
        { id: 'rival', name: 'Beto', equipo: 'B', esBot: false, conectado: true },
      ],
      turno: { jugadorActual: 'compa', numeroTurno: 2 },
    }));
    renderPage();
    expect(screen.getByText(/turno de tu compañero \(cata\)/i)).toBeInTheDocument();
  });

  it('turno del rival', () => {
    useGameState.mockReturnValue(crearGameState({ turno: { jugadorActual: 'rival', numeroTurno: 2 } }));
    renderPage();
    expect(screen.getByText(/turno del rival \(beto\)/i)).toBeInTheDocument();
  });
});

describe('chat y voz', () => {
  it('se muestran cuando hay otro humano en la sala', () => {
    renderPage();
    expect(screen.getByTestId('chat')).toBeInTheDocument();
    expect(screen.getByTestId('voice-chat')).toBeInTheDocument();
  });

  it('se ocultan en 1v1 contra el bot (no tiene sentido chatear con él)', () => {
    useGameState.mockReturnValue(crearGameState({
      modo: '1v1-bot',
      jugadores: [
        { id: 'yo', name: 'Ana', equipo: 'A', esBot: false, conectado: true },
        { id: 'bot', name: 'Bot', equipo: 'B', esBot: true, conectado: true },
      ],
    }));
    renderPage();
    expect(screen.queryByTestId('chat')).not.toBeInTheDocument();
    expect(screen.queryByTestId('voice-chat')).not.toBeInTheDocument();
  });
});

describe('eventos de socket propios de GamePage', () => {
  it('game:error de cadencia NO muestra un toast (se reencola en silencio)', () => {
    useGameState.mockReturnValue(crearGameState({ fase: 'SALVA', turno: { jugadorActual: null, numeroTurno: 6 } }));
    renderPage();
    socket.disparar('game:error', { error: 'cadencia_no_cumplida', x: 3, y: 4 });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('game:error de "ya disparada" tampoco genera toast', () => {
    renderPage();
    socket.disparar('game:error', { error: 'celda_ya_disparada', x: 1, y: 1 });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('game:error de energía insuficiente sí muestra un toast', () => {
    renderPage();
    socket.disparar('game:error', { error: 'energia_insuficiente' });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('poder:tormenta anima las compuertas SOLO para el rival, no para quien la lanzó', () => {
    renderPage();
    socket.disparar('poder:tormenta', { porId: 'yo', porNombre: 'Ana', equipo: 'A' });
    expect(screen.getByTestId('storm-gates')).toHaveAttribute('data-trigger', '0');

    socket.disparar('poder:tormenta', { porId: 'rival', porNombre: 'Beto', equipo: 'B' });
    expect(screen.getByTestId('storm-gates')).toHaveAttribute('data-trigger', '1');
  });

  it('poder:resultado de escudo muestra el mensaje de confirmación', () => {
    renderPage();
    socket.disparar('poder:resultado', { powerType: 'escudo' });
    expect(screen.getByText(/escudo activado/i)).toBeInTheDocument();
  });

  it('tu:flota actualiza las formas de la flota que se dibujan en mi tablero', () => {
    renderPage();
    const propio = screen.getByText('Tu tablero (flota del equipo)').closest('[data-testid="board"]');
    expect(propio).toHaveAttribute('data-ships', '0');
    socket.disparar('tu:flota', { cells: [[0, 0], [1, 0]], barcos: { yo_destructor: [[0, 0], [1, 0]] } });
    expect(propio).toHaveAttribute('data-ships', '1');
  });
});

describe('barco hundido', () => {
  it('detecta un grupo nuevo de celdas sunk en el tablero rival y avisa', () => {
    useGameState.mockReturnValue(crearGameState({
      boards: { A: { size: 10, cells: {} }, B: { size: 10, cells: { '0,0': 'hit', '1,0': 'hit' } } },
    }));
    const { rerender } = renderPage();

    useGameState.mockReturnValue(crearGameState({
      boards: { A: { size: 10, cells: {} }, B: { size: 10, cells: { '0,0': 'sunk', '1,0': 'sunk' } } },
    }));
    rerender(<MemoryRouter><GamePage /></MemoryRouter>);

    expect(screen.getByText(/hundiste el destructor/i)).toBeInTheDocument();
  });

  it('detecta cuando el RIVAL me hunde un barco propio (sin acumularlo en la lista de trofeos)', () => {
    useGameState.mockReturnValue(crearGameState({
      boards: { A: { size: 10, cells: { '0,0': 'hit', '1,0': 'hit' } }, B: { size: 10, cells: {} } },
    }));
    const { rerender } = renderPage();

    useGameState.mockReturnValue(crearGameState({
      boards: { A: { size: 10, cells: { '0,0': 'sunk', '1,0': 'sunk' } }, B: { size: 10, cells: {} } },
    }));
    rerender(<MemoryRouter><GamePage /></MemoryRouter>);

    expect(screen.getByText(/hundieron tu destructor/i)).toBeInTheDocument();
  });
});

describe('escudo de equipo', () => {
  it('muestra el badge de escudo activo cuando mi equipo lo tiene', () => {
    useGameState.mockReturnValue(crearGameState({ escudos: { A: true, B: false } }));
    renderPage();
    expect(screen.getByText(/escudo activo/i)).toBeInTheDocument();
  });

  it('no muestra el badge si no hay escudo', () => {
    renderPage();
    expect(screen.queryByText(/escudo activo/i)).not.toBeInTheDocument();
  });
});
