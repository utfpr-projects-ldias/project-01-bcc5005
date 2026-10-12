'use client';

import type { ReactNode } from 'react';
import { initSuperTokens } from '@/config/supertokens';

if (typeof window !== 'undefined') {
  initSuperTokens();
}

export function SuperTokensInit({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
