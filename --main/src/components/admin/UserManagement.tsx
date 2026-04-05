/**
 * 用户管理页面（管理员专用）
 */

import React, { useState, useEffect } from 'react';
import { Users, Shield, UserCheck, UserX, Trash2, RefreshCw } from 'lucide-react';

interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'researcher' | 'guest';
  status: 'active' | 'inactive' | 'locked';
  created_at: string;
  last_login_at: string | null;
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchUsers = async () => {
    setIsLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error('获取用户列表失败');
      }

      const data = await res.json();
      setUsers(data.users);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const updateRole = async (userId: number, role: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ role })
      });

      if (!res.ok) throw new Error('更新失败');

      fetchUsers();
    } catch (err) {
      alert('更新角色失败');
    }
  };

  const updateStatus = async (userId: number, status: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/users/${userId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });

      if (!res.ok) throw new Error('更新失败');

      fetchUsers();
    } catch (err) {
      alert('更新状态失败');
    }
  };

  const deleteUser = async (userId: number, username: string) => {
    if (!confirm(`确定要删除用户 "${username}" 吗？此操作不可恢复。`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '删除失败');
      }

      fetchUsers();
    } catch (err: any) {
      alert(err.message);
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

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-700';
      case 'researcher': return 'bg-blue-100 text-blue-700';
      case 'guest': return 'bg-slate-100 text-slate-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return '正常';
      case 'inactive': return '未激活';
      case 'locked': return '已锁定';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700';
      case 'inactive': return 'bg-yellow-100 text-yellow-700';
      case 'locked': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">用户管理</h1>
            <p className="text-slate-500 mt-1">管理系统用户和权限</p>
          </div>
          <button
            onClick={fetchUsers}
            className="flex items-center space-x-2 px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>刷新</span>
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl border border-red-100">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-slate-500">加载中...</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-6 py-4 text-sm font-medium text-slate-500">用户信息</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-slate-500">角色</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-slate-500">状态</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-slate-500">注册时间</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-slate-500">最后登录</th>
                  <th className="text-right px-6 py-4 text-sm font-medium text-slate-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-indigo-600">
                            {user.username.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{user.username}</p>
                          <p className="text-sm text-slate-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={user.role}
                        onChange={(e) => updateRole(user.id, e.target.value)}
                        className={`text-sm px-3 py-1 rounded-full border-0 cursor-pointer ${getRoleColor(user.role)}`}
                      >
                        <option value="admin">管理员</option>
                        <option value="researcher">研究员</option>
                        <option value="guest">访客</option>
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={user.status}
                        onChange={(e) => updateStatus(user.id, e.target.value)}
                        className={`text-sm px-3 py-1 rounded-full border-0 cursor-pointer ${getStatusColor(user.status)}`}
                      >
                        <option value="active">正常</option>
                        <option value="inactive">未激活</option>
                        <option value="locked">已锁定</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {formatDate(user.last_login_at)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => deleteUser(user.id, user.username)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="删除用户"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!isLoading && users.length === 0 && (
            <div className="p-12 text-center">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">暂无用户数据</p>
            </div>
          )}
        </div>

        {/* 权限说明 */}
        <div className="mt-8 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <Shield className="w-5 h-5 mr-2 text-indigo-600" />
            角色权限说明
          </h2>
          <div className="grid grid-cols-3 gap-6">
            <div className="p-4 bg-red-50 rounded-xl">
              <h3 className="font-medium text-red-700 mb-2">管理员</h3>
              <ul className="text-sm text-red-600/80 space-y-1">
                <li>• 查看行情数据</li>
                <li>• 运行回测任务</li>
                <li>• 保存自定义策略</li>
                <li>• 管理用户账户</li>
              </ul>
            </div>
            <div className="p-4 bg-blue-50 rounded-xl">
              <h3 className="font-medium text-blue-700 mb-2">研究员</h3>
              <ul className="text-sm text-blue-600/80 space-y-1">
                <li>• 查看行情数据</li>
                <li>• 运行回测任务</li>
                <li>• 保存自定义策略</li>
              </ul>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl">
              <h3 className="font-medium text-slate-700 mb-2">访客</h3>
              <ul className="text-sm text-slate-600/80 space-y-1">
                <li>• 仅查看行情数据</li>
                <li>• 无回测权限</li>
                <li>• 无策略保存权限</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
