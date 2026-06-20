import { Router, Response } from 'express';
import { pool } from '../db/init';
import { AuthRequest } from '../middleware/auth';
import {
  importFakturoidInvoices,
  MAX_FAKTUROID_CSV_BYTES,
  parseFakturoidCsv
} from '../services/fakturoidCsvImport';

export const invoiceImportRouter: ReturnType<typeof Router> = Router();

function getCsv(body: unknown): string {
  const csv = (body as { csv?: unknown } | undefined)?.csv;
  if (typeof csv !== 'string' || !csv.trim()) throw new Error('CSV content is required');
  if (Buffer.byteLength(csv, 'utf8') > MAX_FAKTUROID_CSV_BYTES) throw new Error('CSV file is larger than 5 MB');
  return csv;
}

invoiceImportRouter.post('/fakturoid/preview', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = parseFakturoidCsv(getCsv(req.body));
    res.json({
      totalRows: parsed.totalRows,
      importable: parsed.invoices.length,
      skipped: parsed.skippedRows,
      issues: parsed.issues.slice(0, 50),
      preview: parsed.invoices.slice(0, 10).map(invoice => ({
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.client.name,
        issueDate: invoice.issueDate,
        total: invoice.total,
        currency: invoice.currency,
        status: invoice.status
      }))
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid CSV file' });
  }
});

invoiceImportRouter.post('/fakturoid', async (req: AuthRequest, res: Response) => {
  let parsed;
  try {
    parsed = parseFakturoidCsv(getCsv(req.body));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid CSV file' });
  }

  if (parsed.invoices.length === 0) {
    return res.status(400).json({ error: 'CSV does not contain any importable invoices' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await importFakturoidInvoices(
      { query: (text, params) => client!.query(text, params) },
      req.userId!,
      parsed
    );
    await client.query('COMMIT');

    res.status(201).json({
      ...result,
      invalidRows: parsed.issues.length,
      skippedRows: parsed.skippedRows
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Fakturoid import error:', error);
    res.status(500).json({ error: 'Failed to import invoices' });
  } finally {
    client?.release();
  }
});
