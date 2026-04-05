import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, ComposedChart, Bar } from 'recharts';
import { TrendingUp, TrendingDown, Activity, AlertTriangle } from 'lucide-react';

interface BacktestResultsProps {
  result: any;
  onReset: () => void;
}

export default function BacktestResults({ result, onReset }: BacktestResultsProps) {
  if (!result) return null;

  const { metrics, chartData, drawdownData } = result;

  const formatPercent = (val: number) => `${(val * 100).toFixed(2)}%`;
  const formatNumber = (val: number) => val.toFixed(2);

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">回测结果</h1>
          <p className="text-slate-500 mt-1">绩效指标与累计收益率。</p>
        </div>
        <button 
          onClick={onReset}
          className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          新建回测
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Annualized Return */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center space-x-3 mb-4">
            <div className={`p-2 rounded-lg ${metrics.annualizedReturn >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              {metrics.annualizedReturn >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            </div>
            <h3 className="text-sm font-medium text-slate-500">年化收益率</h3>
          </div>
          <p className={`text-3xl font-semibold ${metrics.annualizedReturn >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatPercent(metrics.annualizedReturn)}
          </p>
        </div>

        {/* Benchmark Return */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 rounded-lg bg-slate-50 text-slate-600">
              <Activity className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-medium text-slate-500">基准收益率</h3>
          </div>
          <p className="text-3xl font-semibold text-slate-900">
            {formatPercent(metrics.benchmarkReturn)}
          </p>
        </div>

        {/* Sharpe Ratio */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-medium text-slate-500">夏普比率</h3>
          </div>
          <p className="text-3xl font-semibold text-slate-900">
            {formatNumber(metrics.sharpeRatio)}
          </p>
        </div>

        {/* Max Drawdown */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-medium text-slate-500">最大回撤</h3>
          </div>
          <p className="text-3xl font-semibold text-amber-600">
            {formatPercent(metrics.maxDrawdown)}
          </p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
        <h2 className="text-lg font-medium text-slate-900 mb-6">累计收益率</h2>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
              <Line 
                type="monotone" 
                name="策略收益"
                dataKey="strategy" 
                stroke="#6366f1" 
                strokeWidth={2} 
                dot={false}
                activeDot={{ r: 6, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                name="基准收益 (沪深300)"
                dataKey="benchmark"
                stroke="#94a3b8"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6, fill: '#94a3b8', stroke: '#fff', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 回撤图表 */}
      {drawdownData && drawdownData.length > 0 && (
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-lg font-medium text-slate-900 mb-6">策略回撤</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={drawdownData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <defs>
                  <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
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
                  tickFormatter={(val) => `${(val * 100).toFixed(0)}%`}
                  domain={[0, 'auto']}
                  reversed
                />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`${(value * 100).toFixed(2)}%`, '回撤']}
                  labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                />
                <Area
                  type="monotone"
                  dataKey="drawdown"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fill="url(#drawdownGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
