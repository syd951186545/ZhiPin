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

async function fetchProfile(userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('full_name, tenant_id, role')
    .eq('id', userId)
    .single();
  return data;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only handle INITIAL_SESSION (page reload with existing session) and SIGNED_OUT.
    // login() and register() manage user state directly to avoid race conditions.
    // Callback is NOT async to prevent holding the auth lock longer than needed.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        if (session?.user) {
          fetchProfile(session.user.id)
            .then((profile) => {
              if (profile) {
                setUser({
                  id: session.user.id,
                  name: profile.full_name,
                  email: session.user.email || '',
                  tenantId: profile.tenant_id,
                  role: profile.role,
                });
              }
              setLoading(false);
            })
            .catch(() => setLoading(false));
        } else {
          setLoading(false);
        }
      } else if (event === 'SIGNED_OUT') {
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

      if (data.user) {
        const profile = await fetchProfile(data.user.id);
        setUser({
          id: data.user.id,
          name: profile?.full_name || data.user.user_metadata?.full_name || email.split('@')[0],
          email: data.user.email || email,
          tenantId: profile?.tenant_id,
          role: profile?.role,
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

      // Only set user if email is auto-confirmed (no email verification step)
      if (data.user && data.session) {
        // The handle_new_user DB trigger creates profile + tenant synchronously,
        // so fetching the profile here should succeed immediately.
        const profile = await fetchProfile(data.user.id);
        setUser({
          id: data.user.id,
          name: name,
          email: data.user.email || email,
          tenantId: profile?.tenant_id,
          role: profile?.role,
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
