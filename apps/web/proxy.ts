import { NextResponse, type NextRequest } from 'next/server';
import { ORIGIN_SECRET_HEADER, originAllowed } from './lib/security';

/** Rejects requests that did not come through Cloudflare (when CF_ORIGIN_SECRET is set). */
export function proxy(req: NextRequest) {
  if (
    !originAllowed(req.nextUrl.pathname, req.headers.get(ORIGIN_SECRET_HEADER), process.env.CF_ORIGIN_SECRET)
  ) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
