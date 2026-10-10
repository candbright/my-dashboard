import { redirect } from 'next/navigation';

/**
 * The AI settings page used to live here, reachable from no menu — which is
 * exactly why its configuration could not be found. It has been replaced by
 * `/admin/ai`, which the admin sidebar links to; this path only survives so that
 * a bookmarked or hard-coded link does not 404.
 */
export default function AdminSettingsPage() {
  redirect('/admin/ai');
}
