import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import { query } from '../db/init';
import { AuthRequest } from '../middleware/auth';
import { parseAlzaInvoice } from '../services/alzaInvoiceParser';

export const expenseRouter: ReturnType<typeof Router> = Router();
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, callback) => {
    callback(null, file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf'));
  },
});

// Generate expense number based on issue date
async function generateExpenseNumber(userId: string, issueDate: string, attempt: number = 0): Promise<string> {
  const date = new Date(issueDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const datePrefix = `N${year}${month}`;

  const result = await query(
    `SELECT COUNT(*) FROM expenses
     WHERE user_id = $1
     AND expense_number LIKE $2`,
    [userId, `${datePrefix}%`]
  );

  const count = parseInt(result.rows[0].count) + 1 + attempt;
  return `${datePrefix}${String(count).padStart(2, '0')}`;
}

// Parse one Alza PDF without saving it, so the normal form can be reviewed before creation.
expenseRouter.post('/import/preview', pdfUpload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'A PDF file is required' });

  try {
    res.json(parseAlzaInvoice(req.file.buffer));
  } catch (error) {
    res.status(422).json({ error: error instanceof Error ? error.message : 'Could not parse the invoice' });
  }
});

// Import up to 10 Alza PDFs. Each file succeeds or fails independently.
expenseRouter.post('/import', pdfUpload.array('files', 10), async (req: AuthRequest, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files?.length) return res.status(400).json({ error: 'At least one PDF file is required' });

  const imported: Array<{ fileName: string; id: string; expenseNumber: string; supplierInvoiceNumber: string }> = [];
  const failed: Array<{ fileName: string; error: string }> = [];

  for (const file of files) {
    try {
      const parsed = parseAlzaInvoice(file.buffer);
      const duplicate = await query(
        'SELECT id FROM expenses WHERE user_id = $1 AND supplier_invoice_number = $2 LIMIT 1',
        [req.userId, parsed.supplierInvoiceNumber]
      );
      if (duplicate.rows.length) throw new Error(`Invoice ${parsed.supplierInvoiceNumber} has already been imported`);

      const supplier = await query(
        'SELECT id FROM clients WHERE user_id = $1 AND ico = $2 LIMIT 1',
        [req.userId, parsed.supplierIco]
      );
      const clientId = supplier.rows[0]?.id ?? null;

      let expenseNumber = '';
      let importedId = '';
      for (let attempt = 0; attempt <= 3; attempt += 1) {
        expenseNumber = await generateExpenseNumber(req.userId!, parsed.issueDate, attempt);
        try {
          const result = await query(
            `INSERT INTO expenses (user_id, client_id, expense_number, supplier_invoice_number,
             status, currency, issue_date, due_date, amount, vat_rate, vat_amount, total,
             description, file_data, file_name, file_mime_type)
             VALUES ($1, $2, $3, $4, 'unpaid', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'application/pdf')
             RETURNING id`,
            [req.userId, clientId, expenseNumber, parsed.supplierInvoiceNumber,
             parsed.currency, parsed.issueDate, parsed.dueDate, parsed.amount, parsed.vatRate,
             parsed.vatAmount, parsed.total, parsed.description, file.buffer.toString('base64'), file.originalname]
          );
          importedId = result.rows[0].id;
          break;
        } catch (error: any) {
          if (error.code === '23505' && error.constraint === 'expenses_user_expense_number_key' && attempt < 3) continue;
          throw error;
        }
      }

      imported.push({
        fileName: file.originalname,
        id: importedId,
        expenseNumber,
        supplierInvoiceNumber: parsed.supplierInvoiceNumber,
      });
    } catch (error) {
      failed.push({
        fileName: file.originalname,
        error: error instanceof Error ? error.message : 'Could not import the invoice',
      });
    }
  }

  res.json({ imported, failed });
});

// Get all expenses
expenseRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { status, clientId, from, to } = req.query;

    let sql = `
      SELECT e.id, e.expense_number, e.supplier_invoice_number, e.status, e.currency,
             e.client_id, e.issue_date, e.due_date, e.delivery_date,
             e.amount, e.vat_rate, e.vat_amount, e.total,
             e.description, e.notes, e.paid_at, e.created_at, e.updated_at,
             e.file_name, e.file_mime_type,
             c.company_name as client_name
      FROM expenses e
      LEFT JOIN clients c ON e.client_id = c.id
      WHERE e.user_id = $1
    `;
    const params: any[] = [req.userId];
    let paramIndex = 2;

    if (status) {
      sql += ` AND e.status = $${paramIndex++}`;
      params.push(status);
    }

    if (clientId) {
      sql += ` AND e.client_id = $${paramIndex++}`;
      params.push(clientId);
    }

    if (from) {
      sql += ` AND e.issue_date >= $${paramIndex++}`;
      params.push(from);
    }

    if (to) {
      sql += ` AND e.issue_date <= $${paramIndex++}`;
      params.push(to);
    }

    sql += ' ORDER BY e.issue_date DESC, e.created_at DESC';

    const result = await query(sql, params);

    const expenses = result.rows.map(row => ({
      id: row.id,
      expenseNumber: row.expense_number,
      supplierInvoiceNumber: row.supplier_invoice_number,
      status: row.status,
      currency: row.currency,
      clientId: row.client_id,
      clientName: row.client_name,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      deliveryDate: row.delivery_date,
      amount: parseFloat(row.amount),
      vatRate: parseFloat(row.vat_rate),
      vatAmount: parseFloat(row.vat_amount),
      total: parseFloat(row.total),
      description: row.description,
      notes: row.notes,
      hasFile: !!row.file_name,
      paidAt: row.paid_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    res.json(expenses);
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({ error: 'Failed to get expenses' });
  }
});

