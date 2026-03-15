import React, {createContext, useContext, useEffect, useState} from 'react';
import {supabase} from '@/lib/supabase';

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
    // onAuthStateChange fires INITIAL_SESSION on mount, so no need for getSession().
    // Using both causes lock contention under React StrictMode (double-mount).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, tenant_id, role')
            .eq('id', session.user.id)
            .single();

          if (profile) {
            setUser({
              id: session.user.id,
              name: profile.full_name,
              email: session.user.email || '',
              tenantId: profile.tenant_id,
              role: profile.role,
            });
          }
        } catch {
          // Profile fetch failed
        }
        setLoading(false);
      } else if (event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Set user immediately from the sign-in response so navigation works
      // (onAuthStateChange is async and may not fire before navigate('/') runs)
      if (data.user) {
        let userName = data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || '';
        let tenantId: string | undefined;
        let role: string | undefined;

        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, tenant_id, role')
            .eq('id', data.user.id)
            .single();

          if (profile) {
            userName = profile.full_name || userName;
            tenantId = profile.tenant_id;
            role = profile.role;
          }
        } catch {
          // Profile fetch failed, use fallback name
        }

        setUser({
          id: data.user.id,
          name: userName,
          email: data.user.email || email,
          tenantId,
          role,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string, name: string, companyName: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name, company_name: companyName } },
      });
      if (error) throw error;

      // Set user immediately if sign-up auto-confirms (no email verification required)
      if (data.user && data.session) {
        let tenantId: string | undefined;
        let role: string | undefined;

        // The handle_new_user trigger creates profile + tenant in the DB,
        // so fetch the profile to get tenantId and role
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, tenant_id, role')
            .eq('id', data.user.id)
            .single();

          if (profile) {
            tenantId = profile.tenant_id;
            role = profile.role;
          }
        } catch {
          // Profile fetch failed, will be populated by onAuthStateChange
        }

        setUser({
          id: data.user.id,
          name: name,
          email: data.user.email || email,
          tenantId,
          role,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
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
