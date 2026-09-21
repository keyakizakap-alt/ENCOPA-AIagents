import { NextResponse, type NextRequest } from 'next/server';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Issues a per-request nonce and builds the Content-Security-Policy around it.
 *
 * The App Router emits an inline bootstrap payload and then injects further script
 * elements at runtime, so the only policy that covers both without 'unsafe-inline' is a
 * nonce plus 'strict-dynamic'. Next.js reads the nonce out of the Content-Security-Policy
 * request header set below and stamps it onto the scripts it renders.
 *
 * The cost is deliberate: a nonce must never repeat, so pages carrying one cannot be
 * cached and every route renders dynamically. Styles keep 'unsafe-inline' because the
 * framework and Tailwind both emit inline style attributes that no nonce covers.
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://imgfp.hotp.jp",
    "font-src 'self'",
    `connect-src 'self'${isDev ? ' ws:' : ''}`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join('; ');

  // 'unsafe-inline' and https: above are ignored by any browser that understands
  // 'strict-dynamic'; they are the documented fallback for browsers that do not.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Documents only. API routes return JSON that no browser parses as markup, and the
     * static asset paths would pay for a nonce they never use.
     */
    {
      source: '/((?!api|_next/static|_next/image|favicon.svg|.*\\.svg$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
