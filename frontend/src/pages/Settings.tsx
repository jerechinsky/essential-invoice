import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../utils/api';
import {
  Mail, Server, Eye, EyeOff, Calculator, Sparkles, FileText, Sun, Moon, Monitor,
  Globe, Building, Landmark, Image, Lock, LogOut, ChevronRight, Check, Download,
} from 'lucide-react';
import { PageLoader } from '../components/Spinner';
import AccountantExport from '../components/AccountantExport';
import StickySaveBar from '../components/StickySaveBar';
import { SettingsGroup, SettingsRow, SettingsBackHeader, StatusValue, RowToggle } from '../components/SettingsList';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { getInitials } from '../utils/format';

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
  defaultVatRate: number;
  defaultPaymentTerms: number;
  emailTemplate: string | null;
  calculatorEnabled: boolean;
  aiEnabled: boolean;
  aiApiKeySet: boolean;
  aiApiUrl: string | null;
  aiModel: string | null;
}

type SectionKey = 'exports' | 'invoiceDefaults' | 'emailSending' | 'bankMatching' | 'ai' | 'calculator' | 'appearance' | 'language';

/** Sections are routes (`/settings/<slug>`) so mobile can drill in and back out */
const SECTIONS: Array<{ key: SectionKey; slug: string; icon: typeof Mail; headingKey: string; descriptionKey: string }> = [
  { key: 'invoiceDefaults', slug: 'invoicing', icon: FileText, headingKey: 'invoiceDefaults.heading', descriptionKey: 'invoiceDefaults.description' },
  { key: 'exports', slug: 'exports', icon: Download, headingKey: 'exports.heading', descriptionKey: 'exports.description' },
  { key: 'emailSending', slug: 'email', icon: Mail, headingKey: 'smtp.heading', descriptionKey: 'smtp.description' },
  { key: 'bankMatching', slug: 'bank-matching', icon: Server, headingKey: 'imap.heading', descriptionKey: 'imap.description' },
  { key: 'ai', slug: 'ai', icon: Sparkles, headingKey: 'ai.heading', descriptionKey: 'ai.description' },
  { key: 'calculator', slug: 'calculator', icon: Calculator, headingKey: 'calculator.heading', descriptionKey: 'calculator.description' },
  { key: 'appearance', slug: 'appearance', icon: Sun, headingKey: 'appearance.heading', descriptionKey: 'appearance.description' },
  { key: 'language', slug: 'language', icon: Globe, headingKey: 'language.heading', descriptionKey: 'language.description' },
];

const EMPTY_FORM = {
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
  defaultVatRate: 21,
  defaultPaymentTerms: 14,
  emailTemplate: '',
  calculatorEnabled: false,
  aiEnabled: true,
  aiApiKey: '',
  aiApiUrl: '',
  aiModel: '',
};

type FormState = typeof EMPTY_FORM;

function toFormState(result: Settings): FormState {
  return {
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
    defaultVatRate: result.defaultVatRate ?? 21,
    defaultPaymentTerms: result.defaultPaymentTerms ?? 14,
    emailTemplate: result.emailTemplate || '',
    calculatorEnabled: result.calculatorEnabled ?? false,
    aiEnabled: result.aiEnabled ?? true,
    aiApiKey: '',
    aiApiUrl: result.aiApiUrl || '',
    aiModel: result.aiModel || '',
  };
}

