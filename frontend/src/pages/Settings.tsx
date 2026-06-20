import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '../utils/api';
import { Mail, Server, Eye, EyeOff, Calculator, Sparkles } from 'lucide-react';

interface Settings {
  smtpHost: string | null;
  smtpPort: number;
  smtpUser: string | null;
  smtpPasswordSet: boolean;
  smtpSecure: boolean;
  smtpFromEmail: string | null;
  smtpFromName: string | null;
  imapHost: string | null;
  imapPort: number;
  imapUser: string | null;
  imapPasswordSet: boolean;
  imapTls: boolean;
  bankNotificationEmail: string | null;
  emailPollingInterval: number;
  invoiceNumberPrefix: string;
  invoiceNumberFormat: string;
  invoiceNumberStartingSequence: number;
  invoiceNumberResetPeriod: 'monthly' | 'yearly';
  invoicePdfTemplate: 'classic' | 'minimalistic';
  defaultVatRate: number;
  defaultPaymentTerms: number;
  emailTemplate: string | null;
  calculatorEnabled: boolean;
  aiEnabled: boolean;
  perplexityApiKeySet: boolean;
}

type SettingsFormData = {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpSecure: boolean;
  smtpFromEmail: string;
  smtpFromName: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPassword: string;
  imapTls: boolean;
  bankNotificationEmail: string;
  emailPollingInterval: number;
  invoiceNumberPrefix: string;
  invoiceNumberFormat: string;
  invoiceNumberStartingSequence: number;
  invoiceNumberResetPeriod: 'monthly' | 'yearly';
  invoicePdfTemplate: 'classic' | 'minimalistic';
  defaultVatRate: number;
  defaultPaymentTerms: number;
  emailTemplate: string;
  calculatorEnabled: boolean;
  aiEnabled: boolean;
  perplexityApiKey: string;
};

