/** Marca do jogo: "LIFE WORLD" com selo 3D. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`logo ${compact ? 'logo--compact' : ''}`}>
      <svg className="logo__mark" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id="lw-g1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffb36b" />
            <stop offset="1" stopColor="#ff6f61" />
          </linearGradient>
          <linearGradient id="lw-g2" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#2ec4b6" />
            <stop offset="1" stopColor="#7fe0d4" />
          </linearGradient>
        </defs>
        <path d="M32 4 58 19v26L32 60 6 45V19Z" fill="url(#lw-g2)" opacity="0.95" />
        <path d="M32 4 58 19 32 34 6 19Z" fill="url(#lw-g1)" />
        <path d="M22 30.5 32 24l10 6.5V44H22Z" fill="#0e2230" opacity="0.9" />
        <path d="M29 44v-6h6v6" fill="#ffb36b" />
      </svg>
      <div className="logo__text">
        <span className="logo__life">LIFE</span>
        <span className="logo__world">WORLD</span>
        <span className="logo__badge">3D</span>
      </div>
    </div>
  );
}
