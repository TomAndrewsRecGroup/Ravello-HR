import Image from 'next/image';
import { AlertCircle } from 'lucide-react';

const COSTS = [
  'Hiring without structure means the same roles keep coming back: and the agency bill keeps growing',
  'No People leader means managers make it up as they go: and you pay for the inconsistency',
  'Missing or outdated HR documents are a liability waiting to be triggered',
  'Growth exposes every people gap you papered over on the way up',
  'Without the right foundations, you cannot scale: you just accumulate more risk',
];

export default function CostOfProblem() {
  return (
    <section className="section-padding" style={{ background: 'var(--surface)' }}>
      <div className="container-wide">
        <div className="grid lg:grid-cols-[1fr_420px] gap-16 items-center">

          <div>
            <p className="eyebrow mb-5">
              <span
                className="w-1.5 h-1.5 rounded-full inline-block mr-2"
                style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }}
              />
              The real cost
            </p>

            <h2 className="section-title mb-10">
              Where growing businesses<br />lose time, money, and momentum
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

          {/* People image */}
          <div className="hidden lg:block">
            <div className="rounded-[24px] overflow-hidden" style={{ boxShadow: '0 8px 40px rgba(10,15,30,0.08)' }}>
              <Image
                src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&h=1000&fit=crop&crop=faces"
                alt="Team collaborating in a modern office"
                width={420}
                height={520}
                className="w-full h-auto object-cover"
              />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