export default function Settings() {
  const { t } = useTranslation('settings');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<'smtp' | 'imap' | null>(null);
  const [showPasswords, setShowPasswords] = useState({ smtp: false, imap: false, perplexity: false });

  const [formData, setFormData] = useState<SettingsFormData>({
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPassword: '',
    smtpSecure: true,
    smtpFromEmail: '',
    smtpFromName: '',
    imapHost: '',
    imapPort: 993,
    imapUser: '',
    imapPassword: '',
    imapTls: true,
    bankNotificationEmail: '',
    emailPollingInterval: 300,
    invoiceNumberPrefix: '',
    invoiceNumberFormat: '{YYYY}{MM}{SEQ2}',
    invoiceNumberStartingSequence: 1,
    invoiceNumberResetPeriod: 'monthly',
    invoicePdfTemplate: 'classic',
    defaultVatRate: 21,
    defaultPaymentTerms: 14,
    emailTemplate: '',
    calculatorEnabled: false,
    aiEnabled: true,
    perplexityApiKey: '',
  });

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const result = await api.get('/settings');
      setSettings(result);
      setFormData({
        smtpHost: result.smtpHost || '',
        smtpPort: result.smtpPort ?? 587,
        smtpUser: result.smtpUser || '',
        smtpPassword: '',
        smtpSecure: result.smtpSecure ?? true,
        smtpFromEmail: result.smtpFromEmail || '',
        smtpFromName: result.smtpFromName || '',
        imapHost: result.imapHost || '',
        imapPort: result.imapPort ?? 993,
        imapUser: result.imapUser || '',
        imapPassword: '',
        imapTls: result.imapTls ?? true,
        bankNotificationEmail: result.bankNotificationEmail || '',
        emailPollingInterval: result.emailPollingInterval ?? 300,
        invoiceNumberPrefix: result.invoiceNumberPrefix || '',
        invoiceNumberFormat: result.invoiceNumberFormat || '{YYYY}{MM}{SEQ2}',
        invoiceNumberStartingSequence: result.invoiceNumberStartingSequence ?? 1,
        invoiceNumberResetPeriod: result.invoiceNumberResetPeriod === 'yearly' ? 'yearly' : 'monthly',
        invoicePdfTemplate: result.invoicePdfTemplate === 'minimalistic' ? 'minimalistic' : 'classic',
        defaultVatRate: result.defaultVatRate ?? 21,
        defaultPaymentTerms: result.defaultPaymentTerms ?? 14,
        emailTemplate: result.emailTemplate || '',
        calculatorEnabled: result.calculatorEnabled ?? false,
        aiEnabled: result.aiEnabled ?? true,
        perplexityApiKey: '',
      });
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value, type } = e.target;
    const numericFields = ['smtpPort', 'imapPort', 'emailPollingInterval', 'defaultVatRate', 'defaultPaymentTerms', 'invoiceNumberStartingSequence'];

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked :
              (type === 'number' || numericFields.includes(name)) ? (value === '' ? '' : parseInt(value)) : value
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      await api.put('/settings', formData);
      toast.success(t('toast.saveSuccess'));
      loadSettings();
      window.dispatchEvent(new Event('settings-updated'));
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || t('toast.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function testConnection(type: 'smtp' | 'imap') {
    setTesting(type);

    try {
      await api.post(`/settings/test-${type}`);
      toast.success(t(`${type}.testSuccess`));
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || t(`${type}.testFailed`));
    } finally {
      setTesting(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SMTP Settings */}
        <div className="card">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
              <Mail className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('smtp.heading')}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">{t('smtp.server')}</label>
              <input
                type="text"
                name="smtpHost"
                value={formData.smtpHost}
                onChange={handleChange}
                className="input"
                placeholder={t('smtp.serverPlaceholder')}
              />
            </div>
            <div>
              <label className="label">{t('smtp.port')}</label>
              <input
                type="number"
                name="smtpPort"
                value={formData.smtpPort}
                onChange={handleChange}
                className="input"
              />
            </div>
            <div>
              <label className="label">{t('smtp.user')}</label>
              <input
                type="text"
                name="smtpUser"
                value={formData.smtpUser}
                onChange={handleChange}
                className="input"
              />
            </div>
            <div>
              <label className="label">{t('smtp.password')} {settings?.smtpPasswordSet && t('smtp.passwordSet')}</label>
              <div className="relative">
                <input
                  type={showPasswords.smtp ? 'text' : 'password'}
                  name="smtpPassword"
                  value={formData.smtpPassword}
                  onChange={handleChange}
                  className="input pr-10"
                  placeholder={settings?.smtpPasswordSet ? '••••••••' : ''}
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(p => ({ ...p, smtp: !p.smtp }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPasswords.smtp ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">{t('smtp.fromEmail')}</label>
              <input
                type="email"
                name="smtpFromEmail"
                value={formData.smtpFromEmail}
                onChange={handleChange}
                className="input"
                placeholder={t('smtp.fromEmailPlaceholder')}
              />
            </div>
            <div>
              <label className="label">{t('smtp.fromName')}</label>
              <input
                type="text"
                name="smtpFromName"
                value={formData.smtpFromName}
                onChange={handleChange}
                className="input"
                placeholder={t('smtp.fromNamePlaceholder')}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                name="smtpSecure"
                checked={formData.smtpSecure}
                onChange={handleChange}
                className="rounded border-gray-300 text-indigo-600"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('smtp.useTls')}</span>
            </label>
            <button
              type="button"
              onClick={() => testConnection('smtp')}
              disabled={testing === 'smtp' || !formData.smtpHost}
              className="btn btn-secondary"
            >
              {testing === 'smtp' ? t('smtp.testing') : t('smtp.testConnection')}
            </button>
          </div>
        </div>

        {/* IMAP Settings */}
        <div className="card">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Server className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('imap.heading')}</h2>
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {t('imap.description')}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">{t('imap.server')}</label>
              <input
                type="text"
                name="imapHost"
                value={formData.imapHost}
                onChange={handleChange}
                className="input"
                placeholder={t('imap.serverPlaceholder')}
              />
            </div>
            <div>
              <label className="label">{t('imap.port')}</label>
              <input
                type="number"
                name="imapPort"
                value={formData.imapPort}
                onChange={handleChange}
                className="input"
              />
            </div>
            <div>
              <label className="label">{t('imap.user')}</label>
              <input
                type="text"
                name="imapUser"
                value={formData.imapUser}
                onChange={handleChange}
                className="input"
              />
            </div>
            <div>
              <label className="label">{t('imap.password')} {settings?.imapPasswordSet && t('imap.passwordSet')}</label>
              <div className="relative">
                <input
                  type={showPasswords.imap ? 'text' : 'password'}
                  name="imapPassword"
                  value={formData.imapPassword}
                  onChange={handleChange}
                  className="input pr-10"
                  placeholder={settings?.imapPasswordSet ? '••••••••' : ''}
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(p => ({ ...p, imap: !p.imap }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPasswords.imap ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="label">{t('imap.bankNotificationEmail')}</label>
              <input
                type="email"
                name="bankNotificationEmail"
                value={formData.bankNotificationEmail}
                onChange={handleChange}
                className="input"
                placeholder={t('imap.bankNotificationEmailPlaceholder')}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('imap.bankNotificationEmailHelp')}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                name="imapTls"
                checked={formData.imapTls}
                onChange={handleChange}
                className="rounded border-gray-300 text-indigo-600"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('imap.useTls')}</span>
            </label>
            <button
              type="button"
              onClick={() => testConnection('imap')}
              disabled={testing === 'imap' || !formData.imapHost}
              className="btn btn-secondary"
            >
              {testing === 'imap' ? t('imap.testing') : t('imap.testConnection')}
            </button>
          </div>
        </div>

        {/* AI Features Settings */}
        <div className="card">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('ai.heading')}</h2>
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {t('ai.description')}
          </p>

          <label className="flex items-center space-x-2 mb-4">
            <input
              type="checkbox"
              name="aiEnabled"
              checked={formData.aiEnabled}
              onChange={handleChange}
              className="rounded border-gray-300 text-indigo-600"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">{t('ai.enableAi')}</span>
          </label>

          <div>
            <label className="label">{t('ai.apiKeyLabel')} {settings?.perplexityApiKeySet && t('ai.apiKeySet')}</label>
            <div className="relative">
              <input
                type={showPasswords.perplexity ? 'text' : 'password'}
                name="perplexityApiKey"
                value={formData.perplexityApiKey}
                onChange={handleChange}
                className="input pr-10"
                placeholder={settings?.perplexityApiKeySet ? '••••••••' : t('ai.apiKeyPlaceholder')}
              />
              <button
                type="button"
                onClick={() => setShowPasswords(p => ({ ...p, perplexity: !p.perplexity }))}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showPasswords.perplexity ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('ai.apiKeyHelp')}{' '}
              <a
                href="https://www.perplexity.ai/settings/api"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline"
              >
                {t('ai.apiKeyLink')}
              </a>
            </p>
          </div>
        </div>

        {/* Invoice defaults */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('invoiceDefaults.heading')}</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">{t('invoiceDefaults.vatRate')}</label>
              <select
                name="defaultVatRate"
                value={formData.defaultVatRate}
                onChange={handleChange}
                className="input"
              >
                <option value={0}>0%</option>
                <option value={12}>12%</option>
                <option value={21}>21%</option>
              </select>
            </div>
            <div>
              <label className="label">{t('invoiceDefaults.paymentTerms')}</label>
              <input
                type="number"
                name="defaultPaymentTerms"
                value={formData.defaultPaymentTerms}
                onChange={handleChange}
                className="input"
                min={1}
              />
            </div>
            <div>
              <label className="label">{t('invoiceDefaults.invoiceNumberPrefix')}</label>
              <input
                type="text"
                name="invoiceNumberPrefix"
                value={formData.invoiceNumberPrefix}
                onChange={handleChange}
                className="input"
                placeholder={t('invoiceDefaults.invoiceNumberPrefixPlaceholder')}
              />
            </div>
            <div>
              <label className="label">{t('invoiceDefaults.invoiceNumberStartingSequence')}</label>
              <input
                type="number"
                name="invoiceNumberStartingSequence"
                value={formData.invoiceNumberStartingSequence}
                onChange={handleChange}
                className="input"
                min={1}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('invoiceDefaults.invoiceNumberStartingSequenceHelp')}
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="label">{t('invoiceDefaults.invoiceNumberFormat')}</label>
              <input
                type="text"
                name="invoiceNumberFormat"
                value={formData.invoiceNumberFormat}
                onChange={handleChange}
                className="input font-mono"
                placeholder="{YYYY}{MM}{SEQ2}"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('invoiceDefaults.invoiceNumberFormatHelp')}
              </p>
            </div>
            <div>
              <label className="label">{t('invoiceDefaults.invoiceNumberResetPeriod')}</label>
              <select
                name="invoiceNumberResetPeriod"
                value={formData.invoiceNumberResetPeriod}
                onChange={handleChange}
                className="input"
              >
                <option value="yearly">{t('invoiceDefaults.invoiceNumberResetPeriodYearly')}</option>
                <option value="monthly">{t('invoiceDefaults.invoiceNumberResetPeriodMonthly')}</option>
              </select>
            </div>
            <div>
              <label className="label">{t('invoiceDefaults.pdfTemplate')}</label>
              <select
                name="invoicePdfTemplate"
                value={formData.invoicePdfTemplate}
                onChange={handleChange}
                className="input"
              >
                <option value="classic">{t('invoiceDefaults.pdfTemplateClassic')}</option>
                <option value="minimalistic">{t('invoiceDefaults.pdfTemplateMinimalistic')}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Calculator Settings */}
        <div className="card">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Calculator className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('calculator.heading')}</h2>
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {t('calculator.description')}
          </p>

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              name="calculatorEnabled"
              checked={formData.calculatorEnabled}
              onChange={handleChange}
              className="rounded border-gray-300 text-indigo-600"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">{t('calculator.enable')}</span>
          </label>
        </div>

        {/* Email template */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('emailTemplate.heading')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {t('emailTemplate.variablesHelp')}
          </p>
          <textarea
            name="emailTemplate"
            value={formData.emailTemplate}
            onChange={handleChange}
            className="input"
            rows={6}
            placeholder={t('emailTemplate.placeholder')}
          />
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? t('actions.saving') : t('actions.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
