'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/ui';

/** Route-level error boundary: keeps the shell (nav, wallet) usable when one page crashes. */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg py-12">
      <ErrorState
        message={`Something went wrong on this page.${error.digest ? ` Reference: ${error.digest}` : ''}`}
        onRetry={reset}
      />
    </div>
  );
}
