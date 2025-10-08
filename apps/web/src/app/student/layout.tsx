'use client';

import { LanguageProvider } from '../../contexts/LanguageContext';
import { useLoginSession } from '../../hooks/useLoginSession';

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Track login session time
  useLoginSession();

  return (
    <LanguageProvider>
      {children}
    </LanguageProvider>
  );
}