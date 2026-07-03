/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  modularizeImports: {
    '@mui/icons-material': {
      transform: '@mui/icons-material/{{member}}',
    },
  },
  async rewrites() {
    return [{ source: '/download', destination: '/CLAMS.apk' }];
  },
  async headers() {
    return [
      {
        source: '/download',
        headers: [
          {
            key: 'Content-Disposition',
            value: 'attachment; filename="CLAMS.apk"',
          },
          {
            key: 'Content-Type',
            value: 'application/vnd.android.package-archive',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
