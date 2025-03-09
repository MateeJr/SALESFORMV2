/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.externals = [...config.externals, 'canvas', 'jsdom'];
    return config;
  },
  transpilePackages: ['@whiskeysockets/baileys', 'jimp', 'qrcode-terminal', 'link-preview-js'],
};

module.exports = nextConfig; 