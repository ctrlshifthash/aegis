// Aegis Protocol logo mark.
export function CoinMark({ size = 32, glow = false }: { size?: number; glow?: boolean }) {
  return (
    <img
      src="/logo.png"
      alt="Aegis Protocol"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.26),
        display: 'block',
        objectFit: 'cover',
        boxShadow: glow ? '0 6px 18px rgba(39, 117, 202, 0.5)' : undefined,
      }}
    />
  );
}
