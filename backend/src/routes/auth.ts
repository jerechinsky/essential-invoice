import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { query } from '../db/init';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { isGlobalSmtpConfigured, sendWelcomeEmail, sendPasswordResetEmail } from '../services/globalEmailSender';

// Configure multer for logo uploads (memory storage for base64 conversion)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG, JPG, and SVG are allowed.'));
    }
  }
});

export const authRouter: ReturnType<typeof Router> = Router();

// Register
authRouter.post('/register',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('name').trim().notEmpty(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, name, language } = req.body;

    try {
      // Check if user exists
      const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user with preferred language
      const userLanguage = language === 'en' ? 'en' : 'cs';
      const result = await query(
        `INSERT INTO users (email, password_hash, name, language)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, name`,
        [email, passwordHash, name, userLanguage]
      );

      const user = result.rows[0];

      // Create default settings for user
      await query(
        `INSERT INTO settings (user_id) VALUES ($1)`,
        [user.id]
      );

      // Generate token
      const secret = process.env.JWT_SECRET || 'your-secret-key';
      const token = jwt.sign({ userId: user.id, email: user.email }, secret, { expiresIn: '7d' });

      // Send welcome email (fire-and-forget)
      if (isGlobalSmtpConfigured()) {
        sendWelcomeEmail(email, name, userLanguage).catch(err => {
          console.error('Failed to send welcome email:', err);
        });
      }

      res.status(201).json({
        user: { id: user.id, email: user.email, name: user.name, onboardingCompleted: false },
        token
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
);

// Rate limiter for login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'TOO_MANY_LOGIN_ATTEMPTS' }
});

// Login
authRouter.post('/login',
  loginLimiter,
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      const result = await query(
        'SELECT id, email, name, password_hash FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const user = result.rows[0];
      const validPassword = await bcrypt.compare(password, user.password_hash);

      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const secret = process.env.JWT_SECRET || 'your-secret-key';
      const token = jwt.sign({ userId: user.id, email: user.email }, secret, { expiresIn: '7d' });

      res.json({
        user: { id: user.id, email: user.email, name: user.name },
        token
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// Get current user profile
authRouter.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT id, email, name, company_name, company_ico, company_dic, company_address, company_register_info, bank_account, bank_code, vat_payer, onboarding_completed, pausalni_dan_enabled, pausalni_dan_tier, pausalni_dan_limit, language, logo_data IS NOT NULL as has_logo, created_at
       FROM users WHERE id = $1`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      companyName: user.company_name,
      companyIco: user.company_ico,
      companyDic: user.company_dic,
      companyAddress: user.company_address,
      companyRegisterInfo: user.company_register_info,
      bankAccount: user.bank_account,
      bankCode: user.bank_code,
      vatPayer: user.vat_payer,
      onboardingCompleted: user.onboarding_completed,
      pausalniDanEnabled: user.pausalni_dan_enabled,
      pausalniDanTier: user.pausalni_dan_tier,
      pausalniDanLimit: user.pausalni_dan_limit,
      language: user.language || 'cs',
      hasLogo: user.has_logo,
      createdAt: user.created_at
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Update user profile
authRouter.put('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { name, companyName, companyIco, companyDic, companyAddress, companyRegisterInfo, bankAccount, bankCode, vatPayer, onboardingCompleted, pausalniDanEnabled, pausalniDanTier, pausalniDanLimit, language } = req.body;

  try {
    const result = await query(
      `UPDATE users SET
        name = COALESCE($1, name),
        company_name = $2,
        company_ico = $3,
        company_dic = $4,
        company_address = $5,
        company_register_info = $6,
        bank_account = $7,
        bank_code = $8,
        vat_payer = COALESCE($9, vat_payer),
        onboarding_completed = COALESCE($10, onboarding_completed),
        pausalni_dan_enabled = COALESCE($11, pausalni_dan_enabled),
        pausalni_dan_tier = COALESCE($12, pausalni_dan_tier),
        pausalni_dan_limit = COALESCE($13, pausalni_dan_limit),
        language = COALESCE($14, language),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $15
       RETURNING id, email, name, company_name, company_ico, company_dic, company_address, company_register_info, bank_account, bank_code, vat_payer, onboarding_completed, pausalni_dan_enabled, pausalni_dan_tier, pausalni_dan_limit, language`,
      [name, companyName, companyIco, companyDic, companyAddress, companyRegisterInfo, bankAccount, bankCode, vatPayer, onboardingCompleted, pausalniDanEnabled, pausalniDanTier, pausalniDanLimit, language, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      companyName: user.company_name,
      companyIco: user.company_ico,
      companyDic: user.company_dic,
      companyAddress: user.company_address,
      companyRegisterInfo: user.company_register_info,
      bankAccount: user.bank_account,
      bankCode: user.bank_code,
      vatPayer: user.vat_payer,
      onboardingCompleted: user.onboarding_completed,
      pausalniDanEnabled: user.pausalni_dan_enabled,
      pausalniDanTier: user.pausalni_dan_tier,
      pausalniDanLimit: user.pausalni_dan_limit,
      language: user.language || 'cs'
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password
authRouter.post('/change-password', authenticateToken,
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    try {
      const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const validPassword = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      await query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newHash, req.userId]);

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ error: 'Failed to change password' });
    }
  }
);

// Rate limiter for forgot-password
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'TOO_MANY_RESET_ATTEMPTS' }
});

// Forgot password
authRouter.post('/forgot-password',
  forgotPasswordLimiter,
  body('email').isEmail().normalizeEmail(),
  async (req: Request, res: Response) => {
    const genericResponse = { message: 'RESET_EMAIL_SENT' };

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    try {
      if (!isGlobalSmtpConfigured()) {
        console.error('Global SMTP not configured, cannot send password reset email');
        return res.json(genericResponse);
      }

      const userResult = await query('SELECT id, name, email, language FROM users WHERE email = $1', [email]);
      if (userResult.rows.length === 0) {
        return res.json(genericResponse);
      }

      const user = userResult.rows[0];

      // Invalidate existing tokens for this user
      await query(
        'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND used_at IS NULL',
        [user.id]
      );

      // Generate token
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await query(
        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [user.id, tokenHash, expiresAt]
      );

      await sendPasswordResetEmail(user.email, user.name, token, user.language || 'cs');

      res.json(genericResponse);
    } catch (error) {
      console.error('Forgot password error:', error);
      res.json(genericResponse);
    }
  }
);

// Reset password
authRouter.post('/reset-password',
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token, password } = req.body;

    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const tokenResult = await query(
        `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1`,
        [tokenHash]
      );

      if (tokenResult.rows.length === 0) {
        return res.status(400).json({ error: 'RESET_LINK_INVALID' });
      }

      const resetToken = tokenResult.rows[0];

      if (resetToken.used_at) {
        return res.status(400).json({ error: 'RESET_LINK_USED' });
      }

      if (new Date(resetToken.expires_at) < new Date()) {
        return res.status(400).json({ error: 'RESET_LINK_EXPIRED' });
      }

      // Hash new password and update
      const passwordHash = await bcrypt.hash(password, 12);
      await query(
        'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [passwordHash, resetToken.user_id]
      );

      // Mark token as used
      await query(
        'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
        [resetToken.id]
      );

      // Clean up expired tokens
      await query('DELETE FROM password_reset_tokens WHERE expires_at < CURRENT_TIMESTAMP');

      res.json({ message: 'PASSWORD_RESET_SUCCESS' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'PASSWORD_RESET_FAILED' });
    }
  }
);

// Get logo image (supports token via query param for img src usage)
authRouter.get('/me/logo', async (req: Request, res: Response) => {
  try {
    // Accept token from header or query parameter
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryToken;

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const secret = process.env.JWT_SECRET || 'your-secret-key';
    let userId: string;
    try {
      const decoded = jwt.verify(token, secret) as { userId: string };
      userId = decoded.userId;
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const result = await query(
      'SELECT logo_data, logo_mime_type FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].logo_data) {
      return res.status(404).json({ error: 'Logo not found' });
    }

    const { logo_data, logo_mime_type } = result.rows[0];
    const logoBuffer = Buffer.from(logo_data, 'base64');

    res.set('Content-Type', logo_mime_type);
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(logoBuffer);
  } catch (error) {
    console.error('Get logo error:', error);
    res.status(500).json({ error: 'Failed to get logo' });
  }
});

// Upload logo
authRouter.post('/me/logo', authenticateToken, upload.single('logo'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const logoData = req.file.buffer.toString('base64');
    const logoMimeType = req.file.mimetype;

    await query(
      'UPDATE users SET logo_data = $1, logo_mime_type = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [logoData, logoMimeType, req.userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Upload logo error:', error);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

// Delete account (password-confirmed)
authRouter.delete('/me', authenticateToken,
  body('password').notEmpty(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { password } = req.body;

    try {
      const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const validPassword = await bcrypt.compare(password, result.rows[0].password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Incorrect password' });
      }

      await query('DELETE FROM users WHERE id = $1', [req.userId]);

      res.json({ message: 'Account deleted' });
    } catch (error) {
      console.error('Delete account error:', error);
      res.status(500).json({ error: 'Failed to delete account' });
    }
  }
);

// Delete logo
authRouter.delete('/me/logo', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    await query(
      'UPDATE users SET logo_data = NULL, logo_mime_type = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [req.userId]
    );

    res.json({ message: 'Logo deleted successfully' });
  } catch (error) {
    console.error('Delete logo error:', error);
    res.status(500).json({ error: 'Failed to delete logo' });
  }
});
