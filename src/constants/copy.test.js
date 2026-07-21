import { describe, it, expect } from 'vitest';
import {
  MODO_LABEL, FASE_LABEL, ROOM_ERRORS, LOCAL_AUTH_ERRORS, GAME_ERRORS,
} from './copy';

// Estos mapas traducen códigos del backend a texto para el usuario, y se usan siempre con
// el patrón `MAPA[codigo] ?? codigo`. Ese `??` es cómodo pero traicionero: si falta una
// entrada NADA falla, simplemente al jugador le aparece un código en crudo como
// "jugador_no_esta". Estas pruebas fijan la lista de códigos que el backend puede emitir,
// de modo que añadir uno nuevo allí sin su texto aquí rompa el CI en vez de llegar a
// producción. (Al escribirlas faltaban dos: `jugador_no_esta` y `fase_invalida`.)

// Códigos que los servicios lanzan hoy y que viajan al cliente en room:error / game:error.
const CODIGOS_ROOM = [
  'modo_invalido', 'sala_no_existe', 'sala_llena', 'ya_estas_en_la_sala',
  'equipo_lleno', 'equipo_invalido', 'partida_en_curso', 'solo_anfitrion',
  'faltan_jugadores', 'jugador_no_esta',
];

const CODIGOS_GAME = [
  'fase_incorrecta', 'fase_invalida', 'turno_pausado', 'no_es_tu_turno',
  'flota_incompleta', 'barcos_incorrectos', 'tamano_incorrecto', 'fuera_de_limites',
  'celda_ocupada', 'poder_invalido', 'energia_insuficiente', 'tormenta_ya_usada',
];

const CODIGOS_AUTH = [
  'email_invalido', 'password_corta', 'apodo_invalido', 'email_en_uso',
  'credenciales_invalidas', 'credenciales_requeridas',
];

const textoUtil = (t) => typeof t === 'string' && t.trim().length > 0;

describe('ROOM_ERRORS', () => {
  it.each(CODIGOS_ROOM)('traduce el código "%s"', (codigo) => {
    expect(ROOM_ERRORS[codigo], `falta el texto para "${codigo}"`).toSatisfy(textoUtil);
  });
});

describe('GAME_ERRORS', () => {
  it.each(CODIGOS_GAME)('traduce el código "%s"', (codigo) => {
    expect(GAME_ERRORS[codigo], `falta el texto para "${codigo}"`).toSatisfy(textoUtil);
  });
});

describe('LOCAL_AUTH_ERRORS', () => {
  it.each(CODIGOS_AUTH)('traduce el código "%s"', (codigo) => {
    expect(LOCAL_AUTH_ERRORS[codigo], `falta el texto para "${codigo}"`).toSatisfy(textoUtil);
  });
});

describe('etiquetas de modo y fase', () => {
  it.each(['1v1', '1v1-bot', '2v2'])('nombra el modo "%s"', (modo) => {
    expect(MODO_LABEL[modo]).toSatisfy(textoUtil);
  });

  it.each(['COLOCACION', 'TURNOS', 'SALVA', 'FIN'])('nombra la fase "%s"', (fase) => {
    expect(FASE_LABEL[fase]).toSatisfy(textoUtil);
  });
});

describe('calidad de los textos', () => {
  const todos = { ...ROOM_ERRORS, ...LOCAL_AUTH_ERRORS, ...GAME_ERRORS };

  it('ningún texto está vacío', () => {
    for (const [codigo, texto] of Object.entries(todos)) {
      expect(texto, `"${codigo}" tiene texto vacío`).toSatisfy(textoUtil);
    }
  });

  it('ningún texto es el propio código sin traducir', () => {
    // Un copia-pega descuidado dejaría `sala_llena: 'sala_llena'`, que no aporta nada.
    for (const [codigo, texto] of Object.entries(todos)) {
      expect(texto, `"${codigo}" no está traducido`).not.toBe(codigo);
    }
  });

  it('los textos van dirigidos a una persona, no con guiones bajos', () => {
    for (const [codigo, texto] of Object.entries(todos)) {
      expect(texto, `"${codigo}" parece un identificador`).not.toMatch(/^[a-z]+_[a-z_]+$/);
    }
  });
});
