import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useVoice } from './useVoice';

// Socket falso: `on/off` registran handlers para eventos que el SERVIDOR dispara
// (simulados con _trigger); `emit` es un espía para verificar lo que el HOOK manda
// al servidor. Son dos direcciones distintas del mismo socket, como en la app real.
function fakeSocket() {
  const handlers = {};
  return {
    on: vi.fn((ev, fn) => { (handlers[ev] ??= []).push(fn); }),
    off: vi.fn((ev, fn) => { handlers[ev] = (handlers[ev] ?? []).filter((h) => h !== fn); }),
    emit: vi.fn(),
    _trigger: (ev, payload) => { (handlers[ev] ?? []).forEach((h) => h(payload)); },
  };
}

function fakeStream() {
  const track = { stop: vi.fn(), enabled: true, kind: 'audio' };
  return { getTracks: () => [track], getAudioTracks: () => [track], _track: track };
}

// RTCPeerConnection falso: solo implementa lo que useVoice.js realmente llama
// (createOffer/createAnswer/set*Description/addIceCandidate/addTrack + los
// callbacks onicecandidate/ontrack/oniceconnectionstatechange). No simula
// negociación ICE real — eso queda fuera de alcance para un test unitario.
let createdPCs = [];
class FakeRTCPeerConnection {
  constructor(config) {
    this.config = config;
    this.localDescription = null;
    this.remoteDescription = null;
    this.iceConnectionState = 'new';
    this.tracksAdded = [];
    this.iceCandidatesAdded = [];
    this.closed = false;
    this.onicecandidate = null;
    this.ontrack = null;
    this.oniceconnectionstatechange = null;
    createdPCs.push(this);
  }
  addTrack(track) { this.tracksAdded.push(track); }
  createOffer() { return Promise.resolve({ type: 'offer', sdp: 'fake-offer' }); }
  createAnswer() { return Promise.resolve({ type: 'answer', sdp: 'fake-answer' }); }
  setLocalDescription(desc) { this.localDescription = desc; return Promise.resolve(); }
  setRemoteDescription(desc) { this.remoteDescription = desc; return Promise.resolve(); }
  addIceCandidate(c) { this.iceCandidatesAdded.push(c); return Promise.resolve(); }
  close() { this.closed = true; }
}

beforeEach(() => {
  createdPCs = [];
  vi.stubGlobal('RTCPeerConnection', FakeRTCPeerConnection);
  // jsdom no implementa mediaDevices: se agrega directo sobre el navigator real
  // (en vez de reemplazarlo entero) para no romper lo que testing-library necesita.
  window.navigator.mediaDevices = { getUserMedia: vi.fn() };
});

