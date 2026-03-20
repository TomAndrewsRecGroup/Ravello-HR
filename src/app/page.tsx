import HeroElevated    from '@/components/home/HeroElevated';
import TrustBar        from '@/components/home/TrustBar';
import CostOfProblem   from '@/components/home/CostOfProblem';
import FunnelCards     from '@/components/home/FunnelCards';
import ToolsHub        from '@/components/home/ToolsHub';
import ProofSection    from '@/components/home/ProofSection';
import FounderSection  from '@/components/home/FounderSection';
import PlaybookTeaser  from '@/components/home/PlaybookTeaser';
import HotlineSection  from '@/components/home/HotlineSection';

export default function HomePage() {
  return (
    <main>
      <HeroElevated />
      <TrustBar />
      <CostOfProblem />
      <FunnelCards />
      <ToolsHub />
      <ProofSection />
      <FounderSection />
      <PlaybookTeaser />
      <HotlineSection />
    </main>
  );
}
