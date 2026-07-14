import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './Board.module.css';
import ShipSprite from '../ShipSprite/ShipSprite';

// Tablero N×N. `cells` es un mapa { "x,y": estado }, donde estado ∈
// fog | ship | hit | miss | sunk | selected. `preview` (opcional) marca celdas
// para la vista previa de colocación. `onCellHover` para el hover del ShipPlacer.
//
// `variant` define la apariencia (mockups pixel-art):
//   screen → pantalla CRT verde (tablero RIVAL)
//   map    → mesa con mapa pergamino (tablero PROPIO en partida)
//   sea    → mesa de mar teal (colocación de flota)
// `ships` (opcional): [{ id, size, x, y, horizontal }] → sprites pixel-art superpuestos.
// `sunkenShips` (opcional): [{ name: string, size: number, cells: ["x,y", ...] }]
//   → muestra el nombre del barco hundido directamente sobre sus celdas.
const COL_LETTERS = 'ABCDEFGHIJKLMNOP';

// Efectos de combate: al aparecer un resultado nuevo en una celda se lanza una ráfaga de
// partículas + texto flotante + sacudida del tablero. Vida de cada efecto en ms.
const FX_TTL = { hit: 950, miss: 750, sunk: 1400, bombardeo: 1600 };
const FX_PARTICLES = { hit: 8, miss: 5, sunk: 14, bombardeo: 20 };
const FX_TEXT = { hit: '¡TOCADO!', miss: 'AGUA', sunk: '¡HUNDIDO!' };
let fxSeq = 0;

const SHIP_SIZE_TO_TIPO = { 5: 'portaaviones', 4: 'acorazado', 3: 'crucero', 2: 'destructor' };
// Cualquier tamaño → un sprite VÁLIDO (nunca ''): así el wreck siempre se dibuja y no
// queda "solo estrellas". Tamaños raros (tramos de barcos adyacentes) se acotan a [2,5].
const tipoFor = (size) => SHIP_SIZE_TO_TIPO[Math.max(2, Math.min(5, size))];

// Agrupa celdas 'sunk' en barcos rectos. DFS por componentes conectados y luego descompone
// cada componente en tramos rectos a lo largo del eje dominante: barcos adyacentes que se
// tocan (permitidos por las reglas) se separan en wrecks individuales en vez de fusionarse
// en un tamaño inválido sin sprite. Devuelve [{ x, y, size, horizontal, id }].
function groupSunkCells(cells) {
  const sunkKeys = Object.entries(cells)
    .filter(([, v]) => v === 'sunk')
    .map(([k]) => k);
  if (sunkKeys.length === 0) return [];
  const sunkSet = new Set(sunkKeys);

  const visited = new Set();
  const components = [];
  for (const key of sunkKeys) {
    if (visited.has(key)) continue;
    const comp = [];
    const stack = [key];
    while (stack.length) {
      const k = stack.pop();
      if (visited.has(k)) continue;
      visited.add(k);
      comp.push(k);
      const [x, y] = k.split(',').map(Number);
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nk = `${x+dx},${y+dy}`;
        if (sunkSet.has(nk) && !visited.has(nk)) stack.push(nk);
      }
    }
    components.push(comp);
  }

  const ships = [];
  for (const comp of components) {
    const xs = comp.map(k => +k.split(',')[0]);
    const ys = comp.map(k => +k.split(',')[1]);
    const w = Math.max(...xs) - Math.min(...xs) + 1;
    const h = Math.max(...ys) - Math.min(...ys) + 1;
    const horizontal = w >= h; // eje dominante (una línea recta cae aquí como un solo tramo)

    // Agrupar por línea perpendicular al eje y partir en tramos consecutivos.
    const byLine = new Map();
    for (const k of comp) {
      const [x, y] = k.split(',').map(Number);
      const line = horizontal ? y : x;
      const pos = horizontal ? x : y;
      if (!byLine.has(line)) byLine.set(line, []);
      byLine.get(line).push(pos);
    }
    for (const [line, poss] of byLine) {
      poss.sort((a, b) => a - b);
      let start = poss[0], prev = poss[0];
      const flush = (s, e) => {
        const size = e - s + 1;
        ships.push({
          x: horizontal ? s : line,
          y: horizontal ? line : s,
          size,
          horizontal,
          id: tipoFor(size),
        });
      };
      for (let i = 1; i < poss.length; i++) {
        if (poss[i] === prev + 1) { prev = poss[i]; continue; }
        flush(start, prev);
        start = poss[i]; prev = poss[i];
      }
      flush(start, prev);
    }
  }
  return ships;
}

