import type { Metadata } from 'next';
import { AdminPanel } from './admin-panel';

export const metadata: Metadata = { title: 'Moderation', robots: { index: false } };

export default function AdminPage() {
  return <AdminPanel />;
}
