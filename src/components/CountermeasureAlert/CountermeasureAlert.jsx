import { useState, useEffect, useRef } from 'react';
import styles from './CountermeasureAlert.module.css';

// Escucha poder:contramedida-disponible ({ powerType, remaining: 5000 }) y muestra
// una cuenta regresiva local de 5s con botón para anular. NO usa timer:tick (§4.3).
const CONTRAMEDIDA_COST = 3;

export default function CountermeasureAlert({ socket, codigo, energia = 0 }) {
  const [alert, setAlert] = useState(null); // { powerType }
  const [remaining, setRemaining] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!socket) return;
    const onAvailable = ({ powerType, remaining }) => {
      setAlert({ powerType });
      setRemaining(remaining ?? 5000);
      clearInterval(intervalRef.current);
      const end = Date.now() + (remaining ?? 5000);
      intervalRef.current = setInterval(() => {
        const left = end - Date.now();
        if (left <= 0) {
          clearInterval(intervalRef.current);
          setAlert(null);
          setRemaining(0);
        } else {
          setRemaining(left);
        }
      }, 100);
    };
    socket.on('poder:contramedida-disponible', onAvailable);
    return () => {
      socket.off('poder:contramedida-disponible', onAvailable);
      clearInterval(intervalRef.current);
    };
  }, [socket]);

  if (!alert) return null;

  const activar = () => {
    socket?.emit('contramedida:activar', { codigo });
    clearInterval(intervalRef.current);
    setAlert(null);
  };

  const nombre = alert.powerType === 'bombardeo' ? 'Bombardeo' : 'Sonar';
  const sinEnergia = energia < CONTRAMEDIDA_COST;

  return (
    <div className={styles.overlay} role="alert">
      <div className={styles.box}>
        <p className={styles.text}>
          ¡El rival lanzó <strong>{nombre}</strong>! Puedes anularlo.
        </p>
        <div className={styles.count}>{(remaining / 1000).toFixed(1)}s</div>
        <button className={styles.btn} onClick={activar} disabled={sinEnergia}>
          ¡Anular! (Contramedida · {CONTRAMEDIDA_COST}E)
        </button>
        {sinEnergia && (
          <p className={styles.text}>Necesitas {CONTRAMEDIDA_COST}E (tienes {energia}E).</p>
        )}
      </div>
    </div>
  );
}
