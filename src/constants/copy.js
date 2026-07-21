// Textos de la UI en UN solo lugar: labels de modos/fases y el mapeo de códigos de error del
// backend → texto legible para el usuario. Antes estaban repartidos por LobbyPage, LoginPage,
// GamePage y el overlay de fin de partida. Centralizarlos facilita revisar la voz del producto y traducir.

export const MODO_LABEL = {
  '1v1':     '1 vs 1',
  '1v1-bot': '1 vs Bot',
  '2v2':     '2 vs 2',
};

export const FASE_LABEL = {
  COLOCACION: 'Coloca tu flota',
  TURNOS:     'Turnos',
  SALVA:      'Salva simultánea',
  FIN:        'Fin de la partida',
};

// Errores del lobby / sala (room:error).
export const ROOM_ERRORS = {
  modo_invalido:        'Modo de juego inválido.',
  sala_no_existe:       'No existe una sala con ese código.',
  sala_llena:           'La sala ya está llena.',
  ya_estas_en_la_sala:  'Ya estás en esa sala. No puedes unirte con la misma cuenta desde otra pestaña — usa otra cuenta para el rival.',
  codigo_invalido:      'El código debe tener 6 dígitos.',
  equipo_lleno:         'Ese bando ya está completo.',
  equipo_invalido:      'Bando inválido.',
  partida_en_curso:     'La partida ya empezó.',
  partida_no_iniciada:  'Esa sala aún está en el lobby — no hay partida que ver todavía.',
  solo_anfitrion:       'Solo el anfitrión puede comenzar la partida.',
  faltan_jugadores:     'Faltan jugadores o los bandos no están completos.',
  jugador_no_esta:      'Ya no estás en esa sala.',
  sin_respuesta:        'El servidor no respondió. ¿Están corriendo los backends (levantar-todo.ps1) y conectados a Kafka?',
};

// Errores de autenticación local (registro / login con email).
export const LOCAL_AUTH_ERRORS = {
  email_invalido:          'Correo no válido.',
  password_corta:          'La contraseña debe tener al menos 6 caracteres.',
  apodo_invalido:          'El apodo debe tener entre 2 y 20 caracteres.',
  email_en_uso:            'Ya existe una cuenta con ese correo. Inicia sesión.',
  credenciales_invalidas:  'Correo o contraseña incorrectos.',
  credenciales_requeridas: 'Escribe tu correo y contraseña.',
  sin_conexion:            'No hay conexión con el servicio de autenticación (puerto 3001).',
  error_desconocido:       'No se pudo completar. Inténtalo de nuevo.',
};

// Errores durante la partida (game:error).
export const GAME_ERRORS = {
  fase_incorrecta:            'No puedes hacer eso en esta fase.',
  fase_invalida:             'La partida quedó en un estado inesperado. Vuelve al lobby.',
  turno_pausado:             'El turno está en pausa.',
  no_es_tu_turno:            'No es tu turno.',
  tablero_no_disponible:     'Tablero no disponible aún.',
  celda_protegida:           'El escudo del rival bloqueó tu impacto.',
  celda_ya_disparada:        'Ya disparaste a esa celda.',
  flota_incompleta:          'La flota está incompleta.',
  barcos_incorrectos:        'La flota no es válida.',
  tamano_incorrecto:         'Tamaño de barco incorrecto.',
  fuera_de_limites:          'Un barco queda fuera del tablero.',
  celda_ocupada:             'Tu flota se superpone con la de tu compañero — reubica los barcos marcados.',
  poder_invalido:            'Poder inválido.',
  energia_insuficiente:      'Energía insuficiente.',
  tormenta_ya_usada:         'Ya usaste Tormenta en esta partida.',
  contramedida_no_disponible:'No hay contramedida disponible.',
  ventana_expirada:          'La ventana de contramedida expiró.',
  celda_ya_tomada:           'Un compañero ya tomó esa celda.',
  cadencia_no_cumplida:      'Cadencia de disparo no cumplida.',
};