describe('useVoice — join/leave/mute', () => {
  it('join() pide el micrófono con las constraints esperadas, marca joined y avisa al servidor', async () => {
    const stream = fakeStream();
    window.navigator.mediaDevices.getUserMedia.mockResolvedValue(stream);
    const socket = fakeSocket();
    const { result, unmount } = renderHook(() => useVoice({ socket, codigo: 'ABCD', miId: 'yo' }));

    await act(async () => { await result.current.join(); });

    expect(window.navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    expect(result.current.joined).toBe(true);
    expect(result.current.muted).toBe(false);
    expect(result.current.error).toBeNull();
    expect(socket.emit).toHaveBeenCalledWith('voice:join', { codigo: 'ABCD', canal: 'equipo' });

    unmount();
  });

  it("join() con permiso de micrófono denegado (NotAllowedError) → error 'permiso_denegado', no queda joined", async () => {
    const err = new Error('denegado'); err.name = 'NotAllowedError';
    window.navigator.mediaDevices.getUserMedia.mockRejectedValue(err);
    const socket = fakeSocket();
    const { result } = renderHook(() => useVoice({ socket, codigo: 'ABCD', miId: 'yo' }));

    await act(async () => { await result.current.join(); });

    expect(result.current.error).toBe('permiso_denegado');
    expect(result.current.joined).toBe(false);
    expect(socket.emit).not.toHaveBeenCalledWith('voice:join', expect.anything());
  });

  it("join() sin micrófono disponible (otro error) → error 'sin_microfono'", async () => {
    // Cualquier fallo que NO sea el usuario negando el permiso explícitamente
    // (p.ej. no hay hardware) debe distinguirse: el mensaje de error en la UI es
    // distinto ("revisa tu micrófono" vs "da permiso de micrófono").
    const err = new Error('sin dispositivo'); err.name = 'NotFoundError';
    window.navigator.mediaDevices.getUserMedia.mockRejectedValue(err);
    const socket = fakeSocket();
    const { result } = renderHook(() => useVoice({ socket, codigo: 'ABCD', miId: 'yo' }));

    await act(async () => { await result.current.join(); });

    expect(result.current.error).toBe('sin_microfono');
    expect(result.current.joined).toBe(false);
  });

  it('join() llamado dos veces seguidas no pide el micrófono otra vez', async () => {
    const stream = fakeStream();
    window.navigator.mediaDevices.getUserMedia.mockResolvedValue(stream);
    const socket = fakeSocket();
    const { result, unmount } = renderHook(() => useVoice({ socket, codigo: 'ABCD', miId: 'yo' }));

    await act(async () => { await result.current.join(); });
    await act(async () => { await result.current.join(); });

    expect(window.navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('leave() detiene las pistas del micrófono, avisa al servidor y resetea joined', async () => {
    const stream = fakeStream();
    window.navigator.mediaDevices.getUserMedia.mockResolvedValue(stream);
    const socket = fakeSocket();
    const { result } = renderHook(() => useVoice({ socket, codigo: 'ABCD', miId: 'yo' }));
    await act(async () => { await result.current.join(); });

    act(() => { result.current.leave(); });

    expect(stream._track.stop).toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('voice:leave', { codigo: 'ABCD' });
    expect(result.current.joined).toBe(false);
  });

  it('leave() sin haberse unido antes no emite nada (no-op)', () => {
    const socket = fakeSocket();
    const { result } = renderHook(() => useVoice({ socket, codigo: 'ABCD', miId: 'yo' }));
    act(() => { result.current.leave(); });
    expect(socket.emit).not.toHaveBeenCalledWith('voice:leave', expect.anything());
  });

  it('toggleMute() alterna muted, deshabilita/habilita el track de audio local y avisa al servidor', async () => {
    const stream = fakeStream();
    window.navigator.mediaDevices.getUserMedia.mockResolvedValue(stream);
    const socket = fakeSocket();
    const { result } = renderHook(() => useVoice({ socket, codigo: 'ABCD', miId: 'yo' }));
    await act(async () => { await result.current.join(); });

    act(() => { result.current.toggleMute(); });
    expect(result.current.muted).toBe(true);
    expect(stream._track.enabled).toBe(false); // track.enabled=false ⇒ audio cortado
    expect(socket.emit).toHaveBeenCalledWith('voice:mute', { codigo: 'ABCD', muted: true });

    act(() => { result.current.toggleMute(); });
    expect(result.current.muted).toBe(false);
    expect(stream._track.enabled).toBe(true);
    expect(socket.emit).toHaveBeenCalledWith('voice:mute', { codigo: 'ABCD', muted: false });
  });

  it('al desmontar mientras sigue unido, se llama a leave() automáticamente (limpieza de partida)', async () => {
    const stream = fakeStream();
    window.navigator.mediaDevices.getUserMedia.mockResolvedValue(stream);
    const socket = fakeSocket();
    const { result, unmount } = renderHook(() => useVoice({ socket, codigo: 'ABCD', miId: 'yo' }));
    await act(async () => { await result.current.join(); });

    unmount();

    expect(socket.emit).toHaveBeenCalledWith('voice:leave', { codigo: 'ABCD' });
    expect(stream._track.stop).toHaveBeenCalled();
  });
});

describe('useVoice — cambio de canal', () => {
  it('cambiarCanal() al mismo canal actual no emite nada (evita re-join innecesario)', () => {
    const socket = fakeSocket();
    const { result } = renderHook(() => useVoice({ socket, codigo: 'ABCD', miId: 'yo', canalInicial: 'equipo' }));
    act(() => { result.current.cambiarCanal('equipo'); });
    expect(socket.emit).not.toHaveBeenCalled();
    expect(result.current.canal).toBe('equipo');
  });

  it('cambiarCanal() sin estar unido solo actualiza el estado local (no reemite voice:join)', () => {
    const socket = fakeSocket();
    const { result } = renderHook(() => useVoice({ socket, codigo: 'ABCD', miId: 'yo', canalInicial: 'equipo' }));
    act(() => { result.current.cambiarCanal('publico'); });
    expect(result.current.canal).toBe('publico');
    expect(socket.emit).not.toHaveBeenCalledWith('voice:join', expect.anything());
  });

  it('cambiarCanal() estando unido cierra la malla de peers actual y reingresa con el canal nuevo', async () => {
    const stream = fakeStream();
    window.navigator.mediaDevices.getUserMedia.mockResolvedValue(stream);
    const socket = fakeSocket();
    const { result, unmount } = renderHook(() =>
      useVoice({ socket, codigo: 'ABCD', miId: 'yo', canalInicial: 'equipo' }));
    await act(async () => { await result.current.join(); });

    act(() => { socket._trigger('voice:peers', { peers: ['p1'] }); });
    await vi.waitFor(() => expect(result.current.participantes).toHaveLength(1));

    act(() => { result.current.cambiarCanal('publico'); });

    expect(result.current.canal).toBe('publico');
    expect(result.current.participantes).toHaveLength(0); // malla vieja cerrada
    expect(createdPCs[0].closed).toBe(true);
    expect(socket.emit).toHaveBeenCalledWith('voice:join', { codigo: 'ABCD', canal: 'publico' });

    unmount();
  });
});

describe('useVoice — eventos de peers del servidor', () => {
  it("voice:peers crea una conexión hacia cada peer existente y YO envío la oferta (soy quien entra)", async () => {
    const socket = fakeSocket();
    const { result } = renderHook(() => useVoice({ socket, codigo: 'ABCD', miId: 'yo' }));

    act(() => {
      socket._trigger('voice:peers', { peers: ['p1'], mutes: { p1: true } });
    });

    await vi.waitFor(() => {
      expect(socket.emit).toHaveBeenCalledWith(
        'voice:signal',
        expect.objectContaining({ codigo: 'ABCD', to: 'p1', data: expect.objectContaining({ sdp: expect.anything() }) }),
      );
    });
    expect(result.current.participantes).toHaveLength(1);
    expect(result.current.participantes[0]).toMatchObject({ id: 'p1', muted: true });
  });

  it('voice:peer-joined prepara la conexión pero NO envía oferta (espera la del que entró)', async () => {
    const socket = fakeSocket();
    const { result } = renderHook(() => useVoice({ socket, codigo: 'ABCD', miId: 'yo' }));

    act(() => { socket._trigger('voice:peer-joined', { peerId: 'p2', muted: false }); });

    await vi.waitFor(() => expect(result.current.participantes).toHaveLength(1));
    // anti-glare: el que ya estaba NO inicia la oferta
    expect(socket.emit).not.toHaveBeenCalledWith('voice:signal', expect.anything());
  });

  it('voice:peer-left cierra la conexión de ese peer y lo quita de participantes', async () => {
    const socket = fakeSocket();
    const { result } = renderHook(() => useVoice({ socket, codigo: 'ABCD', miId: 'yo' }));
    act(() => { socket._trigger('voice:peers', { peers: ['p1'] }); });
    await vi.waitFor(() => expect(result.current.participantes).toHaveLength(1));

    act(() => { socket._trigger('voice:peer-left', { peerId: 'p1' }); });

    expect(result.current.participantes).toHaveLength(0);
    expect(createdPCs[0].closed).toBe(true);
  });

  it('voice:peer-mute actualiza el estado muted de ese participante', async () => {
    const socket = fakeSocket();
    const { result } = renderHook(() => useVoice({ socket, codigo: 'ABCD', miId: 'yo' }));
    act(() => { socket._trigger('voice:peer-joined', { peerId: 'p1', muted: false }); });
    await vi.waitFor(() => expect(result.current.participantes).toHaveLength(1));

    act(() => { socket._trigger('voice:peer-mute', { peerId: 'p1', muted: true }); });

    expect(result.current.participantes[0].muted).toBe(true);
  });

  it('voice:signal con oferta entrante responde con un answer (no soy el iniciador)', async () => {
    const socket = fakeSocket();
    renderHook(() => useVoice({ socket, codigo: 'ABCD', miId: 'yo' }));

    act(() => {
      socket._trigger('voice:signal', { from: 'p2', data: { sdp: { type: 'offer', sdp: 'oferta-fake' } } });
    });

    await vi.waitFor(() => {
      expect(socket.emit).toHaveBeenCalledWith('voice:signal', expect.objectContaining({
        to: 'p2',
        data: expect.objectContaining({ sdp: expect.objectContaining({ type: 'answer' }) }),
      }));
    });
  });

  it('voice:signal con un candidato ICE lo agrega a la conexión del peer correspondiente', async () => {
    const socket = fakeSocket();
    renderHook(() => useVoice({ socket, codigo: 'ABCD', miId: 'yo' }));
    act(() => { socket._trigger('voice:peers', { peers: ['p1'] }); });
    await vi.waitFor(() => expect(createdPCs).toHaveLength(1));

    act(() => {
      socket._trigger('voice:signal', { from: 'p1', data: { candidate: { candidate: 'fake-candidate' } } });
    });

    await vi.waitFor(() => expect(createdPCs[0].iceCandidatesAdded).toHaveLength(1));
  });
});
