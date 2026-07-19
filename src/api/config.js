// URLs y config de entorno en UN solo lugar (antes repetidas en LoginPage, AccountMenu,
// AdminPage, useSocket). Vite hornea import.meta.env.* en el build (ver Dockerfile build-args).
export const AUTH_URL    = import.meta.env.VITE_AUTH_URL    ?? 'http://localhost:3001';
export const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:3000';
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Google OAuth solo está disponible si hay un client_id REAL configurado (no el placeholder).
export const googleConfigurado = !!GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.startsWith('tu-client-id');
