import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import routes from './routes/index.js';
import { initDatabase } from './db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', routes);

// Serve Frontend Static Files in production/build mode
const frontendDistPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDistPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  const indexPath = path.join(frontendDistPath, 'index.html');
  if (req.accepts('html')) {
    res.sendFile(indexPath, (err) => {
      if (err) {
        res.send('<h1>NMS Web Service Backend API is Running</h1><p>Visit /api/devices for API endpoints.</p>');
      }
    });
  } else {
    next();
  }
});

import { startPollerDaemon } from './services/poller_service.js';

// Start Server
async function start() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`================================================`);
      console.log(` NMS Web Backend running on http://localhost:${PORT}`);
      console.log(` REST API Base: http://localhost:${PORT}/api`);
      console.log(`================================================`);

      // Start background poller worker
      startPollerDaemon(30);
    });
  } catch (err) {
    console.error('Failed to initialize database and start server:', err);
    process.exit(1);
  }
}

start();
