/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Settings, ActivitySquare, LogOut, Code2, GitCompare, Users, ChevronDown, Upload } from 'lucide-react';
import Dashboard from './components/Dashboard';
import StrategyConfig from './components/StrategyConfig';
import StrategyEditor from './components/StrategyEditor';
import BacktestResults from './components/BacktestResults';
import StrategyCompare from './components/StrategyCompare';
import LoginPage from './components/auth/LoginPage';
import RegisterPage from './components/auth/RegisterPage';
import UserManagement from './components/admin/UserManagement';
import DataUpload from './components/data/DataUpload';
import { useAuth } from './hooks/useAuth';

type View = 'dashboard' | 'strategy' | 'editor' | 'compare' | 'results' | 'users' | 'upload';

// 加载中的骨架屏
function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-500">加载中...</p>
      </div>
    </div>
  );
}

// 认证包装器组件
function AuthenticatedApp() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isProcessing, setIsProcessing] = useState(false);
  const [backtestResult, setBacktestResult] = useState<any>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { user, logout, hasRole, canBacktest } = useAuth();

  const handleRunBacktest = async (config: any) => {
    // 权限检查
    if (!canBacktest()) {
      alert('您没有执行回测的权限，请联系管理员升级账户权限');
      return;
    }

    setIsProcessing(true);
    try {
      const token = localStorage.getItem('token');
      const endpoint = config.isCustom ? '/api/backtest/custom' : '/api/backtest/submit';
      const body = config.isCustom
        ? { symbol: config.symbol, startDate: config.startDate, endDate: config.endDate, strategyCode: config.strategyCode }
        : config;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body),
      });

      if (res.status === 401 || res.status === 403) {
        const data = await res.json();
        alert(data.error || '权限不足');
        setIsProcessing(false);
        return;
      }

      const { taskId } = await res.json();

      // Poll for status
      const pollInterval = setInterval(async () => {
        const statusRes = await fetch(`/api/backtest/status/${taskId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const statusData = await statusRes.json();

        if (statusData.status === 'completed') {
          clearInterval(pollInterval);
          setBacktestResult(statusData.result);
          setIsProcessing(false);
          setCurrentView('results');
        } else if (statusData.status === 'failed') {
          clearInterval(pollInterval);
          setIsProcessing(false);
          alert('回测失败: ' + (statusData.error || '未知错误'));
        }
      }, 1000);
    } catch (error) {
      console.error(error);
      setIsProcessing(false);
      alert('提交回测出错。');
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return '管理员';
      case 'researcher': return '研究员';
      case 'guest': return '访客';
      default: return role;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-700';
      case 'researcher': return 'bg-blue-100 text-blue-700';
      case 'guest': return 'bg-slate-100 text-slate-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6">
          <div className="flex items-center space-x-3 text-indigo-600">
            <ActivitySquare className="w-8 h-8" />
            <span className="text-xl font-bold tracking-tight">QuantFlow</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">多因子量化投研平台</p>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <button
            onClick={() => setCurrentView('dashboard')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${
              currentView === 'dashboard'
                ? 'bg-indigo-50 text-indigo-700 font-medium'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>仪表盘</span>
          </button>

          {canBacktest() && (
            <>
              <button
                onClick={() => setCurrentView('strategy')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${
                  currentView === 'strategy'
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Settings className="w-5 h-5" />
                <span>策略配置</span>
              </button>
              <button
                onClick={() => setCurrentView('editor')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${
                  currentView === 'editor'
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Code2 className="w-5 h-5" />
                <span>策略编辑器</span>
              </button>
              <button
                onClick={() => setCurrentView('compare')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${
                  currentView === 'compare'
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <GitCompare className="w-5 h-5" />
                <span>策略对比</span>
              </button>
            </>
          )}

          {hasRole('admin') && (
            <button
              onClick={() => setCurrentView('users')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${
                currentView === 'users'
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Users className="w-5 h-5" />
              <span>用户管理</span>
            </button>
          )}

          {canBacktest() && (
            <button
              onClick={() => setCurrentView('upload')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${
                currentView === 'upload'
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Upload className="w-5 h-5" />
              <span>数据上传</span>
            </button>
          )}

          {backtestResult && (
            <button
              onClick={() => setCurrentView('results')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${
                currentView === 'results'
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <ActivitySquare className="w-5 h-5" />
              <span>回测结果</span>
            </button>
          )}
        </nav>

        {/* User Info */}
        <div className="p-4 border-t border-slate-100">
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center justify-between w-full px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-indigo-600">
                    {user?.username?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-900">{user?.username}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getRoleBadgeColor(user?.role || '')}`}>
                    {getRoleLabel(user?.role || '')}
                  </span>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>

            {showUserMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                <button
                  onClick={() => {
                    logout();
                    setShowUserMenu(false);
                  }}
                  className="flex items-center space-x-3 px-4 py-3 w-full text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  <span>退出登录</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {currentView === 'dashboard' && <Dashboard />}
        {currentView === 'strategy' && (
          <StrategyConfig onRunBacktest={handleRunBacktest} isProcessing={isProcessing} />
        )}
        {currentView === 'editor' && (
          <StrategyEditor onRunBacktest={handleRunBacktest} isProcessing={isProcessing} />
        )}
        {currentView === 'compare' && <StrategyCompare />}
        {currentView === 'upload' && <DataUpload />}
        {currentView === 'users' && hasRole('admin') && <UserManagement />}
        {currentView === 'results' && backtestResult && (
          <BacktestResults
            result={backtestResult}
            onReset={() => {
              setBacktestResult(null);
              setCurrentView('strategy');
            }}
          />
        )}
      </main>
    </div>
  );
}

export default function App() {
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const { isAuthenticated, isLoading } = useAuth();

  // 加载中
  if (isLoading) {
    return <LoadingScreen />;
  }

  // 未登录 - 显示登录/注册页面
  if (!isAuthenticated) {
    if (authView === 'login') {
      return <LoginPage onSwitchToRegister={() => setAuthView('register')} />;
    } else {
      return <RegisterPage onSwitchToLogin={() => setAuthView('login')} />;
    }
  }

  // 已登录 - 显示主应用
  return <AuthenticatedApp />;
}
