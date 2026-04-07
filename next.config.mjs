/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  async redirects() {
    return [
      // Legacy /events URLs → /projects (permanent redirect, keeps SEO juice)
      {
        source: '/events',
        destination: '/projects',
        permanent: true,
      },
      {
        source: '/events/:path*',
        destination: '/projects/:path*',
        permanent: true,
      },
      // Legacy /api/events/[id] → /api/projects/[id]
      {
        source: '/api/events/:id',
        destination: '/api/projects/:id',
        permanent: true,
      },
      {
        source: '/api/events/:id/:sub*',
        destination: '/api/projects/:id/:sub*',
        permanent: true,
      },
      {
        source: '/api/event-views',
        destination: '/api/project-views',
        permanent: true,
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/sign/**',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/render/image/sign/**',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/render/image/public/**',
      },
    ],
  },
}

export default nextConfig