export default function Settings() {
  const { t } = useTranslation('settings');
  const { theme, setTheme } = useTheme();
  const { user, updateProfile, logout } = useAuth();
  const { section: slug } = useParams();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<'smtp' | 'imap' | null>(null);
  const [showPasswords, setShowPasswords] = useState({ smtp: false, imap: false, ai: false });

  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);
  // Last saved state — the save bar only appears once formData drifts from it
  const [savedForm, setSavedForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const result = await api.get('/settings');
      setSettings(result);
      const next = toFormState(result);
      setFormData(next);
      setSavedForm(next);
    } catch (error) {
      console.error('Failed to load settings:', error);
      toast.error(t('common:errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value, type } = e.target;
    const numericFields = ['smtpPort', 'imapPort', 'emailPollingInterval', 'defaultVatRate', 'defaultPaymentTerms'];

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

  /** Index toggles apply straight away — there is no Save button on the index */
  async function toggleFromIndex(name: 'calculatorEnabled') {
    const next = { ...formData, [name]: !formData[name] };
    setFormData(next);
    setSavedForm(next);

    try {
      await api.put('/settings', next);
      window.dispatchEvent(new Event('settings-updated'));
      toast.success(t('toast.saveSuccess'));
    } catch (err: unknown) {
      setFormData(formData);
      setSavedForm(formData);
      toast.error((err as Error).message || t('toast.saveFailed'));
    }
  }

  /** Language lives on the user record; PUT /auth/me replaces company fields, so send the whole profile */
  async function changeLanguage(language: 'cs' | 'en') {
    if (user?.language === language) return;

    try {
      await updateProfile({ ...user, language });
      toast.success(t('toast.saveSuccess'));
    } catch (err: unknown) {
      toast.error((err as Error).message || t('toast.saveFailed'));
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
    return <PageLoader />;
  }

  // No slug: the mobile index. Desktop ignores it and shows the first section.
  const activeSection = SECTIONS.find(s => s.slug === slug) ?? SECTIONS[0];
  const section = activeSection.key;
  const ContentContainer = section === 'exports' ? 'div' : 'form';
  const isDirty = section !== 'exports' && (Object.keys(EMPTY_FORM) as Array<keyof FormState>).some(key => formData[key] !== savedForm[key]);
  const themeLabel = t(`appearance.${theme}`);
  const languageLabel = t(`language.${user?.language === 'en' ? 'en' : 'cs'}`);

  const passwordField = (
    name: 'smtpPassword' | 'imapPassword' | 'aiApiKey',
    toggleKey: 'smtp' | 'imap' | 'ai',
    isSet: boolean | undefined,
    placeholder?: string
  ) => (
    <div className="relative">
      <input
        type={showPasswords[toggleKey] ? 'text' : 'password'}
        name={name}
        value={formData[name]}
        onChange={handleChange}
        className="input pr-10"
        placeholder={isSet ? '••••••••' : placeholder || ''}
      />
      <button
        type="button"
        onClick={() => setShowPasswords(p => ({ ...p, [toggleKey]: !p[toggleKey] }))}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-faint hover:text-text-secondary"
      >
        {showPasswords[toggleKey] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );

  const toggleRow = (name: 'smtpSecure' | 'imapTls' | 'aiEnabled' | 'calculatorEnabled', label: string, description?: string) => (
    <div className="flex items-center justify-between gap-5 py-1">
      <div>
        <p className="text-sm font-medium text-text">{label}</p>
        {description && <p className="text-xs text-text-faint mt-0.5">{description}</p>}
      </div>
      <label className="relative inline-flex items-center cursor-pointer shrink-0">
        <input
          type="checkbox"
          name={name}
          checked={formData[name] as boolean}
          onChange={handleChange}
          className="sr-only peer"
        />
        <span className="w-[34px] h-5 bg-border-strong rounded-full peer-checked:bg-accent transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-3.5" />
      </label>
    </div>
  );

  return (
    <>
      {/* Mobile index — one entry point to everything, including the profile */}
      {!slug && (
        <div className="lg:hidden" data-testid="settings-index">
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-text mb-[18px]">{t('title')}</h1>

          <Link
            to="/profile"
            className="flex items-center gap-3.5 bg-surface border border-border rounded-[20px] px-4 py-3.5 mb-[22px] active:bg-nav-hover transition-colors"
          >
            <span className="flex items-center justify-center h-11 w-11 rounded-full bg-accent-soft text-accent text-sm font-semibold shrink-0">
              {user?.name ? getInitials(user.name) : '—'}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-semibold text-text truncate">{user?.name}</span>
              <span className="block text-[13px] text-text-muted truncate">
                {[user?.email, user?.companyName].filter(Boolean).join(' · ')}
              </span>
            </span>
            <ChevronRight className="h-[18px] w-[18px] text-text-faint shrink-0" />
          </Link>

          <SettingsGroup caption={t('index.groups.business')} className="mb-[22px]">
            <SettingsRow
              icon={Building}
              tint="success"
              label={t('index.rows.companyDetails')}
              value={user?.vatPayer ? t('index.status.vatPayer') : t('index.status.nonVatPayer')}
              to="/profile/company"
            />
            <SettingsRow
              icon={Landmark}
              tint="success"
              label={t('index.rows.bankAndTax')}
              value={
                user?.pausalniDanEnabled
                  ? t('index.status.tier', { tier: user?.pausalniDanTier ?? 1 })
                  : user?.bankAccount || t('index.status.notSet')
              }
              to="/profile/bank"
            />
            <SettingsRow
              icon={Image}
              tint="accent"
              label={t('index.rows.companyLogo')}
              value={user?.hasLogo ? t('index.status.set') : t('index.status.none')}
              to="/profile/logo"
            />
          </SettingsGroup>

          <SettingsGroup caption={t('index.groups.invoicing')} className="mb-[22px]">
            <SettingsRow
              icon={FileText}
              tint="accent"
              label={t('index.rows.invoiceDefaults')}
              value={t('index.status.invoiceDefaults', {
                vat: formData.defaultVatRate,
                days: formData.defaultPaymentTerms,
                count: Number(formData.defaultPaymentTerms),
              })}
              to="/settings/invoicing"
            />
            <SettingsRow icon={Download} tint="accent" label={t('exports.heading')} to="/settings/exports" />
            <SettingsRow
              icon={Mail}
              tint="accent"
              label={t('index.rows.emailSending')}
              value={
                <StatusValue
                  connected={Boolean(formData.smtpHost)}
                  label={formData.smtpHost ? t('index.status.connected') : t('index.status.notSetUp')}
                />
              }
              to="/settings/email"
            />
            <SettingsRow
              icon={Server}
              tint="accent"
              label={t('index.rows.bankMatching')}
              value={
                <StatusValue
                  connected={Boolean(formData.imapHost)}
                  label={formData.imapHost ? t('index.status.connected') : t('index.status.off')}
                />
              }
              to="/settings/bank-matching"
            />
          </SettingsGroup>

          <SettingsGroup caption={t('index.groups.app')} className="mb-[22px]">
            <SettingsRow icon={Sun} label={t('index.rows.appearance')} value={themeLabel} to="/settings/appearance" />
            <SettingsRow icon={Globe} label={t('index.rows.language')} value={languageLabel} to="/settings/language" />
            {/* Drills in rather than toggling: the API key, URL and model live behind it */}
            <SettingsRow
              icon={Sparkles}
              tint="accent"
              label={t('index.rows.ai')}
              value={formData.aiEnabled ? t('index.status.on') : t('index.status.off')}
              to="/settings/ai"
            />
            <SettingsRow
              icon={Calculator}
              label={t('index.rows.calculator')}
              value={
                <RowToggle
                  checked={formData.calculatorEnabled}
                  onChange={() => toggleFromIndex('calculatorEnabled')}
                  label={t('calculator.enable')}
                />
              }
              chevron={false}
            />
          </SettingsGroup>

          <SettingsGroup className="mb-4">
            <SettingsRow icon={Lock} label={t('index.rows.changePassword')} to="/profile/password" />
            <SettingsRow
              icon={LogOut}
              tint="danger"
              label={t('index.rows.logout')}
              onClick={logout}
              danger
              chevron={false}
            />
          </SettingsGroup>

        </div>
      )}

      {/* Section detail on mobile; the full two-column layout on desktop */}
      <div className={!slug ? 'hidden lg:block' : ''}>
        {slug && (
          <SettingsBackHeader to="/settings" backLabel={t('title')} title={t(activeSection.headingKey)} />
        )}
        <div className="space-y-5">
          <h1 className="hidden lg:block text-2xl font-bold tracking-[-0.02em] text-text">{t('title')}</h1>

          <div className="lg:grid lg:grid-cols-[230px_1fr] lg:gap-6 lg:items-start">
          {/* Secondary nav — surface-sunken active state, deliberately not indigo */}
          <nav className="hidden lg:block space-y-1">
            {SECTIONS.map(({ key, slug: sectionSlug, icon: Icon, headingKey }) => (
              <Link
                key={key}
                to={`/settings/${sectionSlug}`}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-[10px] text-sm transition-colors text-left ${
                  section === key
                    ? 'bg-surface-sunken text-text font-medium'
                    : 'text-text-secondary hover:bg-nav-hover hover:text-text'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {t(headingKey)}
              </Link>
            ))}
          </nav>

          {/* Content */}
          <ContentContainer onSubmit={section === 'exports' ? undefined : handleSubmit} className="space-y-4 min-w-0">
            {/* Page head — on mobile the section title sits in the back header */}
            <div>
              <h2 className="hidden lg:block text-xl font-bold tracking-[-0.02em] text-text">{t(activeSection.headingKey)}</h2>
              <p className="lg:mt-1 text-[13px] text-text-muted">{t(activeSection.descriptionKey)}</p>
            </div>

            {section === 'exports' && <AccountantExport />}

            {section === 'invoiceDefaults' && (
              <div className="card">
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
                    <p className="text-xs text-text-faint mt-1">{t('invoiceDefaults.vatRateHelp')}</p>
                  </div>
                  <div>
                    <label className="label">{t('invoiceDefaults.paymentTerms')}</label>
                    <input
                      type="number"
                      name="defaultPaymentTerms"
                      value={formData.defaultPaymentTerms}
                      onChange={handleChange}
                      className="input tabular-nums"
                      min={1}
                    />
                    <p className="text-xs text-text-faint mt-1">{t('invoiceDefaults.paymentTermsHelp')}</p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">{t('invoiceDefaults.invoiceNumberPrefix')}</label>
                    <input
                      type="text"
                      name="invoiceNumberPrefix"
                      value={formData.invoiceNumberPrefix}
                      onChange={handleChange}
                      className="input font-mono"
                      placeholder={t('invoiceDefaults.invoiceNumberPrefixPlaceholder')}
                    />
                  </div>
                </div>
              </div>
            )}

            {section === 'emailSending' && (
              <>
                <div className="card">
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
                        className="input tabular-nums"
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
                      {passwordField('smtpPassword', 'smtp', settings?.smtpPasswordSet)}
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

                  <div className="mt-4 pt-4 border-t border-hairline space-y-3">
                    {toggleRow('smtpSecure', t('smtp.useTls'))}
                    <button
                      type="button"
                      onClick={() => testConnection('smtp')}
                      disabled={testing === 'smtp' || !formData.smtpHost}
                      className="btn btn-secondary w-full sm:w-auto"
                    >
                      {testing === 'smtp' ? t('smtp.testing') : t('smtp.testConnection')}
                    </button>
                  </div>
                </div>

                <div className="card">
                  <h3 className="text-[15px] font-semibold text-text mb-1">{t('emailTemplate.heading')}</h3>
                  <p className="text-[13px] text-text-muted mb-3">{t('emailTemplate.variablesHelp')}</p>
                  <textarea
                    name="emailTemplate"
                    value={formData.emailTemplate}
                    onChange={handleChange}
                    className="input"
                    rows={6}
                    placeholder={t('emailTemplate.placeholder')}
                  />
                </div>
              </>
            )}

            {section === 'bankMatching' && (
              <div className="card">
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
                      className="input tabular-nums"
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
                    {passwordField('imapPassword', 'imap', settings?.imapPasswordSet)}
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
                    <p className="text-xs text-text-faint mt-1">{t('imap.bankNotificationEmailHelp')}</p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-hairline space-y-3">
                  {toggleRow('imapTls', t('imap.useTls'))}
                  <button
                    type="button"
                    onClick={() => testConnection('imap')}
                    disabled={testing === 'imap' || !formData.imapHost}
                    className="btn btn-secondary w-full sm:w-auto"
                  >
                    {testing === 'imap' ? t('imap.testing') : t('imap.testConnection')}
                  </button>
                </div>
              </div>
            )}

            {section === 'ai' && (
              <div className="card space-y-4">
                {toggleRow('aiEnabled', t('ai.enableAi'))}
                <div className="pt-4 border-t border-hairline space-y-4">
                  <div>
                    <label className="label">{t('ai.apiKeyLabel')} {settings?.aiApiKeySet && t('ai.apiKeySet')}</label>
                    {passwordField('aiApiKey', 'ai', settings?.aiApiKeySet, t('ai.apiKeyPlaceholder'))}
                    <p className="text-xs text-text-faint mt-1">
                      {t('ai.apiKeyHelp')}{' '}
                      <a
                        href="https://openrouter.ai/settings/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent-link hover:underline"
                      >
                        {t('ai.apiKeyLink')}
                      </a>
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="label">{t('ai.apiUrlLabel')}</label>
                      <input
                        type="text"
                        name="aiApiUrl"
                        value={formData.aiApiUrl}
                        onChange={handleChange}
                        className="input font-mono"
                        placeholder="https://openrouter.ai/api/v1"
                      />
                      <p className="text-xs text-text-faint mt-1">{t('ai.apiUrlHelp')}</p>
                    </div>
                    <div>
                      <label className="label">{t('ai.modelLabel')}</label>
                      <input
                        type="text"
                        name="aiModel"
                        value={formData.aiModel}
                        onChange={handleChange}
                        className="input font-mono"
                        placeholder="openai/gpt-5.6-luna"
                      />
                      <p className="text-xs text-text-faint mt-1">{t('ai.modelHelp')}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {section === 'appearance' && (
              <div className="card">
                {/* Stacks below sm — side by side the segmented control would overflow the card */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
                  <div>
                    <p className="text-sm font-medium text-text">{t('appearance.themeLabel')}</p>
                    <p className="text-xs text-text-faint mt-0.5">{t('appearance.themeHelp')}</p>
                  </div>
                  <div className="grid grid-cols-3 bg-surface-sunken rounded-[9px] p-[3px] sm:flex sm:shrink-0">
                    {([
                      { value: 'light' as const, icon: Sun, label: t('appearance.light') },
                      { value: 'dark' as const, icon: Moon, label: t('appearance.dark') },
                      { value: 'system' as const, icon: Monitor, label: t('appearance.system') },
                    ]).map(({ value, icon: Icon, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setTheme(value)}
                        className={`flex items-center justify-center gap-1.5 min-w-0 px-2.5 sm:px-3 py-1.5 text-[13px] font-medium rounded-[7px] transition-colors ${
                          theme === value
                            ? 'bg-surface shadow-[0_1px_2px_rgba(20,22,40,.08)] text-text'
                            : 'text-text-muted hover:text-text'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {section === 'language' && (
              <div className="bg-surface border border-border rounded-[20px] overflow-hidden">
                {(['cs', 'en'] as const).map((code, i) => (
                  <div key={code}>
                    {i > 0 && <div className="h-px bg-hairline ml-4" />}
                    <button
                      type="button"
                      onClick={() => changeLanguage(code)}
                      className="w-full flex items-center gap-3 px-4 py-[13px] min-h-[44px] text-left active:bg-nav-hover transition-colors"
                    >
                      <span className="flex-1 text-[15px] text-text">{t(`language.${code}`)}</span>
                      {(user?.language === 'en' ? 'en' : 'cs') === code && <Check className="h-4 w-4 text-accent" />}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {section === 'calculator' && (
              <div className="card">
                {toggleRow('calculatorEnabled', t('calculator.enable'), t('calculator.description'))}
              </div>
            )}

            {/* Room for the save bar so it never covers the last field */}
            {isDirty && <div className="h-16" aria-hidden />}

            {/* Appearance and language apply on change; every other section saves from the bar */}
            <StickySaveBar
              show={isDirty}
              saving={saving}
              saveLabel={t('actions.save')}
              savingLabel={t('actions.saving')}
              message={t('actions.unsavedChanges')}
              discardLabel={t('actions.discard')}
              onDiscard={() => setFormData(savedForm)}
            />
          </ContentContainer>
          </div>
        </div>
      </div>
    </>
  );
}
