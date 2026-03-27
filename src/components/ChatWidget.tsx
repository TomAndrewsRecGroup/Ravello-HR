'use client';
// Tawk.to or Crisp live chat: swap in your widget ID
import Script from 'next/script';

export default function ChatWidget() {
  // Replace with your Tawk.to property ID or Crisp website ID
  const tawkId = process.env.NEXT_PUBLIC_TAWK_ID;
  if (!tawkId) return null;

  return (
    <Script
      id="tawk-widget"
      strategy="lazyOnload"
      dangerouslySetInnerHTML={{
        __html: `
          var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
          (function(){
            var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
            s1.async=true;
            s1.src='https://embed.tawk.to/${tawkId}/default';
            s1.charset='UTF-8';
            s1.setAttribute('crossorigin','*');
            s0.parentNode.insertBefore(s1,s0);
          })();
        `,
      }}
    />
  );
}
