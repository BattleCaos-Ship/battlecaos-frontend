import styles from './Timer.module.css';

const LABELS = {
  COLOCACION: 'Colocación',
  TURNO: 'Turno',
  SALVA: 'Salva',
};

// remaining en ms. tipo ∈ COLOCACION | TURNO | SALVA (viene de timer:tick).
export default function Timer({ tipo, remaining }) {
  if (remaining == null) return null;
  const secs = Math.max(0, remaining / 1000);
  const low = secs <= 5;
  return (
    <div className={`${styles.timer} ${low ? styles.low : ''}`} role="timer">
      <span className={styles.label}>{LABELS[tipo] ?? tipo}</span>
      <span className={styles.value}>{secs.toFixed(1)}s</span>
    </div>
  );
}
