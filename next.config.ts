import type { NextConfig } from 'next';
const nextConfig:NextConfig={
  serverExternalPackages:['@libsql/client'],
  images:{remotePatterns:[{protocol:'https',hostname:'imgfp.hotp.jp',pathname:'/**'}]},
  // Only headers that cannot influence how the page renders. A Content-Security-Policy
  // was tried here and reverted: see docs/AUDIT-2026-09.md for what it broke and why a
  // reintroduction has to be verified against a rendered page, not just a passing build.
  async headers(){return [
    {source:'/:path*',headers:[
      {key:'X-Content-Type-Options',value:'nosniff'},
      // Two years, no includeSubDomains: subdomains are not ours to pin to HTTPS.
      {key:'Strict-Transport-Security',value:'max-age=63072000'},
      {key:'X-Frame-Options',value:'DENY'},
      {key:'Referrer-Policy',value:'no-referrer'},
      {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=(), interest-cohort=()'},
      {key:'Cross-Origin-Opener-Policy',value:'same-origin'},
      {key:'X-DNS-Prefetch-Control',value:'off'},
    ]},
    {source:'/groups/:path*',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'}]},
  ]},
};
export default nextConfig;
