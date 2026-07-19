import { useCallback, useEffect, useRef, useState } from 'react';

// Chat de voz P2P (WebRTC en malla). El audio va DIRECTO entre navegadores; el
// servidor (battlecaos-voice-channel) solo dice con quién conectar y el gateway
// hace de relay de señalización (voice:signal). Reglas de canal (equipo/rival) las
// decide el servidor: aquí solo conectamos con los peers que nos manda.
//
// Anti-glare: el que ENTRA inicia las ofertas hacia los que ya estaban; los que ya
// estaban solo responden. Como el servidor serializa los joins, cada arista tiene un
// único iniciador.
export function useVoice({ socket, codigo, jugadores = [], miId, canalInicial = 'equipo' }) {
  const [joined, setJoined]   = useState(false);
  const [muted, setMuted]     = useState(false);
  const [canal, setCanal]     = useState(canalInicial); // 'equipo' | 'publico' (2v2)
  const [error, setError]     = useState(null);
  // peersState[peerId] = { muted, speaking, connected }
  const [peersState, setPeersState] = useState({});
  const [remoteStreams, setRemoteStreams] = useState({}); // peerId → MediaStream

  const localStreamRef = useRef(null);
  const pcsRef         = useRef(new Map());   // peerId → RTCPeerConnection
  const iceRef         = useRef([{ urls: ['stun:stun.l.google.com:19302'] }]);
  const joinedRef      = useRef(false);
  const audioCtxRef    = useRef(null);
  const analysersRef   = useRef(new Map());   // peerId|'me' → AnalyserNode
  const rafRef         = useRef(null);

  const setPeer = useCallback((id, patch) => {
    setPeersState((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }));
  }, []);

  // ── Detección de "quién habla" (analizador de volumen) ───────────────────────
  const attachAnalyser = useCallback((key, stream) => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      const src = ctx.createMediaStreamSource(stream);
      const an  = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      analysersRef.current.set(key, an);
    } catch { /* WebAudio no disponible: sin indicador de habla, no es crítico */ }
  }, []);

  useEffect(() => {
    if (!joined) return;
    const buf = new Uint8Array(256);
    const tick = () => {
      for (const [key, an] of analysersRef.current) {
        an.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i];
        const speaking = sum / buf.length > 12; // umbral empírico
        if (key === 'me') setSpeakingMe(speaking);
        else setPeer(key, { speaking });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [joined, setPeer]);

  const [speakingMe, setSpeakingMe] = useState(false);

  // ── Gestión de conexiones peer ───────────────────────────────────────────────
  const closePeer = useCallback((peerId) => {
    const pc = pcsRef.current.get(peerId);
    if (pc) { try { pc.close(); } catch { /* noop */ } pcsRef.current.delete(peerId); }
    analysersRef.current.delete(peerId);
    setRemoteStreams((prev) => { const n = { ...prev }; delete n[peerId]; return n; });
    setPeersState((prev) => { const n = { ...prev }; delete n[peerId]; return n; });
  }, []);

  // Envía una oferta (inicial o RE-negociación con iceRestart) al peer.
  const enviarOferta = useCallback((pc, peerId, opts = {}) => {
    pc.createOffer(opts)
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => socket.emit('voice:signal', { codigo, to: peerId, data: { sdp: pc.localDescription } }))
      .catch(() => { /* si falla, el otro lado reintentará o el ICE restart lo recupera */ });
  }, [socket, codigo]);

  const createPeer = useCallback((peerId, initiator) => {
    if (pcsRef.current.has(peerId)) return pcsRef.current.get(peerId);
    // iceCandidatePoolSize acelera el gathering; iceServers ya trae STUN + TURN (relevo).
    const pc = new RTCPeerConnection({ iceServers: iceRef.current, iceCandidatePoolSize: 2 });
    pc._initiator = initiator;
    pc._iceRestarts = 0;

    localStreamRef.current?.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current));

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('voice:signal', { codigo, to: peerId, data: { candidate: e.candidate } });
    };
    pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (!stream) return;
      setRemoteStreams((prev) => ({ ...prev, [peerId]: stream }));
      attachAnalyser(peerId, stream);
    };
    // El indicador "conectado" se basa en iceConnectionState (refleja si el MEDIO fluye),
    // no en connectionState. Ante 'failed' (típico entre redes sin ruta directa) intentamos
    // hasta 2 REINICIOS DE ICE (fuerza re-gathering, puede encontrar la ruta TURN) antes de rendirse.
    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState;
      const conectado = st === 'connected' || st === 'completed';
      setPeer(peerId, { connected: conectado, status: conectado ? 'connected' : st });
      // Ante 'failed', el INICIADOR renegocia con iceRestart (hasta 2 veces) buscando una ruta
      // nueva, incluida la del TURN. Ambos lados suelen ver 'failed', así que basta con que el
      // iniciador reintente (evita "glare" de dos ofertas simultáneas). Si tras los reintentos
      // sigue fallando, se marca 'failed' (la UI avisa "sin ruta — revisa TURN") en vez de quedar
      // "conectando" mudo para siempre.
      if (st === 'failed') {
        if (pc._initiator && pc._iceRestarts < 2) {
          pc._iceRestarts++;
          enviarOferta(pc, peerId, { iceRestart: true });
        } else {
          setPeer(peerId, { connected: false, status: 'failed' });
        }
      }
      if (st === 'closed') closePeer(peerId);
    };

    pcsRef.current.set(peerId, pc);
    setPeer(peerId, { connected: false });

    if (initiator) enviarOferta(pc, peerId);
    return pc;
  }, [socket, codigo, attachAnalyser, setPeer, closePeer, enviarOferta]);

  // ── Handlers de eventos del servidor ─────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onPeers = ({ peers, iceServers, mutes }) => {
      if (Array.isArray(iceServers) && iceServers.length) iceRef.current = iceServers;
      for (const [pid, m] of Object.entries(mutes ?? {})) setPeer(pid, { muted: !!m });
      (peers ?? []).forEach((peerId) => createPeer(peerId, true)); // YO inicio hacia los que ya estaban
    };
    const onPeerJoined = ({ peerId, muted: m }) => {
      setPeer(peerId, { muted: !!m });
      createPeer(peerId, false); // preparo la conexión; su oferta llegará por voice:signal
    };
    const onPeerLeft = ({ peerId }) => closePeer(peerId);
    const onPeerMute = ({ peerId, muted: m }) => setPeer(peerId, { muted: !!m });

    const onSignal = async ({ from, data }) => {
      if (!from || !data) return;
      const pc = pcsRef.current.get(from) ?? createPeer(from, false);
      try {
        if (data.sdp) {
          await pc.setRemoteDescription(data.sdp);
          if (data.sdp.type === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('voice:signal', { codigo, to: from, data: { sdp: pc.localDescription } });
          }
        } else if (data.candidate) {
          await pc.addIceCandidate(data.candidate);
        }
      } catch { /* candidatos que llegan antes del setRemoteDescription: se descartan sin romper */ }
    };

    socket.on('voice:peers', onPeers);
    socket.on('voice:peer-joined', onPeerJoined);
    socket.on('voice:peer-left', onPeerLeft);
    socket.on('voice:peer-mute', onPeerMute);
    socket.on('voice:signal', onSignal);
    return () => {
      socket.off('voice:peers', onPeers);
      socket.off('voice:peer-joined', onPeerJoined);
      socket.off('voice:peer-left', onPeerLeft);
      socket.off('voice:peer-mute', onPeerMute);
      socket.off('voice:signal', onSignal);
    };
  }, [socket, codigo, createPeer, closePeer, setPeer]);

  // ── Acciones públicas ────────────────────────────────────────────────────────
  const join = useCallback(async () => {
    if (joinedRef.current) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      localStreamRef.current = stream;
      attachAnalyser('me', stream);
      joinedRef.current = true;
      setJoined(true);
      setMuted(false);
      socket.emit('voice:join', { codigo, canal });
    } catch (err) {
      setError(err?.name === 'NotAllowedError' ? 'permiso_denegado' : 'sin_microfono');
    }
  }, [socket, codigo, canal, attachAnalyser]);

  // Cambiar de canal (switch Equipo/Público en 2v2): cierra la malla actual y
  // re-entra con el canal nuevo — el servidor avisa a los peers viejos y calcula
  // los nuevos. El micrófono local NO se corta (misma stream).
  const cambiarCanal = useCallback((nuevoCanal) => {
    setCanal((prev) => {
      if (nuevoCanal === prev) return prev;
      if (joinedRef.current) {
        for (const peerId of [...pcsRef.current.keys()]) closePeer(peerId);
        socket?.emit('voice:join', { codigo, canal: nuevoCanal });
      }
      return nuevoCanal;
    });
  }, [socket, codigo, closePeer]);

  const leave = useCallback(() => {
    if (!joinedRef.current) return;
    socket?.emit('voice:leave', { codigo });
    for (const peerId of [...pcsRef.current.keys()]) closePeer(peerId);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    analysersRef.current.clear();
    joinedRef.current = false;
    setJoined(false);
    setPeersState({});
    setRemoteStreams({});
  }, [socket, codigo, closePeer]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
      socket?.emit('voice:mute', { codigo, muted: next });
      return next;
    });
  }, [socket, codigo]);

  // Al desmontar (salir de la partida) o cambiar de sala: cerrar la voz.
  useEffect(() => () => { if (joinedRef.current) leave(); }, [leave]);

  // Lista de participantes con nombre (desde jugadores) — solo los conectados a voz.
  const participantes = Object.keys(peersState).map((id) => ({
    id,
    name: jugadores.find((j) => j.id === id)?.name ?? 'Jugador',
    ...peersState[id],
  }));

  return { joined, muted, canal, error, participantes, remoteStreams, speakingMe, join, leave, toggleMute, cambiarCanal };
}
