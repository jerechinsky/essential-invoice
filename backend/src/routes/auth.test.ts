import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Mock the database module
vi.mock('../db/init.js', () => ({
  query: vi.fn()
}));

// Mock the global email sender
vi.mock('../services/globalEmailSender.js', () => ({
  isGlobalSmtpConfigured: vi.fn(),
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocking
import { authRouter } from './auth';
import { query } from '../db/init';
import { isGlobalSmtpConfigured, sendWelcomeEmail, sendPasswordResetEmail } from '../services/globalEmailSender';

const mockedQuery = vi.mocked(query);
const mockedIsGlobalSmtpConfigured = vi.mocked(isGlobalSmtpConfigured);
const mockedSendWelcomeEmail = vi.mocked(sendWelcomeEmail);
const mockedSendPasswordResetEmail = vi.mocked(sendPasswordResetEmail);

describe('Auth Routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret-at-least-16-chars';
    // Restore default mock implementations after clearAllMocks
    mockedIsGlobalSmtpConfigured.mockReturnValue(false);
    mockedSendWelcomeEmail.mockResolvedValue(undefined);
    mockedSendPasswordResetEmail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('POST /auth/register', () => {
    it('should return 400 if email is invalid', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'invalid-email',
          password: 'password123',
          name: 'Test User'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it('should return 400 if password is too short', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'short',
          name: 'Test User'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it('should return 400 if name is empty', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
          name: ''
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it('should return 400 if user already exists', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [{ id: '123' }] } as any);

      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'existing@example.com',
          password: 'password123',
          name: 'Test User'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('User with this email already exists');
    });

    it('should register user successfully', async () => {
      const userId = 'new-user-id';
      // Check if user exists
      mockedQuery.mockResolvedValueOnce({ rows: [] } as any);
      // Create user
      mockedQuery.mockResolvedValueOnce({
        rows: [{ id: userId, email: 'new@example.com', name: 'New User' }]
      } as any);
      // Create default settings
      mockedQuery.mockResolvedValueOnce({ rows: [] } as any);

      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'new@example.com',
          password: 'password123',
          name: 'New User'
        });

      expect(response.status).toBe(201);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe('new@example.com');
      expect(response.body.token).toBeDefined();
    });

    it('should register user with onboardingCompleted: false', async () => {
      const userId = 'new-user-id';
      // Check if user exists
      mockedQuery.mockResolvedValueOnce({ rows: [] } as any);
      // Create user
      mockedQuery.mockResolvedValueOnce({
        rows: [{ id: userId, email: 'new@example.com', name: 'New User' }]
      } as any);
      // Create default settings
      mockedQuery.mockResolvedValueOnce({ rows: [] } as any);

      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'new@example.com',
          password: 'password123',
          name: 'New User'
        });

      expect(response.status).toBe(201);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.onboardingCompleted).toBe(false);
    });

    it('should only accept name, email, password (no company fields)', async () => {
      const userId = 'new-user-id';
      // Check if user exists
      mockedQuery.mockResolvedValueOnce({ rows: [] } as any);
      // Create user
      mockedQuery.mockResolvedValueOnce({
        rows: [{ id: userId, email: 'new@example.com', name: 'New User' }]
      } as any);
      // Create default settings
      mockedQuery.mockResolvedValueOnce({ rows: [] } as any);

      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'new@example.com',
          password: 'password123',
          name: 'New User',
          companyName: 'Should Be Ignored',
          companyIco: '12345678'
        });

      expect(response.status).toBe(201);

      // Verify the INSERT query only includes email, password_hash, name
      const insertCall = mockedQuery.mock.calls[1];
      const sql = insertCall[0] as string;
      expect(sql).toContain('INSERT INTO users');
      expect(sql).toContain('email');
      expect(sql).toContain('password_hash');
      expect(sql).toContain('name');
      expect(sql).not.toContain('company_name');
      expect(sql).not.toContain('company_ico');

      // Verify the parameters array has exactly 4 items (email, passwordHash, name, language)
      const params = insertCall[1] as any[];
      expect(params).toHaveLength(4);
      expect(params[0]).toBe('new@example.com');
      // params[1] is the bcrypt hash
      expect(params[2]).toBe('New User');
      expect(params[3]).toBe('cs'); // default language
    });
  });

  describe('POST /auth/login', () => {
    it('should return 400 if email is invalid', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'invalid',
          password: 'password123'
        });

      expect(response.status).toBe(400);
    });

    it('should return 400 if password is empty', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: ''
        });

      expect(response.status).toBe(400);
    });

    it('should return 401 if user not found', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [] } as any);

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'notfound@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid email or password');
    });
  });

  describe('GET /auth/me', () => {
    it('returns the supplier registration details', async () => {
      const token = jwt.sign({ userId: 'registry-user', email: 'test@example.com' }, 'test-secret-at-least-16-chars');
      mockedQuery.mockResolvedValueOnce({ rows: [{ id: 'registry-user', company_register_info: 'Zapsáno v živnostenském rejstříku' }] } as any);
      const response = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.companyRegisterInfo).toBe('Zapsáno v živnostenském rejstříku');
      expect(mockedQuery.mock.calls[0][0]).toContain('company_register_info');
      expect(mockedQuery.mock.calls[0][1]).toEqual(['registry-user']);
    });

    it('should return 401 if no token provided', async () => {
      const response = await request(app).get('/auth/me');

      expect(response.status).toBe(401);
    });

    it('should return 401 if token is invalid', async () => {
      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(403);
    });

    it('should return user profile with valid token', async () => {
      const userId = 'test-user-id';
      const token = jwt.sign({ userId, email: 'test@example.com' }, 'test-secret-at-least-16-chars');

      mockedQuery.mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: 'test@example.com',
          name: 'Test User',
          company_name: 'Test Company',
          company_ico: '12345678',
          company_dic: 'CZ12345678',
          company_address: 'Test Address',
          bank_account: '123456789',
          bank_code: '0100',
          created_at: new Date()
        }]
      } as any);

      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.email).toBe('test@example.com');
      expect(response.body.name).toBe('Test User');
      expect(response.body.companyName).toBe('Test Company');
    });
  });

  describe('GET /auth/me - new fields', () => {
    it('should return onboardingCompleted field', async () => {
      const userId = 'test-user-id';
      const token = jwt.sign({ userId, email: 'test@example.com' }, 'test-secret-at-least-16-chars');

      mockedQuery.mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: 'test@example.com',
          name: 'Test User',
          company_name: 'Test Company',
          company_ico: '12345678',
          company_dic: 'CZ12345678',
          company_address: 'Test Address',
          bank_account: '123456789',
          bank_code: '0100',
          vat_payer: true,
          onboarding_completed: true,
          pausalni_dan_enabled: false,
          pausalni_dan_tier: null,
          pausalni_dan_limit: null,
          has_logo: false,
          created_at: new Date()
        }]
      } as any);

      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.onboardingCompleted).toBe(true);
    });

    it('should return pausalni dan fields', async () => {
      const userId = 'test-user-id';
      const token = jwt.sign({ userId, email: 'test@example.com' }, 'test-secret-at-least-16-chars');

      mockedQuery.mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: 'test@example.com',
          name: 'Test User',
          company_name: 'Test Company',
          company_ico: '12345678',
          company_dic: 'CZ12345678',
          company_address: 'Test Address',
          bank_account: '123456789',
          bank_code: '0100',
          vat_payer: true,
          onboarding_completed: true,
          pausalni_dan_enabled: true,
          pausalni_dan_tier: 2,
          pausalni_dan_limit: 1500000,
          has_logo: false,
          created_at: new Date()
        }]
      } as any);

      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.pausalniDanEnabled).toBe(true);
      expect(response.body.pausalniDanTier).toBe(2);
      expect(response.body.pausalniDanLimit).toBe(1500000);
    });

    it('should return vatPayer defaulting to false for new user', async () => {
      const userId = 'test-user-id';
      const token = jwt.sign({ userId, email: 'test@example.com' }, 'test-secret-at-least-16-chars');

      mockedQuery.mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: 'test@example.com',
          name: 'Test User',
          company_name: null,
          company_ico: null,
          company_dic: null,
          company_address: null,
          bank_account: null,
          bank_code: null,
          vat_payer: false,
          onboarding_completed: false,
          pausalni_dan_enabled: false,
          pausalni_dan_tier: null,
          pausalni_dan_limit: null,
          has_logo: false,
          created_at: new Date()
        }]
      } as any);

      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.vatPayer).toBe(false);
    });
  });

  describe('PUT /auth/me', () => {
    it.each(['Zapsáno v živnostenském rejstříku', '', '  Zapsáno v obchodním rejstříku  '])('saves and returns registration details: %j', async companyRegisterInfo => {
      const token = jwt.sign({ userId: 'registry-user', email: 'test@example.com' }, 'test-secret-at-least-16-chars');
      mockedQuery.mockResolvedValueOnce({ rows: [{ id: 'registry-user', company_register_info: companyRegisterInfo.trim() }] } as any);
      const response = await request(app).put('/auth/me').set('Authorization', `Bearer ${token}`).send({ companyRegisterInfo });
      expect(response.status).toBe(200);
      expect(response.body.companyRegisterInfo).toBe(companyRegisterInfo.trim());
      const [sql, values] = mockedQuery.mock.calls[0];
      expect(sql).toContain('company_register_info = COALESCE($15, company_register_info)');
      expect(sql).toContain('WHERE id = $14');
      expect(values?.slice(13)).toEqual(['registry-user', companyRegisterInfo.trim()]);
    });

    it('preserves registration details when another profile section omits the field', async () => {
      const token = jwt.sign({ userId: 'registry-user', email: 'test@example.com' }, 'test-secret-at-least-16-chars');
      mockedQuery.mockResolvedValueOnce({ rows: [{ id: 'registry-user', company_register_info: 'Existing registry details' }] } as any);
      const response = await request(app).put('/auth/me').set('Authorization', `Bearer ${token}`).send({ language: 'en' });
      expect(response.status).toBe(200);
      expect(response.body.companyRegisterInfo).toBe('Existing registry details');
      expect(mockedQuery.mock.calls[0][0]).toContain('company_register_info = COALESCE($15, company_register_info)');
      expect(mockedQuery.mock.calls[0][1]?.[14]).toBeUndefined();
    });

    it.each([null, 12, {}, ['registry'], 'x'.repeat(501)])('rejects invalid registration details: %j', async companyRegisterInfo => {
      const token = jwt.sign({ userId: 'registry-user', email: 'test@example.com' }, 'test-secret-at-least-16-chars');
      const response = await request(app).put('/auth/me').set('Authorization', `Bearer ${token}`).send({ companyRegisterInfo });
      expect(response.status).toBe(400);
      expect(mockedQuery).not.toHaveBeenCalled();
    });

    it('should update user profile', async () => {
      const userId = 'test-user-id';
      const token = jwt.sign({ userId, email: 'test@example.com' }, 'test-secret-at-least-16-chars');

      mockedQuery.mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: 'test@example.com',
          name: 'Updated Name',
          company_name: 'Updated Company',
          company_ico: '87654321',
          company_dic: 'CZ87654321',
          company_address: 'Updated Address',
          bank_account: '987654321',
          bank_code: '0800'
        }]
      } as any);

      const response = await request(app)
        .put('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Updated Name',
          companyName: 'Updated Company'
        });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Name');
    });
  });

  describe('PUT /auth/me - new fields', () => {
    it('should update onboardingCompleted to true', async () => {
      const userId = 'test-user-id';
      const token = jwt.sign({ userId, email: 'test@example.com' }, 'test-secret-at-least-16-chars');

      mockedQuery.mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: 'test@example.com',
          name: 'Test User',
          company_name: 'Test Company',
          company_ico: '12345678',
          company_dic: 'CZ12345678',
          company_address: 'Test Address',
          bank_account: '123456789',
          bank_code: '0100',
          vat_payer: true,
          onboarding_completed: true,
          pausalni_dan_enabled: false,
          pausalni_dan_tier: null,
          pausalni_dan_limit: null
        }]
      } as any);

      const response = await request(app)
        .put('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({
          onboardingCompleted: true
        });

      expect(response.status).toBe(200);
      expect(response.body.onboardingCompleted).toBe(true);
    });

    it('should update pausalni dan fields', async () => {
      const userId = 'test-user-id';
      const token = jwt.sign({ userId, email: 'test@example.com' }, 'test-secret-at-least-16-chars');

      mockedQuery.mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: 'test@example.com',
          name: 'Test User',
          company_name: 'Test Company',
          company_ico: '12345678',
          company_dic: 'CZ12345678',
          company_address: 'Test Address',
          bank_account: '123456789',
          bank_code: '0100',
          vat_payer: true,
          onboarding_completed: true,
          pausalni_dan_enabled: true,
          pausalni_dan_tier: 2,
          pausalni_dan_limit: 1500000
        }]
      } as any);

      const response = await request(app)
        .put('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({
          pausalniDanEnabled: true,
          pausalniDanTier: 2,
          pausalniDanLimit: 1500000
        });

      expect(response.status).toBe(200);
      expect(response.body.pausalniDanEnabled).toBe(true);
      expect(response.body.pausalniDanTier).toBe(2);
      expect(response.body.pausalniDanLimit).toBe(1500000);
    });
  });

  describe('POST /auth/change-password', () => {
    it('should return 400 if new password is too short', async () => {
      const userId = 'test-user-id';
      const token = jwt.sign({ userId, email: 'test@example.com' }, 'test-secret-at-least-16-chars');

      const response = await request(app)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'oldpassword',
          newPassword: 'short'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /auth/register - welcome email', () => {
    it('should send welcome email when global SMTP is configured', async () => {
      mockedIsGlobalSmtpConfigured.mockReturnValue(true);
      // Check if user exists
      mockedQuery.mockResolvedValueOnce({ rows: [] } as any);
      // Create user
      mockedQuery.mockResolvedValueOnce({
        rows: [{ id: 'new-id', email: 'new@example.com', name: 'New User' }]
      } as any);
      // Create default settings
      mockedQuery.mockResolvedValueOnce({ rows: [] } as any);

      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'new@example.com',
          password: 'password123',
          name: 'New User'
        });

      expect(response.status).toBe(201);
      expect(mockedSendWelcomeEmail).toHaveBeenCalledWith('new@example.com', 'New User', 'cs');
    });

    it('should still register successfully when global SMTP is not configured', async () => {
      mockedIsGlobalSmtpConfigured.mockReturnValue(false);
      // Check if user exists
      mockedQuery.mockResolvedValueOnce({ rows: [] } as any);
      // Create user
      mockedQuery.mockResolvedValueOnce({
        rows: [{ id: 'new-id', email: 'new@example.com', name: 'New User' }]
      } as any);
      // Create default settings
      mockedQuery.mockResolvedValueOnce({ rows: [] } as any);

      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'new@example.com',
          password: 'password123',
          name: 'New User'
        });

      expect(response.status).toBe(201);
      expect(mockedSendWelcomeEmail).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /auth/me', () => {
    it('should return 401 if no token provided', async () => {
      const response = await request(app)
        .delete('/auth/me')
        .send({ password: 'password123' });

      expect(response.status).toBe(401);
    });

    it('should return 400 if password is missing', async () => {
      const userId = 'test-user-id';
      const token = jwt.sign({ userId, email: 'test@example.com' }, 'test-secret-at-least-16-chars');

      const response = await request(app)
        .delete('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('should return 401 if password is incorrect', async () => {
      const userId = 'test-user-id';
      const token = jwt.sign({ userId, email: 'test@example.com' }, 'test-secret-at-least-16-chars');

      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash('correctpassword', 12);

      mockedQuery.mockResolvedValueOnce({
        rows: [{ password_hash: hash }]
      } as any);

      const response = await request(app)
        .delete('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'wrongpassword' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Incorrect password');
    });

    it('should delete account with correct password', async () => {
      const userId = 'test-user-id';
      const token = jwt.sign({ userId, email: 'test@example.com' }, 'test-secret-at-least-16-chars');

      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash('correctpassword', 12);

      // SELECT password_hash
      mockedQuery.mockResolvedValueOnce({
        rows: [{ password_hash: hash }]
      } as any);
      // DELETE FROM users
      mockedQuery.mockResolvedValueOnce({ rows: [] } as any);

      const response = await request(app)
        .delete('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'correctpassword' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Account deleted');

      // Verify DELETE query was called
      const deleteCall = mockedQuery.mock.calls[1];
      expect(deleteCall[0]).toContain('DELETE FROM users');
      expect(deleteCall[1]).toEqual([userId]);
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('should return success even if email does not exist', async () => {
      mockedIsGlobalSmtpConfigured.mockReturnValue(true);
      mockedQuery.mockResolvedValueOnce({ rows: [] } as any);

      const response = await request(app)
        .post('/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBeDefined();
      expect(mockedSendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .post('/auth/forgot-password')
        .send({ email: 'not-an-email' });

      expect(response.status).toBe(400);
    });

    it('should create token and send email when user exists', async () => {
      mockedIsGlobalSmtpConfigured.mockReturnValue(true);
      // User lookup
      mockedQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-id', name: 'Test User', email: 'test@example.com', language: 'cs' }]
      } as any);
      // Invalidate existing tokens
      mockedQuery.mockResolvedValueOnce({ rows: [] } as any);
      // Insert new token
      mockedQuery.mockResolvedValueOnce({ rows: [] } as any);

      const response = await request(app)
        .post('/auth/forgot-password')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(200);
      expect(mockedSendPasswordResetEmail).toHaveBeenCalledWith(
        'test@example.com',
        'Test User',
        expect.any(String),
        'cs'
      );
    });

    it('should return success when global SMTP is not configured', async () => {
      mockedIsGlobalSmtpConfigured.mockReturnValue(false);

      const response = await request(app)
        .post('/auth/forgot-password')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBeDefined();
    });
  });

  describe('POST /auth/reset-password', () => {
    it('should return 400 if token is missing', async () => {
      const response = await request(app)
        .post('/auth/reset-password')
        .send({ password: 'newpassword123' });

      expect(response.status).toBe(400);
    });

    it('should return 400 if password is too short', async () => {
      const response = await request(app)
        .post('/auth/reset-password')
        .send({ token: 'some-token', password: 'short' });

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid token', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [] } as any);

      const response = await request(app)
        .post('/auth/reset-password')
        .send({ token: 'invalid-token', password: 'newpassword123' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('RESET_LINK_INVALID');
    });

    it('should return 400 for already-used token', async () => {
      mockedQuery.mockResolvedValueOnce({
        rows: [{
          id: 'token-id',
          user_id: 'user-id',
          expires_at: new Date(Date.now() + 3600000),
          used_at: new Date()
        }]
      } as any);

      const response = await request(app)
        .post('/auth/reset-password')
        .send({ token: 'used-token', password: 'newpassword123' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('RESET_LINK_USED');
    });

    it('should return 400 for expired token', async () => {
      mockedQuery.mockResolvedValueOnce({
        rows: [{
          id: 'token-id',
          user_id: 'user-id',
          expires_at: new Date(Date.now() - 3600000),
          used_at: null
        }]
      } as any);

      const response = await request(app)
        .post('/auth/reset-password')
        .send({ token: 'expired-token', password: 'newpassword123' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('RESET_LINK_EXPIRED');
    });

    it('should reset password successfully with valid token', async () => {
      // Token lookup
      mockedQuery.mockResolvedValueOnce({
        rows: [{
          id: 'token-id',
          user_id: 'user-id',
          expires_at: new Date(Date.now() + 3600000),
          used_at: null
        }]
      } as any);
      // Update password
      mockedQuery.mockResolvedValueOnce({ rows: [] } as any);
      // Mark token as used
      mockedQuery.mockResolvedValueOnce({ rows: [] } as any);
      // Clean up expired tokens
      mockedQuery.mockResolvedValueOnce({ rows: [] } as any);

      const response = await request(app)
        .post('/auth/reset-password')
        .send({ token: 'valid-token', password: 'newpassword123' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('PASSWORD_RESET_SUCCESS');

      // Verify password was updated
      const updateCall = mockedQuery.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE users SET password_hash');

      // Verify token was marked as used
      const markUsedCall = mockedQuery.mock.calls[2];
      expect(markUsedCall[0]).toContain('UPDATE password_reset_tokens SET used_at');
    });
  });
});
