import { useVoice } from '../../hooks/useVoice';
import styles from './VoiceChat.module.css';

// Panel de chat de voz (WebRTC P2P). Controles (unirse / mute / salir), lista de quién
// está en el canal y quién habla, y los <audio> ocultos de cada peer remoto.
// En 2v2 (`conCanales`) trae el switch Equipo 🔒 / Público 🌐 — igual que el chat de texto.
// `compact`: versión mínima (solo botones + lista breve) para ir debajo del chat de texto
// sin robarle espacio a los tableros.
export default function VoiceChat({ socket, codigo, jugadores = [], miId, titulo = 'Voz', conCanales = false, compact = false }) {
  const { joined, muted, canal, error, participantes, remoteStreams, speakingMe, join, leave, toggleMute, cambiarCanal } =
    useVoice({ socket, codigo, jugadores, miId, canalInicial: conCanales ? 'equipo' : 'publico' });

  const errMsg = {
    permiso_denegado: 'Permiso de micrófono denegado. Habilítalo en el navegador para usar la voz.',
    sin_microfono: 'No se pudo acceder al micrófono.',
  };

  return (
    <aside className={`${styles.voice} ${compact ? styles.compact : ''}`}>
      <div className={styles.header}>
        <h3 className={styles.title}>{titulo} 🎙️</h3>
        {conCanales && joined && (
          <div className={styles.switch} role="tablist">
            <button
              role="tab"
              className={canal === 'equipo' ? styles.tabActive : styles.tab}
              onClick={() => cambiarCanal('equipo')}
            >
              🔒 Equipo
            </button>
            <button
              role="tab"
              className={canal === 'publico' ? styles.tabActive : styles.tab}
              onClick={() => cambiarCanal('publico')}
            >
              🌐 Público
            </button>
          </div>
        )}
      </div>

      {error && <p className={styles.error}>{errMsg[error] ?? error}</p>}

      {!joined ? (
        <button className={styles.joinBtn} onClick={join}>Unirse a la voz</button>
      ) : (
        <>
          <div className={styles.controls}>
            <button
              className={`${styles.micBtn} ${muted ? styles.muted : ''}`}
              onClick={toggleMute}
              title={muted ? 'Activar micrófono' : 'Silenciar micrófono'}
            >
              {muted ? '🔇 Silenciado' : '🎤 Mic activo'}
            </button>
            <button className={styles.leaveBtn} onClick={leave}>Salir</button>
          </div>

          <ul className={styles.list}>
            <li className={`${styles.me} ${speakingMe && !muted ? styles.speaking : ''}`}>
              <span className={styles.dot} /> Tú {muted ? '(silenciado)' : ''}
            </li>
            {participantes.length === 0 && (
              <li className={styles.empty}>
                {conCanales && canal === 'publico' ? 'Nadie más en el canal público…' : 'Esperando a que se una alguien…'}
              </li>
            )}
            {participantes.map((p) => (
              <li key={p.id} className={p.speaking && !p.muted ? styles.speaking : ''}>
                <span className={styles.dot} />
                {p.name}
                {p.status === 'failed'
                  ? <span className={styles.tagErr} title="No se pudo abrir una ruta de audio entre las dos redes. Suele faltar un servidor TURN alcanzable.">sin audio ⚠️</span>
                  : !p.connected && <span className={styles.tag}>conectando…</span>}
                {p.muted && <span className={styles.tag}>🔇</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Audio remoto (oculto): un elemento por peer, srcObject vía ref callback. */}
      <div className={styles.audios} aria-hidden="true">
        {Object.entries(remoteStreams).map(([peerId, stream]) => (
          <audio
            key={peerId}
            autoPlay
            playsInline
            ref={(el) => {
              if (el && el.srcObject !== stream) {
                el.srcObject = stream;
                el.play?.().catch(() => { /* autoplay puede requerir gesto; el botón "Unirse" ya lo dio */ });
              }
            }}
          />
        ))}
      </div>
    </aside>
  );
}
