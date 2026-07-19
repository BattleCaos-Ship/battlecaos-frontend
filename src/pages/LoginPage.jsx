import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { decodeJwt } from '../hooks/useAuth';
import { setSession } from '../store/authStore';
import { loginGoogle, registrarLocal, loginLocal } from '../api/auth';
import { GATEWAY_URL, GOOGLE_CLIENT_ID, googleConfigurado } from '../api/config';
import { LOCAL_AUTH_ERRORS } from '../constants/copy';
import PixelBackdrop from '../components/PixelBackdrop/PixelBackdrop';
import styles from './LoginPage.module.css';

export default function LoginPage() {
  const [status, setStatus] = useState('idle'); // idle | loading | error
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();
  const btnRef = useRef(null);

  function onGoogleResponse(response) {
    setStatus('loading');
    loginGoogle(response.credential)
      .then(({ token }) => { setSession(token); navigate('/lobby'); })
      .catch(() => {
        setErrorMsg('No se pudo iniciar sesión. Inténtalo de nuevo.');
        setStatus('error');
      });
  }

  useEffect(() => {
    const google = window.google;
    if (!google || !GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.startsWith('tu-client-id')) return;
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: onGoogleResponse,
    });
    if (btnRef.current) {
      google.accounts.id.renderButton(btnRef.current, {
        theme: 'filled_blue',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fallback de desarrollo: pide un JWT de prueba al mismo backend de auth no es posible
  // (requiere Google), así que se genera con el script gen-token.mjs del repo raíz y se
  // pega aquí. Útil para probar el frontend sin configurar Google OAuth.
  const [devToken, setDevToken] = useState('');
  const [devError, setDevError] = useState('');
  function useDevToken() {
    const t = devToken.trim();
    if (!t) return;
    // Validar el token antes de entrar: si está mal formado o vencido, avisar en vez de
    // dejar que falle silenciosamente al conectar el socket.
    const payload = decodeJwt(t);
    if (!payload || !payload.sub) {
      setDevError('El token no es válido. Genéralo con: node gen-token.mjs "TuNombre" tu-id');
      return;
    }
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      setDevError('El token está vencido (duran 1 hora). Genera uno nuevo con node gen-token.mjs');
      return;
    }
    setDevError('');
    setSession(t);
    navigate('/lobby');
  }

  // ── Registro / inicio de sesión con email + contraseña + apodo ──────────────
  const [modo, setModo] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ email: '', password: '', apodo: '' });
  const [localError, setLocalError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviarLocal(e) {
    e.preventDefault();
    setLocalError('');
    setEnviando(true);
    try {
      const { token } = modo === 'register'
        ? await registrarLocal({ email: form.email, password: form.password, apodo: form.apodo })
        : await loginLocal({ email: form.email, password: form.password });
      setSession(token);
      navigate('/lobby');
    } catch (err) {
      // err.codigo es el código del backend (ApiError) → texto legible de constants/copy.
      setLocalError(LOCAL_AUTH_ERRORS[err.codigo] ?? LOCAL_AUTH_ERRORS.error_desconocido);
    } finally {
      setEnviando(false);
    }
  }

  const location = useLocation();
  const sesionExpirada = location.state?.motivo === 'sesion_expirada';

  return (
    <main className={styles.wrap}>
      <PixelBackdrop scene="sea" />
      <div className={`${styles.card} metal`}>
        <h1 className={styles.title}>BattleCaos-Ship</h1>
        <p className={styles.subtitle}>Batalla naval multijugador en tiempo real</p>

        {sesionExpirada && <p role="alert">Tu sesión expiró. Genera un token nuevo e ingresa otra vez.</p>}
        {status === 'error' && <p role="alert">{errorMsg}</p>}

        {status === 'loading' ? (
          <p className={styles.loading}>Cargando…</p>
        ) : googleConfigurado ? (
          <div ref={btnRef} className={styles.googleBtn} />
        ) : (
          <p className={styles.googleOff}>
            Inicio de sesión con Google no configurado en este entorno.
            <br />Usa el <strong>modo desarrollo</strong> de abajo para entrar.
          </p>
        )}

        <div className={styles.localAuth}>
          <div className={styles.tabs}>
            <button
              type="button"
              className={modo === 'login' ? styles.tabActive : styles.tab}
              onClick={() => { setModo('login'); setLocalError(''); }}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              className={modo === 'register' ? styles.tabActive : styles.tab}
              onClick={() => { setModo('register'); setLocalError(''); }}
            >
              Registrarse
            </button>
          </div>

          <form onSubmit={enviarLocal} className={styles.form}>
            <input
              type="email"
              placeholder="Correo"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            {modo === 'register' && (
              <input
                type="text"
                placeholder="Apodo (2–20 caracteres)"
                maxLength={20}
                value={form.apodo}
                onChange={(e) => setForm((f) => ({ ...f, apodo: e.target.value }))}
              />
            )}
            <input
              type="password"
              placeholder="Contraseña"
              autoComplete={modo === 'register' ? 'new-password' : 'current-password'}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
            {localError && <p role="alert" className={styles.devErr}>{localError}</p>}
            <button type="submit" disabled={enviando}>
              {enviando ? 'Enviando…' : modo === 'register' ? 'Crear cuenta y entrar' : 'Entrar'}
            </button>
          </form>
        </div>

        <details className={styles.dev} open={!googleConfigurado}>
          <summary>Modo desarrollo (token de prueba)</summary>
          <p className={styles.devHelp}>
            Genera un JWT con <code>node gen-token.mjs "TuNombre" tu-id</code> en la raíz del
            proyecto y pégalo aquí.
          </p>
          <textarea
            className={styles.devInput}
            rows={3}
            value={devToken}
            onChange={(e) => { setDevToken(e.target.value); setDevError(''); }}
            placeholder="eyJhbGciOiJIUzI1NiI..."
          />
          {devError && <p role="alert" className={styles.devErr}>{devError}</p>}
          <button onClick={useDevToken} disabled={!devToken.trim()}>
            Entrar con token de prueba
          </button>
        </details>

        <a className={styles.guideLink} href="/guia.html" target="_blank" rel="noopener noreferrer">
          📖 Cómo jugar — guía del juego
        </a>
        <p className={styles.gatewayInfo}>Gateway: {GATEWAY_URL}</p>
      </div>
    </main>
  );
}
