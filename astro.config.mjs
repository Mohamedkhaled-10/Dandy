// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';

const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: isVercel
    ? vercel()
    : node({
        mode: 'standalone'
      }),
  build: {
    format: 'directory'
  }
});



