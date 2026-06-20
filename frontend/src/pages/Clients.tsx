import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDialogKeyboard } from '../hooks/useDialogKeyboard';
import { toast } from 'sonner';
import { api } from '../utils/api';
import { formatCurrency } from '../utils/format';
import { Plus, Search, Users, Building, Edit, Trash2, X } from 'lucide-react';

interface Client {
  id: string;
  companyName: string;
  primaryEmail: string;
  secondaryEmail: string | null;
  address: string;
  ico: string;
  dic: string;
  contactPerson: string;
  contactPhone: string;
  notes: string;
  invoiceCount: number;
  totalPaid: number;
}

export default function Clients() {
  const { t } = useTranslation('clients');
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [aresLoading, setAresLoading] = useState(false);
  useDialogKeyboard(showModal, () => setShowModal(false));

  const [formData, setFormData] = useState({
    companyName: '',
    primaryEmail: '',
    secondaryEmail: '',
    address: '',
    ico: '',
    dic: '',
    contactPerson: '',
    contactPhone: '',
    notes: '',
  });

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    try {
      const result = await api.get('/clients');
      setClients(result);
    } catch (error) {
      console.error('Failed to load clients:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  }

  async function handleAresLookup() {
    if (!formData.ico || formData.ico.length !== 8) {
      toast.error(t('modal.ares.icoValidation'));
      return;
    }

    setAresLoading(true);
    try {
      const result = await api.get(`/ares/lookup/${formData.ico}`);
      setFormData(prev => ({
        ...prev,
        companyName: result.companyName || prev.companyName,
        address: result.address || prev.address,
        dic: result.dic || prev.dic,
      }));
      toast.success(t('modal.ares.success'));
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || t('modal.ares.failed'));
    } finally {
      setAresLoading(false);
    }
  }

  function openCreateModal() {
    setEditingClient(null);
    setFormData({
      companyName: '',
      primaryEmail: '',
      secondaryEmail: '',
      address: '',
      ico: '',
      dic: '',
      contactPerson: '',
      contactPhone: '',
      notes: '',
    });
    setShowModal(true);
  }

  function openEditModal(client: Client) {
    setEditingClient(client);
    setFormData({
      companyName: client.companyName,
      primaryEmail: client.primaryEmail,
      secondaryEmail: client.secondaryEmail || '',
      address: client.address || '',
      ico: client.ico || '',
      dic: client.dic || '',
      contactPerson: client.contactPerson || '',
      contactPhone: client.contactPhone || '',
      notes: client.notes || '',
    });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingClient) {
        await api.put(`/clients/${editingClient.id}`, formData);
        toast.success(t('list.toast.updated'));
      } else {
        await api.post('/clients', formData);
        toast.success(t('list.toast.created'));
      }
      setShowModal(false);
      loadClients();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || t('list.toast.operationFailed'));
    }
  }

  async function handleDelete(client: Client) {
    if (!confirm(t('list.confirm.delete', { name: client.companyName }))) return;

    try {
      await api.delete(`/clients/${client.id}`);
      toast.success(t('list.toast.deleted'));
      loadClients();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || t('list.toast.deleteFailed'));
    }
  }

  const filteredClients = clients.filter(client =>
    client.companyName.toLowerCase().includes(search.toLowerCase()) ||
    client.primaryEmail.toLowerCase().includes(search.toLowerCase()) ||
    (client.ico && client.ico.includes(search))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('list.title')}</h1>
        <button onClick={openCreateModal} className="btn btn-primary flex items-center space-x-2">
          <Plus className="h-4 w-4" />
          <span>{t('list.newClient')}</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder={t('list.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-10"
        />
      </div>

      {/* Clients grid */}
      {filteredClients.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClients.map(client => (
            <div key={client.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                    <Building className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <Link
                      to={`/clients/${client.id}`}
                      className="font-semibold text-gray-900 dark:text-gray-100 hover:text-indigo-600"
                    >
                      {client.companyName}
                    </Link>
                    {client.ico && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">ICO: {client.ico}</p>
                    )}
                  </div>
                </div>
                <div className="flex space-x-1">
                  <button
                    onClick={() => openEditModal(client)}
                    className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(client)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <p className="text-gray-600 dark:text-gray-300">{client.primaryEmail}</p>
                {client.contactPerson && (
                  <p className="text-gray-500 dark:text-gray-400">{t('list.contactLabel', { name: client.contactPerson })}</p>
                )}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">{t('list.invoiceCount', { count: client.invoiceCount })}</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(client.totalPaid)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <Users className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">{t('list.empty')}</p>
          <button onClick={openCreateModal} className="btn btn-primary mt-4 inline-flex items-center space-x-2">
            <Plus className="h-4 w-4" />
            <span>{t('list.addFirst')}</span>
          </button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {editingClient ? t('modal.titleEdit') : t('modal.titleNew')}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* ICO with ARES lookup */}
              <div>
                <label className="label">{t('modal.fields.ico')}</label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    name="ico"
                    value={formData.ico}
                    onChange={handleChange}
                    className="input flex-1"
                    maxLength={8}
                    placeholder={t('modal.fields.icoPlaceholder')}
                  />
                  <button
                    type="button"
                    onClick={handleAresLookup}
                    disabled={aresLoading || formData.ico.length !== 8}
                    className="btn btn-secondary whitespace-nowrap"
                  >
                    {aresLoading ? t('modal.ares.loading') : t('modal.ares.lookup')}
                  </button>
                </div>
              </div>

              <div>
                <label className="label">{t('modal.fields.companyName')}</label>
                <input
                  type="text"
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleChange}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="label">{t('modal.fields.primaryEmail')}</label>
                <input
                  type="email"
                  name="primaryEmail"
                  value={formData.primaryEmail}
                  onChange={handleChange}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="label">{t('modal.fields.secondaryEmail')}</label>
                <input
                  type="email"
                  name="secondaryEmail"
                  value={formData.secondaryEmail}
                  onChange={handleChange}
                  className="input"
                />
              </div>

              <div>
                <label className="label">{t('modal.fields.dic')}</label>
                <input
                  type="text"
                  name="dic"
                  value={formData.dic}
                  onChange={handleChange}
                  className="input"
                  placeholder={t('modal.fields.dicPlaceholder')}
                />
              </div>

              <div>
                <label className="label">{t('modal.fields.address')}</label>
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  className="input"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">{t('modal.fields.contactPerson')}</label>
                  <input
                    type="text"
                    name="contactPerson"
                    value={formData.contactPerson}
                    onChange={handleChange}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">{t('modal.fields.phone')}</label>
                  <input
                    type="text"
                    name="contactPhone"
                    value={formData.contactPhone}
                    onChange={handleChange}
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label className="label">{t('modal.fields.notes')}</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  className="input"
                  rows={2}
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">
                  {t('modal.buttons.cancel')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingClient ? t('modal.buttons.saveChanges') : t('modal.buttons.createClient')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
