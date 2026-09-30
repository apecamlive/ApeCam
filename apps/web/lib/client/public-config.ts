'use client';

import { useQuery } from '@tanstack/react-query';
import { api, type PublicConfig } from './api';

/** Go Live mode + beta feedback link. Refreshed every minute so an emergency close shows up without reload. */
export function usePublicConfig() {
  return useQuery({
    queryKey: ['public-config'],
    queryFn: () => api<PublicConfig>('/api/public-config'),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
