import styles from './PowerPanel.module.css';

// Costos y metadatos exactos (Frontend_idea.md §2.7).
export const POWERS = [
  { id: 'bombardeo', label: 'Bombardeo', cost: 2, target: 'rival-cell', hint: 'Dispara un área 3×3 del tablero rival' },
  { id: 'sonar', label: 'Sonar', cost: 2, target: 'rival-cell', hint: 'Revela los barcos de un área 3×3 rival' },
  { id: 'escudo', label: 'Escudo', cost: 1, target: 'none', hint: 'Protege TODA tu flota del próximo impacto' },
  { id: 'tormenta', label: 'Tormenta', cost: 3, target: 'none', hint: 'Salta el turno del rival (1 vez)' },
];

export default function PowerPanel({ energia = 0, tormentaUsada = false, selectedPower, onChoose, disabled }) {
  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>Poderes</h3>
      <div className={styles.grid}>
        {POWERS.map((p) => {
          const noEnergy = energia < p.cost;
          const usedUp = p.id === 'tormenta' && tormentaUsada;
          const isDisabled = disabled || noEnergy || usedUp;
          return (
            <button
              key={p.id}
              className={`${styles.power} ${selectedPower === p.id ? styles.active : ''}`}
              onClick={() => onChoose(p)}
              disabled={isDisabled}
              title={usedUp ? 'Ya usaste Tormenta' : p.hint}
            >
              <span className={styles.plate}>
                <span className={styles.name}>{p.label}</span>
                <span className={styles.cost}>{p.cost}E</span>
              </span>
              <span className={styles.leverSlot} aria-hidden="true">
                <span className={styles.leverStick} />
                <span className={styles.leverKnob} />
              </span>
            </button>
          );
        })}
      </div>
      {selectedPower && (
        <p className={styles.selectedHint}>
          {POWERS.find((p) => p.id === selectedPower)?.hint} — selecciona el objetivo o vuelve a pulsar para cancelar.
        </p>
      )}
    </div>
  );
}
