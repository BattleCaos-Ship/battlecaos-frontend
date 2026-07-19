// Cliente HTTP mínimo compartido por toda la capa api/. Centraliza: armado de headers JSON,
// token Bearer opcional, parseo de la respuesta y NORMALIZACIÓN de errores → siempre un
// ApiError con el `codigo` que devuelve el backend (p.ej. 'email_en_uso'), para que la UI lo
// mapee a texto vía constants/copy.js. Antes cada fetch inline repetía este boilerplate.

export class ApiError extends Error {
  constructor(codigo, status = 0) {
    super(codigo);
    this.name = 'ApiError';
    this.codigo = codigo;   // código de negocio del backend, o 'sin_conexion' / 'error_desconocido'
    this.status = status;   // status HTTP (0 si ni siquiera hubo respuesta)
  }
}

async function parse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? 'error_desconocido', res.status);
  return data;
}

export async function postJson(url, body, { token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    throw new ApiError('sin_conexion', 0); // el backend no respondió (caído/red)
  }
  return parse(res);
}

export async function getJson(url) {
  let res;
  try { res = await fetch(url); }
  catch { throw new ApiError('sin_conexion', 0); }
  return parse(res);
}
