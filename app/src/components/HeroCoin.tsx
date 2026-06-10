// Premium hero coin — a stylised minted USDC-style coin (double-arc ring + $),
// our own render rather than the Circle/USDC trademark. Layered glow, rotating
// specular sweep, reflection, and floating glass chips.
export function HeroCoin() {
  return (
    <div className="hcoin">
      <div className="hcoin-glow" />
      <div className="hcoin-spin" />
      <svg className="hcoin-face" viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <radialGradient id="hcBody" cx="37%" cy="30%" r="80%">
            <stop offset="0" stopColor="#8fcbff" />
            <stop offset="40%" stopColor="#3a8ce4" />
            <stop offset="78%" stopColor="#1f63b4" />
            <stop offset="100%" stopColor="#0c3568" />
          </radialGradient>
          <radialGradient id="hcSpec" cx="33%" cy="24%" r="42%">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hcArc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#bfe0ff" />
          </linearGradient>
        </defs>

        {/* coin body */}
        <circle cx="100" cy="100" r="95" fill="#0c3568" />
        <circle cx="100" cy="100" r="95" fill="url(#hcBody)" />
        {/* rim highlight */}
        <circle cx="100" cy="100" r="94" fill="none" stroke="#cfe8ff" strokeOpacity="0.55" strokeWidth="1.4" />
        <circle cx="100" cy="100" r="88" fill="none" stroke="#0a2c57" strokeOpacity="0.5" strokeWidth="2" />

        {/* USDC-style double arc ring hugging the $ */}
        <circle
          cx="100"
          cy="100"
          r="60"
          fill="none"
          stroke="url(#hcArc)"
          strokeOpacity="0.95"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray="154.5 34"
          strokeDashoffset="77"
        />

        {/* dollar glyph */}
        <text
          x="100"
          y="134"
          textAnchor="middle"
          fontSize="92"
          fontWeight="700"
          fill="#ffffff"
          fontFamily="'Inter', system-ui, sans-serif"
        >
          $
        </text>

        {/* specular sheen on top */}
        <circle cx="100" cy="100" r="95" fill="url(#hcSpec)" />
      </svg>
      <div className="hcoin-floor" />

      <span className="chip chip-a">
        <b>🔒</b> Secret note
      </span>
      <span className="chip chip-b">
        <b>◈</b> Poseidon hash
      </span>
      <span className="chip chip-c">
        <b>✓</b> ZK proof
      </span>
    </div>
  );
}
