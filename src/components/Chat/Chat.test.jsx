import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Chat from './Chat';

// jsdom no implementa scrollTo en elementos; el componente lo usa para hacer scroll al
// último mensaje. Sin este stub, cada render lanza un TypeError no capturado.
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

// Chat de texto: la parte delicada es el ciclo de vida del socket (altas/bajas de
// listeners), el filtrado por canal (equipo/público, cuando `conCanales` está activo)
// y el toggle "ver más" que decide cuántos mensajes mostrar. Cada una tiene su prueba.

// Socket falso: guarda los handlers registrados por evento y permite dispararlos desde
// el test (simulando lo que haría el servidor real vía socket.io).
function makeSocket() {
  const handlers = {};
  return {
    on: vi.fn((event, cb) => {
      (handlers[event] ??= []).push(cb);
    }),
    off: vi.fn((event, cb) => {
      handlers[event] = (handlers[event] ?? []).filter((h) => h !== cb);
    }),
    emit: vi.fn(),
    // Helper de test, no forma parte de la API real del socket. Envuelto en act() porque
    // dispara setState fuera de un evento de React (como haría socket.io de verdad).
    emitEvent(event, payload) {
      act(() => {
        (handlers[event] ?? []).forEach((h) => h(payload));
      });
    },
  };
}

