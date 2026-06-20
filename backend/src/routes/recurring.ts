import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db/init';
import { AuthRequest } from '../middleware/auth';
import { generateInvoiceFromRecurring } from '../services/recurringInvoiceGenerator';

export const recurringRouter: ReturnType<typeof Router> = Router();

// Get all recurring invoice templates
recurringRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT ri.*, c.company_name as client_name, c.primary_email as client_email,
              (SELECT COALESCE(SUM(rii.quantity * rii.unit_price), 0)
               FROM recurring_invoice_items rii WHERE rii.recurring_invoice_id = ri.id) as subtotal
       FROM recurring_invoices ri
       JOIN clients c ON ri.client_id = c.id
       WHERE ri.user_id = $1
       ORDER BY ri.created_at DESC`,
      [req.userId]
    );

    const templates = result.rows.map(row => ({
      id: row.id,
      clientId: row.client_id,
      clientName: row.client_name,
      clientEmail: row.client_email,
      currency: row.currency,
      vatRate: parseFloat(row.vat_rate),
      dayOfMonth: row.day_of_month,
      startDate: row.start_date,
      endDate: row.end_date,
      nextGenerationDate: row.next_generation_date,
      paymentTerms: row.payment_terms,
      autoSend: row.auto_send,
      active: row.active,
      subtotal: parseFloat(row.subtotal),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    res.json(templates);
  } catch (error) {
    console.error('Get recurring invoices error:', error);
    res.status(500).json({ error: 'Failed to get recurring invoices' });
  }
});

// Get single recurring invoice template with items
recurringRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const templateResult = await query(
      `SELECT ri.*, c.company_name as client_name, c.primary_email as client_email
       FROM recurring_invoices ri
       JOIN clients c ON ri.client_id = c.id
       WHERE ri.id = $1 AND ri.user_id = $2`,
      [req.params.id, req.userId]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Recurring invoice not found' });
    }

    const itemsResult = await query(
      'SELECT * FROM recurring_invoice_items WHERE recurring_invoice_id = $1 ORDER BY sort_order ASC',
      [req.params.id]
    );

    const row = templateResult.rows[0];
    const template = {
      id: row.id,
      clientId: row.client_id,
      clientName: row.client_name,
      clientEmail: row.client_email,
      currency: row.currency,
      vatRate: parseFloat(row.vat_rate),
      notes: row.notes,
      dayOfMonth: row.day_of_month,
      startDate: row.start_date,
      endDate: row.end_date,
      nextGenerationDate: row.next_generation_date,
      paymentTerms: row.payment_terms,
      autoSend: row.auto_send,
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      items: itemsResult.rows.map(item => ({
        id: item.id,
        description: item.description,
        quantity: parseFloat(item.quantity),
        unit: item.unit,
        unitPrice: parseFloat(item.unit_price),
      })),
    };

    res.json(template);
  } catch (error) {
    console.error('Get recurring invoice error:', error);
    res.status(500).json({ error: 'Failed to get recurring invoice' });
  }
});

// Create recurring invoice template
recurringRouter.post('/',
  body('clientId').isUUID(),
  body('dayOfMonth').isInt({ min: 1, max: 28 }),
  body('startDate').isISO8601(),
  body('items').isArray({ min: 1 }),
  body('items.*.description').isLength({ max: 150 }),
  body('notes').optional().isLength({ max: 300 }),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { clientId, currency = 'CZK', vatRate = 21, notes, dayOfMonth, startDate, endDate, paymentTerms = 14, autoSend = false, items } = req.body;

    try {
      // Verify client belongs to user
      const clientCheck = await query(
        'SELECT id FROM clients WHERE id = $1 AND user_id = $2',
        [clientId, req.userId]
      );

      if (clientCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid client' });
      }

      // Validate endDate > startDate if provided
      if (endDate && new Date(endDate) <= new Date(startDate)) {
        return res.status(400).json({ error: 'End date must be after start date' });
      }

      // Calculate next generation date
      const start = new Date(startDate);
      let nextGenDate: Date;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (start > today) {
        // Start date is in the future, use it
        nextGenDate = new Date(start.getFullYear(), start.getMonth(), dayOfMonth);
        if (nextGenDate < start) {
          nextGenDate.setMonth(nextGenDate.getMonth() + 1);
        }
      } else {
        // Start date is today or in the past, find next occurrence
        nextGenDate = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
        if (nextGenDate <= today) {
          nextGenDate.setMonth(nextGenDate.getMonth() + 1);
        }
      }

      const nextGenStr = nextGenDate.toISOString().split('T')[0];

      const templateResult = await query(
        `INSERT INTO recurring_invoices (user_id, client_id, currency, vat_rate, notes, day_of_month, start_date, end_date, next_generation_date, payment_terms, auto_send)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [req.userId, clientId, currency, vatRate, notes, dayOfMonth, startDate, endDate || null, nextGenStr, paymentTerms, autoSend]
      );

      const template = templateResult.rows[0];

      // Create items
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await query(
          `INSERT INTO recurring_invoice_items (recurring_invoice_id, description, quantity, unit, unit_price, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [template.id, item.description, item.quantity, item.unit || null, item.unitPrice, i]
        );
      }

      res.status(201).json({
        id: template.id,
        nextGenerationDate: template.next_generation_date,
        active: template.active,
      });
    } catch (error) {
      console.error('Create recurring invoice error:', error);
      res.status(500).json({ error: 'Failed to create recurring invoice' });
    }
  }
);

// Update recurring invoice template
recurringRouter.put('/:id',
  body('items').optional().isArray({ min: 1 }),
  body('items.*.description').optional().isLength({ max: 150 }),
  body('notes').optional().isLength({ max: 300 }),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { clientId, currency, vatRate, notes, dayOfMonth, startDate, endDate, paymentTerms, autoSend, items } = req.body;

    try {
      // Check template exists and belongs to user
      const existing = await query(
        'SELECT * FROM recurring_invoices WHERE id = $1 AND user_id = $2',
        [req.params.id, req.userId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Recurring invoice not found' });
      }

      // Recalculate next_generation_date if dayOfMonth changed
      let nextGenStr = existing.rows[0].next_generation_date;
      const newDayOfMonth = dayOfMonth ?? existing.rows[0].day_of_month;
      if (dayOfMonth && dayOfMonth !== existing.rows[0].day_of_month) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const nextGen = new Date(today.getFullYear(), today.getMonth(), newDayOfMonth);
        if (nextGen <= today) {
          nextGen.setMonth(nextGen.getMonth() + 1);
        }
        nextGenStr = nextGen.toISOString().split('T')[0];
      }

      await query(
        `UPDATE recurring_invoices SET
          client_id = COALESCE($1, client_id),
          currency = COALESCE($2, currency),
          vat_rate = COALESCE($3, vat_rate),
          notes = $4,
          day_of_month = COALESCE($5, day_of_month),
          start_date = COALESCE($6, start_date),
          end_date = $7,
          next_generation_date = $8,
          payment_terms = COALESCE($9, payment_terms),
          auto_send = COALESCE($10, auto_send),
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $11 AND user_id = $12`,
        [clientId, currency, vatRate, notes, dayOfMonth, startDate, endDate, nextGenStr, paymentTerms, autoSend, req.params.id, req.userId]
      );

      // Replace items if provided
      if (items) {
        await query('DELETE FROM recurring_invoice_items WHERE recurring_invoice_id = $1', [req.params.id]);
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          await query(
            `INSERT INTO recurring_invoice_items (recurring_invoice_id, description, quantity, unit, unit_price, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [req.params.id, item.description, item.quantity, item.unit || null, item.unitPrice, i]
          );
        }
      }

      res.json({ message: 'Recurring invoice updated' });
    } catch (error) {
      console.error('Update recurring invoice error:', error);
      res.status(500).json({ error: 'Failed to update recurring invoice' });
    }
  }
);

