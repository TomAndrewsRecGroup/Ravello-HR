import Hero           from '@/components/home/Hero';
import PortalShowcase from '@/components/home/PortalShowcase';
import ProofSection   from '@/components/home/ProofSection';
import FounderSection from '@/components/home/FounderSection';
import ToolsHub       from '@/components/home/ToolsHub';
import HotlineSection from '@/components/home/HotlineSection';

export default function HomePage() {
  return (
    <main>
      <Hero />
      <PortalShowcase />
      <ProofSection />
      <FounderSection />
      <ToolsHub />
      <HotlineSection />
    </main>
  );
}
