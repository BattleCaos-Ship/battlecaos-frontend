import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AccountMenu from './AccountMenu';
import { useAuth } from '../../hooks/useAuth';
import { setSession } from '../../store/authStore';
import { cambiarApodo } from '../../api/auth';

// El apodo se cambia contra el backend y luego se recarga la página con el JWT nuevo — hay
// bastante lógica de estado (edición, guardando, error) que vale la pena fijar con pruebas.

vi.mock('../../hooks/useAuth');
vi.mock('../../store/authStore');
vi.mock('../../api/auth');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

const PROFILE = { sub: 'user-abc-123456789', name: 'Capitán', exp: Math.floor(Date.now() / 1000) + 3600 };
const logout = vi.fn();

function setAuth(profile = PROFILE) {
  useAuth.mockReturnValue({ token: 'tok-1', profile, logout });
}

beforeEach(() => {
  vi.clearAllMocks();
  setAuth();
  // jsdom no permite redefinir window.location.reload directamente (no es configurable);
  // se reemplaza el objeto location completo por uno editable.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload: vi.fn() },
  });
});

describe('AccountMenu', () => {
  it('no pinta nada si aún no hay perfil (sesión no resuelta)', () => {
    setAuth(null);
    const { container } = render(<AccountMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it('muestra el apodo y la inicial en el disparador, con el menú cerrado', () => {
    render(<AccountMenu />);
    expect(screen.getByTitle('Mi cuenta')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Capitán')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument(); // inicial
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('al pulsar el disparador se abre el menú con los datos de la cuenta', () => {
    render(<AccountMenu />);
    fireEvent.click(screen.getByTitle('Mi cuenta'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByTitle('Mi cuenta')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/ID: user-abc-1234/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('un clic fuera del menú lo cierra', () => {
    render(<AccountMenu />);
    fireEvent.click(screen.getByTitle('Mi cuenta'));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('un clic dentro del menú no lo cierra', () => {
    render(<AccountMenu />);
    fireEvent.click(screen.getByTitle('Mi cuenta'));
    fireEvent.mouseDown(screen.getByRole('menu'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('cerrar sesión hace logout y navega a la portada', () => {
    render(<AccountMenu />);
    fireEvent.click(screen.getByTitle('Mi cuenta'));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(logout).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('editar apodo precarga el valor actual en el input', () => {
    render(<AccountMenu />);
    fireEvent.click(screen.getByTitle('Mi cuenta'));
    fireEvent.click(screen.getByTitle('Editar apodo'));
    expect(screen.getByPlaceholderText('Tu apodo')).toHaveValue('Capitán');
  });

  it('rechaza un apodo demasiado corto sin llamar al backend', async () => {
    render(<AccountMenu />);
    fireEvent.click(screen.getByTitle('Mi cuenta'));
    fireEvent.click(screen.getByTitle('Editar apodo'));
    fireEvent.change(screen.getByPlaceholderText('Tu apodo'), { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: '✔' }));

    expect(await screen.findByText('El apodo debe tener entre 2 y 20 caracteres.')).toBeInTheDocument();
    expect(cambiarApodo).not.toHaveBeenCalled();
  });

  it('si el apodo no cambió, cierra la edición sin llamar al backend', () => {
    render(<AccountMenu />);
    fireEvent.click(screen.getByTitle('Mi cuenta'));
    fireEvent.click(screen.getByTitle('Editar apodo'));
    fireEvent.click(screen.getByRole('button', { name: '✔' }));

    expect(cambiarApodo).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText('Tu apodo')).not.toBeInTheDocument();
  });

  it('guarda un apodo nuevo válido: llama al backend, guarda el token y recarga', async () => {
    cambiarApodo.mockResolvedValue({ token: 'nuevo-jwt' });
    setSession.mockReturnValue(true);
    render(<AccountMenu />);
    fireEvent.click(screen.getByTitle('Mi cuenta'));
    fireEvent.click(screen.getByTitle('Editar apodo'));
    fireEvent.change(screen.getByPlaceholderText('Tu apodo'), { target: { value: 'Almirante' } });
    fireEvent.click(screen.getByRole('button', { name: '✔' }));

    await waitFor(() => expect(cambiarApodo).toHaveBeenCalledWith('tok-1', 'Almirante'));
    expect(setSession).toHaveBeenCalledWith('nuevo-jwt');
    expect(window.location.reload).toHaveBeenCalled();
  });

  it('también guarda al presionar Enter en el input', async () => {
    cambiarApodo.mockResolvedValue({ token: 'nuevo-jwt' });
    setSession.mockReturnValue(true);
    render(<AccountMenu />);
    fireEvent.click(screen.getByTitle('Mi cuenta'));
    fireEvent.click(screen.getByTitle('Editar apodo'));
    const input = screen.getByPlaceholderText('Tu apodo');
    fireEvent.change(input, { target: { value: 'Almirante' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(cambiarApodo).toHaveBeenCalled());
  });

  it('si el backend rechaza el apodo, muestra el mensaje específico y no recarga', async () => {
    const err = new Error('nope');
    err.codigo = 'apodo_invalido';
    cambiarApodo.mockRejectedValue(err);
    render(<AccountMenu />);
    fireEvent.click(screen.getByTitle('Mi cuenta'));
    fireEvent.click(screen.getByTitle('Editar apodo'));
    fireEvent.change(screen.getByPlaceholderText('Tu apodo'), { target: { value: 'Otro' } });
    fireEvent.click(screen.getByRole('button', { name: '✔' }));

    expect(await screen.findByText('Apodo inválido.')).toBeInTheDocument();
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('si falla por otra razón (red, token mal formado), muestra el mensaje genérico', async () => {
    cambiarApodo.mockRejectedValue(new Error('boom'));
    render(<AccountMenu />);
    fireEvent.click(screen.getByTitle('Mi cuenta'));
    fireEvent.click(screen.getByTitle('Editar apodo'));
    fireEvent.change(screen.getByPlaceholderText('Tu apodo'), { target: { value: 'Otro' } });
    fireEvent.click(screen.getByRole('button', { name: '✔' }));

    expect(await screen.findByText('No se pudo guardar. Intenta de nuevo.')).toBeInTheDocument();
  });

  it('cancelar la edición descarta los cambios sin llamar al backend', () => {
    render(<AccountMenu />);
    fireEvent.click(screen.getByTitle('Mi cuenta'));
    fireEvent.click(screen.getByTitle('Editar apodo'));
    fireEvent.change(screen.getByPlaceholderText('Tu apodo'), { target: { value: 'Descartado' } });
    fireEvent.click(screen.getByRole('button', { name: '✖' }));

    expect(screen.queryByPlaceholderText('Tu apodo')).not.toBeInTheDocument();
    expect(cambiarApodo).not.toHaveBeenCalled();
  });

  it('muestra la hora de expiración de la sesión cuando el perfil trae exp', () => {
    render(<AccountMenu />);
    fireEvent.click(screen.getByTitle('Mi cuenta'));
    expect(screen.getByText(/activa hasta/)).toBeInTheDocument();
  });

  it('sin exp en el perfil, muestra un guion en vez de la hora', () => {
    setAuth({ ...PROFILE, exp: null });
    render(<AccountMenu />);
    fireEvent.click(screen.getByTitle('Mi cuenta'));
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
