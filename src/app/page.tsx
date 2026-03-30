import Hero           from '@/components/home/Hero';
import TrustBar       from '@/components/home/TrustBar';
import CostOfProblem  from '@/components/home/CostOfProblem';
import FunnelCards    from '@/components/home/FunnelCards';
import PortalShowcase from '@/components/home/PortalShowcase';
import ProofSection   from '@/components/home/ProofSection';
import FounderSection from '@/components/home/FounderSection';
import HotlineSection from '@/components/home/HotlineSection';

export default function HomePage() {
  return (
    <main>
      <Hero />
      <TrustBar />
      <CostOfProblem />
      <FunnelCards />
      <PortalShowcase />
      <ProofSection />
      <FounderSection />
      <HotlineSection />
    </main>
  );
}
