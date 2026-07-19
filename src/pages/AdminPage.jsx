import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { obtenerKpis } from '../api/kpis';
import PixelBackdrop from '../components/PixelBackdrop/PixelBackdrop';
import styles from './AdminPage.module.css';

export default function AdminPage() {
  const [kpis, setKpis] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cargar = () => {
      obtenerKpis()
        .then((data) => !cancelled && (setKpis(data), setError(false)))
        .catch(() => !cancelled && setError(true));
    };
    cargar();
    const id = setInterval(cargar, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <main className={styles.wrap}>
      <PixelBackdrop scene="warroom" />
      <header className={styles.header}>
        <h1>Panel de observabilidad</h1>
        <Link to="/lobby">← Volver al lobby</Link>
      </header>

      {error && <p role="alert">No se pudo obtener los KPIs del gateway.</p>}
      {!kpis && !error && <p className={styles.loading}>Cargando métricas…</p>}

      {kpis && (
        <div className={styles.grid}>
          <Kpi label="Partidas completadas" value={kpis.tasa_completacion ?? 'N/A'} />
          <Kpi label="Reconexiones exitosas" value={kpis.tasa_reconexion ?? 'N/A'} />
          <Kpi label="Pico de salas concurrentes" value={kpis.pico_salas ?? 0} />
          <Kpi label="Latencia P95 disparos" value={kpis.latencia_p95 ?? 'N/A'} />
        </div>
      )}
    </main>
  );
}

function Kpi({ label, value, note }) {
  return (
    <div className={styles.kpi}>
      <span className={styles.value}>{value}</span>
      <span className={styles.label}>{label}</span>
      {note && <span className={styles.note}>{note}</span>}
    </div>
  );
}