// Get single expense
expenseRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT e.*, c.company_name as client_name, c.address as client_address,
              c.ico as client_ico, c.dic as client_dic, c.primary_email as client_email
       FROM expenses e
       LEFT JOIN clients c ON e.client_id = c.id
       WHERE e.id = $1 AND e.user_id = $2`,
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const row = result.rows[0];
    const expense = {
      id: row.id,
      expenseNumber: row.expense_number,
      supplierInvoiceNumber: row.supplier_invoice_number,
      status: row.status,
      currency: row.currency,
      clientId: row.client_id,
      clientName: row.client_name,
      clientAddress: row.client_address,
      clientIco: row.client_ico,
      clientDic: row.client_dic,
      clientEmail: row.client_email,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      deliveryDate: row.delivery_date,
      amount: parseFloat(row.amount),
      vatRate: parseFloat(row.vat_rate),
      vatAmount: parseFloat(row.vat_amount),
      total: parseFloat(row.total),
      description: row.description,
      notes: row.notes,
      fileData: row.file_data,
      fileName: row.file_name,
      fileMimeType: row.file_mime_type,
      paidAt: row.paid_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    res.json(expense);
  } catch (error) {
    console.error('Get expense error:', error);
    res.status(500).json({ error: 'Failed to get expense' });
  }
});

// Create expense
expenseRouter.post('/',
  body('issueDate').isISO8601(),
  body('dueDate').isISO8601(),
  body('amount').isNumeric().custom((value) => {
    if (parseFloat(value) <= 0) {
      throw new Error('Amount must be greater than 0');
    }
    return true;
  }),
  body('vatRate').optional().isNumeric(),
  body('currency').optional().isIn(['CZK', 'EUR']),
  body('clientId').optional({ values: 'falsy' }).isUUID(),
  body('supplierInvoiceNumber').optional().isLength({ max: 100 }),
  body('description').optional({ values: 'null' }).isLength({ max: 300 }),
  body('notes').optional({ values: 'null' }).isLength({ max: 300 }),
  body('fileMimeType').optional({ values: 'null' }).isIn(['application/pdf', 'image/jpeg', 'image/png']),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      clientId, issueDate, dueDate, deliveryDate, currency = 'CZK',
      amount, vatRate = 21, supplierInvoiceNumber,
      description, notes, fileData, fileName, fileMimeType
    } = req.body;

    try {
      // Verify client belongs to user if provided
      if (clientId) {
        const clientCheck = await query(
          'SELECT id FROM clients WHERE id = $1 AND user_id = $2',
          [clientId, req.userId]
        );
        if (clientCheck.rows.length === 0) {
          return res.status(400).json({ error: 'Invalid client' });
        }
      }

      const vatAmount = parseFloat(amount) * (parseFloat(vatRate) / 100);
      const total = parseFloat(amount) + vatAmount;

      // Retry loop to handle race conditions with expense number generation
      const MAX_RETRIES = 3;
      let row;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const expenseNumber = await generateExpenseNumber(req.userId!, issueDate, attempt);

          const result = await query(
            `INSERT INTO expenses (user_id, client_id, expense_number, supplier_invoice_number,
             status, currency, issue_date, due_date, delivery_date,
             amount, vat_rate, vat_amount, total,
             description, notes, file_data, file_name, file_mime_type)
             VALUES ($1, $2, $3, $4, 'unpaid', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
             RETURNING *`,
            [req.userId, clientId || null, expenseNumber, supplierInvoiceNumber || null,
             currency, issueDate, dueDate, deliveryDate || null,
             amount, vatRate, vatAmount, total,
             description || null, notes || null,
             fileData || null, fileName || null, fileMimeType || null]
          );

          row = result.rows[0];
          break; // Success, exit retry loop
        } catch (err: any) {
          // Retry on duplicate key violation (race condition between concurrent requests)
          if (err.code === '23505' && err.constraint === 'expenses_user_expense_number_key' && attempt < MAX_RETRIES) {
            continue;
          }
          throw err;
        }
      }

      res.status(201).json({
        id: row.id,
        expenseNumber: row.expense_number,
        status: row.status,
        total: parseFloat(row.total),
      });
    } catch (error) {
      console.error('Create expense error:', error);
      res.status(500).json({ error: 'Failed to create expense' });
    }
  }
);

// Update expense
expenseRouter.put('/:id',
  body('issueDate').optional().isISO8601(),
  body('dueDate').optional().isISO8601(),
  body('amount').optional().isNumeric().custom((value) => {
    if (parseFloat(value) <= 0) {
      throw new Error('Amount must be greater than 0');
    }
    return true;
  }),
  body('vatRate').optional().isNumeric(),
  body('currency').optional().isIn(['CZK', 'EUR']),
  body('clientId').optional({ values: 'falsy' }).isUUID(),
  body('supplierInvoiceNumber').optional({ values: 'null' }).isLength({ max: 100 }),
  body('description').optional({ values: 'null' }).isLength({ max: 300 }),
  body('notes').optional({ values: 'null' }).isLength({ max: 300 }),
  body('fileMimeType').optional({ values: 'null' }).isIn(['application/pdf', 'image/jpeg', 'image/png']),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      // Check expense exists and is unpaid
      const expenseCheck = await query(
        'SELECT status FROM expenses WHERE id = $1 AND user_id = $2',
        [req.params.id, req.userId]
      );

      if (expenseCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Expense not found' });
      }

      if (expenseCheck.rows[0].status !== 'unpaid') {
        return res.status(400).json({ error: 'Can only edit unpaid expenses' });
      }

      const {
        clientId, issueDate, dueDate, deliveryDate, currency,
        amount, vatRate, supplierInvoiceNumber,
        description, notes, fileData, fileName, fileMimeType
      } = req.body;

      // Verify client if provided
      if (clientId) {
        const clientCheck = await query(
          'SELECT id FROM clients WHERE id = $1 AND user_id = $2',
          [clientId, req.userId]
        );
        if (clientCheck.rows.length === 0) {
          return res.status(400).json({ error: 'Invalid client' });
        }
      }

      // Recalculate VAT if amount or rate changed
      let vatAmount = null;
      let total = null;
      if (amount !== undefined || vatRate !== undefined) {
        // Need to get current values for any not provided
        const current = await query(
          'SELECT amount, vat_rate FROM expenses WHERE id = $1',
          [req.params.id]
        );
        const currentAmount = amount !== undefined ? parseFloat(amount) : parseFloat(current.rows[0].amount);
        const currentVatRate = vatRate !== undefined ? parseFloat(vatRate) : parseFloat(current.rows[0].vat_rate);
        vatAmount = currentAmount * (currentVatRate / 100);
        total = currentAmount + vatAmount;
      }

      const result = await query(
        `UPDATE expenses SET
          client_id = COALESCE($1, client_id),
          supplier_invoice_number = COALESCE($2, supplier_invoice_number),
          currency = COALESCE($3, currency),
          issue_date = COALESCE($4, issue_date),
          due_date = COALESCE($5, due_date),
          delivery_date = COALESCE($6, delivery_date),
          amount = COALESCE($7, amount),
          vat_rate = COALESCE($8, vat_rate),
          vat_amount = COALESCE($9, vat_amount),
          total = COALESCE($10, total),
          description = $11,
          notes = $12,
          file_data = COALESCE($13, file_data),
          file_name = COALESCE($14, file_name),
          file_mime_type = COALESCE($15, file_mime_type),
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $16 AND user_id = $17
         RETURNING *`,
        [
          clientId !== undefined ? (clientId || null) : undefined,
          supplierInvoiceNumber, currency, issueDate, dueDate, deliveryDate,
          amount, vatRate, vatAmount, total,
          description, notes,
          fileData, fileName, fileMimeType,
          req.params.id, req.userId
        ]
      );

      res.json({
        id: result.rows[0].id,
        expenseNumber: result.rows[0].expense_number,
        status: result.rows[0].status,
        total: parseFloat(result.rows[0].total),
      });
    } catch (error) {
      console.error('Update expense error:', error);
      res.status(500).json({ error: 'Failed to update expense' });
    }
  }
);

// Delete expense
expenseRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      'DELETE FROM expenses WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// Mark expense as paid
expenseRouter.post('/:id/mark-paid', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `UPDATE expenses SET
        status = 'paid',
        paid_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND status = 'unpaid'
       RETURNING *`,
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found or already paid' });
    }

    res.json({ message: 'Expense marked as paid' });
  } catch (error) {
    console.error('Mark expense paid error:', error);
    res.status(500).json({ error: 'Failed to mark expense as paid' });
  }
});

// Mark expense as unpaid
expenseRouter.post('/:id/mark-unpaid', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `UPDATE expenses SET
        status = 'unpaid',
        paid_at = NULL,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND status = 'paid'
       RETURNING *`,
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found or not paid' });
    }

    res.json({ message: 'Expense marked as unpaid' });
  } catch (error) {
    console.error('Mark expense unpaid error:', error);
    res.status(500).json({ error: 'Failed to mark expense as unpaid' });
  }
});

// Download file
expenseRouter.get('/:id/file', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      'SELECT file_data, file_name, file_mime_type FROM expenses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const { file_data, file_name, file_mime_type } = result.rows[0];

    if (!file_data) {
      return res.status(404).json({ error: 'No file attached' });
    }

    const buffer = Buffer.from(file_data, 'base64');
    res.setHeader('Content-Type', file_mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${file_name}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});
