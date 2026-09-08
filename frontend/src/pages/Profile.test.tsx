import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Profile from './Profile';

const mockUpdateProfile = vi.fn();
const mockRefreshUser = vi.fn();
const mockLogout = vi.fn();

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '1', name: 'Test', email: 'test@test.com', vatPayer: undefined, pausalniDanEnabled: false, companyRegisterInfo: 'Zapsáno v živnostenském rejstříku' },
    token: 'test-token',
    updateProfile: mockUpdateProfile,
    refreshUser: mockRefreshUser,
    logout: mockLogout,
  })
}));

vi.mock('../utils/api', () => ({
  api: {
    post: vi.fn(),
    delete: vi.fn(),
    uploadFile: vi.fn(),
  }
}));

// Every lucide icon stubs out, so adding an icon never breaks these tests.
// No JSX in here — the factory is hoisted above the JSX runtime import.
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(Object.keys(actual).map((name) => [name, () => null]));
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/:section" element={<Profile />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Profile Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });


  it('loads the registration field and explains both types of registration', () => {
    renderAt('/profile/company');
    const field = screen.getByRole('textbox', { name: 'Zápis v rejstříku nebo jiné evidenci' });
    expect(field).toHaveValue('Zapsáno v živnostenském rejstříku');
    expect(field).toHaveAttribute('maxLength', '500');
    expect(field).toHaveAccessibleDescription(/oddíl a vložku.*živnostenském rejstříku/);
    expect(screen.queryByRole('button', { name: /uložit změny/i })).not.toBeInTheDocument();
  });

  it.each(['Nový zápis, oddíl C, vložka 123456', ''])('saves or clears registration details: %j', async value => {
    mockUpdateProfile.mockResolvedValueOnce({});
    renderAt('/profile/company');
    fireEvent.change(screen.getByRole('textbox', { name: 'Zápis v rejstříku nebo jiné evidenci' }), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: /uložit změny/i }));
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledWith(expect.objectContaining({ companyRegisterInfo: value })));
    await waitFor(() => expect(screen.queryByRole('button', { name: /uložit změny/i })).not.toBeInTheDocument());
  });

  it('discards an unsaved change to registration details', () => {
    renderAt('/profile/company');
    const field = screen.getByRole('textbox', { name: 'Zápis v rejstříku nebo jiné evidenci' });
    fireEvent.change(field, { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: /zahodit/i }));
    expect(field).toHaveValue('Zapsáno v živnostenském rejstříku');
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('renders paušální daň section with "Používám paušální daň" checkbox', () => {
    renderAt('/profile/bank');

    expect(screen.getByText('Paušální daň')).toBeInTheDocument();
    expect(screen.getByLabelText('Používám paušální daň')).toBeInTheDocument();
  });

  it('vatPayer defaults to false for user with undefined vatPayer', () => {
    renderAt('/profile/company');

    const vatPayerCheckbox = screen.getByLabelText('Jsem plátce DPH') as HTMLInputElement;
    expect(vatPayerCheckbox.checked).toBe(false);

    // DIČ field should be disabled since vatPayer is false
    const dicInput = document.querySelector('input[name="companyDic"]') as HTMLInputElement;
    expect(dicInput.disabled).toBe(true);
  });

  it('reveals the save bar only once a field changes, and discard restores the saved value', () => {
    renderAt('/profile/company');

    expect(screen.queryByRole('button', { name: /uložit změny/i })).not.toBeInTheDocument();

    const companyName = document.querySelector('input[name="companyName"]') as HTMLInputElement;
    fireEvent.change(companyName, { target: { value: 'Nová firma' } });

    expect(screen.getByRole('button', { name: /uložit změny/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /zahodit/i }));

    expect((document.querySelector('input[name="companyName"]') as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('button', { name: /uložit změny/i })).not.toBeInTheDocument();
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('shows the password save bar only once a password field is typed into', () => {
    renderAt('/profile/password');

    expect(screen.queryByRole('button', { name: /^Změnit heslo$/ })).not.toBeInTheDocument();

    const current = document.querySelector('input[name="currentPassword"]') as HTMLInputElement;
    fireEvent.change(current, { target: { value: 'secret123' } });

    expect(screen.getByRole('button', { name: /^Změnit heslo$/ })).toBeInTheDocument();
  });

  it('paušální daň fields appear when checkbox is checked', () => {
    renderAt('/profile/bank');

    // Initially no tier/limit selects
    expect(document.querySelector('select[name="pausalniDanTier"]')).toBeNull();
    expect(document.querySelector('select[name="pausalniDanLimit"]')).toBeNull();

    // Check the paušální daň checkbox
    const pausalniCheckbox = screen.getByLabelText('Používám paušální daň');
    fireEvent.click(pausalniCheckbox);

    // Tier and limit selects should now appear
    expect(document.querySelector('select[name="pausalniDanTier"]')).toBeTruthy();
    expect(document.querySelector('select[name="pausalniDanLimit"]')).toBeTruthy();
    expect(screen.getByText('Pásmo paušální daně')).toBeInTheDocument();
    expect(screen.getByText('Limit příjmů')).toBeInTheDocument();
  });

  describe('mobile index', () => {
    it('summarises the profile and drills into each section', () => {
      renderAt('/profile');
      // The desktop nav renders alongside (hidden by CSS), so scope to the index
      const index = within(screen.getByTestId('profile-index'));

      expect(index.getByRole('link', { name: /Jméno/ })).toHaveAttribute('href', '/profile/personal');
      expect(index.getByRole('link', { name: /Bankovní účet/ })).toHaveAttribute('href', '/profile/bank');
      // Language is not repeated here — it lives in Settings
      expect(index.queryByText('Jazyk')).not.toBeInTheDocument();

      // The email row is read-only, so it never becomes a link
      expect(index.queryByRole('link', { name: /test@test.com/ })).not.toBeInTheDocument();
    });

    it('opens the delete-account modal straight from the security row', () => {
      renderAt('/profile');

      const index = within(screen.getByTestId('profile-index'));
      fireEvent.click(index.getByRole('button', { name: /Smazat účet/ }));

      expect(screen.getByRole('heading', { name: 'Opravdu chcete smazat účet?' })).toBeInTheDocument();
    });
  });
});
