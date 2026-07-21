import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PowerPanel, { POWERS } from './PowerPanel';

// El panel de poderes decide qué botones puede pulsar el jugador. Equivocarse aquí deja
// gastar energía que no tiene (y el backend lo rechaza con `energia_insuficiente`, dando
// una experiencia confusa) o bloquea un poder disponible. Cada regla de habilitación
// —energía, tormenta ya usada, panel deshabilitado— tiene su prueba.

const boton = (nombre) => screen.getByRole('button', { name: new RegExp(nombre, 'i') });

describe('POWERS', () => {
  it('define los cuatro poderes con su coste', () => {
    expect(POWERS.map((p) => p.id)).toEqual(['bombardeo', 'sonar', 'escudo', 'tormenta']);
  });

  it('todos tienen coste positivo y una pista para el jugador', () => {
    for (const p of POWERS) {
      expect(p.cost).toBeGreaterThan(0);
      expect(p.hint.length).toBeGreaterThan(0);
    }
  });
});

describe('PowerPanel', () => {
  it('con energía de sobra, todos los poderes son pulsables', () => {
    render(<PowerPanel energia={5} onChoose={vi.fn()} />);
    for (const p of POWERS) expect(boton(p.label)).toBeEnabled();
  });

  it('sin energía, ninguno es pulsable', () => {
    render(<PowerPanel energia={0} onChoose={vi.fn()} />);
    for (const p of POWERS) expect(boton(p.label)).toBeDisabled();
  });

  it('habilita solo los poderes que la energía alcanza a pagar', () => {
    // Con 2E: escudo (1E) y bombardeo/sonar (2E) sí; tormenta (3E) no.
    render(<PowerPanel energia={2} onChoose={vi.fn()} />);
    expect(boton('Escudo')).toBeEnabled();
    expect(boton('Bombardeo')).toBeEnabled();
    expect(boton('Sonar')).toBeEnabled();
    expect(boton('Tormenta')).toBeDisabled();
  });

  it('bloquea la Tormenta si ya se usó, aunque sobre energía', () => {
    render(<PowerPanel energia={5} tormentaUsada onChoose={vi.fn()} />);
    expect(boton('Tormenta')).toBeDisabled();
    expect(boton('Tormenta')).toHaveAttribute('title', 'Ya usaste Tormenta');
  });

  it('el panel deshabilitado bloquea todo, aunque haya energía', () => {
    // Es el caso de "no es tu turno": la energía está, pero no toca actuar.
    render(<PowerPanel energia={5} disabled onChoose={vi.fn()} />);
    for (const p of POWERS) expect(boton(p.label)).toBeDisabled();
  });

  it('avisa con el poder completo al elegirlo', () => {
    // Pasa el objeto entero, no solo el id: GamePage necesita el coste y el tipo de objetivo.
    const onChoose = vi.fn();
    render(<PowerPanel energia={5} onChoose={onChoose} />);
    fireEvent.click(boton('Bombardeo'));
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: 'bombardeo', cost: 2 }));
  });

  it('no avisa si el poder está bloqueado', () => {
    const onChoose = vi.fn();
    render(<PowerPanel energia={0} onChoose={onChoose} />);
    fireEvent.click(boton('Escudo'));
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('explica qué hacer cuando hay un poder seleccionado', () => {
    render(<PowerPanel energia={5} selectedPower="sonar" onChoose={vi.fn()} />);
    expect(screen.getByText(/selecciona el objetivo o vuelve a pulsar para cancelar/i)).toBeInTheDocument();
  });

  it('no muestra la explicación si no hay nada seleccionado', () => {
    render(<PowerPanel energia={5} onChoose={vi.fn()} />);
    expect(screen.queryByText(/selecciona el objetivo/i)).not.toBeInTheDocument();
  });

  it('muestra el coste de cada poder', () => {
    render(<PowerPanel energia={5} onChoose={vi.fn()} />);
    expect(screen.getByText('3E')).toBeInTheDocument();  // tormenta
    expect(screen.getByText('1E')).toBeInTheDocument();  // escudo
  });
});
