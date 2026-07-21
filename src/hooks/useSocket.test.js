import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { io } from 'socket.io-client';
import { useSocket, disconnectSharedSocket } from './useSocket';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));

// Socket falso: guarda handlers por evento (puede haber varios listeners para el
// mismo evento, como pasa cuando dos componentes usan el socket compartido) y
// expone _fire para simular lo que el servidor real dispararía ('connect', etc.).
function fakeSocket() {
  const handlers = {};
  return {
    connected: false,
    on: vi.fn((ev, fn) => { (handlers[ev] ??= []).push(fn); }),
    off: vi.fn((ev, fn) => { handlers[ev] = (handlers[ev] ?? []).filter((h) => h !== fn); }),
    disconnect: vi.fn(),
    connect: vi.fn(),
    emit: vi.fn(),
    _fire: (ev, payload) => { (handlers[ev] ?? []).forEach((h) => h(payload)); },
  };
}

// El socket es un SINGLETON a nivel de módulo (sobrevive la navegación entre
// páginas) — hay que limpiarlo antes de cada test o un test contaminaría al
// siguiente (p.ej. "reutiliza el socket" daría falso positivo siempre).
beforeEach(() => {
  io.mockReset();
  disconnectSharedSocket();
});

describe('useSocket', () => {
  it('sin token, no crea conexión', () => {
    const { result } = renderHook(() => useSocket(null));
    expect(io).not.toHaveBeenCalled();
    expect(result.current.socket).toBeNull();
    expect(result.current.connected).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('con token, conecta autenticando con el JWT y refleja connected:true tras el evento connect', () => {
    const s = fakeSocket();
    io.mockReturnValue(s);
    const { result } = renderHook(() => useSocket('tok-1'));

    expect(io).toHaveBeenCalledTimes(1);
    expect(io).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ auth: { token: 'tok-1' } }));
    expect(result.current.connected).toBe(false); // aún no llega 'connect'

    act(() => { s._fire('connect'); });

    expect(result.current.socket).toBe(s);
    expect(result.current.connected).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('si el socket compartido ya venía conectado (navegación entre páginas), refleja connected:true de entrada', () => {
    const s = fakeSocket();
    s.connected = true;
    io.mockReturnValue(s);
    const { result } = renderHook(() => useSocket('tok-1'));
    expect(result.current.connected).toBe(true);
  });

  it('evento disconnect del servidor pone connected:false', () => {
    const s = fakeSocket();
    io.mockReturnValue(s);
    const { result } = renderHook(() => useSocket('tok-1'));
    act(() => { s._fire('connect'); });
    act(() => { s._fire('disconnect'); });
    expect(result.current.connected).toBe(false);
  });

  it("connect_error con mensaje 'token_invalido' → error 'sesion_invalida'", () => {
    const s = fakeSocket();
    io.mockReturnValue(s);
    const { result } = renderHook(() => useSocket('tok-1'));
    act(() => { s._fire('connect_error', { message: 'token_invalido' }); });
    expect(result.current.error).toBe('sesion_invalida');
    expect(result.current.connected).toBe(false);
  });

  it("connect_error con mensaje 'sin_token' → error 'sesion_invalida'", () => {
    const s = fakeSocket();
    io.mockReturnValue(s);
    const { result } = renderHook(() => useSocket('tok-1'));
    act(() => { s._fire('connect_error', { message: 'sin_token' }); });
    expect(result.current.error).toBe('sesion_invalida');
  });

  it("connect_error con otro mensaje (backend caído) → error 'sin_conexion', NO 'sesion_invalida'", () => {
    // Distinguir estos dos casos importa: uno manda al login, el otro solo avisa
    // "sin conexión" — confundirlos expulsaría de sesión a alguien con buen token
    // solo porque el gateway está caído.
    const s = fakeSocket();
    io.mockReturnValue(s);
    const { result } = renderHook(() => useSocket('tok-1'));
    act(() => { s._fire('connect_error', { message: 'ECONNREFUSED' }); });
    expect(result.current.error).toBe('sin_conexion');
  });

  it('al perder el token (logout) desconecta el socket compartido y resetea el estado', () => {
    const s = fakeSocket();
    io.mockReturnValue(s);
    const { result, rerender } = renderHook(({ token }) => useSocket(token), {
      initialProps: { token: 'tok-1' },
    });
    act(() => { s._fire('connect'); });
    expect(result.current.connected).toBe(true);

    rerender({ token: null });

    expect(s.disconnect).toHaveBeenCalled();
    expect(result.current.socket).toBeNull();
    expect(result.current.connected).toBe(false);
  });

  it('reutiliza el mismo socket compartido entre dos hooks con igual token (no llama a io() dos veces)', () => {
    // Simula dos páginas (p.ej. Lobby y Game) montando useSocket con la misma
    // sesión: NO debe crear una segunda conexión ni desconectar la primera.
    const s = fakeSocket();
    io.mockReturnValue(s);
    renderHook(() => useSocket('tok-1'));
    renderHook(() => useSocket('tok-1'));
    expect(io).toHaveBeenCalledTimes(1);
    expect(s.disconnect).not.toHaveBeenCalled();
  });

  it('si el token cambia entre renders (cambio de cuenta), desconecta el socket viejo y crea uno nuevo', () => {
    const s1 = fakeSocket();
    const s2 = fakeSocket();
    io.mockReturnValueOnce(s1).mockReturnValueOnce(s2);
    const { rerender } = renderHook(({ token }) => useSocket(token), {
      initialProps: { token: 'tok-1' },
    });
    rerender({ token: 'tok-2' });
    expect(s1.disconnect).toHaveBeenCalled();
    expect(io).toHaveBeenCalledTimes(2);
  });

  it('disconnectSharedSocket() desconecta y limpia el singleton (el siguiente useSocket crea uno NUEVO)', () => {
    const s1 = fakeSocket();
    io.mockReturnValue(s1);
    renderHook(() => useSocket('tok-1'));
    expect(io).toHaveBeenCalledTimes(1);

    act(() => { disconnectSharedSocket(); });
    expect(s1.disconnect).toHaveBeenCalled();

    const s2 = fakeSocket();
    io.mockReturnValue(s2);
    renderHook(() => useSocket('tok-1'));
    expect(io).toHaveBeenCalledTimes(2); // singleton estaba limpio → conexión nueva, no reutilizada
  });

  it('al desmontar, quita los listeners de ESTE componente pero NO desconecta el socket compartido', () => {
    const s = fakeSocket();
    io.mockReturnValue(s);
    const { unmount } = renderHook(() => useSocket('tok-1'));
    unmount();
    expect(s.off).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(s.off).toHaveBeenCalledWith('disconnect', expect.any(Function));
    expect(s.off).toHaveBeenCalledWith('connect_error', expect.any(Function));
    expect(s.disconnect).not.toHaveBeenCalled(); // persiste para la siguiente página
  });
});
