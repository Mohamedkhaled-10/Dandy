// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';

const isVercel = !!process.env.VERCEL;

// https://astro.build/config
export default defineConfig({
  output: isVercel ? 'static' : 'server',
  adapter: isVercel ? vercel() : node({ mode: 'standalone' }),
  build: {
    format: 'directory'
  }
});




