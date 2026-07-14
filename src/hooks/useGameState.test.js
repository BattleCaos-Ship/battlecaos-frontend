import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useGameState } from './useGameState';

// Socket mínimo simulado: guarda handlers y permite dispararlos.
function fakeSocket() {
  const handlers = {};
  return {
    on: (ev, fn) => { handlers[ev] = fn; },
    off: (ev) => { delete handlers[ev]; },
    emit: (ev, payload) => handlers[ev]?.(payload),
  };
}

describe('useGameState', () => {
  it('normaliza la forma sanitizada (tableroPublico)', () => {
    const socket = fakeSocket();
    const { result } = renderHook(() => useGameState(socket));
    act(() => {
      socket.emit('game:state', {
        fase: 'TURNOS',
        tableroPublico: { p1: { size: 10, cells: { '3,4': 'hit' } } },
      });
    });
    expect(result.current.fase).toBe('TURNOS');
    expect(result.current.boards.p1.cells['3,4']).toBe('hit');
  });

  it('colapsa a fog cualquier "ship" de la forma cruda (reconexión)', () => {
    const socket = fakeSocket();
    const { result } = renderHook(() => useGameState(socket));
    act(() => {
      socket.emit('game:state', {
        fase: 'TURNOS',
        tableros: { p1: { size: 10, cells: { '0,0': 'ship', '1,1': 'hit' } } },
      });
    });
    expect(result.current.boards.p1.cells['0,0']).toBe('fog'); // nunca revelar barco ajeno
    expect(result.current.boards.p1.cells['1,1']).toBe('hit');
  });
});
