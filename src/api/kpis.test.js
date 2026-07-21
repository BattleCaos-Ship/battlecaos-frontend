import { describe, it, expect, vi } from 'vitest';
import { obtenerKpis } from './kpis';
import { getJson } from './client';
import { GATEWAY_URL } from './config';

// Igual que auth.test.js: verificar que kpis.js pide la URL correcta del gateway,
// delegando el fetch real en getJson (ya cubierto en client.test.js).

vi.mock('./client', () => ({ getJson: vi.fn() }));

describe('obtenerKpis', () => {
  it('pide /kpis al gateway', () => {
    obtenerKpis();
    expect(getJson).toHaveBeenCalledWith(`${GATEWAY_URL}/kpis`);
  });
});
