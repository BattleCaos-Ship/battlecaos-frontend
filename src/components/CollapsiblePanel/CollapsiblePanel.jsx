import { useState } from 'react';
import styles from './CollapsiblePanel.module.css';

// Panel PLEGABLE HACIA ABAJO (acordeón): cabecera siempre visible; el cuerpo se
// despliega/oculta debajo. Se usa bajo los tableros (chat a la izq, voz a la der)
// para no robar ancho a los tableros.
export default function CollapsiblePanel({ label, icon = '💬', defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={styles.panel}>
      <button
        className={styles.head}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={open ? `Ocultar ${label}` : `Mostrar ${label}`}
      >
        <span className={styles.headLabel}>{icon} {label}</span>
        <span className={styles.arrow}>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className={styles.body}>{children}</div>}
    </div>
  );
}
