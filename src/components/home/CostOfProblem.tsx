import { AlertCircle } from 'lucide-react';

const COSTS = [
  'Hiring decisions made without structure lead to repeated mistakes',
  'Weak leadership creates inconsistent performance across teams',
  'Missing or outdated documents increase risk and slow decisions',
  'Growth exposes gaps that were never properly fixed',
  'The same issues keep resurfacing because nothing has been systemised',
];

export default function CostOfProblem() {
  return (
    <section className="section-sm" style={{ background: 'var(--surface)' }}>
      <div className="container-wide">
        <div className="max-w-[680px] mx-auto">

          <p className="eyebrow mb-5">
            <span
              className="w-1.5 h-1.5 rounded-full inline-block mr-2"
              style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }}
            />
            The real cost
          </p>

          <h2 className="section-title mb-10">
            Where businesses lose time,<br />money, and momentum
          </h2>

          <ul className="space-y-4">
            {COSTS.map((item) => (
              <li
                key={item}
                className="flex items-start gap-4 py-4"
                style={{ borderBottom: '1px solid var(--brand-line)' }}
              >
                <span
                  className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5"
                  style={{ background: 'rgba(217,68,68,0.10)' }}
                >
                  <AlertCircle size={11} style={{ color: '#C04444' }} />
                </span>
                <p className="text-base leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                  {item}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
