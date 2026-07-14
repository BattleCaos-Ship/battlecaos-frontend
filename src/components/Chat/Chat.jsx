import { useState, useEffect, useRef } from 'react';
import styles from './Chat.module.css';

// battlecaos-chat aún no existe: emitimos chat:mensaje igual (no rompe nada) y
// escuchamos chat:history/chat:message por si más adelante el servicio se conecta.
export default function Chat({ socket, codigo }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
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

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    socket?.emit('chat:mensaje', { codigo, text: t });
    setText('');
  };

  return (
    <aside className={styles.chat}>
      <h3 className={styles.title}>Chat</h3>
      <div className={styles.list} ref={listRef}>
        {messages.length === 0 ? (
          <p className={styles.empty}>Sin mensajes.</p>
        ) : (
          messages.map((m, i) => (
            <p key={i} className={styles.msg}>
              <span className={styles.sender}>{m.senderName ?? 'Jugador'}:</span> {m.text}
            </p>
          ))
        )}
      </div>
      <div className={styles.inputRow}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Escribe un mensaje…"
        />
        <button onClick={send}>Enviar</button>
      </div>
    </aside>
  );
}
