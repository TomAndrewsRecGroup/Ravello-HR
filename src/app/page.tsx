import Hero             from '@/components/home/Hero';
import AudienceSection  from '@/components/home/AudienceSection';
import ProblemSection   from '@/components/home/ProblemSection';
import SolutionOverview from '@/components/home/SolutionOverview';
import HiringSystemSection from '@/components/home/HiringSystemSection';
import PortalTeaser     from '@/components/home/PortalTeaser';
import PartnerSection   from '@/components/home/PartnerSection';
import FinalCTA         from '@/components/home/FinalCTA';
import StructuredData   from '@/components/StructuredData';

export default function HomePage() {
  return (
    <>
      <StructuredData />
      {/* 1 — Hero: who, what, CTA */}
      <Hero />
      {/* 2 — Audience: who this is for */}
      <AudienceSection />
      {/* 3 — Problem: the four pain points, each mapped to a capability */}
      <ProblemSection />
      {/* 4 — Solution overview: HR support + hiring + portal */}
      <SolutionOverview />
      {/* 5 — Hiring system: how the recruiter network works */}
      <HiringSystemSection />
      {/* 6 — Portal teaser: docs, pipeline, reports, support */}
      <PortalTeaser />
      {/* 7 — Partner positioning: no agency management overhead */}
      <PartnerSection />
      {/* 8 — Final CTA: consultation or role submission */}
      <FinalCTA />
    </>
  );
}
