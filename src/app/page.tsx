import Hero            from '@/components/home/Hero';
import TrustBar       from '@/components/home/TrustBar';
import FunnelCards    from '@/components/home/FunnelCards';
import ProofSection   from '@/components/home/ProofSection';
import FounderSection from '@/components/home/FounderSection';
import PlaybookTeaser from '@/components/home/PlaybookTeaser';
import HotlineSection from '@/components/home/HotlineSection';

export default function HomePage() {
  return (
    <main>
      <Hero />
      <TrustBar />
      <FunnelCards />
      <ProofSection />
      <FounderSection />
      <PlaybookTeaser />
      <HotlineSection />
    </main>
  );
}
