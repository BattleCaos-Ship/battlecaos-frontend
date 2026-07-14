import styles from './SalvoBanner.module.css';

// Banner de la fase SALVA. remaining en ms (de timer:tick tipo SALVA). notice es un
// aviso breve opcional (ej. rechazo por cadencia) que GamePage pasa cuando aplica.
export default function SalvoBanner({ remaining, notice }) {
  return (
    <div className={styles.banner}>
      <div className={styles.left}>
        <strong className={styles.title}>¡SALVA SIMULTÁNEA!</strong>
        <span className={styles.sub}>Todos disparan a la vez · cadencia mínima 0.5s</span>
      </div>
      {remaining != null && <div className={styles.count}>{Math.max(0, remaining / 1000).toFixed(1)}s</div>}
      {notice && <div className={styles.notice}>{notice}</div>}
    </div>
  );
}
