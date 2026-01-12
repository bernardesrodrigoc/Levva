import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
// Removemos a barra extra caso exista na env var para evitar erros de URL (ex: .com//api)
const API = `${BACKEND_URL?.replace(/\/$/, '')}/api`;

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('levva_token'));
  const [loading, setLoading] = useState(true);

  // Função para buscar usuário - useCallback para estabilidade
  const fetchCurrentUser = useCallback(async (tokenToUse) => {
    try {
      const currentToken = tokenToUse || token;
      if (!currentToken) return;

      const response = await axios.get(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      // Só faz logout se for erro de autenticação (401/403)
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          logout();
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Efeito principal: Executa no load da página
  useEffect(() => {
    // Só busca se tiver token E (não tiver usuário OU estiver carregando)
    // Isso evita que ele busque de novo logo após o login
    if (token && !user) {
      fetchCurrentUser(token);
    } else {
      setLoading(false);
    }
  }, [token, user, fetchCurrentUser]);

  const login = async (email, password) => {
    try {
      const response = await axios.post(`${API}/auth/login`, { email, password });
      const { token: newToken, user: userData } = response.data;
      
      localStorage.setItem('levva_token', newToken);
      setToken(newToken);
      setUser(userData); // Já setamos o usuário aqui!
      
      return userData;
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  };

  const register = async (userData) => {
    const response = await axios.post(`${API}/auth/register`, userData);
    const { token: newToken, user: newUser } = response.data;
    
    localStorage.setItem('levva_token', newToken);
    setToken(newToken);
    setUser(newUser);
    
    return newUser;
  };

  const logout = () => {
    localStorage.removeItem('levva_token');
    setToken(null);
    setUser(null);
  };

  const value = {
    user,
    token,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
