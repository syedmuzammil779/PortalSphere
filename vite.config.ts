import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Handle HOST env var workaround
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const isProd = process.env.NODE_ENV === "production";

// Development-specific HMR configuration
const getDevHmrConfig = () => {
  const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost").hostname;
  
  if (host === "localhost") {
    return {
      protocol: "ws",
      host: "localhost",
      port: 64999,
      clientPort: 64999,
    };
  }
  
  return {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT!) || 8002,
    clientPort: 443,
  };
};

// Base configuration shared between dev and prod
const baseConfig = {
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
    }),
    tsconfigPaths(),
  ],
};

// Production-specific configuration
const prodConfig = {
  ...baseConfig,
  ssr: {
    noExternal: [
      "@shopify/shopify-app-remix",
      "@shopify/shopify-app-session-storage-prisma",
      "@shopify/polaris",
      "@shopify/app-bridge-react",
      "@shopify/discount-app-components",
      "react-query",
      /^@shopify\/.*/
    ]
  },
  build: {
    rollupOptions: {
      output: {
        format: 'es'
      }
    }
  },
  optimizeDeps: {
    include: [
      '@shopify/polaris',
      '@shopify/app-bridge-react',
      'react-query'
    ]
  }
};

// Development-specific configuration
const devConfig = {
  ...baseConfig,
  server: {
    port: Number(process.env.PORT || 3000),
    hmr: getDevHmrConfig(),
    fs: {
      allow: ["app", "node_modules"],
    },
  },
  build: {
    assetsInlineLimit: 0,
  },
};

export default defineConfig(isProd ? prodConfig as UserConfig : devConfig as UserConfig) satisfies UserConfig; 