describe('Chat', () => {
  it('arranca sin mensajes', () => {
    const socket = makeSocket();
    render(<Chat socket={socket} codigo="ABC" />);
    expect(screen.getByText('Sin mensajes.')).toBeInTheDocument();
  });

  it('agrega mensajes nuevos que llegan por chat:message', () => {
    const socket = makeSocket();
    render(<Chat socket={socket} codigo="ABC" />);
    socket.emitEvent('chat:message', { senderName: 'Ana', text: 'Hola' });
    socket.emitEvent('chat:message', { senderName: 'Beto', text: 'Qué tal' });
    expect(screen.getByText('Hola')).toBeInTheDocument();
    expect(screen.getByText('Qué tal')).toBeInTheDocument();
  });

  it('chat:history reemplaza la lista en vez de acumularse', () => {
    const socket = makeSocket();
    render(<Chat socket={socket} codigo="ABC" />);
    socket.emitEvent('chat:message', { senderName: 'Ana', text: 'Mensaje viejo' });
    socket.emitEvent('chat:history', [{ senderName: 'Caro', text: 'Historial' }]);
    expect(screen.queryByText('Mensaje viejo')).not.toBeInTheDocument();
    expect(screen.getByText('Historial')).toBeInTheDocument();
  });

  it('chat:history con algo que no es array deja la lista vacía', () => {
    const socket = makeSocket();
    render(<Chat socket={socket} codigo="ABC" />);
    socket.emitEvent('chat:message', { senderName: 'Ana', text: 'Se va a borrar' });
    socket.emitEvent('chat:history', null);
    expect(screen.getByText('Sin mensajes.')).toBeInTheDocument();
  });

  it('enviar un mensaje emite chat:mensaje con el payload correcto y limpia el input', () => {
    const socket = makeSocket();
    render(<Chat socket={socket} codigo="SALA1" />);
    const input = screen.getByPlaceholderText('Escribe un mensaje…');
    fireEvent.change(input, { target: { value: '  hola equipo  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(socket.emit).toHaveBeenCalledWith('chat:mensaje', {
      codigo: 'SALA1',
      text: 'hola equipo',
      canal: 'publico',
    });
    expect(input.value).toBe('');
  });

  it('un texto vacío o solo espacios no emite nada', () => {
    const socket = makeSocket();
    render(<Chat socket={socket} codigo="SALA1" />);
    const input = screen.getByPlaceholderText('Escribe un mensaje…');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('Enter en el input también envía el mensaje', () => {
    const socket = makeSocket();
    render(<Chat socket={socket} codigo="SALA1" />);
    const input = screen.getByPlaceholderText('Escribe un mensaje…');
    fireEvent.change(input, { target: { value: 'con enter' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(socket.emit).toHaveBeenCalledWith('chat:mensaje', {
      codigo: 'SALA1',
      text: 'con enter',
      canal: 'publico',
    });
  });

  it('sin conCanales no muestra el switch de canales', () => {
    const socket = makeSocket();
    render(<Chat socket={socket} codigo="ABC" />);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('con conCanales filtra los mensajes por el canal activo (arranca en equipo)', () => {
    const socket = makeSocket();
    render(<Chat socket={socket} codigo="ABC" conCanales jugadores={[]} miId="yo" />);
    socket.emitEvent('chat:history', [
      { senderName: 'Ana', text: 'solo equipo', canal: 'equipo' },
      { senderName: 'Beto', text: 'para todos', canal: 'publico' },
    ]);
    // Arranca en 'equipo': solo se ve el mensaje de ese canal.
    expect(screen.getByText('solo equipo')).toBeInTheDocument();
    expect(screen.queryByText('para todos')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Público/i }));
    expect(screen.getByText('para todos')).toBeInTheDocument();
    expect(screen.queryByText('solo equipo')).not.toBeInTheDocument();
  });

  it('un mensaje sin canal se trata como "equipo" por defecto', () => {
    const socket = makeSocket();
    render(<Chat socket={socket} codigo="ABC" conCanales jugadores={[]} miId="yo" />);
    socket.emitEvent('chat:history', [{ senderName: 'Ana', text: 'sin canal explícito' }]);
    expect(screen.getByText('sin canal explícito')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Público/i }));
    expect(screen.queryByText('sin canal explícito')).not.toBeInTheDocument();
  });

  it('en el canal público lista a los jugadores conectados (bots y desconectados fuera)', () => {
    const socket = makeSocket();
    const jugadores = [
      { id: 'yo', name: 'Ana', conectado: true },
      { id: 'otro', name: 'Beto', conectado: true },
      { id: 'bot1', name: 'BotX', esBot: true, conectado: true },
      { id: 'caido', name: 'Caro', conectado: false },
    ];
    render(<Chat socket={socket} codigo="ABC" conCanales jugadores={jugadores} miId="yo" />);
    fireEvent.click(screen.getByRole('tab', { name: /Público/i }));
    const linea = screen.getByTitle('Jugadores conectados en el chat público');
    expect(linea.textContent).toContain('Ana (tú)');
    expect(linea.textContent).toContain('Beto');
    expect(linea.textContent).not.toContain('BotX');
    expect(linea.textContent).not.toContain('Caro');
  });

  it('el placeholder cambia cuando se está escribiendo al canal de equipo', () => {
    const socket = makeSocket();
    render(<Chat socket={socket} codigo="ABC" conCanales jugadores={[]} miId="yo" />);
    expect(screen.getByPlaceholderText('Mensaje a tu equipo…')).toBeInTheDocument();
  });

  it('"ver más" expande la lista y "ver menos" la vuelve a compactar', () => {
    const socket = makeSocket();
    render(<Chat socket={socket} codigo="ABC" />);
    const historial = Array.from({ length: 5 }, (_, i) => ({ senderName: 'J', text: `msg${i}` }));
    socket.emitEvent('chat:history', historial);

    // Compacto: solo los últimos 3.
    expect(screen.queryByText('msg0')).not.toBeInTheDocument();
    expect(screen.queryByText('msg1')).not.toBeInTheDocument();
    expect(screen.getByText('msg2')).toBeInTheDocument();
    expect(screen.getByText('msg4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ver todos (5) ▾' }));
    expect(screen.getByText('msg0')).toBeInTheDocument();
    expect(screen.getByText('msg4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ver menos ▴' }));
    expect(screen.queryByText('msg0')).not.toBeInTheDocument();
    expect(screen.getByText('msg4')).toBeInTheDocument();
  });

  it('con 3 mensajes o menos no aparece el botón "ver más"', () => {
    const socket = makeSocket();
    render(<Chat socket={socket} codigo="ABC" />);
    socket.emitEvent('chat:history', [
      { senderName: 'J', text: 'a' },
      { senderName: 'J', text: 'b' },
      { senderName: 'J', text: 'c' },
    ]);
    expect(screen.queryByRole('button', { name: /Ver todos/ })).not.toBeInTheDocument();
  });

  it('da de baja los listeners del socket al desmontar', () => {
    const socket = makeSocket();
    const { unmount } = render(<Chat socket={socket} codigo="ABC" />);
    const registrados = socket.on.mock.calls.map(([event, cb]) => [event, cb]);
    expect(registrados.map(([event]) => event)).toEqual(
      expect.arrayContaining(['chat:history', 'chat:message']),
    );
    unmount();
    for (const [event, cb] of registrados) {
      expect(socket.off).toHaveBeenCalledWith(event, cb);
    }
  });

  it('sin socket no explota y no intenta suscribirse', () => {
    expect(() => render(<Chat socket={null} codigo="ABC" />)).not.toThrow();
  });
});
