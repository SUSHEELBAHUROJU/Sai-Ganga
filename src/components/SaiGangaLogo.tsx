/**
 * Sai Ganga signboard mark, redrawn in SVG so it scales cleanly at any size
 * and works on the navy header without a raster asset — a red "SAI GANGA"
 * band over a navy "PVC PIPES & FITTINGS" band, with a small shield emblem,
 * matching the physical shop signboard.
 */
type SaiGangaLogoProps = {
  className?: string
  /** Emblem only, no text bands — for very tight spaces. */
  compact?: boolean
}

export function SaiGangaLogo({ className = 'h-10', compact = false }: SaiGangaLogoProps) {
  if (compact) {
    return (
      <svg viewBox="0 0 48 48" className={className} role="img" aria-label="Sai Ganga">
        <rect x="1" y="1" width="46" height="46" rx="8" fill="#ffffff" stroke="#d21f1f" strokeWidth="2" />
        <path
          d="M24 6 L38 12 V22 C38 32 32 39 24 42 C16 39 10 32 10 22 V12 Z"
          fill="#d21f1f"
        />
        <path
          d="M24 10 L34 14.5 V22 C34 29.5 29.7 34.8 24 37.3 C18.3 34.8 14 29.5 14 22 V14.5 Z"
          fill="#0f1f45"
        />
        <text
          x="24"
          y="27"
          textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontWeight="700"
          fontSize="15"
          fill="#ffffff"
        >
          SG
        </text>
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 260 64" className={className} role="img" aria-label="Sai Ganga — PVC Pipes & Fittings">
      <rect x="1" y="1" width="258" height="62" rx="6" fill="#ffffff" stroke="#d21f1f" strokeWidth="2" />

      {/* Shield emblem */}
      <g transform="translate(8, 8)">
        <path d="M24 2 L44 9 V24 C44 36 36 45 24 49 C12 45 4 36 4 24 V9 Z" fill="#d21f1f" />
        <path d="M24 7 L39 12.3 V24 C39 33.5 33.2 40.4 24 43.6 C14.8 40.4 9 33.5 9 24 V12.3 Z" fill="#0f1f45" />
        <text
          x="24"
          y="30"
          textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontWeight="700"
          fontSize="17"
          fill="#ffffff"
        >
          SG
        </text>
      </g>

      {/* Red band */}
      <rect x="60" y="8" width="192" height="24" fill="#d21f1f" />
      <text
        x="156"
        y="26"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize="19"
        letterSpacing="1"
        fill="#ffffff"
      >
        SAI GANGA
      </text>

      {/* Navy band */}
      <rect x="60" y="32" width="192" height="18" fill="#0f1f45" />
      <text
        x="156"
        y="45"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="600"
        fontSize="10.5"
        letterSpacing="0.5"
        fill="#ffffff"
      >
        PVC PIPES &amp; FITTINGS
      </text>
    </svg>
  )
}
