interface Props {
  name: string;
  size?: number;
  className?: string;
}

// Deterministic colour based on a name, drawn from the brand palette.
const PALETTE = [
  '#7C3AED', '#5A1EC0', '#3B82F6', '#1848CC',
  '#14B8A6', '#0E7A6A', '#BF8F28', '#EA3DC4',
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AvatarInitials({ name, size = 40, className = '' }: Props) {
  const bg = PALETTE[hashCode(name) % PALETTE.length];
  return (
    <div
      className={`flex-shrink-0 inline-flex items-center justify-center rounded-full text-white font-semibold ${className}`}
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: Math.round(size * 0.38),
        letterSpacing: '0.02em',
      }}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  );
}
