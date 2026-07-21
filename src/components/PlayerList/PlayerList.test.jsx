import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PlayerList from './PlayerList';

// Lo sustancial de este componente es `relacion()`: decide si cada jugador es "tú",
// "compañero", "rival" o "bot". En 2v2 equivocarse ahí significa pintar a un aliado como
// enemigo, así que cada rama merece su prueba.

const jugador = (extra) => ({ id: 'x', name: 'X', equipo: 'A', conectado: true, ...extra });

describe('PlayerList', () => {
  it('avisa cuando la sala está vacía', () => {
    render(<PlayerList jugadores={[]} />);
    expect(screen.getByText(/Aún no hay jugadores/i)).toBeInTheDocument();
  });

  it('marca como "tú" al jugador propio', () => {
    render(<PlayerList jugadores={[jugador({ id: 'yo', name: 'Ana' })]} miId="yo" miEquipo="A" />);
    expect(screen.getByText('tú')).toBeInTheDocument();
  });

  it('marca como "compañero" a quien comparte equipo', () => {
    render(
      <PlayerList
        jugadores={[jugador({ id: 'otro', name: 'Beto', equipo: 'A' })]}
        miId="yo"
        miEquipo="A"
      />,
    );
    expect(screen.getByText('compañero')).toBeInTheDocument();
  });

  it('marca como "rival" a quien está en el otro equipo', () => {
    render(
      <PlayerList
        jugadores={[jugador({ id: 'otro', name: 'Caro', equipo: 'B' })]}
        miId="yo"
        miEquipo="A"
      />,
    );
    expect(screen.getByText('rival')).toBeInTheDocument();
  });

  it('marca como "bot" aunque comparta equipo conmigo', () => {
    // El bot va antes que la comprobación de equipo: un bot aliado se etiqueta "bot",
    // no "compañero".
    render(
      <PlayerList
        jugadores={[jugador({ id: 'b1', name: 'Bot', equipo: 'A', esBot: true })]}
        miId="yo"
        miEquipo="A"
      />,
    );
    expect(screen.getByText('bot')).toBeInTheDocument();
  });

  it('sin equipo propio conocido, los demás salen como rivales', () => {
    render(<PlayerList jugadores={[jugador({ id: 'otro', equipo: 'A' })]} miId="yo" />);
    expect(screen.getByText('rival')).toBeInTheDocument();
  });

  it('señala de quién es el turno', () => {
    render(<PlayerList jugadores={[jugador({ id: 'a', name: 'Ana' })]} activeId="a" />);
    expect(screen.getByTitle('En turno')).toBeInTheDocument();
  });

  it('marca a los desconectados', () => {
    render(<PlayerList jugadores={[jugador({ id: 'a', conectado: false })]} />);
    expect(screen.getByText('offline')).toBeInTheDocument();
  });

  it('no marca offline a quien está conectado', () => {
    render(<PlayerList jugadores={[jugador({ id: 'a', conectado: true })]} />);
    expect(screen.queryByText('offline')).not.toBeInTheDocument();
  });

  it('lista a todos los jugadores con su nombre y equipo', () => {
    render(
      <PlayerList
        jugadores={[
          jugador({ id: 'a', name: 'Ana', equipo: 'A' }),
          jugador({ id: 'b', name: 'Beto', equipo: 'B' }),
        ]}
      />,
    );
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Beto')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
