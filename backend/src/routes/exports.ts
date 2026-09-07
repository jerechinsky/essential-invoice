import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { generateAccountantExport, validatePeriod } from '../services/accountantExport';
import { ExportError } from '../services/invoiceDocument';

export const exportRouter: ReturnType<typeof Router> = Router();
const activeExports = new Set<string>();

exportRouter.get('/accountant', async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  if (activeExports.has(userId)) return res.status(429).json({ error: 'An export is already running' });
  try {
    const period = validatePeriod(req.query.from, req.query.to, req.query.basis ?? 'issue');
    activeExports.add(userId);
    const buffer = await generateAccountantExport(userId, period);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="accountant-${period.from}-${period.to}.zip"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (error) {
    if (error instanceof ExportError) return res.status(error.status).json({ error: error.message });
    console.error('Accountant export error:', error);
    res.status(500).json({ error: 'Failed to generate accountant export' });
  } finally {
    activeExports.delete(userId);
  }
});
