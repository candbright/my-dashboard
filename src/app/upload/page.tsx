'use client';

import { AuthGuard } from '@/components/layout';
import { CreatePageClient } from '@/components/CreatePageClient';

export default function CreatePage() {
  return (
    <AuthGuard>
      <CreatePageClient />
    </AuthGuard>
  );
}
