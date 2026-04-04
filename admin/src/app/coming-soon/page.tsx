import { Suspense } from 'react';
import ComingSoonForm from './ComingSoonForm';

export const metadata = { title: 'Coming Soon | The People Office' };

const GLOWS = [
  { top: '-10%', left: '20%',  w: '600px', h: '500px', color: 'rgba(124,58,237,0.22)' },
  { top: 'auto', left: 'auto', bottom: '-5%', right: '15%', w: '500px', h: '400px', color: 'rgba(234,61,196,0.16)' },
  { top: '40%',  left: 'auto', right: '5%',  w: '400px', h: '350px', color: 'rgba(59,111,255,0.14)' },
];

export default function ComingSoonPage() {
  return (
    <div style={{
      minHeight: '100vh', background: '#FAFAF8',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', position: 'relative', overflow: 'hidden',
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      {/* Atmospheric glows */}
      {GLOWS.map((g, i) => (
        <div key={i} style={{
          position: 'absolute',
          top: g.top, left: g.left,
          ...(g.bottom ? { bottom: g.bottom } : {}),
          ...(g.right  ? { right: g.right   } : {}),
          width: g.w, height: g.h, borderRadius: '50%',
          background: `radial-gradient(ellipse, ${g.color} 0%, transparent 70%)`,
          filter: 'blur(40px)', pointerEvents: 'none',
        }} />
      ))}

      {/* Blurred faux-content */}
      <div style={{ position: 'absolute', inset: 0, filter: 'blur(2px)', opacity: 0.15, pointerEvents: 'none' }}>
        {[...Array(8)].map((_, i) => (
          <div key={i} style={{
            position: 'absolute', background: 'rgba(255,255,255,0.06)', borderRadius: '10px',
            top: `${10 + i * 10}%`, left: `${4 + (i % 4) * 24}%`,
            width: `${160 + (i % 3) * 80}px`, height: `${36 + (i % 2) * 16}px`,
          }} />
        ))}
      </div>

      <Suspense fallback={null}>
        <ComingSoonForm />
      </Suspense>
    </div>
  );
}
