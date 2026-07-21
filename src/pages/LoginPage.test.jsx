import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';
import { loginLocal, registrarLocal } from '../api/auth';
import * as configModule from '../api/config';

// PixelBackdrop dibuja en <canvas> vía requestAnimationFrame; jsdom no implementa un
// contexto 2D real (no está el paquete `canvas`), así que se reemplaza por un stub — no es
// parte de la lógica de LoginPage que queremos probar y evita ruido/crashes ajenos al test.
vi.mock('../components/PixelBackdrop/PixelBackdrop', () => ({
  default: () => null,
}));

vi.mock('../api/auth', () => ({
  loginGoogle: vi.fn(),
  registrarLocal: vi.fn(),
  loginLocal: vi.fn(),
}));

// mockeamos api/config para controlar googleConfigurado/GOOGLE_CLIENT_ID por test en vez de
// depender del .env real del entorno (que aquí podría o no tener un client_id real).
vi.mock('../api/config', () => ({
  GATEWAY_URL: 'http://gateway.test',
  GOOGLE_CLIENT_ID: 'tu-client-id-placeholder',
  googleConfigurado: false,
}));

let mockNavigate;
let mockLocationState = null;

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: mockLocationState }),
}));

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mockNavigate = vi.fn();
  mockLocationState = null;
  vi.clearAllMocks();
  delete window.google;
});

