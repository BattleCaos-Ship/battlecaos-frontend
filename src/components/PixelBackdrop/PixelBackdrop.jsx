import { useEffect, useRef } from 'react';
import styles from './PixelBackdrop.module.css';
import { drawScene, SCENE_W, SCENE_H } from './scenes';

// Fondo pixel-art ANIMADO a pantalla completa (radar barriendo, fogonazos, olas, vapor…).
// Escenas: 'sea' (mar nocturno con flota), 'warroom' (sala de guerra), 'workshop' (taller).
// Se redibuja a ~24 fps en un canvas de baja resolución; con prefers-reduced-motion se
// dibuja una sola vez (estático).
export default function PixelBackdrop({ scene = 'workshop' }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      drawScene(canvas, scene, 0);
      return;
    }

    let raf;
    let last = 0;
    const loop = (ms) => {
      if (ms - last >= 40) { // ~24 fps: suficiente para pixel-art, barato para la CPU
        last = ms;
        drawScene(canvas, scene, ms / 1000);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [scene]);

  return (
    <canvas
      ref={ref}
      className={styles.backdrop}
      width={SCENE_W}
      height={SCENE_H}
      aria-hidden="true"
    />
  );
}