// Delete recurring invoice template
recurringRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      'DELETE FROM recurring_invoices WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recurring invoice not found' });
    }

    res.json({ message: 'Recurring invoice deleted' });
  } catch (error) {
    console.error('Delete recurring invoice error:', error);
    res.status(500).json({ error: 'Failed to delete recurring invoice' });
  }
});

// Toggle active/paused
recurringRouter.post('/:id/toggle', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `UPDATE recurring_invoices SET
        active = NOT active,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING active`,
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recurring invoice not found' });
    }

    res.json({ active: result.rows[0].active });
  } catch (error) {
    console.error('Toggle recurring invoice error:', error);
    res.status(500).json({ error: 'Failed to toggle recurring invoice' });
  }
});

// Generate invoice now (manual trigger)
recurringRouter.post('/:id/generate-now', async (req: AuthRequest, res: Response) => {
  try {
    const templateResult = await query(
      'SELECT * FROM recurring_invoices WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Recurring invoice not found' });
    }

    const result = await generateInvoiceFromRecurring(templateResult.rows[0]);

    if (result.success) {
      res.json({ message: 'Invoice generated', invoiceId: result.invoiceId });
    } else {
      res.status(500).json({ error: result.error || 'Failed to generate invoice' });
    }
  } catch (error) {
    console.error('Generate recurring invoice error:', error);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
});
