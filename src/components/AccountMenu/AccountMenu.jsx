import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import styles from './AccountMenu.module.css';

// Menú de cuenta para la esquina superior derecha: muestra los datos de la sesión y permite
// cerrar sesión. Reutilizable en Lobby y Game.
export default function AccountMenu() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!profile) return null;

  const inicial = (profile.name ?? '?').trim().charAt(0).toUpperCase();
  const expira = profile.exp ? new Date(profile.exp * 1000) : null;
  const cerrar = () => { logout(); navigate('/', { replace: true }); };

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        className={styles.trigger}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        title="Mi cuenta"
      >
        <span className={styles.avatar}>{inicial}</span>
        <span className={styles.name}>{profile.name}</span>
        <span className={styles.caret}>▾</span>
      </button>

      {open && (
        <div className={`${styles.menu} metal`} role="menu">
          <div className={styles.card}>
            <span className={styles.avatarBig}>{inicial}</span>
            <div>
              <p className={styles.cardName}>{profile.name}</p>
              <p className={styles.cardId} title={profile.sub}>ID: {String(profile.sub).slice(0, 16)}…</p>
            </div>
          </div>

          <dl className={styles.data}>
            <dt>Sesión</dt>
            <dd>{expira ? `activa hasta ${expira.toLocaleTimeString()}` : '—'}</dd>
          </dl>

          <a className={styles.link} href="/guia.html" target="_blank" rel="noopener noreferrer">
            📖 Cómo jugar
          </a>
          <button className={styles.logout} onClick={cerrar}>Cerrar sesión</button>
        </div>
      )}
    </div>
  );
}
