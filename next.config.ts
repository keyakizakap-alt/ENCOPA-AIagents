import type { NextConfig } from 'next';

// The Content-Security-Policy is issued per request by middleware.ts, because a strict
// policy needs a fresh nonce on every response. Everything here is request-independent.
const nextConfig:NextConfig={
  serverExternalPackages:['@libsql/client'],
  async headers(){return [
    {source:'/:path*',headers:[
      {key:'X-Content-Type-Options',value:'nosniff'},
      // Two years, no includeSubDomains: subdomains are not ours to pin to HTTPS.
      {key:'Strict-Transport-Security',value:'max-age=63072000'},
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
