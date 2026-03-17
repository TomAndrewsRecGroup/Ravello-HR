import type { Metadata } from 'next';
import ContactForm from '@/components/ContactForm';

export const metadata: Metadata = {
  title: 'Book a Scoping Call | Ravello HR',
  description: 'Talk to Ravello HR about your people challenge. Book a free 30-minute scoping call to discuss HR strategy, compliance, hiring, or M&A people risk.',
  openGraph: {
    title: 'Book a Scoping Call | Ravello HR',
    description: 'A 30-minute call to understand the specific people challenge you\'re facing and whether Ravello HR is the right fit to help fix it.',
  },
};

export default function ContactPage() {
  return <ContactForm />;
}
