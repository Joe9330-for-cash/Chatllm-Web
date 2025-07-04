/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  
  // 性能优化配置
  experimental: {
    workerThreads: false,        // 禁用多线程worker，防止进程失控
  },
  
  // 编译优化
  swcMinify: true,               // 使用SWC压缩，性能更好
  
  // 开发模式优化
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,   // 60秒后卸载未使用页面
    pagesBufferLength: 2,        // 最多保留2个页面在内存中
  },
  
  // webpack配置优化
  webpack: (config, { isServer, dev }) => {
    // 只在服务端打包时包含 better-sqlite3
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      };
    }
    
    // 配置外部化 better-sqlite3
    if (isServer) {
      config.externals = [...(config.externals || []), 'better-sqlite3'];
    }

    // 开发模式性能优化
    if (dev) {
      config.watchOptions = {
        poll: 1000,                // 减少文件监听频率
        aggregateTimeout: 300,     // 延迟重编译
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.next/**',
          '**/*.d.ts',
          '**/data/*.db',          // 忽略数据库文件变化
          '**/useless/**',         // 忽略废弃文件夹
        ],
      };
      
      // 限制并发编译
      config.parallelism = 1;
      
      // 缓存优化 - 使用绝对路径
      config.cache = {
        type: 'filesystem',
        cacheDirectory: path.resolve(__dirname, '.next/cache/webpack'),
      };
    }

    return config;
  },
};

module.exports = nextConfig;
