import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LobbyPage from './LobbyPage';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { primeGameStateCache } from '../hooks/useGameState';
import { ROOM_ERRORS } from '../constants/copy';

// PixelBackdrop dibuja en <canvas> vía requestAnimationFrame; jsdom no implementa un
// contexto 2D real (no está el paquete `canvas`), así que se reemplaza por un stub — no es
// parte de la lógica de LobbyPage que queremos probar y evita ruido/crashes ajenos al test.
vi.mock('../components/PixelBackdrop/PixelBackdrop', () => ({
  default: () => null,
}));

// AccountMenu es un componente hijo independiente (menú de cuenta): lo stubeamos para
// aislar el comportamiento propio del lobby y no depender de sus propias llamadas a la API.
vi.mock('../components/AccountMenu/AccountMenu', () => ({
  default: () => null,
}));

vi.mock('../hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../hooks/useSocket', () => ({ useSocket: vi.fn() }));
vi.mock('../hooks/useGameState', () => ({ primeGameStateCache: vi.fn() }));

let mockNavigate;
let mockLocationState = {};

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: mockLocationState }),
}));

// Socket falso con un mapa de listeners: `fire` invoca los handlers registrados con
// socket.on(evento, cb), envuelto en act() porque simula un evento asíncrono del servidor.
function makeSocket() {
  const handlers = {};
  return {
    on: vi.fn((evt, cb) => { (handlers[evt] ??= []).push(cb); }),
    off: vi.fn((evt, cb) => { handlers[evt] = (handlers[evt] || []).filter((h) => h !== cb); }),
    emit: vi.fn(),
    fire: (evt, payload) => act(() => { (handlers[evt] || []).forEach((cb) => cb(payload)); }),
  };
}

function renderLobby() {
  return render(
    <MemoryRouter>
      <LobbyPage />
    </MemoryRouter>,
  );
}

const MI_ID = 'me-1';
const perfil = { sub: MI_ID, name: 'Ana' };

let socket;

beforeEach(() => {
  vi.clearAllMocks();
  mockNavigate = vi.fn();
  mockLocationState = {};
  socket = makeSocket();
  useAuth.mockReturnValue({ token: 'tok-123', profile: perfil, isAuthenticated: true, logout: vi.fn() });
  useSocket.mockReturnValue({ socket, connected: true, error: null });
});

describe('LobbyPage — estado de conexión', () => {
  // El banner de conexión existe justamente para que el usuario NUNCA vea un botón
  // deshabilitado sin saber por qué (bug real de este proyecto) — se prueba con precisión.
  it('muestra "Conectando…" mientras el socket todavía no conecta', () => {
    useSocket.mockReturnValue({ socket, connected: false, error: null });
    renderLobby();
    expect(screen.getByText('Conectando al servidor…')).toBeInTheDocument();
  });

  it('muestra un aviso claro de "sin conexión" cuando el gateway no responde', () => {
    useSocket.mockReturnValue({ socket, connected: false, error: 'sin_conexion' });
    renderLobby();
    expect(screen.getByText(/Sin conexión con el servidor/)).toBeInTheDocument();
  });

  it('muestra "Conectado" cuando el socket está conectado', () => {
    renderLobby();
    expect(screen.getByText('● Conectado')).toBeInTheDocument();
  });

  it('redirige a "/" si el usuario no está autenticado', () => {
    useAuth.mockReturnValue({ token: null, profile: null, isAuthenticated: false, logout: vi.fn() });
    renderLobby();
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('sesión inválida: cierra sesión y redirige con motivo=sesion_expirada', () => {
    const logout = vi.fn();
    useAuth.mockReturnValue({ token: 'tok', profile: perfil, isAuthenticated: true, logout });
    useSocket.mockReturnValue({ socket, connected: false, error: 'sesion_invalida' });
    renderLobby();
    expect(logout).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true, state: { motivo: 'sesion_expirada' } });
  });
});

