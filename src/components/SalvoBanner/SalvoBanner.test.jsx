import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SalvoBanner from './SalvoBanner';

// Banner de la fase SALVA. La cuenta atrás y el aviso son opcionales: el banner debe
// pintarse igual sin ellos (llega antes del primer tick del temporizador).

describe('SalvoBanner', () => {
  it('anuncia la fase aunque no haya llegado el primer tick', () => {
    render(<SalvoBanner />);
    expect(screen.getByText(/SALVA SIMULTÁNEA/i)).toBeInTheDocument();
  });

  it('muestra la cuenta atrás en segundos', () => {
    render(<SalvoBanner remaining={4500} />);
    expect(screen.getByText('4.5s')).toBeInTheDocument();
  });

  it('no muestra tiempo negativo si el tick llega tarde', () => {
    render(<SalvoBanner remaining={-200} />);
    expect(screen.getByText('0.0s')).toBeInTheDocument();
  });

  it('muestra el aviso cuando GamePage lo pasa (p. ej. rechazo por cadencia)', () => {
    render(<SalvoBanner remaining={3000} notice="¡Más despacio!" />);
    expect(screen.getByText('¡Más despacio!')).toBeInTheDocument();
  });

  it('no deja hueco de aviso si no hay aviso', () => {
    render(<SalvoBanner remaining={3000} />);
    expect(screen.queryByText(/Más despacio/)).not.toBeInTheDocument();
  });
});
