import { Building2, TrendingUp, Users } from 'lucide-react';

const segments = [
  {
    icon: Building2,
    eyebrow: 'Size',
    headline: 'SMEs — 10 to 250 people',
    body:
      'You\'re past the startup stage but not yet at the point where an in-house HR director makes financial sense. Ravello fills that gap without the full-time cost.',
    dot: 'var(--brand-purple)',
  },
  {
    icon: Users,
    eyebrow: 'Structure',
    headline: 'No formal HR function',
    body:
      'HR responsibilities sit with a line manager, operations lead, or the founder themselves. Decisions are reactive. Processes aren\'t documented. Ravello gives you the structure to fix that.',
    dot: 'var(--brand-blue)',
  },
  {
    icon: TrendingUp,
    eyebrow: 'Challenge',
    headline: 'Growing but struggling to scale people',
    body:
      'Hiring is taking too long or breaking down after the offer. Employee issues keep landing without a clear process. You can\'t see what\'s happening across your team. Ravello is built for exactly this.',
    dot: 'var(--brand-pink)',
  },
];

export default function AudienceSection() {
  return (
    <section className="section-padding section-alt">
      <div className="container-wide">

        <div className="mb-14">
          <p className="eyebrow mb-4">Who Ravello is for</p>
          <h2 className="display-lg" style={{ color: 'var(--ink)' }}>
            Built for businesses that have outgrown<br className="hidden lg:block" /> winging it on people.
          </h2>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {segments.map((s) => (
            <div key={s.headline} className="card-feature">
              <div
                className="w-10 h-10 rounded-[12px] flex items-center justify-center"
                style={{ background: 'var(--gradient-soft)', border: '1px solid var(--brand-line)' }}
              >
                <s.icon size={18} style={{ color: s.dot }} />
              </div>
              <div>
                <p className="eyebrow mb-2">{s.eyebrow}</p>
                <h3 className="font-display font-bold text-[1.15rem] mb-2 leading-snug" style={{ color: 'var(--ink)' }}>
                  {s.headline}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                  {s.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
