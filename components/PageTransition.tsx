'use client';

import { useEffect, useId, useState } from 'react';

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const uid = useId();
  const animName = `saguaro-fade-in-${uid.replace(/:/g, '')}`;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes ${animName} {
              from {
                opacity: 0;
                transform: translateY(8px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `,
        }}
      />
      <div
        style={{
          animation: mounted ? `${animName} 150ms ease-out forwards` : 'none',
          opacity: mounted ? undefined : 0,
        }}
      >
        {children}
      </div>
    </>
  );
}