describe('LobbyPage — crear y unirse a sala', () => {
  it('emite game:sync al montar (reincorporación instantánea)', () => {
    renderLobby();
    expect(socket.emit).toHaveBeenCalledWith('game:sync');
  });

  it('crear sala emite room:create con el modo elegido y el nombre de sala', () => {
    renderLobby();
    fireEvent.change(screen.getByLabelText('Modo'), { target: { value: '2v2' } });
    fireEvent.change(screen.getByLabelText('Nombre de la sala'), { target: { value: 'Mi Flota' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comenzar' }));
    expect(socket.emit).toHaveBeenCalledWith('room:create', { modo: '2v2', name: 'Ana', nombreSala: 'Mi Flota' });
  });

  it('crear sala en modo 1v1-bot no requiere nombre de sala (el campo no se muestra)', () => {
    renderLobby();
    fireEvent.change(screen.getByLabelText('Modo'), { target: { value: '1v1-bot' } });
    expect(screen.queryByLabelText('Nombre de la sala')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Comenzar' }));
    expect(socket.emit).toHaveBeenCalledWith('room:create', { modo: '1v1-bot', name: 'Ana', nombreSala: undefined });
  });

  it('crear/unirse están deshabilitados mientras el socket no está conectado', () => {
    useSocket.mockReturnValue({ socket, connected: false, error: null });
    renderLobby();
    expect(screen.getByRole('button', { name: 'Comenzar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Unirse' })).toBeDisabled();
  });

  it('unirse a sala con un código de 6 dígitos emite room:join', () => {
    renderLobby();
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unirse' }));
    expect(socket.emit).toHaveBeenCalledWith('room:join', { codigo: '654321', name: 'Ana' });
  });

  it('el campo de código solo admite dígitos', () => {
    renderLobby();
    const input = screen.getByPlaceholderText('123456');
    fireEvent.change(input, { target: { value: '12a3b4c' } });
    expect(input).toHaveValue('1234');
  });

  it('unirse con un código incompleto muestra el error de código inválido', () => {
    renderLobby();
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unirse' }));
    expect(screen.getByRole('alert')).toHaveTextContent(ROOM_ERRORS.codigo_invalido);
    expect(socket.emit).not.toHaveBeenCalledWith('room:join', expect.anything());
  });

  it('espectar con un código válido emite room:espectar', () => {
    renderLobby();
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '111222' } });
    fireEvent.click(screen.getByRole('button', { name: '👁 Ver partida' }));
    expect(socket.emit).toHaveBeenCalledWith('room:espectar', { codigo: '111222' });
  });
});

describe('LobbyPage — sala de espera (room:created / room:joined)', () => {
  it('room:created me deja como anfitrión y muestra el código y "esperando jugadores"', () => {
    renderLobby();
    socket.fire('room:created', { codigo: '555444', modo: '1v1', nombre: null });

    // El código se pinta como un span por dígito: se verifica el texto agregado de la fila.
    expect(screen.getByText(/Código de sala/)).toHaveTextContent('555444');
    expect(screen.getByText(/Esperando jugadores…/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comenzar partida' })).toBeDisabled();
  });

  it('room:created en modo 1v1-bot NO abre la sala de espera (arranca solo)', () => {
    renderLobby();
    socket.fire('room:created', { codigo: '999999', modo: '1v1-bot', nombre: null });
    expect(screen.getByText('Crear sala')).toBeInTheDocument();
    expect(screen.queryByText(/Esperando jugadores…/)).not.toBeInTheDocument();
  });

  it('room:joined puebla la sala con jugadores, código y etiqueta de anfitrión', () => {
    renderLobby();
    socket.fire('room:joined', {
      codigo: '123123',
      modo: '2v2',
      nombre: 'Sala de Beto',
      jugadores: [
        { id: 'host-1', name: 'Beto', equipo: 'A', conectado: true },
        { id: MI_ID, name: 'Ana', equipo: 'B', conectado: true },
      ],
      hostId: 'host-1',
      puedeComenzar: false,
      slotsMax: 4,
    });

    expect(screen.getByText('⚓ Sala de Beto')).toBeInTheDocument();
    expect(screen.getByText('Beto')).toBeInTheDocument();
    expect(screen.getByText('anfitrión')).toBeInTheDocument();
    expect(screen.getByText(/Esperando jugadores…\s*\(2\/4\)/)).toBeInTheDocument();
    // No soy el host: no debo ver el botón de comenzar.
    expect(screen.queryByRole('button', { name: 'Comenzar partida' })).not.toBeInTheDocument();
    expect(screen.getByText('Esperando al anfitrión…')).toBeInTheDocument();
  });

  it('siendo anfitrión y con puedeComenzar, el botón Comenzar partida está habilitado y emite room:comenzar', () => {
    renderLobby();
    socket.fire('room:joined', {
      codigo: '456456',
      modo: '1v1',
      jugadores: [{ id: MI_ID, name: 'Ana', equipo: 'A', conectado: true }],
      hostId: MI_ID,
      puedeComenzar: true,
      slotsMax: 2,
    });

    expect(screen.getByText('¡Listo! Pulsa Comenzar cuando quieran.')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Comenzar partida' });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(socket.emit).toHaveBeenCalledWith('room:comenzar', { codigo: '456456' });
  });

  it('no siendo anfitrión y con puedeComenzar, muestra el mensaje de espera al anfitrión', () => {
    renderLobby();
    socket.fire('room:joined', {
      codigo: '456457',
      modo: '1v1',
      jugadores: [
        { id: MI_ID, name: 'Ana', equipo: 'A', conectado: true },
        { id: 'otro', name: 'Beto', equipo: 'B', conectado: true },
      ],
      hostId: 'otro',
      puedeComenzar: true,
      slotsMax: 2,
    });
    expect(screen.getByText('Esperando a que el anfitrión comience…')).toBeInTheDocument();
  });

  it('room:error muestra el mensaje mapeado por ROOM_ERRORS', () => {
    renderLobby();
    socket.fire('room:error', { error: 'sala_llena' });
    expect(screen.getByRole('alert')).toHaveTextContent(ROOM_ERRORS.sala_llena);
  });

  it('room:left vacía la sala y vuelve a la selección de modo', () => {
    renderLobby();
    socket.fire('room:joined', {
      codigo: '111111',
      modo: '1v1',
      jugadores: [{ id: MI_ID, name: 'Ana', equipo: 'A', conectado: true }],
      hostId: MI_ID,
      puedeComenzar: false,
      slotsMax: 2,
    });
    expect(screen.getByText(/Esperando jugadores…/)).toBeInTheDocument();
    socket.fire('room:left', {});
    expect(screen.getByText('Crear sala')).toBeInTheDocument();
  });

  it('"← Volver a seleccionar modo" emite room:salir y limpia la sala local', () => {
    renderLobby();
    socket.fire('room:joined', {
      codigo: '222222',
      modo: '1v1',
      jugadores: [{ id: MI_ID, name: 'Ana', equipo: 'A', conectado: true }],
      hostId: MI_ID,
      puedeComenzar: false,
      slotsMax: 2,
    });
    fireEvent.click(screen.getByRole('button', { name: '← Volver a seleccionar modo' }));
    expect(socket.emit).toHaveBeenCalledWith('room:salir', { codigo: '222222' });
    expect(screen.getByText('Crear sala')).toBeInTheDocument();
  });
});

describe('LobbyPage — equipos en 2v2', () => {
  it('elegir un equipo libre emite room:cambiar-equipo', () => {
    renderLobby();
    socket.fire('room:joined', {
      codigo: '333333',
      modo: '2v2',
      jugadores: [{ id: MI_ID, name: 'Ana', equipo: null, conectado: true }],
      hostId: MI_ID,
      puedeComenzar: false,
      slotsMax: 4,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unirme al A' }));
    expect(socket.emit).toHaveBeenCalledWith('room:cambiar-equipo', { codigo: '333333', equipo: 'A' });
  });

  it('con el equipo destino lleno, aparece el botón de intercambio y emite swapCon', () => {
    renderLobby();
    socket.fire('room:joined', {
      codigo: '444444',
      modo: '2v2',
      jugadores: [
        { id: MI_ID, name: 'Ana', equipo: 'B', conectado: true },
        { id: 'p2', name: 'Beto', equipo: 'A', conectado: true },
        { id: 'p3', name: 'Caro', equipo: 'A', conectado: true },
      ],
      hostId: MI_ID,
      puedeComenzar: false,
      slotsMax: 4,
    });
    // Equipo A ya tiene 2 (maxPorEquipo en 2v2), así que se ofrece intercambiar con Beto.
    const swapBtn = screen.getByTitle('Intercambiar bando con Beto');
    fireEvent.click(swapBtn);
    expect(socket.emit).toHaveBeenCalledWith('room:cambiar-equipo', { codigo: '444444', equipo: 'A', swapCon: 'p2' });
  });
});

describe('LobbyPage — navegación a la partida', () => {
  it('game:state con fase activa guarda el estado y navega a /game', () => {
    renderLobby();
    const estado = { fase: 'COLOCACION', codigo: 'x' };
    socket.fire('game:state', estado);
    expect(primeGameStateCache).toHaveBeenCalledWith(socket, estado);
    expect(mockNavigate).toHaveBeenCalledWith('/game');
  });

  it('game:state con fase FIN NO navega a /game', () => {
    renderLobby();
    socket.fire('game:state', { fase: 'FIN' });
    expect(mockNavigate).not.toHaveBeenCalledWith('/game');
  });
});

describe('LobbyPage — reincorporación (rejoin)', () => {
  it('con rejoinCodigo en location.state, reingresa automáticamente a la sala', () => {
    mockLocationState = { rejoinCodigo: '777777', modo: '1v1' };
    renderLobby();
    expect(socket.emit).toHaveBeenCalledWith('room:volver', { codigo: '777777', name: 'Ana' });
    // Consume el rejoinCodigo del history para no reintentar si el usuario recarga.
    expect(mockNavigate).toHaveBeenCalledWith('.', { replace: true, state: { modo: '1v1' } });
  });

  it('sin rejoinCodigo, no emite room:volver', () => {
    renderLobby();
    expect(socket.emit).not.toHaveBeenCalledWith('room:volver', expect.anything());
  });
});

describe('LobbyPage — timeout sin respuesta', () => {
  it('si el servidor no responde en 6s, muestra el error sin_respuesta y reactiva el botón', () => {
    vi.useFakeTimers();
    try {
      renderLobby();
      fireEvent.click(screen.getByRole('button', { name: 'Comenzar' }));
      expect(screen.getByRole('button', { name: 'Creando…' })).toBeDisabled();

      act(() => { vi.advanceTimersByTime(6000); });

      expect(screen.getByRole('alert')).toHaveTextContent(ROOM_ERRORS.sin_respuesta);
      expect(screen.getByRole('button', { name: 'Comenzar' })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });
});
