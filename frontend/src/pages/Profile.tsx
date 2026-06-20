import { useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { User, Building, Upload, Trash2, Image, Landmark, ShieldAlert } from 'lucide-react';

export default function Profile() {
  const { t } = useTranslation('profile');
  const { user, token, updateProfile, refreshUser, logout } = useAuth();
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

  const [formData, setFormData] = useState({
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
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

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
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>

      {/* Profile form */}
      <form onSubmit={handleSubmit} className="card space-y-6">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
            <User className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('personal.heading')}</h2>
        </div>

        <div>
          <label className="label">{t('language.label')}</label>
          <select
            name="language"
            value={formData.language || 'cs'}
            onChange={handleChange}
            className="input"
          >
            <option value="cs">{t('language.cs')}</option>
            <option value="en">{t('language.en')}</option>
          </select>
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
            className="input bg-gray-50 dark:bg-gray-700"
            disabled
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('personal.emailReadonly')}</p>
        </div>

        <hr className="dark:border-gray-700" />

        <div className="flex items-center space-x-3">
          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <Building className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('company.heading')}</h2>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400">
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
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('company.dicNotRequired')}</p>
            )}
          </div>
        </div>

        <div className="flex items-start space-x-3 p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg border border-indigo-200 dark:border-indigo-800">
          <input
            type="checkbox"
            id="vatPayer"
            name="vatPayer"
            checked={formData.vatPayer}
            onChange={handleChange}
            className="mt-1 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
          />
          <div className="flex-1">
            <label htmlFor="vatPayer" className="text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer">
              {t('company.vatPayer')}
            </label>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
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
          <label className="label">{t('company.registerInfo')}</label>
          <textarea
            name="companyRegisterInfo"
            value={formData.companyRegisterInfo}
            onChange={handleChange}
            className="input"
            rows={2}
            placeholder={t('company.registerInfoPlaceholder')}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('company.registerInfoHelp')}</p>
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

        <hr className="dark:border-gray-700" />

        {/* Paušální daň section */}
        <div id="pausalni-dan" className="flex items-center space-x-3 scroll-mt-6">
          <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
            <Landmark className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('pausalniDan.heading')}</h2>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('pausalniDan.description')}
        </p>

        <div className="space-y-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              name="pausalniDanEnabled"
              checked={formData.pausalniDanEnabled}
              onChange={handleChange}
              className="rounded border-gray-300 text-indigo-600"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">{t('pausalniDan.enable')}</span>
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
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
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
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('pausalniDan.limitHelp')}
                </p>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? t('actions.saving') : t('actions.save')}
          </button>
        </div>
      </form>

      {/* Logo upload */}
      <div className="card space-y-6">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <Image className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('logo.heading')}</h2>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('logo.description')}
        </p>

        <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
          {/* Logo preview */}
          <div className="flex-shrink-0">
            {user?.hasLogo ? (
              <div className="relative">
                <img
                  src={logoUrl}
                  alt={t('logo.altText')}
                  className="w-32 sm:w-48 h-24 object-contain border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-700 p-2"
                />
              </div>
            ) : (
              <div className="w-32 sm:w-48 h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center bg-gray-50 dark:bg-gray-800">
                <span className="text-gray-400 text-sm">{t('logo.noLogo')}</span>
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
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('logo.recommendedSize')}
            </p>
          </div>
        </div>
      </div>

      {/* Password change */}
      <form onSubmit={handlePasswordSubmit} className="card space-y-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('password.heading')}</h2>

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

        <div className="flex justify-end">
          <button type="submit" disabled={changingPassword} className="btn btn-primary">
            {changingPassword ? t('password.changing') : t('password.change')}
          </button>
        </div>
      </form>

      {/* Danger Zone */}
      <div className="border-2 border-red-200 dark:border-red-800 rounded-lg p-4 sm:p-6 space-y-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
            <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-lg font-semibold text-red-900 dark:text-red-400">{t('dangerZone.heading')}</h2>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t('dangerZone.description')}
        </p>

        <button
          type="button"
          onClick={() => setShowDeleteModal(true)}
          className="btn btn-danger"
        >
          {t('dangerZone.deleteAccount')}
        </button>
      </div>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-red-900 dark:text-red-400">{t('dangerZone.deleteModalTitle')}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('dangerZone.deleteModalDescription')}
            </p>
            <ul className="text-sm text-gray-600 dark:text-gray-400 list-disc list-inside space-y-1">
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
      )}
    </div>
  );
}
