import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import PixelBackdrop from '../components/PixelBackdrop/PixelBackdrop';
import styles from './ResultPage.module.css';

const MODO_LABEL = { '1v1': '1 vs 1', '1v1-bot': '1 vs Bot', '2v2': '2 vs 2' };

export default function ResultPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const winner = state?.winner;
  const modo = state?.modo;
  const duracion = state?.duracion;
  const miEquipo = state?.miEquipo;

  // Resultado desde tu perspectiva cuando sabemos tu equipo.
  const gane = miEquipo != null && winner != null && miEquipo === winner;
  const perdi = miEquipo != null && winner != null && miEquipo !== winner;

  let titulo = 'Partida terminada';
  if (gane) titulo = '🏆 ¡Ganaste!';
  else if (perdi) titulo = 'Derrota';
  else if (winner) titulo = `Gana el equipo ${winner}`;

  return (
    <main className={styles.wrap}>
      <PixelBackdrop scene="workshop" />
      <div className={`${styles.card} metal ${gane ? styles.win : perdi ? styles.lose : ''}`}>
        <h1 className={styles.title}>{titulo}</h1>

        <dl className={styles.stats}>
          {modo && (<><dt>Modo</dt><dd>{MODO_LABEL[modo] ?? modo}</dd></>)}
          {winner && (<><dt>Equipo ganador</dt><dd>{winner}</dd></>)}
          {duracion != null && (<><dt>Duración</dt><dd>{Math.round(duracion / 1000)}s</dd></>)}
        </dl>

        <div className={styles.actions}>
          <button
            className={styles.primary}
            onClick={() => navigate('/lobby', { state: { modo } })}
          >
            🔄 Jugar de nuevo
          </button>
          <button className={styles.secondary} onClick={() => navigate('/lobby')}>
            Elegir otro modo
          </button>
          <button
            className={styles.secondary}
            onClick={() => { logout(); navigate('/', { replace: true }); }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </main>
  );
}
