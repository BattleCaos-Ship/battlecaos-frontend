import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { setSession } from '../../store/authStore';
import { cambiarApodo } from '../../api/auth';
import styles from './AccountMenu.module.css';

// Menú de cuenta para la esquina superior derecha: muestra los datos de la sesión, permite
// EDITAR EL APODO (persiste en el backend y re-emite el JWT) y cerrar sesión.
export default function AccountMenu() {
  const { token, profile, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState(false);
  const [apodo, setApodo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
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

  const empezarEdicion = () => { setApodo(profile.name ?? ''); setError(null); setEditando(true); };

  const guardarApodo = async () => {
    const nuevo = apodo.trim();
    if (nuevo.length < 2 || nuevo.length > 20) { setError('El apodo debe tener entre 2 y 20 caracteres.'); return; }
    if (nuevo === profile.name) { setEditando(false); return; }
    setGuardando(true);
    setError(null);
    try {
      const { token: nuevoToken } = await cambiarApodo(token, nuevo);
      if (!nuevoToken) throw new Error('error');
      // Reemplazar el token: el nuevo JWT trae el apodo actualizado. Recargamos para que
      // toda la app (socket incluido) use la sesión con el nombre nuevo.
      setSession(nuevoToken);
      window.location.reload();
    } catch (err) {
      setError(err.codigo === 'apodo_invalido' ? 'Apodo inválido.' : 'No se pudo guardar. Intenta de nuevo.');
      setGuardando(false);
    }
  };

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
              {!editando ? (
                <p className={styles.cardName}>
                  {profile.name}
                  <button className={styles.editBtn} onClick={empezarEdicion} title="Editar apodo">✏️</button>
                </p>
              ) : (
                <div className={styles.editRow}>
                  <input
                    value={apodo}
                    onChange={(e) => setApodo(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && guardarApodo()}
                    maxLength={20}
                    autoFocus
                    placeholder="Tu apodo"
                  />
                  <button onClick={guardarApodo} disabled={guardando}>{guardando ? '…' : '✔'}</button>
                  <button onClick={() => setEditando(false)} disabled={guardando}>✖</button>
                </div>
              )}
              <p className={styles.cardId} title={profile.sub}>ID: {String(profile.sub).slice(0, 16)}…</p>
            </div>
          </div>
          {error && <p className={styles.error}>{error}</p>}

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
