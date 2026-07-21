import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminPage from './AdminPage';
import { obtenerKpis } from '../api/kpis';

// PixelBackdrop dibuja en <canvas> vía requestAnimationFrame; jsdom no implementa un
// contexto 2D real (no está el paquete `canvas`), así que se reemplaza por un stub — no es
// parte de la lógica de AdminPage que queremos probar y evita ruido/crashes ajenos al test.
vi.mock('../components/PixelBackdrop/PixelBackdrop', () => ({
  default: () => null,
}));

vi.mock('../api/kpis', () => ({ obtenerKpis: vi.fn() }));

function renderAdmin() {
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminPage', () => {
  it('muestra el estado de carga mientras obtenerKpis todavía no resuelve', () => {
    obtenerKpis.mockReturnValue(new Promise(() => {})); // nunca resuelve
    renderAdmin();
    expect(screen.getByText('Cargando métricas…')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('con datos completos, renderiza los 4 KPIs con sus valores', async () => {
    obtenerKpis.mockResolvedValue({
      tasa_completacion: '92%',
      tasa_reconexion: '87%',
      pico_salas: 14,
      latencia_p95: '120ms',
    });
    renderAdmin();

    await waitFor(() => expect(screen.getByText('92%')).toBeInTheDocument());
    expect(screen.getByText('Partidas completadas')).toBeInTheDocument();
    expect(screen.getByText('87%')).toBeInTheDocument();
    expect(screen.getByText('Reconexiones exitosas')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('Pico de salas concurrentes')).toBeInTheDocument();
    expect(screen.getByText('120ms')).toBeInTheDocument();
    expect(screen.getByText('Latencia P95 disparos')).toBeInTheDocument();
    // Ya con datos, el estado de carga desaparece.
    expect(screen.queryByText('Cargando métricas…')).not.toBeInTheDocument();
  });

  it('con datos parciales, usa los valores por defecto (N/A y 0)', async () => {
    obtenerKpis.mockResolvedValue({});
    renderAdmin();

    await waitFor(() => expect(screen.getAllByText('N/A').length).toBeGreaterThan(0));
    // tasa_completacion, tasa_reconexion y latencia_p95 caen a 'N/A'; pico_salas cae a 0.
    expect(screen.getAllByText('N/A')).toHaveLength(3);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('si obtenerKpis rechaza, muestra un mensaje de error claro y no la grilla de KPIs', async () => {
    obtenerKpis.mockRejectedValue(new Error('boom'));
    renderAdmin();

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo obtener los KPIs del gateway.');
    expect(screen.queryByText('Cargando métricas…')).not.toBeInTheDocument();
    expect(screen.queryByText('Partidas completadas')).not.toBeInTheDocument();
  });

  it('incluye el enlace de vuelta al lobby', () => {
    obtenerKpis.mockReturnValue(new Promise(() => {}));
    renderAdmin();
    expect(screen.getByRole('link', { name: '← Volver al lobby' })).toHaveAttribute('href', '/lobby');
  });
});
