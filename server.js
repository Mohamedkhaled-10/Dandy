import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import productHandler from './api/product.js';
import sendTelegramHandler from './api/send-telegram.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

// Enable body parsers for JSON and URL-encoded requests
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'Dandy Cosmetics' });
});

// API Routes
app.all(['/api/product', '/api/product.js'], async (req, res) => {
  try {
    await productHandler(req, res);
  } catch (err) {
    console.error('Error in /api/product:', err);
    if (!res.headersSent) {
      res.status(500).send('Internal error');
    }
  }
});

app.all(['/api/send-telegram', '/api/send-telegram.js'], async (req, res) => {
  try {
    await sendTelegramHandler(req, res);
  } catch (err) {
    console.error('Error in /api/send-telegram:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Helpful root aliases for common paths
app.get('/product.html', (req, res) => {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(301, `/pages/shop/product.html${query}`);
});

app.get('/cart.html', (req, res) => {
  res.redirect(301, '/pages/shop/cart.html');
});

app.get('/all-products.html', (req, res) => {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(301, `/pages/shop/all-products.html${query}`);
});

app.get('/dashboard', (req, res) => {
  res.redirect(301, '/pages/dashboard/dashboard.html');
});

// Serve static assets from the project root
app.use(express.static(__dirname, {
  extensions: ['html', 'htm'],
  index: 'index.html'
}));

// Fallback for missing routes
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Dandy server running on http://${HOST}:${PORT}`);
});
