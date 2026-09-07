import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { authRouter } from './routes/auth';
import { clientRouter } from './routes/clients';
import { invoiceRouter } from './routes/invoices';
import { dashboardRouter } from './routes/dashboard';
import { paymentRouter } from './routes/payments';
import { settingsRouter } from './routes/settings';
import { aresRouter } from './routes/ares';
import { aiRouter } from './routes/ai';
import { exportRouter } from './routes/exports';
import { expenseRouter } from './routes/expenses';
import { recurringRouter } from './routes/recurring';
import { authenticateToken } from './middleware/auth';
import { startEmailPolling } from './services/emailPoller';
import { startRecurringInvoiceGeneration } from './services/recurringInvoiceGenerator';
import { initializeDatabase } from './db/init';
import { validateEncryptionKey } from './utils/encryption';
import { validateJwtSecret } from './utils/jwt';
import { log } from './utils/logger';

// Prevent IMAP/socket errors from crashing the process in Bun
process.on('uncaughtException', (err) => {
  log.error('Uncaught exception (non-fatal):', err?.stack || err);
});
process.on('unhandledRejection', (err) => {
  log.error('Unhandled rejection (non-fatal):', err);
});

const app = express();
const PORT = process.env.PORT || 3001;

// Trust first proxy (needed when running behind Docker/nginx/reverse proxy)
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});

// Middleware
// CORS configuration - support multiple origins for development
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
const allowedOrigins = corsOrigin.split(',').map(origin => origin.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or Postman)
    if (!origin) return callback(null, true);
    
    // Check if the origin is in the allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Health check - placed before rate limiter so Kubernetes probes are not throttled
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(limiter);

// Public routes
app.use('/api/auth', authRouter);

// Protected routes
app.use('/api/clients', authenticateToken, clientRouter);
app.use('/api/invoices', authenticateToken, invoiceRouter);
app.use('/api/dashboard', authenticateToken, dashboardRouter);
app.use('/api/payments', authenticateToken, paymentRouter);
app.use('/api/settings', authenticateToken, settingsRouter);
app.use('/api/ares', authenticateToken, aresRouter);
app.use('/api/ai', authenticateToken, aiRouter);
app.use('/api/exports', authenticateToken, exportRouter);
app.use('/api/expenses', authenticateToken, expenseRouter);
app.use('/api/recurring-invoices', authenticateToken, recurringRouter);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  log.error('Request error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  try {
    validateEncryptionKey();
    validateJwtSecret();
    await initializeDatabase();

    app.listen(PORT, () => {
      log.info(`Server running on port ${PORT}`);
    });

    // Start email polling service (checks database for users with IMAP configured)
    startEmailPolling();

    // Start recurring invoice generation service
    startRecurringInvoiceGeneration();
  } catch (error) {
    log.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
