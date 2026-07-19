import { useState, useEffect, useRef } from 'react';
import styles from './Chat.module.css';

// Chat de texto con CANALES (2v2): switch Equipo 🔒 / Público 🌐.
//  - Equipo: solo tus compañeros lo ven (enrutado en el servidor).
//  - Público: toda la sala; muestra además quiénes están conectados.
// En 1v1 no hay switch: todo es público (se habla con el rival).
export default function Chat({ socket, codigo, titulo = 'Chat', conCanales = false, jugadores = [], miId }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [canal, setCanal] = useState(conCanales ? 'equipo' : 'publico');
  const [verMas, setVerMas] = useState(false); // compacto (3 últimos) ↔ expandido (6 + scroll)
  const listRef = useRef(null);

  useEffect(() => {
    if (!socket) return;
    const onHistory = (hist) => setMessages(Array.isArray(hist) ? hist : []);
    const onMessage = (msg) => setMessages((m) => [...m, msg]);
    socket.on('chat:history', onHistory);
    socket.on('chat:message', onMessage);
    return () => {
      socket.off('chat:history', onHistory);
      socket.off('chat:message', onMessage);
    };
  }, [socket]);

  // Mensajes visibles según la pestaña (el servidor ya filtró lo que NO me toca ver).
  const visibles = conCanales
    ? messages.filter((m) => (m.canal ?? 'equipo') === canal)
    : messages;

  // Compacto: solo los últimos 3 (sin scroll). Expandido: todos, con scroll (caja de ~6 filas).
  const mostrados = verMas ? visibles : visibles.slice(-3);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [mostrados.length, canal, verMas]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    socket?.emit('chat:mensaje', { codigo, text: t, canal });
    setText('');
  };

  const conectados = jugadores.filter((j) => !j.esBot && j.conectado !== false);

  return (
    <aside className={styles.chat}>
      <div className={styles.header}>
        <h3 className={styles.title}>{titulo}</h3>
        {conCanales && (
          <div className={styles.switch} role="tablist">
            <button
              role="tab"
              className={canal === 'equipo' ? styles.tabActive : styles.tab}
              onClick={() => setCanal('equipo')}
            >
              🔒 Equipo
            </button>
            <button
              role="tab"
              className={canal === 'publico' ? styles.tabActive : styles.tab}
              onClick={() => setCanal('publico')}
            >
              🌐 Público
            </button>
          </div>
        )}
      </div>

      {conCanales && canal === 'publico' && (
        <p className={styles.connected} title="Jugadores conectados en el chat público">
          Conectados: {conectados.map((j) => (j.id === miId ? `${j.name} (tú)` : j.name)).join(', ') || '—'}
        </p>
      )}

      <div className={`${styles.list} ${verMas ? styles.listExpanded : styles.listCompact}`} ref={listRef}>
        {mostrados.length === 0 ? (
          <p className={styles.empty}>Sin mensajes.</p>
        ) : (
          mostrados.map((m, i) => (
            <p key={i} className={styles.msg}>
              <span className={styles.sender}>{m.senderName ?? 'Jugador'}:</span> {m.text}
            </p>
          ))
        )}
      </div>
      {visibles.length > 3 && (
        <button className={styles.verMas} onClick={() => setVerMas((v) => !v)}>
          {verMas ? 'Ver menos ▴' : `Ver todos (${visibles.length}) ▾`}
        </button>
      )}
      <div className={styles.inputRow}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={conCanales && canal === 'equipo' ? 'Mensaje a tu equipo…' : 'Escribe un mensaje…'}
        />
        <button onClick={send}>Enviar</button>
      </div>
    </aside>
  );
}
