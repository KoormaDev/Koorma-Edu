"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface ChatPageWrapperProps {
  children: React.ReactNode;
}

function ChatContent({ children }: ChatPageWrapperProps) {
  // This component can use useSearchParams safely inside Suspense
  const searchParams = useSearchParams();
  return <>{children}</>;
}

export default function ChatPageWrapper({ children }: ChatPageWrapperProps) {
  return (
    <Suspense fallback={<div>Loading chat...</div>}>
      <ChatContent>{children}</ChatContent>
    </Suspense>
  );
}