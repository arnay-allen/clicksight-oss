import { CredentialResponse } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { getUserByEmail, insertOrUpdateUser } from '../lib/clickhouse-auth';

interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  google_id: string;
}

interface GoogleJWT {
  sub: string;
  email: string;
  name: string;
  picture?: string; // Optional: not all Google accounts have profile pictures
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (credentialResponse: CredentialResponse) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('clicksight_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Failed to parse stored user:', error);
        localStorage.removeItem('clicksight_user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (credentialResponse: CredentialResponse) => {
    try {
      setLoading(true);

      if (!credentialResponse.credential) {
        throw new Error('No credential received from Google');
      }

      // Decode the JWT token to get user info
      const decoded: GoogleJWT = jwtDecode(credentialResponse.credential);

      // Check if user exists in ClickHouse
      let existingUser = await getUserByEmail(decoded.email);

      if (existingUser) {
        // User exists, update last login and use existing user
        await insertOrUpdateUser({
          id: existingUser.id,
          email: decoded.email,
          name: decoded.name,
          avatar_url: decoded.picture || '', // Default to empty string if no picture
          google_id: decoded.sub,
        });

        setUser(existingUser);
        localStorage.setItem('clicksight_user', JSON.stringify(existingUser));
      } else {
        // New user, insert into ClickHouse
        const newUser = await insertOrUpdateUser({
          email: decoded.email,
          name: decoded.name,
          avatar_url: decoded.picture || '', // Default to empty string if no picture
          google_id: decoded.sub,
        });

        setUser(newUser);
        localStorage.setItem('clicksight_user', JSON.stringify(newUser));
      }

      setLoading(false);
    } catch (error) {
      console.error('Login failed:', error);
      setLoading(false);
      throw error;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('clicksight_user');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
