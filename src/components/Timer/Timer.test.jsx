import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Timer from './Timer';

// El Timer recibe `remaining` en MILISEGUNDOS desde el evento timer:tick y lo muestra en
// segundos. Los dos casos que de verdad importan: que no aparezca nada antes del primer
// tick (remaining null) y que nunca muestre un tiempo negativo si el tick llega tarde.

describe('Timer', () => {
  it('no pinta nada antes del primer tick', () => {
    const { container } = render(<Timer tipo="TURNO" remaining={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('convierte milisegundos a segundos con un decimal', () => {
    render(<Timer tipo="TURNO" remaining={12300} />);
    expect(screen.getByText('12.3s')).toBeInTheDocument();
  });

  it('nunca muestra tiempo negativo', () => {
    // Un tick que llega tarde puede traer un remaining negativo; mostrar "-0.4s" sería feo
    // y confuso, así que se recorta en 0.
    render(<Timer tipo="TURNO" remaining={-400} />);
    expect(screen.getByText('0.0s')).toBeInTheDocument();
  });

  it('traduce el tipo de fase a una etiqueta legible', () => {
    render(<Timer tipo="COLOCACION" remaining={5000} />);
    expect(screen.getByText('Colocación')).toBeInTheDocument();
  });

  it('muestra el tipo tal cual si es uno desconocido', () => {
    // Si el backend añade una fase nueva, mejor enseñar su nombre que dejar el hueco vacío.
    render(<Timer tipo="FASE_NUEVA" remaining={1000} />);
    expect(screen.getByText('FASE_NUEVA')).toBeInTheDocument();
  });

  it('se marca como temporizador para lectores de pantalla', () => {
    render(<Timer tipo="SALVA" remaining={3000} />);
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });
});
