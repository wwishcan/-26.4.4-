/**
 * 认证状态管理 Context
 */

import React, { createContext, useState, useEffect, useCallback } from 'react';
import { User, AuthContextType, UserRole } from '../types/auth';

export const AuthContext = createContext<AuthContextType | null>(null);

const API_BASE = '';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 初始化时检查 token
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const res = await fetch(`${API_BASE}/api/auth/me`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
          } else {
            localStorage.removeItem('token');
          }
        } catch (error) {
          console.error('认证检查失败:', error);
          localStorage.removeItem('token');
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  // 登录
  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || '登录失败');
    }

    localStorage.setItem('token', data.token);
    setUser(data.user);
  }, []);

  // 注册
  const register = useCallback(async (username: string, email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || '注册失败');
    }

    // 注册成功后自动登录
    await login(username, password);
  }, [login]);

  // 登出
  const logout = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (error) {
        console.error('登出请求失败:', error);
      }
    }
    localStorage.removeItem('token');
    setUser(null);
  }, []);

  // 检查角色
  const hasRole = useCallback((...roles: UserRole[]): boolean => {
    if (!user) return false;
    return roles.includes(user.role);
  }, [user]);

  // 检查是否可以回测
  const canBacktest = useCallback((): boolean => {
    return hasRole('admin', 'researcher');
  }, [hasRole]);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
    hasRole,
    canBacktest
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
