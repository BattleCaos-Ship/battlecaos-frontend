import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VoiceChat from './VoiceChat';
import { useVoice } from '../../hooks/useVoice';
import styles from './VoiceChat.module.css';

// jsdom no implementa HTMLMediaElement.play(); el componente lo llama al montar cada
// <audio> remoto y espera que devuelva una promesa (para engancharle un .catch()).
window.HTMLMediaElement.prototype.play = () => Promise.resolve();

// El otro agente prueba useVoice.js por su cuenta; acá el hook se mockea por completo y
// solo se comprueba que VoiceChat pinte lo correcto según lo que el hook devuelve, y que
// dispare las acciones correctas (join/leave/toggleMute/cambiarCanal) al pulsar botones.
vi.mock('../../hooks/useVoice', () => ({ useVoice: vi.fn() }));

// Estado base "no unido, sin nada especial": cada test sobreescribe solo lo que necesita.
function baseState(overrides = {}) {
  return {
    joined: false,
    muted: false,
    canal: 'equipo',
    error: null,
    participantes: [],
    remoteStreams: {},
    speakingMe: false,
    join: vi.fn(),
    leave: vi.fn(),
    toggleMute: vi.fn(),
    cambiarCanal: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  useVoice.mockReset();
});

describe('VoiceChat', () => {
  it('sin unirse, solo muestra el botón para unirse a la voz', () => {
    useVoice.mockReturnValue(baseState());
    render(<VoiceChat socket={{}} codigo="ABC" />);
    expect(screen.getByRole('button', { name: 'Unirse a la voz' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Salir/ })).not.toBeInTheDocument();
  });

  it('pulsar "Unirse a la voz" llama a join()', () => {
    const join = vi.fn();
    useVoice.mockReturnValue(baseState({ join }));
    render(<VoiceChat socket={{}} codigo="ABC" />);
    fireEvent.click(screen.getByRole('button', { name: 'Unirse a la voz' }));
    expect(join).toHaveBeenCalledTimes(1);
  });

  it('unido y sin silenciar, muestra los controles de mic activo y salir', () => {
    useVoice.mockReturnValue(baseState({ joined: true, muted: false }));
    render(<VoiceChat socket={{}} codigo="ABC" />);
    expect(screen.getByRole('button', { name: '🎤 Mic activo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salir' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unirse a la voz' })).not.toBeInTheDocument();
  });

  it('pulsar el botón de mic llama a toggleMute()', () => {
    const toggleMute = vi.fn();
    useVoice.mockReturnValue(baseState({ joined: true, toggleMute }));
    render(<VoiceChat socket={{}} codigo="ABC" />);
    fireEvent.click(screen.getByRole('button', { name: '🎤 Mic activo' }));
    expect(toggleMute).toHaveBeenCalledTimes(1);
  });

  it('pulsar "Salir" llama a leave()', () => {
    const leave = vi.fn();
    useVoice.mockReturnValue(baseState({ joined: true, leave }));
    render(<VoiceChat socket={{}} codigo="ABC" />);
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('silenciado, muestra el botón "silenciado" y marca "Tú (silenciado)"', () => {
    useVoice.mockReturnValue(baseState({ joined: true, muted: true }));
    render(<VoiceChat socket={{}} codigo="ABC" />);
    expect(screen.getByRole('button', { name: '🔇 Silenciado' })).toBeInTheDocument();
    expect(screen.getByText(/Tú/)).toHaveTextContent('Tú (silenciado)');
  });

  it('mapea el error "permiso_denegado" al mensaje exacto', () => {
    useVoice.mockReturnValue(baseState({ error: 'permiso_denegado' }));
    render(<VoiceChat socket={{}} codigo="ABC" />);
    expect(
      screen.getByText('Permiso de micrófono denegado. Habilítalo en el navegador para usar la voz.'),
    ).toBeInTheDocument();
  });

  it('mapea el error "sin_microfono" al mensaje exacto', () => {
    useVoice.mockReturnValue(baseState({ error: 'sin_microfono' }));
    render(<VoiceChat socket={{}} codigo="ABC" />);
    expect(screen.getByText('No se pudo acceder al micrófono.')).toBeInTheDocument();
  });

  it('un error desconocido se muestra tal cual (fallback)', () => {
    useVoice.mockReturnValue(baseState({ error: 'algo_raro' }));
    render(<VoiceChat socket={{}} codigo="ABC" />);
    expect(screen.getByText('algo_raro')).toBeInTheDocument();
  });

  it('sin error, no se muestra ningún mensaje de error', () => {
    useVoice.mockReturnValue(baseState());
    render(<VoiceChat socket={{}} codigo="ABC" />);
    expect(screen.queryByText(/Permiso de micrófono/)).not.toBeInTheDocument();
  });

  it('con conCanales pero SIN estar unido, el switch de canales no aparece', () => {
    // El código solo lo renderiza cuando `conCanales && joined`.
    useVoice.mockReturnValue(baseState({ joined: false }));
    render(<VoiceChat socket={{}} codigo="ABC" conCanales />);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('sin conCanales, el switch no aparece aunque esté unido', () => {
    useVoice.mockReturnValue(baseState({ joined: true }));
    render(<VoiceChat socket={{}} codigo="ABC" conCanales={false} />);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('con conCanales y unido, muestra el switch y cambia de canal al pulsar la pestaña', () => {
    const cambiarCanal = vi.fn();
    useVoice.mockReturnValue(baseState({ joined: true, canal: 'equipo', cambiarCanal }));
    render(<VoiceChat socket={{}} codigo="ABC" conCanales />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Público/i }));
    expect(cambiarCanal).toHaveBeenCalledWith('publico');
  });

  it('el modo compact agrega la clase compact al contenedor', () => {
    useVoice.mockReturnValue(baseState());
    const { container } = render(<VoiceChat socket={{}} codigo="ABC" compact />);
    expect(container.querySelector('aside')).toHaveClass(styles.compact);
  });

  it('sin compact, el contenedor no lleva la clase compact', () => {
    useVoice.mockReturnValue(baseState());
    const { container } = render(<VoiceChat socket={{}} codigo="ABC" />);
    expect(container.querySelector('aside')).not.toHaveClass(styles.compact);
  });

  it('sin participantes, muestra el mensaje de espera acorde (sin canales)', () => {
    useVoice.mockReturnValue(baseState({ joined: true, participantes: [] }));
    render(<VoiceChat socket={{}} codigo="ABC" conCanales={false} />);
    expect(screen.getByText('Esperando a que se una alguien…')).toBeInTheDocument();
  });

  it('sin participantes en el canal público (2v2), muestra el mensaje específico', () => {
    useVoice.mockReturnValue(baseState({ joined: true, canal: 'publico', participantes: [] }));
    render(<VoiceChat socket={{}} codigo="ABC" conCanales />);
    expect(screen.getByText('Nadie más en el canal público…')).toBeInTheDocument();
  });

  it('lista los participantes con su nombre', () => {
    useVoice.mockReturnValue(
      baseState({
        joined: true,
        participantes: [
          { id: 'p1', name: 'Ana', speaking: false, muted: false, connected: true },
          { id: 'p2', name: 'Beto', speaking: false, muted: true, connected: true },
        ],
      }),
    );
    render(<VoiceChat socket={{}} codigo="ABC" />);
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Beto')).toBeInTheDocument();
  });

  it('marca "conectando…" a un participante que aún no conectó', () => {
    useVoice.mockReturnValue(
      baseState({
        joined: true,
        participantes: [{ id: 'p1', name: 'Ana', speaking: false, muted: false, connected: false }],
      }),
    );
    render(<VoiceChat socket={{}} codigo="ABC" />);
    expect(screen.getByText('conectando…')).toBeInTheDocument();
  });

  it('marca "sin audio" a un participante en estado failed, y no "conectando…"', () => {
    useVoice.mockReturnValue(
      baseState({
        joined: true,
        participantes: [
          { id: 'p1', name: 'Ana', speaking: false, muted: false, connected: false, status: 'failed' },
        ],
      }),
    );
    render(<VoiceChat socket={{}} codigo="ABC" />);
    expect(screen.getByText(/sin audio/)).toBeInTheDocument();
    expect(screen.queryByText('conectando…')).not.toBeInTheDocument();
  });

  it('marca con 🔇 a un participante silenciado', () => {
    useVoice.mockReturnValue(
      baseState({
        joined: true,
        participantes: [{ id: 'p1', name: 'Ana', speaking: false, muted: true, connected: true }],
      }),
    );
    render(<VoiceChat socket={{}} codigo="ABC" />);
    expect(screen.getByText('🔇')).toBeInTheDocument();
  });

  it('marca como hablando (speaking) a "Tú" cuando speakingMe es true y no está silenciado', () => {
    useVoice.mockReturnValue(baseState({ joined: true, speakingMe: true, muted: false }));
    render(<VoiceChat socket={{}} codigo="ABC" />);
    const yo = screen.getByText(/^Tú/).closest('li');
    expect(yo).toHaveClass(styles.speaking);
  });

  it('no marca como hablando a "Tú" si está silenciado, aunque speakingMe sea true', () => {
    // El propio silencio anula el indicador visual: no tiene sentido mostrar "hablando"
    // si el micrófono no está transmitiendo nada.
    useVoice.mockReturnValue(baseState({ joined: true, speakingMe: true, muted: true }));
    render(<VoiceChat socket={{}} codigo="ABC" />);
    const yo = screen.getByText(/^Tú/).closest('li');
    expect(yo).not.toHaveClass(styles.speaking);
  });

  it('marca como hablando a un participante remoto que habla y no está silenciado', () => {
    useVoice.mockReturnValue(
      baseState({
        joined: true,
        participantes: [{ id: 'p1', name: 'Ana', speaking: true, muted: false, connected: true }],
      }),
    );
    render(<VoiceChat socket={{}} codigo="ABC" />);
    const li = screen.getByText('Ana').closest('li');
    expect(li).toHaveClass(styles.speaking);
  });

  it('renderiza un <audio> oculto por cada stream remoto', () => {
    useVoice.mockReturnValue(
      baseState({
        joined: true,
        remoteStreams: { p1: {}, p2: {} },
      }),
    );
    const { container } = render(<VoiceChat socket={{}} codigo="ABC" />);
    expect(container.querySelectorAll('audio')).toHaveLength(2);
  });
});
