import { useState, useEffect } from 'react';
import Board from '../Board/Board';
import styles from './ShipPlacer.module.css';

// Flota exacta (Frontend_idea.md §2.3). El backend valida de verdad; aquí solo damos
// una vista previa cómoda y evitamos solapamientos obvios antes de enviar.
const FLEET = [
  { id: 'portaaviones', size: 5, label: 'Portaaviones' },
  { id: 'acorazado', size: 4, label: 'Acorazado' },
  { id: 'crucero', size: 3, label: 'Crucero' },
  { id: 'submarino', size: 3, label: 'Submarino' },
  { id: 'destructor', size: 2, label: 'Destructor' },
];

function shipCells({ x, y, size, horizontal }) {
  return Array.from({ length: size }, (_, i) => (horizontal ? [x + i, y] : [x, y + i]));
}

function inBounds(cells, size) {
  return cells.every(([x, y]) => x >= 0 && y >= 0 && x < size && y < size);
}

// Convierte los barcos ya colocados en un mapa de celdas ocupadas.
function occupiedMap(placed) {
  const map = {};
  for (const ship of placed) {
    for (const [x, y] of shipCells(ship)) map[`${x},${y}`] = 'ship';
  }
  return map;
}

// `teammateShips` (2v2): BARCOS de tu compañero en el tablero COMPARTIDO (confirmados o
// en preview en vivo) — se dibujan con sus SPRITES y sus celdas quedan bloqueadas.
// `onPreview(placed)`: notifica cada cambio de TU colocación para que tu compañero la
// vea en tiempo real (incluso antes de confirmar).
export default function ShipPlacer({ onConfirm, size = 10, teammateShips = [], onPreview }) {
  const [placed, setPlaced] = useState([]);
  const [horizontal, setHorizontal] = useState(true);
  const [hover, setHover] = useState(null); // [x, y]

  // Preview en vivo hacia el compañero: cada barco puesto/reiniciado se comunica al instante.
  useEffect(() => { onPreview?.(placed); }, [placed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rotar el barco con el TECLADO: "R" o las flechas ←/→ alternan horizontal/vertical.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return; // no robar el foco del chat
      if (e.key === 'r' || e.key === 'R' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setHorizontal((h) => !h);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const currentIndex = placed.length;
  const current = FLEET[currentIndex];
  const done = currentIndex >= FLEET.length;

  const occupied = occupiedMap(placed);
  for (const ship of teammateShips) {
    for (const [x, y] of shipCells(ship)) occupied[`${x},${y}`] ??= 'teammate';
  }

  // Vista previa del barco actual bajo el cursor.
  let preview = {};
  if (!done && hover) {
    const [hx, hy] = hover;
    const candidate = { x: hx, y: hy, size: current.size, horizontal };
    const cells = shipCells(candidate);
    const valid = inBounds(cells, size) && cells.every(([x, y]) => !occupied[`${x},${y}`]);
    preview = Object.fromEntries(
      cells
        .filter(([x, y]) => x >= 0 && y >= 0 && x < size && y < size)
        .map(([x, y]) => [`${x},${y}`, valid ? 'selected' : 'invalid']),
    );
  }

  function placeAt(x, y) {
    if (done) return;
    const candidate = { id: current.id, size: current.size, x, y, horizontal };
    const cells = shipCells(candidate);
    if (!inBounds(cells, size)) return;
    if (cells.some(([cx, cy]) => occupied[`${cx},${cy}`])) return;
    setPlaced((prev) => [...prev, candidate]);
  }

  function reset() {
    setPlaced([]);
  }

  function confirm() {
    // El payload usa exactamente { id, size, x, y, horizontal } (§3.4).
    onConfirm(placed.map(({ id, size, x, y, horizontal }) => ({ id, size, x, y, horizontal })));
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        {!done ? (
          <p className={styles.instruction}>
            Coloca: <strong>{current.label}</strong> ({current.size} celdas)
          </p>
        ) : (
          <p className={styles.instruction}>Flota completa. Confírmala para empezar.</p>
        )}
        {teammateShips.length > 0 && (
          <p className={styles.teammateNote}>
            Los barcos de tu compañero se ven en el tablero (en vivo) — no puedes colocar encima.
          </p>
        )}
        <div className={styles.buttons}>
          <button onClick={() => setHorizontal((h) => !h)} disabled={done} title="También puedes rotar con R o las flechas ←/→">
            Girar ({horizontal ? 'Horizontal' : 'Vertical'}) — tecla R / ←→
          </button>
          <button onClick={reset} disabled={placed.length === 0} className={styles.secondary}>
            Reiniciar
          </button>
          <button onClick={confirm} disabled={!done}>
            Confirmar flota
          </button>
        </div>
        <ol className={styles.fleetList}>
          {FLEET.map((s, i) => (
            <li key={s.id} data-state={i < placed.length ? 'done' : i === placed.length ? 'current' : 'pending'}>
              {s.label} ({s.size})
            </li>
          ))}
        </ol>
      </div>

      <Board
        size={size}
        cells={{}}
        preview={preview}
        interactive={!done}
        onCellClick={placeAt}
        onCellHover={(x, y) => setHover(x === null ? null : [x, y])}
        label="Tablero del equipo"
        variant="sea"
        ships={[...teammateShips, ...placed]}
      />
    </div>
  );
}
