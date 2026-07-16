import { randomBytes } from 'node:crypto';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const cspNonce = randomBytes(18).toString('base64');
const createContentSecurityPolicy = (isDevelopment: boolean) => [
  "default-src 'none'",
  `script-src 'self' 'nonce-${cspNonce}'`,
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  isDevelopment
    ? "connect-src 'self' ws://127.0.0.1:5173"
    : "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "media-src 'none'",
  "manifest-src 'none'",
].join('; ');

export default defineConfig(({ command }) => ({
  base: './',
  html: {
    cspNonce,
  },
  plugins: [
    react(),
    {
      name: 'rainpane-content-security-policy',
      transformIndexHtml() {
        return [{
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: createContentSecurityPolicy(command === 'serve'),
          },
          injectTo: 'head-prepend',
        }];
      },
    },
  ],
  server: {
    port: 5173,
  },
  test: {
    exclude: ['node_modules/**', '**/node_modules/**', 'dist/**', 'dist-electron/**', 'release/**'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}));
