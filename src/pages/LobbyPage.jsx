import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { primeGameStateCache } from '../hooks/useGameState';
import AccountMenu from '../components/AccountMenu/AccountMenu';
import PixelBackdrop from '../components/PixelBackdrop/PixelBackdrop';
import { MODO_LABEL, ROOM_ERRORS } from '../constants/copy';
import styles from './LobbyPage.module.css';

const MODOS = [
  { value: '1v1', label: '1 vs 1' },
  { value: '1v1-bot', label: '1 vs Bot' },
  { value: '2v2', label: '2 vs 2' },
];

export default function LobbyPage() {
  const { token, profile, isAuthenticated, logout } = useAuth();
  const { socket, connected, error: connError } = useSocket(token);
  const navigate = useNavigate();
  const location = useLocation();
  const miId = profile?.sub;

  // Modo preseleccionado si venimos de "Jugar de nuevo" en la pantalla de resultado.
  const [modo, setModo] = useState(location.state?.modo ?? '1v1');
  const [nombreSala, setNombreSala] = useState('');
  const [codigoInput, setCodigoInput] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  // Estado de la sala de espera (null = todavía eligiendo modo).
  const [sala, setSala] = useState(null); // { codigo, modo, jugadores, hostId, puedeComenzar, slotsMax }
  const timeoutRef = useRef(null);

  useEffect(() => { if (!isAuthenticated) navigate('/', { replace: true }); }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (connError === 'sesion_invalida') {
      logout();
      navigate('/', { replace: true, state: { motivo: 'sesion_expirada' } });
    }
  }, [connError, logout, navigate]);

  // Reincorporación instantánea: si tengo una partida activa, el gateway responde con su
  // estado y el listener de game:state navega a /game. Cubre la carrera del re-envío
  // directo en la reconexión (llegaba antes de que este componente adjuntara listeners)
  // — sin esto el jugador quedaba varado en el lobby "hasta que su compañero interactuara".
  useEffect(() => {
    if (!socket || !connected) return;
    socket.emit('game:sync');
  }, [socket, connected]);

  // "Volver a la sala" desde el fin de una partida: reingresa a la MISMA sala (la reinicia a
  // LOBBY si soy el primero, o me reincorpora si otro ya volvió). El room:joined resultante
  // muestra la sala de espera. Idempotente: re-emitir solo re-sincroniza.
  useEffect(() => {
    const rejoin = location.state?.rejoinCodigo;
    if (!socket || !connected || !rejoin) return;
    socket.emit('room:volver', { codigo: rejoin, name: profile?.name ?? 'Jugador' });
    // Consume el rejoinCodigo del history para no re-emitir si el usuario recarga la página.
    navigate('.', { replace: true, state: { modo: location.state?.modo } });
  }, [socket, connected, location.state?.rejoinCodigo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!socket) return;
    const clearPending = () => { clearTimeout(timeoutRef.current); setEnviando(false); };

    const onCreated = ({ codigo, modo, nombre }) => {
      clearPending();
      setError(null);
      // 1v1-bot arranca solo (llega game:state enseguida y navega): no mostramos sala de espera.
      if (modo === '1v1-bot') return;
      setSala((s) => s ?? { codigo, modo, nombre: nombre ?? null, jugadores: [], hostId: miId, puedeComenzar: false });
    };
    const onJoined = (data) => {
      clearPending();
      setError(null);
      setSala({
        codigo:        data.codigo,
        modo:          data.modo,
        nombre:        data.nombre ?? null,
        jugadores:     data.jugadores ?? [],
        hostId:        data.hostId ?? null,
        puedeComenzar: !!data.puedeComenzar,
        slotsMax:      data.slotsMax,
      });
    };
    const onLeft = () => { clearPending(); setSala(null); setError(null); };
    const onError = ({ error }) => { clearPending(); setError(error); };
    const onGameState = (state) => {
      // Solo entrar a /game si hay una partida ACTIVA. Una partida terminada (FIN) NO
      // debe reincorporarnos: si no, al pulsar "Jugar de nuevo"/"Elegir modo" el game:sync
      // devolvía la sala FIN y rebotábamos lobby → game → result sin poder crear otra.
      const activas = ['COLOCACION', 'TURNOS', 'SALVA'];
      if (activas.includes(state?.fase)) {
        // Guarda el estado ANTES de navegar: GamePage lo lee al montar y ambos
        // jugadores entran a la colocación al mismo tiempo (sin esperar otro broadcast).
        primeGameStateCache(socket, state);
        navigate('/game');
      }
    };

    socket.on('room:created', onCreated);
    socket.on('room:joined', onJoined);
    socket.on('room:left', onLeft);
    socket.on('room:error', onError);
    socket.on('game:state', onGameState);
    return () => {
      socket.off('room:created', onCreated);
      socket.off('room:joined', onJoined);
      socket.off('room:left', onLeft);
      socket.off('room:error', onError);
      socket.off('game:state', onGameState);
    };
  }, [socket, miId, navigate]);

  function conTimeout() {
    setEnviando(true);
    setError(null);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => { setEnviando(false); setError('sin_respuesta'); }, 6000);
  }

  const crear = () => {
    if (!connected) return;
    conTimeout();
    socket.emit('room:create', {
      modo,
      name: profile?.name ?? 'Jugador',
      nombreSala: nombreSala.trim() || undefined, // sin nombre → el servidor pone uno por defecto
    });
  };
  const unirse = () => {
    if (!connected) return;
    const codigo = codigoInput.trim();
    if (codigo.length !== 6) { setError('codigo_invalido'); return; }
    conTimeout();
    socket.emit('room:join', { codigo, name: profile?.name ?? 'Jugador' });
  };
  const elegirEquipo = (equipo) => socket.emit('room:cambiar-equipo', { codigo: sala.codigo, equipo });
  // Equipo destino lleno: INTERCAMBIA lugar con un jugador específico de ese equipo.
  const intercambiarCon = (equipo, jugadorId) =>
    socket.emit('room:cambiar-equipo', { codigo: sala.codigo, equipo, swapCon: jugadorId });
  const espectar = () => {
    if (!connected) return;
    const codigo = codigoInput.trim();
    if (codigo.length !== 6) { setError('codigo_invalido'); return; }
    conTimeout();
    socket.emit('room:espectar', { codigo });
  };
  const comenzar = () => socket.emit('room:comenzar', { codigo: sala.codigo });
  const volver = () => { if (sala) socket.emit('room:salir', { codigo: sala.codigo }); setSala(null); };

  let estado = null;
  if (!token) estado = null;
  else if (connError === 'sin_conexion')
    estado = { cls: 'connError', txt: '⚠ Sin conexión con el servidor. Verifica que los backends estén corriendo (levantar-todo.ps1) y el Gateway en :3000.' };
  else if (!connected) estado = { cls: 'connecting', txt: 'Conectando al servidor…' };
  else estado = { cls: 'connOk', txt: '● Conectado' };

  // ── Datos derivados de la sala de espera ──
  const soyHost = sala && sala.hostId === miId;
  const es2v2 = sala?.modo === '2v2';
  const equipoA = sala?.jugadores.filter((j) => j.equipo === 'A') ?? [];
  const equipoB = sala?.jugadores.filter((j) => j.equipo === 'B') ?? [];
  const miEquipo = sala?.jugadores.find((j) => j.id === miId)?.equipo;
  const maxPorEquipo = es2v2 ? 2 : 1;

  return (
    <main className={styles.wrap}>
      <PixelBackdrop scene="warroom" />
      <header className={styles.header}>
        <h1>Lobby</h1>
        <div className={styles.headerRight}>
          <AccountMenu />
        </div>
      </header>

      {estado && <p className={styles[estado.cls]}>{estado.txt}</p>}
      {error && <p className={styles.error} role="alert">{ROOM_ERRORS[error] ?? error}</p>}

      {/* ── Selección de modo (solo cuando NO estás en una sala) ── */}
      {!sala && (
        <div className={styles.cols}>
          <section className={`${styles.panel} metal`}>
            <h2>Crear sala</h2>
            <label className={styles.field}>
              Modo
              <select value={modo} onChange={(e) => setModo(e.target.value)}>
                {MODOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            {modo !== '1v1-bot' && (
              <label className={styles.field}>
                Nombre de la sala
                <input
                  value={nombreSala}
                  onChange={(e) => setNombreSala(e.target.value)}
                  maxLength={30}
                  placeholder={`Sala de ${profile?.name ?? 'batalla'}`}
                />
              </label>
            )}
            <button onClick={crear} disabled={!connected || enviando}>
              {enviando ? 'Creando…' : 'Comenzar'}
            </button>
          </section>

          <section className={`${styles.panel} metal`}>
            <h2>Unirse a sala</h2>
            <label className={styles.field}>
              Código
              <input
                value={codigoInput}
                onChange={(e) => setCodigoInput(e.target.value.replace(/\D/g, ''))}
                maxLength={6} inputMode="numeric" placeholder="123456"
              />
            </label>
            <button onClick={unirse} disabled={!connected || enviando}>
              {enviando ? 'Uniéndose…' : 'Unirse'}
            </button>
            <button onClick={espectar} disabled={!connected || enviando} className={styles.spectateBtn}>
              👁 Ver partida
            </button>
          </section>
        </div>
      )}

      {/* ── Sala de espera ── */}
      {sala && (
        <section className={`${styles.roomInfo} metal`}>
          {sala.nombre && <h2 className={styles.roomName}>⚓ {sala.nombre}</h2>}
          <p className={styles.codeRow}>
            Código de sala (contraseña):{' '}
            <strong className={styles.code}>
              {String(sala.codigo).split('').map((d, i) => (
                <span key={i} className={styles.digit}>{d}</span>
              ))}
            </strong>
            <span className={styles.modoBadge}>{MODO_LABEL[sala.modo] ?? sala.modo}</span>
          </p>
          <p className={styles.wait}>
            {sala.puedeComenzar
              ? (soyHost ? '¡Listo! Pulsa Comenzar cuando quieran.' : 'Esperando a que el anfitrión comience…')
              : `Esperando jugadores… (${sala.jugadores.length}/${sala.slotsMax ?? '?'})`}
          </p>

          {/* Bandos (elegible en 2v2) */}
          <div className={styles.teams}>
            {['A', 'B'].map((eq) => {
              const roster = eq === 'A' ? equipoA : equipoB;
              const lleno = roster.length >= maxPorEquipo;
              const yaEstoy = miEquipo === eq;
              return (
                <div key={eq} className={`${styles.team} ${yaEstoy ? styles.teamMine : ''}`}>
                  <h3>Equipo {eq}</h3>
                  <ul>
                    {roster.map((j) => (
                      <li key={j.id}>
                        {j.id === miId ? '👉 ' : ''}{j.name}
                        {j.id === sala.hostId && <span className={styles.hostTag}>anfitrión</span>}
                        {!j.conectado && <span className={styles.offTag}>desconectado</span>}
                        {/* Equipo lleno y no es el mío: puedo INTERCAMBIAR lugar con este jugador. */}
                        {es2v2 && !yaEstoy && lleno && j.id !== miId && (
                          <button
                            className={styles.swapBtn}
                            onClick={() => intercambiarCon(eq, j.id)}
                            title={`Intercambiar bando con ${j.name}`}
                          >
                            ⇄
                          </button>
                        )}
                      </li>
                    ))}
                    {Array.from({ length: Math.max(0, maxPorEquipo - roster.length) }).map((_, i) => (
                      <li key={`v${i}`} className={styles.empty}>— libre —</li>
                    ))}
                  </ul>
                  {es2v2 && (
                    <button
                      className={styles.teamBtn}
                      onClick={() => elegirEquipo(eq)}
                      disabled={yaEstoy || (lleno && !yaEstoy)}
                    >
                      {yaEstoy ? 'Tu bando' : lleno ? 'Completo' : `Unirme al ${eq}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className={styles.roomActions}>
            <button className={styles.backBtn} onClick={volver}>← Volver a seleccionar modo</button>
            {soyHost ? (
              <button
                className={styles.startBtn}
                onClick={comenzar}
                disabled={!sala.puedeComenzar}
                title={sala.puedeComenzar ? '' : 'Faltan jugadores o los bandos no están completos'}
              >
                Comenzar partida
              </button>
            ) : (
              <span className={styles.waitHost}>Esperando al anfitrión…</span>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
