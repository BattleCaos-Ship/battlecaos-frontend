import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CollapsiblePanel from './CollapsiblePanel';

// Panel acordeón que envuelve el chat y la voz bajo los tableros. Lo importante es que el
// contenido se monte/desmonte de verdad al plegar (no solo se oculte con CSS) y que
// aria-expanded acompañe al estado: sin eso, un lector de pantalla anuncia mal el panel.

describe('CollapsiblePanel', () => {
  it('empieza abierto por defecto', () => {
    render(<CollapsiblePanel label="Chat"><p>contenido</p></CollapsiblePanel>);
    expect(screen.getByText('contenido')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });

  it('puede empezar cerrado', () => {
    render(<CollapsiblePanel label="Chat" defaultOpen={false}><p>contenido</p></CollapsiblePanel>);
    expect(screen.queryByText('contenido')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });

  it('pliega y despliega al pulsar la cabecera', () => {
    render(<CollapsiblePanel label="Chat"><p>contenido</p></CollapsiblePanel>);
    const boton = screen.getByRole('button');

    fireEvent.click(boton);
    expect(screen.queryByText('contenido')).not.toBeInTheDocument();
    expect(boton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(boton);
    expect(screen.getByText('contenido')).toBeInTheDocument();
    expect(boton).toHaveAttribute('aria-expanded', 'true');
  });

  it('muestra la etiqueta y el icono', () => {
    render(<CollapsiblePanel label="Voz" icon="🎙️"><p>x</p></CollapsiblePanel>);
    expect(screen.getByRole('button')).toHaveTextContent('Voz');
    expect(screen.getByRole('button')).toHaveTextContent('🎙️');
  });

  it('el título del botón describe la acción que hará al pulsarlo', () => {
    render(<CollapsiblePanel label="Chat"><p>x</p></CollapsiblePanel>);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Ocultar Chat');
  });
});
