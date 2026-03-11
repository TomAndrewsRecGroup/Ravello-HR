import Hero from '@/components/home/Hero';
import TrustBar from '@/components/home/TrustBar';
import FunnelCards from '@/components/home/FunnelCards';
import ProofSection from '@/components/home/ProofSection';
import HotlineSection from '@/components/home/HotlineSection';
import FounderSection from '@/components/home/FounderSection';
import PlaybookTeaser from '@/components/home/PlaybookTeaser';
import StructuredData from '@/components/StructuredData';

export default function HomePage() {
  return (
    <>
      <StructuredData />
      <Hero />
      <TrustBar />
      <FunnelCards />
      <ProofSection />
      <FounderSection />
      <HotlineSection />
      <PlaybookTeaser />
    </>
  );
}
