# battlecaos-frontend

Cliente web (SPA) de **BattleCaos-Ship** — batalla naval multijugador en tiempo real.
React 18 + Vite + socket.io-client. Se conecta al Gateway por WebSocket y al Auth por HTTP.

## Requisitos

- Node.js 20+
- Los backends corriendo (al menos `battlecaos-gateway` en :3000; para jugar también `room`, `game`, `timer`, y `auth` en :3001 si usas login con Google).

## Arranque

```bash
cp .env.example .env.local   # ajusta VITE_GOOGLE_CLIENT_ID si usarás Google OAuth
npm install
npm run dev                  # http://localhost:5173
```

## Modo desarrollo sin Google OAuth

En la pantalla de login, abre **"Modo desarrollo (token de prueba)"**, genera un JWT con el
script del repo raíz (`node gen-token.mjs "Nombre" uid`) y pégalo. Entra directo al lobby sin
configurar Google. El JWT debe firmarse con el mismo `JWT_SECRET` que usa `battlecaos-gateway`.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (Vite) en :5173 |
| `npm run build` | Build de producción a `dist/` |
| `npm run preview` | Sirve el build de producción localmente |
| `npm test` | Tests unitarios (Vitest) |

## Estructura

```
src/
├── main.jsx / App.jsx        ← entrada + React Router (5 rutas) + ErrorBoundary
├── hooks/                    ← useSocket, useGameState, useAuth
├── pages/                    ← LoginPage, LobbyPage, GamePage, ResultPage, AdminPage
├── components/               ← Board, ShipPlacer, EnergyBar, PowerPanel,
│                                CountermeasureAlert, SalvoBanner, Timer, Chat,
│                                PlayerList, ErrorBoundary
└── styles/                   ← tokens.css (paleta) + global.css
```

## Rutas

| Ruta | Pantalla |
|---|---|
| `/` | Login (Google o token de prueba) |
| `/lobby` | Crear / unirse a sala |
| `/game` | Tablero, colocación, turnos, poderes, salva |
| `/result` | Resultado de la partida |
| `/admin` | KPIs de observabilidad (`GET /kpis`) |

## Regla de diseño clave

El cliente **nunca** calcula estado de juego: solo renderiza lo que recibe en `game:state` y
emite la intención del usuario. El servidor es la única autoridad. Ver `Frontend_idea.md` en
`BattleCaos-Ship-Backend/` para el contrato completo de eventos y payloads.
