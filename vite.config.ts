import { defineConfig } from "vite";

import react from "@vitejs/plugin-react-swc";

import path from "path";

import { componentTagger } from "lovable-tagger";



// https://vitejs.dev/config/

export default defineConfig(({ mode }) => ({

  base: "/",

  server: {

    host: "::",

    port: 5173,

    strictPort: false,

    open: false,

    proxy: {

      "/api": {

        target: "http://127.0.0.1:5001",

        changeOrigin: true,

        secure: false,

      },

      "/uploads": {

        target: "http://127.0.0.1:5001",

        changeOrigin: true,

        secure: false,

      },

    },

  },

  preview: {

    port: 5173,

    host: "::",

    proxy: {

      "/api": {

        target: "http://127.0.0.1:5001",

        changeOrigin: true,

        secure: false,

      },

      "/uploads": {

        target: "http://127.0.0.1:5001",

        changeOrigin: true,

        secure: false,

      },

    },

  },

  plugins: [react(), mode === "development" && componentTagger()].filter(

    Boolean,

  ),

  resolve: {

    alias: {

      "@": path.resolve(__dirname, "./src"),

    },

  },

  build: {

    sourcemap: false,

    // Avoid gzip size reporting during build — peaks RAM and OOMs this 4GB host.
    reportCompressedSize: false,

    chunkSizeWarningLimit: 5000,

    rollupOptions: {

      maxParallelFileOps: 1,

      input: {

        main: path.resolve(__dirname, "index.html"),

      },

    },

    minify: "esbuild",

  },

  esbuild: {

    drop: mode === "production" ? ["console", "debugger"] : [],

  },

}));

