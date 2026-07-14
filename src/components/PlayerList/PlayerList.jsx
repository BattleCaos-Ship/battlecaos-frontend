import styles from './PlayerList.module.css';

// Etiqueta de relación de cada jugador respecto a mí.
function relacion(j, miId, miEquipo) {
  if (j.id === miId) return 'tú';
  if (j.esBot) return 'bot';
  if (miEquipo && j.equipo === miEquipo) return 'compañero';
  return 'rival';
}

export default function PlayerList({ jugadores = [], miId, miEquipo, activeId }) {
  if (jugadores.length === 0) {
    return <p className={styles.empty}>Aún no hay jugadores en la sala.</p>;
  }
  return (
    <ul className={styles.list}>
      {jugadores.map((j) => {
        const rel = relacion(j, miId, miEquipo);
        const activo = activeId && j.id === activeId;
        return (
          <li
            key={j.id}
            className={`${styles.item} ${activo ? styles.active : ''}`}
            data-team={j.equipo}
          >
            <span className={styles.badge} data-team={j.equipo}>
              {j.equipo}
            </span>
            <span className={styles.name}>{j.name}</span>
            <span className={styles.rel} data-rel={rel}>
              {rel}
            </span>
            {activo && <span className={styles.turnDot} title="En turno">●</span>}
            {j.conectado === false && <span className={styles.offline}>offline</span>}
          </li>
        );
      })}
    </ul>
  );
}
