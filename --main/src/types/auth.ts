/**
 * 认证相关类型定义
 */

export type UserRole = 'admin' | 'researcher' | 'guest';

export type UserStatus = 'active' | 'inactive' | 'locked';

export interface User {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  status?: UserStatus;
  created_at?: string;
  last_login_at?: string | null;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  token?: string;
  user?: User;
  error?: string;
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: UserRole[]) => boolean;
  canBacktest: () => boolean;
}

// 权限配置
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ['view_market', 'run_backtest', 'save_strategy', 'manage_users', 'view_all_strategies'],
  researcher: ['view_market', 'run_backtest', 'save_strategy'],
  guest: ['view_market']
};

export function hasPermission(role: UserRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
