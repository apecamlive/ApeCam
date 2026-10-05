import Link from 'next/link';
import { Button, EmptyState } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-12">
      <EmptyState
        title="Nothing live here"
        body="This page does not exist, or the stream already ended."
        action={
          <Link href="/">
            <Button variant="white">Back to live streams</Button>
          </Link>
        }
      />
    </div>
  );
}
