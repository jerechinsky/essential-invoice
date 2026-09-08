import { useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { User, Building, Upload, Trash2, Image, Landmark, ShieldAlert, Lock, AlertTriangle } from 'lucide-react';
import StickySaveBar from '../components/StickySaveBar';
import { SettingsGroup, SettingsRow, SettingsBackHeader } from '../components/SettingsList';
import { getInitials } from '../utils/format';

const EMPTY_PASSWORDS = { currentPassword: '', newPassword: '', confirmPassword: '' };

type SectionKey = 'personal' | 'company' | 'bank' | 'logo' | 'password' | 'danger';

export default function Profile() {
  const { t } = useTranslation('profile');
  const { user, token, updateProfile, refreshUser, logout } = useAuth();
  const { section: slug } = useParams();
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoKey, setLogoKey] = useState(() => Date.now());

  const logoUrl = useMemo(() => {
    if (!token) return '';
    return `/api/auth/me/logo?token=${encodeURIComponent(token)}&v=${logoKey}`;
  }, [token, logoKey]);

  const initialFormData = {
    name: user?.name || '',
    companyName: user?.companyName || '',
    companyIco: user?.companyIco || '',
    companyDic: user?.companyDic || '',
    companyAddress: user?.companyAddress || '',
    companyRegisterInfo: user?.companyRegisterInfo || '',
    bankAccount: user?.bankAccount || '',
    bankCode: user?.bankCode || '',
    language: user?.language || 'cs',
    vatPayer: user?.vatPayer ?? false,
    pausalniDanEnabled: user?.pausalniDanEnabled ?? false,
    pausalniDanTier: user?.pausalniDanTier ?? 1,
    pausalniDanLimit: user?.pausalniDanLimit ?? 1000000,
  };

  const [formData, setFormData] = useState(initialFormData);
  // Last saved state — the save bar only appears once formData drifts from it
  const [savedForm, setSavedForm] = useState(initialFormData);

  const [passwordData, setPasswordData] = useState(EMPTY_PASSWORDS);

  const isDirty = (Object.keys(savedForm) as Array<keyof typeof savedForm>).some(
    key => formData[key] !== savedForm[key]
  );
  const passwordDirty = Object.values(passwordData).some(value => value !== '');

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const target = e.target;
    const value = target.type === 'checkbox' ? (target as HTMLInputElement).checked : target.value;
    setFormData({ ...formData, [target.name]: value });
  }

  function handleTierChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const tier = parseInt(e.target.value);
    const defaultLimits: { [key: number]: number } = { 1: 1000000, 2: 1500000, 3: 2000000 };
    setFormData(prev => ({
      ...prev,
      pausalniDanTier: tier,
      pausalniDanLimit: defaultLimits[tier]
    }));
  }

  function handlePasswordChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPasswordData({ ...passwordData, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile(formData);
      setSavedForm(formData);
      toast.success(t('toast.profileUpdated'));
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || t('toast.profileUpdateFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error(t('toast.passwordsDoNotMatch'));
      return;
    }

    if (passwordData.newPassword.length < 8) {
      toast.error(t('toast.passwordTooShort'));
      return;
    }

    setChangingPassword(true);

    try {
      await api.post('/auth/change-password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      toast.success(t('toast.passwordChanged'));
      setPasswordData(EMPTY_PASSWORDS);
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || t('toast.passwordChangeFailed'));
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      toast.error(t('logo.allowedTypes'));
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error(t('logo.maxSize'));
      return;
    }

    setUploadingLogo(true);

    try {
      await api.uploadFile('/auth/me/logo', file, 'logo');
      await refreshUser();
      setLogoKey(Date.now());
      toast.success(t('toast.logoUploaded'));
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || t('toast.logoUploadFailed'));
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleLogoDelete() {
    if (!confirm(t('logo.deleteConfirm'))) return;

    setUploadingLogo(true);

    try {
      await api.delete('/auth/me/logo');
      await refreshUser();
      setLogoKey(Date.now());
      toast.success(t('toast.logoDeleted'));
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || t('toast.logoDeleteFailed'));
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeletingAccount(true);

    try {
      await api.delete('/auth/me', { password: deletePassword });
      logout();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || t('toast.accountDeleteFailed'));
      setDeletingAccount(false);
    }
  }

  /** Sections are routes (`/profile/<slug>`) so mobile can drill in and back out */
  const SECTIONS: Array<{ key: SectionKey; icon: typeof User; label: string }> = [
    { key: 'personal', icon: User, label: t('personal.heading') },
    { key: 'company', icon: Building, label: t('company.heading') },
    { key: 'bank', icon: Landmark, label: t('bank.heading') },
    { key: 'logo', icon: Image, label: t('logo.heading') },
    { key: 'password', icon: Lock, label: t('password.heading') },
    { key: 'danger', icon: AlertTriangle, label: t('dangerZone.heading') },
  ];

  const activeSection = SECTIONS.find(s => s.key === slug) ?? SECTIONS[0];
  const section = activeSection.key;

  const deleteModal = showDeleteModal && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-[18px] shadow-xl max-w-md w-full p-6 space-y-4">
        <h3 className="text-lg font-semibold text-danger">{t('dangerZone.deleteModalTitle')}</h3>
        <p className="text-sm text-text-muted">
          {t('dangerZone.deleteModalDescription')}
        </p>
        <ul className="text-sm text-text-muted list-disc list-inside space-y-1">
          <li>{t('dangerZone.deleteModalInvoices')}</li>
          <li>{t('dangerZone.deleteModalClients')}</li>
          <li>{t('dangerZone.deleteModalExpenses')}</li>
          <li>{t('dangerZone.deleteModalPayments')}</li>
          <li>{t('dangerZone.deleteModalSettings')}</li>
        </ul>
        <form onSubmit={handleDeleteAccount} className="space-y-4">
          <div>
            <label className="label">{t('dangerZone.deleteModalPasswordLabel')}</label>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              className="input"
              required
              autoFocus
            />
          </div>
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => { setShowDeleteModal(false); setDeletePassword(''); }}
              className="btn btn-secondary"
              disabled={deletingAccount}
            >
              {t('dangerZone.deleteModalCancel')}
            </button>
            <button
              type="submit"
              disabled={deletingAccount || !deletePassword}
              className="btn btn-danger"
            >
              {deletingAccount ? t('dangerZone.deleteModalDeleting') : t('dangerZone.deleteModalConfirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile index — the profile at a glance, each row drilling into one section */}
      {!slug && (
        <div className="lg:hidden" data-testid="profile-index">
          <SettingsBackHeader to="/settings" backLabel={t('settings:title')} title={t('title')} />

          <div className="flex flex-col items-center gap-2.5 mb-6">
            <span className="flex items-center justify-center h-[72px] w-[72px] rounded-full bg-accent-soft text-accent text-[22px] font-semibold">
              {user?.name ? getInitials(user.name) : '—'}
            </span>
            <span className="text-[13px] text-text-muted">{user?.email}</span>
          </div>

          <SettingsGroup caption={t('index.groups.personal')} inset="label" className="mb-[22px]">
            <SettingsRow leadingLabel={t('index.rows.name')} label={user?.name || '—'} to="/profile/personal" />
            {/* Language is not repeated here — it lives in Settings → Language */}
            <SettingsRow
              leadingLabel={t('index.rows.email')}
              label={user?.email || '—'}
              trailingIcon={Lock}
              chevron={false}
            />
          </SettingsGroup>

          <SettingsGroup caption={t('index.groups.company')} inset="label" className="mb-2">
            <SettingsRow
              label={t('index.rows.companyDetails')}
              value={user?.companyName || t('index.status.notSet')}
              to="/profile/company"
            />
            <SettingsRow
              label={t('index.rows.bankAccount')}
              value={user?.bankAccount ? `${user.bankAccount}${user.bankCode ? `/${user.bankCode}` : ''}` : t('index.status.notSet')}
              to="/profile/bank"
            />
            <SettingsRow
              label={t('index.rows.flatRateTax')}
              value={user?.pausalniDanEnabled ? t('index.status.tier', { tier: user?.pausalniDanTier ?? 1 }) : t('index.status.off')}
              to="/profile/bank"
            />
            <SettingsRow
              label={t('index.rows.companyLogo')}
              value={
                user?.hasLogo ? (
                  <img src={logoUrl} alt={t('logo.altText')} className="w-[52px] h-6 object-contain border border-border rounded-[6px] bg-surface" />
                ) : (
                  t('index.status.none')
                )
              }
              to="/profile/logo"
            />
          </SettingsGroup>
          <p className="px-1.5 mb-[22px] text-xs leading-relaxed text-text-faint">{t('company.description')}</p>

          <SettingsGroup caption={t('index.groups.security')} inset="label" className="mb-[22px]">
            <SettingsRow label={t('password.heading')} to="/profile/password" />
            <SettingsRow label={t('dangerZone.deleteAccount')} onClick={() => setShowDeleteModal(true)} danger />
          </SettingsGroup>
        </div>
      )}

      {/* Section detail on mobile; the full two-column layout on desktop */}
      <div className={!slug ? 'hidden lg:block' : ''}>
        {slug && <SettingsBackHeader to="/profile" backLabel={t('title')} title={activeSection.label} />}
        <div className="space-y-5">
          <h1 className="hidden lg:block text-2xl font-bold tracking-[-0.02em] text-text">{t('title')}</h1>

          <div className="lg:grid lg:grid-cols-[230px_1fr] lg:gap-6 lg:items-start">
          {/* Secondary nav — surface-sunken active state, not indigo */}
          <nav className="hidden lg:block space-y-1">
            {SECTIONS.map(({ key, icon: Icon, label }) => (
              <Link
                key={key}
                to={`/profile/${key}`}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-[10px] text-sm transition-colors text-left ${
                  section === key
                    ? 'bg-surface-sunken text-text font-medium'
                    : key === 'danger'
                      ? 'text-danger hover:bg-nav-hover'
                      : 'text-text-secondary hover:bg-nav-hover hover:text-text'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="space-y-4 min-w-0">

      {(section === 'personal' || section === 'company' || section === 'bank') && (
      <form onSubmit={handleSubmit} className="card space-y-6">
        {section === 'personal' && (<>
        <div className="hidden lg:flex items-center space-x-3">
          <div className="p-2 bg-accent-soft rounded-lg">
            <User className="h-5 w-5 text-accent" />
          </div>
          <h2 className="text-[15px] font-semibold text-text">{t('personal.heading')}</h2>
        </div>

        <div>
          <label className="label">{t('personal.name')}</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="input"
            required
          />
        </div>

        <div>
          <label className="label">{t('personal.email')}</label>
          <input
            type="email"
            value={user?.email || ''}
            className="input bg-surface-sunken"
            disabled
          />
          <p className="text-xs text-text-muted mt-1">{t('personal.emailReadonly')}</p>
        </div>

        </>)}

        {section === 'company' && (<>

        <div className="hidden lg:flex items-center space-x-3">
          <div className="p-2 bg-success-bg rounded-lg">
            <Building className="h-5 w-5 text-success" />
          </div>
          <h2 className="text-[15px] font-semibold text-text">{t('company.heading')}</h2>
        </div>

        <p className="text-sm text-text-muted">
          {t('company.description')}
        </p>

        <div>
          <label className="label">{t('company.companyName')}</label>
          <input
            type="text"
            name="companyName"
            value={formData.companyName}
            onChange={handleChange}
            className="input"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">{t('company.ico')}</label>
            <input
              type="text"
              name="companyIco"
              value={formData.companyIco}
              onChange={handleChange}
              className="input"
              maxLength={8}
            />
          </div>
          <div>
            <label className="label">{t('company.dic')}</label>
            <input
              type="text"
              name="companyDic"
              value={formData.companyDic}
              onChange={handleChange}
              className="input"
              disabled={!formData.vatPayer}
            />
            {!formData.vatPayer && (
              <p className="text-xs text-text-muted mt-1">{t('company.dicNotRequired')}</p>
            )}
          </div>
        </div>

        <div className="flex items-start space-x-3 p-4 bg-accent-tint rounded-lg border border-accent-soft">
          <input
            type="checkbox"
            id="vatPayer"
            name="vatPayer"
            checked={formData.vatPayer}
            onChange={handleChange}
            className="mt-1 h-4 w-4 text-accent border-border-strong rounded-sm focus:border-accent"
          />
          <div className="flex-1">
            <label htmlFor="vatPayer" className="text-sm font-medium text-text cursor-pointer">
              {t('company.vatPayer')}
            </label>
            <p className="text-xs text-text-muted mt-1">
              {t('company.vatPayerHelp')}
            </p>
          </div>
        </div>

        <div>
          <label className="label">{t('company.address')}</label>
          <textarea
            name="companyAddress"
            value={formData.companyAddress}
            onChange={handleChange}
            className="input"
            rows={2}
          />
        </div>

        <div>
          <label htmlFor="companyRegisterInfo" className="label">{t('company.registerInfo')}</label>
          <textarea
            id="companyRegisterInfo"
            name="companyRegisterInfo"
            value={formData.companyRegisterInfo}
            onChange={handleChange}
            className="input"
            rows={3}
            maxLength={500}
            placeholder={t('company.registerInfoPlaceholder')}
            aria-describedby="companyRegisterInfoHelp"
          />
          <p id="companyRegisterInfoHelp" className="text-xs text-text-muted mt-1">{t('company.registerInfoHelp')}</p>
        </div>

        </>)}

        {section === 'bank' && (<>

        <div className="hidden lg:flex items-center space-x-3">
          <div className="p-2 bg-success-bg rounded-lg">
            <Landmark className="h-5 w-5 text-success" />
          </div>
          <h2 className="text-[15px] font-semibold text-text">{t('bank.heading')}</h2>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">{t('company.bankAccount')}</label>
            <input
              type="text"
              name="bankAccount"
              value={formData.bankAccount}
              onChange={handleChange}
              className="input"
              placeholder={t('company.bankAccountPlaceholder')}
            />
          </div>
          <div>
            <label className="label">{t('company.bankCode')}</label>
            <input
              type="text"
              name="bankCode"
              value={formData.bankCode}
              onChange={handleChange}
              className="input"
              placeholder={t('company.bankCodePlaceholder')}
              maxLength={4}
            />
          </div>
        </div>

        <hr className="border-hairline" />

        {/* Paušální daň section */}
        <div id="pausalni-dan" className="flex items-center space-x-3 scroll-mt-6">
          <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
            <Landmark className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-[15px] font-semibold text-text">{t('pausalniDan.heading')}</h2>
        </div>

        <p className="text-sm text-text-muted">
          {t('pausalniDan.description')}
        </p>

        <div className="space-y-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              name="pausalniDanEnabled"
              checked={formData.pausalniDanEnabled}
              onChange={handleChange}
              className="rounded-sm border-border-strong text-accent"
            />
            <span className="text-sm text-text-muted">{t('pausalniDan.enable')}</span>
          </label>

          {formData.pausalniDanEnabled && (
            <>
              <div>
                <label className="label">{t('pausalniDan.tierLabel')}</label>
                <select
                  name="pausalniDanTier"
                  value={formData.pausalniDanTier}
                  onChange={handleTierChange}
                  className="input"
                >
                  <option value={1}>{t('pausalniDan.tier1')}</option>
                  <option value={2}>{t('pausalniDan.tier2')}</option>
                  <option value={3}>{t('pausalniDan.tier3')}</option>
                </select>
                <p className="text-xs text-text-muted mt-1">
                  {t('pausalniDan.tierHelp')}
                </p>
              </div>

              <div>
                <label className="label">{t('pausalniDan.limitLabel')}</label>
                <select
                  name="pausalniDanLimit"
                  value={formData.pausalniDanLimit}
                  onChange={handleChange}
                  className="input"
                >
                  {formData.pausalniDanTier === 1 && (
                    <>
                      <option value={1000000}>{t('pausalniDan.limit1m')}</option>
                      <option value={1500000}>{t('pausalniDan.limit1_5m_60_80')}</option>
                      <option value={2000000}>{t('pausalniDan.limit2m_80')}</option>
                    </>
                  )}
                  {formData.pausalniDanTier === 2 && (
                    <>
                      <option value={1500000}>{t('pausalniDan.limit1_5m_basic')}</option>
                      <option value={2000000}>{t('pausalniDan.limit2m_pausal')}</option>
                    </>
                  )}
                  {formData.pausalniDanTier === 3 && (
                    <option value={2000000}>{t('pausalniDan.limit2m')}</option>
                  )}
                </select>
                <p className="text-xs text-text-muted mt-1">
                  {t('pausalniDan.limitHelp')}
                </p>
              </div>
            </>
          )}
        </div>

        </>)}

        <StickySaveBar
          show={isDirty}
          saving={saving}
          saveLabel={t('actions.save')}
          savingLabel={t('actions.saving')}
          message={t('actions.unsavedChanges')}
          discardLabel={t('actions.discard')}
          onDiscard={() => setFormData(savedForm)}
        />
      </form>
      )}

      {section === 'logo' && (
      <div className="card space-y-6">
        <div className="hidden lg:flex items-center space-x-3">
          <div className="p-2 bg-accent-soft rounded-lg">
            <Image className="h-5 w-5 text-accent" />
          </div>
          <h2 className="text-[15px] font-semibold text-text">{t('logo.heading')}</h2>
        </div>

        <p className="text-sm text-text-muted">
          {t('logo.description')}
        </p>

        <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
          {/* Logo preview */}
          <div className="shrink-0">
            {user?.hasLogo ? (
              <div className="relative">
                <img
                  src={logoUrl}
                  alt={t('logo.altText')}
                  className="w-32 sm:w-48 h-24 object-contain border border-border rounded-lg bg-surface p-2"
                />
              </div>
            ) : (
              <div className="w-32 sm:w-48 h-24 border-2 border-dashed border-border-strong rounded-lg flex items-center justify-center bg-surface-sunken">
                <span className="text-text-faint text-sm">{t('logo.noLogo')}</span>
              </div>
            )}
          </div>

          {/* Upload controls */}
          <div className="flex-1 space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml"
              onChange={handleLogoUpload}
              className="hidden"
              id="logo-upload"
            />
            <div className="flex flex-wrap gap-2">
              <label
                htmlFor="logo-upload"
                className={`btn btn-secondary flex items-center space-x-2 cursor-pointer ${uploadingLogo ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <Upload className="h-4 w-4" />
                <span>{uploadingLogo ? t('logo.uploading') : user?.hasLogo ? t('logo.changeLogo') : t('logo.uploadLogo')}</span>
              </label>
              {user?.hasLogo && (
                <button
                  type="button"
                  onClick={handleLogoDelete}
                  disabled={uploadingLogo}
                  className="btn btn-danger flex items-center space-x-2"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>{t('logo.deleteLogo')}</span>
                </button>
              )}
            </div>
            <p className="text-xs text-text-muted">
              {t('logo.recommendedSize')}
            </p>
          </div>
        </div>
      </div>

      )}

      {section === 'password' && (
      <form onSubmit={handlePasswordSubmit} className="card space-y-6">
        <h2 className="hidden lg:block text-[15px] font-semibold text-text">{t('password.heading')}</h2>

        <div>
          <label className="label">{t('password.currentPassword')}</label>
          <input
            type="password"
            name="currentPassword"
            value={passwordData.currentPassword}
            onChange={handlePasswordChange}
            className="input"
            required
          />
        </div>

        <div>
          <label className="label">{t('password.newPassword')}</label>
          <input
            type="password"
            name="newPassword"
            value={passwordData.newPassword}
            onChange={handlePasswordChange}
            className="input"
            required
            minLength={8}
          />
        </div>

        <div>
          <label className="label">{t('password.confirmPassword')}</label>
          <input
            type="password"
            name="confirmPassword"
            value={passwordData.confirmPassword}
            onChange={handlePasswordChange}
            className="input"
            required
          />
        </div>

        <StickySaveBar
          show={passwordDirty}
          saving={changingPassword}
          saveLabel={t('password.change')}
          savingLabel={t('password.changing')}
          message={t('actions.unsavedChanges')}
          discardLabel={t('actions.discard')}
          onDiscard={() => setPasswordData(EMPTY_PASSWORDS)}
        />
      </form>
      )}

      {section === 'danger' && (
      <div className="card space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center h-9 w-9 rounded-[10px] bg-danger-bg shrink-0">
            <ShieldAlert className="h-4 w-4 text-danger" />
          </span>
          <h2 className="text-[15px] font-semibold text-text">{t('dangerZone.heading')}</h2>
        </div>

        <p className="text-[13px] text-text-muted">
          {t('dangerZone.description')}
        </p>

        {/* Destructive actions stay text links throughout the app */}
        <button
          type="button"
          onClick={() => setShowDeleteModal(true)}
          className="text-[13px] font-medium text-danger hover:underline"
        >
          {t('dangerZone.deleteAccount')}
        </button>
      </div>
      )}

          {/* Room for the save bar so it never covers the last field */}
          {(isDirty || passwordDirty) && <div className="h-16" aria-hidden />}
          </div>
          </div>
        </div>
      </div>

      {deleteModal}
    </>
  );
}