describe('LoginPage', () => {
  it('muestra la pestaña de inicio de sesión por defecto (sin campo de apodo)', () => {
    renderLoginPage();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Correo')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Contraseña')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Apodo/)).not.toBeInTheDocument();
  });

  it('cambiar a la pestaña de registro muestra el campo de apodo', () => {
    renderLoginPage();
    fireEvent.click(screen.getByRole('button', { name: 'Registrarse' }));
    expect(screen.getByPlaceholderText(/Apodo/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear cuenta y entrar' })).toBeInTheDocument();
  });

  it('login local exitoso llama a loginLocal con los valores del formulario, guarda la sesión y navega a /lobby', async () => {
    // Token con forma válida de JWT (3 partes) para que setSession() lo acepte.
    loginLocal.mockResolvedValue({ token: 'aaa.bbb.ccc' });
    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText('Correo'), { target: { value: 'ana@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'secreta1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(loginLocal).toHaveBeenCalledWith({ email: 'ana@test.com', password: 'secreta1' }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/lobby'));
    expect(localStorage.getItem('token')).toBe('aaa.bbb.ccc');
  });

  it('registro exitoso llama a registrarLocal con email, password y apodo', async () => {
    registrarLocal.mockResolvedValue({ token: 'ddd.eee.fff' });
    renderLoginPage();

    fireEvent.click(screen.getByRole('button', { name: 'Registrarse' }));
    fireEvent.change(screen.getByPlaceholderText('Correo'), { target: { value: 'nueva@test.com' } });
    fireEvent.change(screen.getByPlaceholderText(/Apodo/), { target: { value: 'Capitana' } });
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'secreta1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta y entrar' }));

    await waitFor(() =>
      expect(registrarLocal).toHaveBeenCalledWith({ email: 'nueva@test.com', password: 'secreta1', apodo: 'Capitana' }),
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/lobby'));
  });

  it('contraseña incorrecta muestra el mensaje mapeado por LOCAL_AUTH_ERRORS (credenciales_invalidas)', async () => {
    loginLocal.mockRejectedValue({ codigo: 'credenciales_invalidas' });
    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText('Correo'), { target: { value: 'ana@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'malapass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('un código de error desconocido del backend cae en error_desconocido', async () => {
    loginLocal.mockRejectedValue({ codigo: 'codigo_que_no_existe' });
    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText('Correo'), { target: { value: 'ana@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar. Inténtalo de nuevo.');
  });

  it('si el backend responde con un token mal formado, muestra error_desconocido y no navega', async () => {
    loginLocal.mockResolvedValue({ token: 'esto-no-es-un-jwt' });
    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText('Correo'), { target: { value: 'ana@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'secreta1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar. Inténtalo de nuevo.');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('cambiar de pestaña limpia el mensaje de error local previo', async () => {
    loginLocal.mockRejectedValue({ codigo: 'credenciales_invalidas' });
    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText('Correo'), { target: { value: 'ana@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'malapass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.');

    fireEvent.click(screen.getByRole('button', { name: 'Registrarse' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('muestra el banner de sesión expirada cuando location.state.motivo es sesion_expirada', () => {
    mockLocationState = { motivo: 'sesion_expirada' };
    renderLoginPage();
    expect(screen.getByRole('alert')).toHaveTextContent('Tu sesión expiró. Genera un token nuevo e ingresa otra vez.');
  });

  it('no muestra el banner de sesión expirada en un ingreso normal', () => {
    renderLoginPage();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('con googleConfigurado en false, no muestra el botón de Google y sí el aviso de modo desarrollo', () => {
    renderLoginPage();
    expect(screen.getByText(/Inicio de sesión con Google no configurado/)).toBeInTheDocument();
  });

  it('modo desarrollo: un token de prueba válido guarda la sesión y navega a /lobby', () => {
    // JWT con forma válida y un `sub`, construido a mano con base64url (igual que el helper de useAuth.test.js).
    const b64 = (o) => {
      const bytes = new TextEncoder().encode(JSON.stringify(o));
      let binario = '';
      bytes.forEach((b) => { binario += String.fromCharCode(b); });
      return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-1', name: 'Ana', exp })}.firma`;

    renderLoginPage();
    fireEvent.change(screen.getByPlaceholderText('eyJhbGciOiJIUzI1NiI...'), { target: { value: token } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar con token de prueba' }));

    expect(mockNavigate).toHaveBeenCalledWith('/lobby');
    expect(localStorage.getItem('token')).toBe(token);
  });

  it('modo desarrollo: un token sin sub válido (no decodificable) muestra error y no navega', () => {
    renderLoginPage();
    fireEvent.change(screen.getByPlaceholderText('eyJhbGciOiJIUzI1NiI...'), { target: { value: 'no-es-un-jwt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar con token de prueba' }));

    expect(screen.getByRole('alert')).toHaveTextContent('El token no es válido');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('modo desarrollo: un token vencido muestra el error de expiración y no navega', () => {
    const b64 = (o) => {
      const bytes = new TextEncoder().encode(JSON.stringify(o));
      let binario = '';
      bytes.forEach((b) => { binario += String.fromCharCode(b); });
      return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    const expVencido = Math.floor(Date.now() / 1000) - 3600;
    const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-1', exp: expVencido })}.firma`;

    renderLoginPage();
    fireEvent.change(screen.getByPlaceholderText('eyJhbGciOiJIUzI1NiI...'), { target: { value: token } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar con token de prueba' }));

    expect(screen.getByRole('alert')).toHaveTextContent('El token está vencido');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('el botón de token de prueba está deshabilitado cuando el campo está vacío', () => {
    renderLoginPage();
    expect(screen.getByRole('button', { name: 'Entrar con token de prueba' })).toBeDisabled();
  });
});

describe('LoginPage con Google configurado', () => {
  beforeEach(() => {
    configModule.googleConfigurado = true;
    configModule.GOOGLE_CLIENT_ID = 'client-id-real-de-prueba';
    window.google = {
      accounts: { id: { initialize: vi.fn(), renderButton: vi.fn() } },
    };
  });

  it('cuando googleConfigurado es true y window.google existe, inicializa y renderiza el botón de Google', () => {
    renderLoginPage();
    expect(window.google.accounts.id.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: 'client-id-real-de-prueba' }),
    );
    expect(window.google.accounts.id.renderButton).toHaveBeenCalled();
    expect(screen.queryByText(/Inicio de sesión con Google no configurado/)).not.toBeInTheDocument();
  });
});
