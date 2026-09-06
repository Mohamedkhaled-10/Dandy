// Production entry point for Astro Node standalone server
process.env.HOST = process.env.HOST || '0.0.0.0';
process.env.PORT = process.env.PORT || '3000';
import './dist/server/entry.mjs';

