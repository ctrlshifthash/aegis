// Generic blue dollar-coin mark — deliberately NOT the USDC / Circle logo.
export function CoinMark({ size = 32, glow = false }: { size?: number; glow?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      style={glow ? { filter: 'drop-shadow(0 6px 18px rgba(59,163,255,0.45))' } : undefined}
    >
      <defs>
        <linearGradient id="coinFace" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5BB4FF" />
          <stop offset="0.55" stopColor="#2775CA" />
          <stop offset="1" stopColor="#1B4F8F" />
        </linearGradient>
        <linearGradient id="coinRing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9FD2FF" />
          <stop offset="1" stopColor="#2775CA" />
        </linearGradient>
        <radialGradient id="coinSheen" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.4" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="23" fill="url(#coinRing)" />
      <circle cx="24" cy="24" r="20" fill="url(#coinFace)" />
      <circle cx="24" cy="24" r="20" fill="url(#coinSheen)" />
      <circle cx="24" cy="24" r="20" fill="none" stroke="#BFE0FF" strokeOpacity="0.35" strokeWidth="1" />
      <text
        x="24"
        y="32.5"
        textAnchor="middle"
        fontSize="25"
        fontWeight="700"
        fill="#F8FAFC"
        fontFamily="'Fraunces', Georgia, serif"
      >
        $
      </text>
    </svg>
  );
}
