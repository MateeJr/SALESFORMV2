/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tell webpack to compile these packages
  transpilePackages: ['@whiskeysockets/baileys', 'jimp', 'qrcode', 'link-preview-js'],
  
  // Ignore all build errors
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // Configure webpack
  webpack: (config) => {
    // Externalize some problematic modules
    config.externals = [...config.externals, 'canvas', 'jsdom'];
    
    // Add some more lenient module resolution
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    
    return config;
  },
};

module.exports = nextConfig; 