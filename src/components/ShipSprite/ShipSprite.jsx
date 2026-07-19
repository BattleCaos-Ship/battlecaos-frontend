import styles from './ShipSprite.module.css';
import { SPRITES } from './sprites';

// Sprite pixel-art de un barco, posicionado por el tablero (style: left/top/width/height).
// Se dibuja horizontal (proa a la derecha); en vertical se rota el SVG 90° — para eso el
// SVG necesita sus medidas pre-rotación explícitas (long × short).
export default function ShipSprite({ tipo, horizontal = true, long, short, style, wrecked = false }) {
  const sp = SPRITES[tipo];
  if (!sp) return null;

  return (
    <div
      className={`${styles.sprite} ${horizontal ? styles.horizontal : styles.vertical} ${wrecked ? styles.wrecked : ''}`}
      style={style}
      aria-hidden="true"
    >
      {wrecked && <span className={styles.fireOverlay} />}
      <svg
        viewBox={`0 0 ${sp.w} ${sp.h}`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        style={horizontal ? undefined : { width: long, height: short }}
      >
        {sp.rects.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h ?? 1} fill={r.fill} />
        ))}
      </svg>
    </div>
  );
}
