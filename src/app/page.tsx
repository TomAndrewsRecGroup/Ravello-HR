import Hero           from '@/components/home/Hero';
import TrustBar       from '@/components/home/TrustBar';
import CostTeaser     from '@/components/home/CostTeaser';
import FunnelCards    from '@/components/home/FunnelCards';
import PortalShowcase from '@/components/home/PortalShowcase';
import HotlineSection from '@/components/home/HotlineSection';

export default function HomePage() {
  return (
    <main>
      <Hero />
      <TrustBar />
      <CostTeaser />
      <FunnelCards />
      <PortalShowcase />
      <HotlineSection />
    </main>
  );
}
