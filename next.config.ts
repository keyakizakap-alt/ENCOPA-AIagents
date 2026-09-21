import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

// Next.js App Router ships an inline bootstrap payload, so a nonce-free policy has to keep
// 'unsafe-inline' for scripts. That still leaves the directives that matter here: no foreign
// script or style origin, no plugins, no base-tag hijack, no off-origin form post or fetch.
// A nonce/strict-dynamic policy needs middleware and forces every route to dynamic rendering,
// which the statically prerendered landing page would pay for; see docs/AUDIT-2026-09.md.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? ' ws:' : ''}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "manifest-src 'self'",
].join('; ');

const nextConfig:NextConfig={
  serverExternalPackages:['@libsql/client'],
  async headers(){return [
    {source:'/:path*',headers:[
      {key:'Content-Security-Policy',value:csp},
      {key:'X-Content-Type-Options',value:'nosniff'},
      {key:'X-Frame-Options',value:'DENY'},
      {key:'Referrer-Policy',value:'no-referrer'},
      {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=(), interest-cohort=()'},
      {key:'Cross-Origin-Opener-Policy',value:'same-origin'},
      {key:'Cross-Origin-Resource-Policy',value:'same-origin'},
      {key:'X-DNS-Prefetch-Control',value:'off'},
    ]},
    {source:'/groups/:path*',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'}]},
  ]},
};
export default nextConfig;