export default function Board({
  size = 10,
  cells = {},
  preview = {},
  onCellClick,
  onCellHover,
  interactive = false,
  label,
  variant = 'sea',
  ships = [],
  sunkenShips = [],
  stormActive = false,
  powerCast = null, // { type: 'bombardeo'|'sonar', x, y, id } → animación de lanzamiento fiable
}) {
  // Posicionamiento de sprites sobre la rejilla (celda + 2px de línea, 2px de borde).
  const span = (n) => `calc((var(--cell-size) + 2px) * ${n} - 2px)`;
  const off = (n) => `calc((var(--cell-size) + 2px) * ${n} + 2px)`;
  const center = (n) => `calc((var(--cell-size) + 2px) * ${n} + 2px + var(--cell-size) / 2)`;

  const [effects, setEffects] = useState([]);
  const [shake, setShake] = useState(null); // 'light' | 'heavy'
  const [powerAnim, setPowerAnim] = useState(null); // { type, x, y } animación de poder local
  const [castFx, setCastFx] = useState(null); // { type, x, y } animación de lanzamiento de poder
  const prevCellsRef = useRef(null);
  const castIdRef = useRef(null);

  // Animación de LANZAMIENTO de poder (bombardeo/sonar): siempre se reproduce al recibir el
  // resultado, apunte donde apunte y haya barcos o no. Dura lo suficiente para verse.
  useEffect(() => {
    if (!powerCast || powerCast.id === castIdRef.current) return;
    castIdRef.current = powerCast.id;
    setCastFx({ type: powerCast.type, x: powerCast.x, y: powerCast.y });
    if (powerCast.type === 'bombardeo') {
      // sacudida fuerte cuando cae la bomba
      setTimeout(() => setShake('heavy'), 500);
      setTimeout(() => setShake(null), 1050);
    }
    const dur = powerCast.type === 'bombardeo' ? 1400 : 1700;
    const to = setTimeout(() => setCastFx(null), dur);
    return () => clearTimeout(to);
  }, [powerCast]);

  // Wreck sprites computados localmente desde las celdas (aparecen AL INSTANTE, sin esperar prop)
  const mergedWrecks = useMemo(() => {
    const local = groupSunkCells(cells);
    if (local.length === 0) return local;
    // Preferir entries de sunkenShips (tipos correctos), agregar locales aún no trackeados
    const known = new Set(sunkenShips.map(s => `${s.x}-${s.y}-${s.size}`));
    const result = [...sunkenShips];
    for (const w of local) {
      if (!known.has(`${w.x}-${w.y}-${w.size}`)) result.push(w);
    }
    return result;
  }, [cells, sunkenShips]);

  // Detecta resultados NUEVOS (diff contra el render anterior) y lanza los efectos.
  useEffect(() => {
    const prev = prevCellsRef.current;
    prevCellsRef.current = cells;
    if (!prev) return; // primer render: sin efectos retroactivos

    const nuevos = [];
    for (const [key, val] of Object.entries(cells)) {
      if ((val === 'hit' || val === 'miss' || val === 'sunk') && prev[key] !== val) {
        const [x, y] = key.split(',').map(Number);
        nuevos.push({ x, y, type: val });
      }
    }
    if (nuevos.length === 0) {
      // Revisar si aparecieron celdas 'sonar' nuevas (fuera de hit/miss/sunk)
      const newSonar = [];
      for (const [key, val] of Object.entries(cells)) {
        if (val === 'sonar' && prev[key] !== 'sonar') {
          const [x, y] = key.split(',').map(Number);
          newSonar.push({ x, y });
        }
      }
      if (newSonar.length > 0) {
        const cx = newSonar.reduce((s, n) => s + n.x, 0) / newSonar.length;
        const cy = newSonar.reduce((s, n) => s + n.y, 0) / newSonar.length;
        setPowerAnim({ type: 'sonarWave', x: Math.round(cx), y: Math.round(cy) });
        setTimeout(() => setPowerAnim(null), 1500);
      }
      return;
    }

    const lanzados = [];
    // Detectar bombardeo: 4+ celdas nuevas en un área 3×3 (el umbral 4 cubre
    // áreas parcialmente dañadas donde algunas celdas ya eran hit)
    const xs = nuevos.map((n) => n.x);
    const ys = nuevos.map((n) => n.y);
    const dx = Math.max(...xs) - Math.min(...xs);
    const dy = Math.max(...ys) - Math.min(...ys);
    const esBombardeo = nuevos.length >= 4 && dx <= 2 && dy <= 2;

    // Ráfaga de partículas por celda — INCLUYE las celdas 'sunk': un barco hundido
    // debe estallar a lo largo de TODA su eslora (p.ej. 4 explosiones para el acorazado),
    // no solo aparecer el wreck en silencio. La capa fxLayer va por encima del wreck.
    for (const n of nuevos.slice(0, 12)) {
      lanzados.push({ id: ++fxSeq, kind: 'burst', ...n });
    }

    // Si es bombardeo: gran explosión en el centroide + shakedown fuerte
    if (esBombardeo) {
      const cx = nuevos.reduce((s, n) => s + n.x, 0) / nuevos.length;
      const cy = nuevos.reduce((s, n) => s + n.y, 0) / nuevos.length;
      lanzados.push({ id: ++fxSeq, kind: 'burst', type: 'bombardeo', x: Math.round(cx), y: Math.round(cy) });
    }

    // UN texto flotante por tipo (en el centroide de sus celdas, para no hacer spam)
    for (const type of ['sunk', 'hit', 'miss']) {
      const grupo = nuevos.filter((n) => n.type === type);
      if (!grupo.length) continue;
      const cx = grupo.reduce((s, n) => s + n.x, 0) / grupo.length;
      const cy = grupo.reduce((s, n) => s + n.y, 0) / grupo.length;
      lanzados.push({ id: ++fxSeq, kind: 'label', type, x: cx, y: cy });
    }
    setEffects((e) => [...e, ...lanzados]);

    // Sacudida del tablero: fuerte al hundir/bombardeo, ligera al impactar
    const heavy = nuevos.some((n) => n.type === 'sunk') || esBombardeo;
    if (heavy || nuevos.some((n) => n.type === 'hit')) {
      setShake(heavy ? 'heavy' : 'light');
      setTimeout(() => setShake(null), heavy ? 520 : 320);
    }
    for (const fx of lanzados) {
      setTimeout(() => setEffects((e) => e.filter((f) => f.id !== fx.id)), FX_TTL[fx.type]);
    }
  }, [cells]);

  return (
    <div className={styles.container} data-variant={variant}>
      {label && <span className={styles.label}>{label}</span>}
      <div className={styles.frameArea}>
        <span className={styles.corner} />
        <div
          className={styles.colCoords}
          style={{ gridTemplateColumns: `repeat(${size}, var(--cell-size))` }}
          aria-hidden="true"
        >
          {Array.from({ length: size }, (_, i) => (
            <span key={i}>{COL_LETTERS[i] ?? i}</span>
          ))}
        </div>
        <div className={styles.rowCoords} aria-hidden="true">
          {Array.from({ length: size }, (_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
        <div className={`${styles.boardWrap} ${shake ? styles[shake === 'heavy' ? 'shakeHeavy' : 'shakeLight'] : ''}`}>
        <div
          className={`${styles.grid} ${interactive ? styles.interactive : ''}`}
          style={{ gridTemplateColumns: `repeat(${size}, var(--cell-size))` }}
          onMouseLeave={() => onCellHover?.(null, null)}
        >
          {Array.from({ length: size * size }, (_, i) => {
            const x = i % size;
            const y = Math.floor(i / size);
            const key = `${x},${y}`;
            const state = preview[key] ?? cells[key] ?? 'fog';
            return (
              <div
                key={key}
                className={`${styles.cell} ${styles[state] ?? ''}`}
                onClick={interactive ? () => onCellClick?.(x, y) : undefined}
                onMouseEnter={onCellHover ? () => onCellHover(x, y) : undefined}
                role={interactive ? 'button' : undefined}
                aria-label={interactive ? `Celda ${x},${y}` : undefined}
              />
            );
          })}
        </div>
        {ships.length > 0 && (
          <div className={styles.overlay}>
            {ships.map((s) => (
              <ShipSprite
                key={s.id}
                tipo={s.id}
                horizontal={s.horizontal}
                long={span(s.size)}
                short="var(--cell-size)"
                style={{
                  left: off(s.x),
                  top: off(s.y),
                  width: s.horizontal ? span(s.size) : 'var(--cell-size)',
                  height: s.horizontal ? 'var(--cell-size)' : span(s.size),
                }}
              />
            ))}
          </div>
        )}
        {mergedWrecks.length > 0 && (
          <div className={`${styles.overlay} ${styles.wreckOverlay}`}>
            {mergedWrecks.map((s, i) => (
              <ShipSprite
                key={`wreck-${s.x}-${s.y}-${s.size}-${i}`}
                tipo={s.id}
                horizontal={s.horizontal}
                long={span(s.size)}
                short="var(--cell-size)"
                style={{
                  left: off(s.x),
                  top: off(s.y),
                  width: s.horizontal ? span(s.size) : 'var(--cell-size)',
                  height: s.horizontal ? 'var(--cell-size)' : span(s.size),
                }}
                wrecked
              />
            ))}
          </div>
        )}
        {effects.length > 0 && (
          <div className={styles.fxLayer} aria-hidden="true">
            {effects.map((fx) =>
              fx.kind === 'label' ? (
                <span
                  key={fx.id}
                  className={`${styles.fxLabel} ${styles[`fxLabel_${fx.type}`]}`}
                  style={{ left: center(fx.x), top: center(fx.y) }}
                >
                  {FX_TEXT[fx.type]}
                </span>
              ) : (
                <span
                  key={fx.id}
                  className={`${styles.fxBurst} ${styles[`fxBurst_${fx.type}`]}`}
                  style={{ left: center(fx.x), top: center(fx.y) }}
                >
                  <b className={styles.fxFlash} />
                  {Array.from({ length: FX_PARTICLES[fx.type] ?? 8 }, (_, i) => (
                    <i
                      key={i}
                      style={{
                        '--fx-a': `${Math.round((360 / (FX_PARTICLES[fx.type] ?? 8)) * i)}deg`,
                        '--fx-d': `${fx.type === 'bombardeo' ? 42 : fx.type === 'sunk' ? 34 : fx.type === 'hit' ? 24 : 16}px`,
                      }}
                    />
                  ))}
                </span>
              ),
            )}
          </div>
        )}
        {powerAnim?.type === 'sonarWave' && (
          <div
            className={styles.sonarWave}
            style={{ left: center(powerAnim.x), top: center(powerAnim.y) }}
          />
        )}
        {/* Lanzamiento de BOMBARDEO: reticla que baja + bomba cayendo + gran onda expansiva */}
        {castFx?.type === 'bombardeo' && (
          <div className={styles.bombCast} style={{ left: center(castFx.x), top: center(castFx.y) }}>
            <span className={styles.bombReticle} />
            <span className={styles.bombDrop} />
            <span className={styles.bombFlash} />
            <span className={styles.bombRing} />
            <span className={`${styles.bombRing} ${styles.bombRing2}`} />
          </div>
        )}
        {/* Lanzamiento de SONAR: barrido de radar giratorio + anillos de ping */}
        {castFx?.type === 'sonar' && (
          <div className={styles.sonarCast} style={{ left: center(castFx.x), top: center(castFx.y) }}>
            <span className={styles.sonarSweep} />
            <span className={styles.sonarRing} />
            <span className={`${styles.sonarRing} ${styles.sonarRing2}`} />
            <span className={`${styles.sonarRing} ${styles.sonarRing3}`} />
          </div>
        )}
        {stormActive && <div className={styles.stormOverlay} />}
        </div>
      </div>
    </div>
  );
}
