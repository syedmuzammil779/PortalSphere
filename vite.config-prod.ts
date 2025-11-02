import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [remix(), tsconfigPaths()],
  ssr: {
    noExternal: process.env.NODE_ENV === "production" 
      ? [
          "@shopify/shopify-app-remix",
          "@shopify/shopify-app-session-storage-prisma",
          "@shopify/polaris",
          "@shopify/app-bridge-react",
          "@shopify/discount-app-components",
          "react-query",
          /^@shopify\/.*/
        ] 
      : []
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
});