/**
 * 数据上传页面
 */

import React, { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, Database, CheckCircle, XCircle, Loader2, Cloud, CloudOff } from 'lucide-react';

interface UploadResult {
  success: boolean;
  taskId: string;
  filename: string;
  size: number;
  message: string;
}

interface ImportTask {
  id: string;
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  totalRows: number;
  processedRows: number;
  error?: string;
}

interface DataPreview {
  columns: string[];
  preview: any[];
}

export default function DataUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [preview, setPreview] = useState<DataPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [task, setTask] = useState<ImportTask | null>(null);
  const [tableName, setTableName] = useState('');
  const [cloudStatus, setCloudStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');

  // 检查云端数据库状态
  React.useEffect(() => {
    const checkCloud = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/data/tables', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        setCloudStatus(data.connected ? 'connected' : 'disconnected');
      } catch {
        setCloudStatus('disconnected');
      }
    };
    checkCloud();
  }, []);

  // 拖拽事件处理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, []);

  // 文件上传
  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setUploadResult(null);
    setPreview(null);
    setTask(null);

    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/data/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '上传失败');
      }

      setUploadResult(data);

      // 自动获取预览
      const previewRes = await fetch(`/api/data/preview/${data.filename}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const previewData = await previewRes.json();
      if (previewData.success) {
        setPreview(previewData);
      }
    } catch (error: any) {
      alert(error.message);
    } finally {
      setUploading(false);
    }
  };

  // 文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  };

  // 导入数据
  const handleImport = async () => {
    if (!uploadResult || !tableName) {
      alert('请输入表名');
      return;
    }

    setImporting(true);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/data/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          taskId: uploadResult.taskId,
          tableName,
          createNewTable: true
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '导入失败');
      }

      // 轮询任务状态
      pollTaskStatus(uploadResult.taskId);
    } catch (error: any) {
      alert(error.message);
      setImporting(false);
    }
  };

  // 轮询任务状态
  const pollTaskStatus = async (taskId: string) => {
    const token = localStorage.getItem('token');

    const poll = async () => {
      try {
        const res = await fetch(`/api/data/tasks/${taskId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        setTask(data);

        if (data.status === 'processing') {
          setTimeout(poll, 1000);
        } else {
          setImporting(false);
        }
      } catch {
        setImporting(false);
      }
    };

    poll();
  };

  // 格式化文件大小
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">数据上传</h1>
          <p className="text-slate-500 mt-1">上传 CSV、Excel 或 JSON 文件导入到云端数据库</p>
        </div>

        {/* 云端数据库状态 */}
        <div className="mb-6 p-4 bg-white rounded-xl border border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {cloudStatus === 'checking' && (
              <>
                <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                <span className="text-slate-500">检查云端数据库连接...</span>
              </>
            )}
            {cloudStatus === 'connected' && (
              <>
                <Cloud className="w-5 h-5 text-green-500" />
                <span className="text-green-700 font-medium">云端数据库已连接</span>
              </>
            )}
            {cloudStatus === 'disconnected' && (
              <>
                <CloudOff className="w-5 h-5 text-amber-500" />
                <span className="text-amber-700">云端数据库未连接（数据将保存到本地）</span>
              </>
            )}
          </div>
          {cloudStatus === 'disconnected' && (
            <span className="text-xs text-slate-400">配置 DATABASE_URL 环境变量以连接云端</span>
          )}
        </div>

        {/* 上传区域 */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50'
              : 'border-slate-200 hover:border-slate-300 bg-white'
          }`}
        >
          <input
            type="file"
            id="file-input"
            className="hidden"
            accept=".csv,.xlsx,.xls,.json"
            onChange={handleFileSelect}
          />

          {uploading ? (
            <div className="flex flex-col items-center">
              <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
              <p className="text-slate-600">上传中...</p>
            </div>
          ) : (
            <>
              <Upload className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 mb-2">拖拽文件到此处，或</p>
              <label
                htmlFor="file-input"
                className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg cursor-pointer hover:bg-indigo-700 transition-colors"
              >
                选择文件
              </label>
              <p className="text-xs text-slate-400 mt-4">支持 CSV、Excel (.xlsx/.xls)、JSON 格式，最大 100MB</p>
            </>
          )}
        </div>

        {/* 上传结果 */}
        {uploadResult && (
          <div className="mt-6 bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center space-x-3 mb-4">
              <FileSpreadsheet className="w-6 h-6 text-indigo-500" />
              <div>
                <p className="font-medium text-slate-900">{uploadResult.filename}</p>
                <p className="text-sm text-slate-500">{formatSize(uploadResult.size)}</p>
              </div>
              <CheckCircle className="w-5 h-5 text-green-500 ml-auto" />
            </div>

            {/* 数据预览 */}
            {preview && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-slate-700 mb-2">数据预览（前10行）</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        {preview.columns.map((col, i) => (
                          <th key={i} className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.preview.map((row, i) => (
                        <tr key={i}>
                          {preview.columns.map((col, j) => (
                            <td key={j} className="px-3 py-2 text-slate-600 whitespace-nowrap">
                              {String(row[col] || '-')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 导入配置 */}
            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-medium text-slate-700 mb-3">导入配置</h3>
              <div className="flex items-end space-x-4">
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-1">目标表名</label>
                  <input
                    type="text"
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    placeholder="输入表名（如 stock_data）"
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
                <button
                  onClick={handleImport}
                  disabled={importing || !tableName}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>导入中...</span>
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4" />
                      <span>开始导入</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 导入进度 */}
        {task && (
          <div className="mt-6 bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">导入进度</span>
              <span className="text-sm text-slate-500">{task.progress}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-all"
                style={{ width: `${task.progress}%` }}
              />
            </div>
            <p className="text-sm text-slate-500 mt-2">
              已处理 {task.processedRows} / {task.totalRows} 行
            </p>

            {task.status === 'completed' && (
              <div className="mt-4 p-3 bg-green-50 text-green-700 rounded-lg flex items-center space-x-2">
                <CheckCircle className="w-5 h-5" />
                <span>导入完成！</span>
              </div>
            )}

            {task.status === 'failed' && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-center space-x-2">
                <XCircle className="w-5 h-5" />
                <span>导入失败: {task.error}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
