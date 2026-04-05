/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { GitCompare, Play, Plus, Trash2, TrendingUp, TrendingDown, Activity } from 'lucide-react';

interface StrategyConfig {
  id: string;
  name: string;
  factors: string[];
  model: string;
}

interface CompareResult {
  strategies: Array<{
    name: string;
    chartData: Array<{ date: string; value: number }>;
    metrics: {
      annualizedReturn: number;
      sharpeRatio: number;
      maxDrawdown: number;
    };
  }>;
  benchmark: Array<{ date: string; value: number }>;
  symbol: string;
  stockName: string;
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const FACTOR_OPTIONS = [
  { value: 'pe', label: 'PE估值' },
  { value: 'pb', label: 'PB估值' },
  { value: 'momentum', label: '动量因子' },
];

const MODEL_OPTIONS = [
  { value: 'linear', label: '线性回归' },
  { value: 'random_forest', label: '随机森林' },
  { value: 'lstm', label: 'LSTM' },
];

export default function StrategyCompare() {
  const [symbol, setSymbol] = useState('000001');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [strategies, setStrategies] = useState<StrategyConfig[]>([
    { id: '1', name: '策略1: PE低估值', factors: ['pe'], model: 'linear' },
    { id: '2', name: '策略2: PB+动量', factors: ['pb', 'momentum'], model: 'random_forest' },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [dateRange, setDateRange] = useState({ min: '2020-01-01', max: '2025-12-31' });

  useEffect(() => {
    fetch('/api/date-range')
      .then(res => res.json())
      .then(data => setDateRange(data))
      .catch(console.error);
  }, []);

  const addStrategy = () => {
    const newId = String(strategies.length + 1);
    setStrategies([
      ...strategies,
      {
        id: newId,
        name: `策略${newId}`,
        factors: [],
        model: 'linear'
      }
    ]);
  };

  const removeStrategy = (id: string) => {
    if (strategies.length > 2) {
      setStrategies(strategies.filter(s => s.id !== id));
    }
  };

  const updateStrategy = (id: string, field: keyof StrategyConfig, value: any) => {
    setStrategies(strategies.map(s =>
      s.id === id ? { ...s, [field]: value } : s
    ));
  };

  const runCompare = async () => {
    setIsProcessing(true);
    setResult(null);

    try {
      const res = await fetch('/api/backtest/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          startDate,
          endDate,
          strategies: strategies.map(s => ({
            name: s.name,
            factors: s.factors,
            model: s.model
          }))
        })
      });

      const { taskId } = await res.json();

      // Poll for result
      const pollInterval = setInterval(async () => {
        const statusRes = await fetch(`/api/backtest/status/${taskId}`);
        const statusData = await statusRes.json();

        if (statusData.status === 'completed') {
          clearInterval(pollInterval);
          setResult(statusData.result);
          setIsProcessing(false);
        } else if (statusData.status === 'failed') {
          clearInterval(pollInterval);
          setIsProcessing(false);
          alert('对比失败: ' + (statusData.error || '未知错误'));
        }
      }, 1000);
    } catch (error) {
      console.error(error);
      setIsProcessing(false);
      alert('提交对比请求出错');
    }
  };

