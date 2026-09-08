import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../utils/api';
import i18n from '../i18n/i18n';

interface User {
  id: string;
  email: string;
  name: string;
  companyName?: string;
  companyIco?: string;
  companyDic?: string;
  companyAddress?: string;
  companyRegisterInfo?: string;
  bankAccount?: string;
  bankCode?: string;
  vatPayer?: boolean;
  hasLogo?: boolean;
  onboardingCompleted?: boolean;
  pausalniDanEnabled?: boolean;
  pausalniDanTier?: number;
  pausalniDanLimit?: number;
  language?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  updateProfile: (data: Partial<User>) => Promise<void>;
  refreshUser: () => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  language?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      loadUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  async function loadUser() {
    try {
      const userData = await api.get('/auth/me');
      setUser(userData);
      const lang = userData.language || 'cs';
      i18n.changeLanguage(lang);
      localStorage.setItem('language', lang);
    } catch {
      localStorage.removeItem('token');
      setToken(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const response = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', response.token);
    setToken(response.token);
    setUser(response.user);
  }

  async function register(data: RegisterData) {
    const response = await api.post('/auth/register', data);
    localStorage.setItem('token', response.token);
    setToken(response.token);
    setUser(response.user);
  }

  function logout() {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    i18n.changeLanguage('cs');
    localStorage.setItem('language', 'cs');
  }

  async function updateProfile(data: Partial<User>) {
    const updatedUser = await api.put('/auth/me', data);
    setUser(updatedUser);
    if (updatedUser.language) {
      i18n.changeLanguage(updatedUser.language);
      localStorage.setItem('language', updatedUser.language);
    }
  }

  async function refreshUser() {
    const userData = await api.get('/auth/me');
    setUser(userData);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, updateProfile, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
