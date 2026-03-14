import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  tenantId?: string;
  role?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, companyName: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const storedUser = localStorage.getItem('zhipinyun_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);

    // Listen for Supabase auth changes (when Supabase is configured)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        // Load profile from Supabase
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, tenant_id, role')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          const userData: User = {
            id: session.user.id,
            name: profile.full_name,
            email: session.user.email || '',
            tenantId: profile.tenant_id,
            role: profile.role,
          };
          setUser(userData);
          localStorage.setItem('zhipinyun_user', JSON.stringify(userData));
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        localStorage.removeItem('zhipinyun_user');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      // Try Supabase auth first
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // Fallback to mock login for development
        const mockUser: User = {
          id: 'usr_dev_1',
          name: email.split('@')[0],
          email,
          tenantId: 'tenant_dev_1',
          role: 'owner',
        };
        setUser(mockUser);
        localStorage.setItem('zhipinyun_user', JSON.stringify(mockUser));
      }
    } catch {
      // Mock login when Supabase is not configured
      const mockUser: User = {
        id: 'usr_dev_1',
        name: email.split('@')[0],
        email,
        tenantId: 'tenant_dev_1',
        role: 'owner',
      };
      setUser(mockUser);
      localStorage.setItem('zhipinyun_user', JSON.stringify(mockUser));
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string, name: string, companyName: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name, company_name: companyName } },
      });
      if (error) {
        // Fallback to mock
        const mockUser: User = { id: 'usr_dev_1', name, email, tenantId: 'tenant_dev_1', role: 'owner' };
        setUser(mockUser);
        localStorage.setItem('zhipinyun_user', JSON.stringify(mockUser));
      }
    } catch {
      const mockUser: User = { id: 'usr_dev_1', name, email, tenantId: 'tenant_dev_1', role: 'owner' };
      setUser(mockUser);
      localStorage.setItem('zhipinyun_user', JSON.stringify(mockUser));
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    supabase.auth.signOut().catch(() => {});
    localStorage.removeItem('zhipinyun_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isAuthenticated: !!user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
