import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EnergyBar from './EnergyBar';

// La barra de energía es de EQUIPO y el backend la topa en 5 (ENERGY_CAP). Lo que importa
// aquí es que el ancho no se salga del 100% aunque llegue un valor por encima del tope, y
// que los atributos ARIA del medidor reflejen el valor real (un lector de pantalla los usa).

const barra = () => screen.getByRole('meter');

describe('EnergyBar', () => {
  it('muestra la energía actual', () => {
    render(<EnergyBar energia={3} />);
    expect(screen.getByText('3E')).toBeInTheDocument();
  });

  it('parte de 0 si no le pasan energía', () => {
    render(<EnergyBar />);
    expect(screen.getByText('0E')).toBeInTheDocument();
    expect(barra()).toHaveAttribute('aria-valuenow', '0');
  });

  it('expone el valor y los límites para lectores de pantalla', () => {
    render(<EnergyBar energia={2} max={5} />);
    expect(barra()).toHaveAttribute('aria-valuenow', '2');
    expect(barra()).toHaveAttribute('aria-valuemin', '0');
    expect(barra()).toHaveAttribute('aria-valuemax', '5');
  });

  it('llena la barra al 100% cuando la energía está al tope', () => {
    const { container } = render(<EnergyBar energia={5} max={5} />);
    expect(container.querySelector('[style]')).toHaveStyle({ width: '100%' });
  });

  it('NO se desborda si llega un valor por encima del tope', () => {
    // Sin el Math.min, un 8/5 daría un 160% de ancho y la barra se saldría del panel.
    const { container } = render(<EnergyBar energia={8} max={5} />);
    expect(container.querySelector('[style]')).toHaveStyle({ width: '100%' });
  });

  it('calcula el porcentaje intermedio', () => {
    const { container } = render(<EnergyBar energia={1} max={4} />);
    expect(container.querySelector('[style]')).toHaveStyle({ width: '25%' });
  });
});
