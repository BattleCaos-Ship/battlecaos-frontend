import styles from './EnergyBar.module.css';

// Energía de EQUIPO (no de jugador). Tope de 5 (ENERGY_CAP del backend).
export default function EnergyBar({ energia = 0, max = 5 }) {
  const pct = Math.min((energia / max) * 100, 100);
  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span>Energía del equipo</span>
        <span className={styles.value}>{energia}E</span>
      </div>
      <div
        className={styles.track}
        role="meter"
        aria-valuenow={energia}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
