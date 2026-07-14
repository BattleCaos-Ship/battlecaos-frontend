import { useEffect, useRef, useState } from 'react';
import styles from './StormGates.module.css';

// Animación de la TORMENTA: dos compuertas de acero cierran el mapa desde los lados, aparece
// el letrero de precaución con rayos, y luego se vuelven a abrir. Se dispara al recibir el
// evento `poder:tormenta` (lo ve toda la sala). `trigger` es un id que cambia con cada uso.
export default function StormGates({ trigger, porNombre }) {
  const [phase, setPhase] = useState('idle'); // idle | closing | open-warning | opening
  const timers = useRef([]);

  useEffect(() => {
    if (!trigger) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase('closing');
    timers.current.push(setTimeout(() => setPhase('warning'), 620));
    timers.current.push(setTimeout(() => setPhase('opening'), 2500));
    timers.current.push(setTimeout(() => setPhase('idle'), 3300));
    return () => timers.current.forEach(clearTimeout);
  }, [trigger]);

  if (phase === 'idle') return null;

  const closed = phase === 'closing' || phase === 'warning';

  return (
    <div className={styles.overlay} aria-live="assertive">
      {/* nubarrón + destellos de rayos detrás de las compuertas */}
      <div className={`${styles.sky} ${closed ? styles.skyOn : ''}`}>
        <span className={styles.bolt} style={{ left: '22%', animationDelay: '0.2s' }} />
        <span className={styles.bolt} style={{ left: '58%', animationDelay: '0.55s' }} />
        <span className={styles.bolt} style={{ left: '80%', animationDelay: '0.9s' }} />
      </div>

      {/* compuertas de acero */}
      <div className={`${styles.gate} ${styles.left} ${closed ? styles.leftClosed : ''}`}>
        <span className={styles.stripes} />
        <span className={styles.rivets} />
      </div>
      <div className={`${styles.gate} ${styles.right} ${closed ? styles.rightClosed : ''}`}>
        <span className={styles.stripes} />
        <span className={styles.rivets} />
      </div>

      {/* letrero de precaución al centro */}
      {phase === 'warning' && (
        <div className={styles.signWrap}>
          <div className={styles.sign}>
            <span className={styles.signIcon}>⚠</span>
            <span className={styles.signText}>PRECAUCIÓN<br />SE AVECINA UNA TORMENTA</span>
            <span className={styles.signIcon}>⚠</span>
          </div>
          {porNombre && <p className={styles.by}>{porNombre} desató la tormenta</p>}
        </div>
      )}
    </div>
  );
}
