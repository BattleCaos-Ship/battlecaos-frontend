// KPIs de negocio expuestos por el gateway (los escribe el servicio observability en Redis).
import { GATEWAY_URL } from './config';
import { getJson } from './client';

// { tasa_completacion, tasa_reconexion, pico_salas, latencia_p95, date }
export const obtenerKpis = () => getJson(`${GATEWAY_URL}/kpis`);