  // 合并图表数据
  const getChartData = () => {
    if (!result) return [];

    const dataMap: Record<string, any> = {};

    // 添加基准数据
    result.benchmark.forEach(item => {
      dataMap[item.date] = { date: item.date, 基准: item.value };
    });

    // 添加各策略数据
    result.strategies.forEach((strategy, index) => {
      strategy.chartData.forEach(item => {
        if (dataMap[item.date]) {
          dataMap[item.date][strategy.name] = item.value;
        }
      });
    });

    return Object.values(dataMap).sort((a: any, b: any) => a.date.localeCompare(b.date));
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">策略对比</h1>
        <p className="text-slate-500 mt-1">选择多个策略进行收益对比分析</p>
      </div>

      {/* 配置区域 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-6">
        {/* 股票和日期选择 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">股票代码</label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="如: 000001"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">开始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              min={dateRange.min}
              max={dateRange.max}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">结束日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={dateRange.min}
              max={dateRange.max}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* 策略列表 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-700">策略配置</h3>
            <button
              onClick={addStrategy}
              className="flex items-center space-x-1 text-sm text-indigo-600 hover:text-indigo-700"
            >
              <Plus className="w-4 h-4" />
              <span>添加策略</span>
            </button>
          </div>

          {strategies.map((strategy, index) => (
            <div key={strategy.id} className="p-4 bg-slate-50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  value={strategy.name}
                  onChange={(e) => updateStrategy(strategy.id, 'name', e.target.value)}
                  className="text-sm font-medium text-slate-900 bg-transparent border-none focus:outline-none"
                />
                {strategies.length > 2 && (
                  <button
                    onClick={() => removeStrategy(strategy.id)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">选择因子</label>
                  <div className="flex flex-wrap gap-2">
                    {FACTOR_OPTIONS.map(factor => (
                      <label key={factor.value} className="flex items-center space-x-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={strategy.factors.includes(factor.value)}
                          onChange={(e) => {
                            const newFactors = e.target.checked
                              ? [...strategy.factors, factor.value]
                              : strategy.factors.filter(f => f !== factor.value);
                            updateStrategy(strategy.id, 'factors', newFactors);
                          }}
                          className="w-3 h-3 rounded border-slate-300 text-indigo-600"
                        />
                        <span className="text-xs text-slate-600">{factor.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-500 mb-1">预测模型</label>
                  <select
                    value={strategy.model}
                    onChange={(e) => updateStrategy(strategy.id, 'model', e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {MODEL_OPTIONS.map(model => (
                      <option key={model.value} value={model.value}>{model.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 运行按钮 */}
        <button
          onClick={runCompare}
          disabled={isProcessing}
          className={`w-full py-3 rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors ${
            isProcessing
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          <Play className="w-5 h-5" />
          <span>{isProcessing ? '正在对比...' : '开始对比'}</span>
        </button>
      </div>

      {/* 结果展示 */}
      {result && (
        <div className="space-y-8">
          {/* 指标对比表格 */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h2 className="text-lg font-medium text-slate-900 mb-4">策略指标对比</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-3 px-4 font-medium text-slate-600">策略名称</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-600">年化收益</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-600">夏普比率</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-600">最大回撤</th>
                  </tr>
                </thead>
                <tbody>
                  {result.strategies.map((strategy, index) => (
                    <tr key={index} className="border-b border-slate-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="font-medium text-slate-900">{strategy.name}</span>
                        </div>
                      </td>
                      <td className={`text-right py-3 px-4 font-medium ${
                        strategy.metrics.annualizedReturn >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}>
                        {(strategy.metrics.annualizedReturn * 100).toFixed(2)}%
                      </td>
                      <td className="text-right py-3 px-4 text-slate-900">
                        {strategy.metrics.sharpeRatio.toFixed(2)}
                      </td>
                      <td className="text-right py-3 px-4 text-amber-600">
                        {(strategy.metrics.maxDrawdown * 100).toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 收益曲线对比图 */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h2 className="text-lg font-medium text-slate-900 mb-6">收益曲线对比</h2>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={getChartData()} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    minTickGap={30}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    tickFormatter={(val) => val.toFixed(2)}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => [value.toFixed(4), '']}
                    labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />

                  {/* 基准线 */}
                  <Line
                    type="monotone"
                    name="基准"
                    dataKey="基准"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="5 5"
                  />

                  {/* 策略线 */}
                  {result.strategies.map((strategy, index) => (
                    <Line
                      key={index}
                      type="monotone"
                      name={strategy.name}
                      dataKey={strategy.name}
                      stroke={COLORS[index % COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
