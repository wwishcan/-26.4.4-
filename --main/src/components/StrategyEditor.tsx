import React, { useState, useEffect } from 'react';
import { Play, Upload, FileCode, AlertCircle, Check, Copy, Search, X, ActivitySquare } from 'lucide-react';

interface StrategyEditorProps {
  onRunBacktest: (config: any) => void;
  isProcessing: boolean;
}

interface StockSearchResult {
  ts_code: string;
  symbol: string;
  name: string;
  industry: string;
}

interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  code: string;
}

const DEFAULT_CODE = `// 自定义策略模板
// context 包含: current, history, index, helpers
// 返回 { position: number } position范围 0-1.5

function strategy(context) {
  const { current, helpers, index } = context;

  // 示例: 简单PE估值策略
  if (current.pe && current.pe < 15) {
    return { position: 1.2 }; // 低估值加仓
  } else if (current.pe && current.pe > 50) {
    return { position: 0.5 }; // 高估值减仓
  }

  return { position: 1 }; // 默认满仓
}`;

export default function StrategyEditor({ onRunBacktest, isProcessing }: StrategyEditorProps) {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [validation, setValidation] = useState<{ valid: boolean; error?: string } | null>(null);
  const [templates, setTemplates] = useState<StrategyTemplate[]>([]);

  // 股票选择相关
  const [selectedSymbol, setSelectedSymbol] = useState('600031');
  const [selectedName, setSelectedName] = useState('三一重工');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // 日期范围
  const [startDate, setStartDate] = useState('2023-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');

  // 上传模式
  const [activeTab, setActiveTab] = useState<'editor' | 'upload'>('editor');

  // 加载模板
  useEffect(() => {
    fetch('/api/strategy/templates')
      .then(res => res.json())
      .then(data => setTemplates(data.templates || []))
      .catch(console.error);
  }, []);

  // 处理搜索
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length >= 1) {
        setIsSearching(true);
        try {
          const res = await fetch(`/api/market/search?q=${encodeURIComponent(searchQuery)}`);
          const data = await res.json();
          setSearchResults(data);
          setShowSearchDropdown(true);
        } catch (err) {
          console.error('搜索失败:', err);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
        setShowSearchDropdown(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectStock = (stock: StockSearchResult) => {
    setSelectedSymbol(stock.symbol);
    setSelectedName(stock.name);
    setSearchQuery('');
    setShowSearchDropdown(false);
  };

  // 验证代码
  const validateCode = async () => {
    try {
      const res = await fetch('/api/strategy/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const result = await res.json();
      setValidation(result);
    } catch (error) {
      setValidation({ valid: false, error: '验证请求失败' });
    }
  };

  // 提交回测
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const config = {
      symbol: selectedSymbol,
      startDate,
      endDate,
      strategyCode: code,
      isCustom: true
    };

    console.log('提交自定义策略回测:', config);
    onRunBacktest(config);
  };

  // 文件上传处理
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCode(content);
      setActiveTab('editor');
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">策略编辑器</h1>
        <p className="text-slate-500 mt-1">编写自定义策略代码并运行回测</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 左侧: 配置区 */}
        <div className="space-y-6">
          {/* 股票选择 */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="font-medium text-slate-900 mb-4 flex items-center gap-2">
              <Search className="w-4 h-4 text-blue-500" />
              回测标的
            </h3>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 mb-4">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">当前选择</p>
              <p className="text-lg font-bold text-slate-900">{selectedName} <span className="text-slate-400 font-normal ml-2">{selectedSymbol}</span></p>
            </div>

            <div className="relative">
              <label className="block text-xs font-medium text-slate-500 mb-1">更换标的</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索代码或名称..."
                  className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => searchQuery.length >= 1 && setShowSearchDropdown(true)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {showSearchDropdown && (
                <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                  {isSearching ? (
                    <div className="p-4 text-center text-sm text-slate-500">搜索中...</div>
                  ) : searchResults.length > 0 ? (
                    <div className="max-h-48 overflow-y-auto">
                      {searchResults.map((stock) => (
                        <button
                          key={stock.symbol}
                          type="button"
                          className="w-full px-4 py-2.5 text-left hover:bg-slate-50 flex items-center justify-between border-b border-slate-50 last:border-0"
                          onClick={() => handleSelectStock(stock)}
                        >
                          <div>
                            <p className="font-medium text-slate-900 text-sm">{stock.name}</p>
                            <p className="text-[10px] text-slate-500">{stock.symbol}</p>
                          </div>
                          <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-1 rounded">
                            {stock.industry}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-sm text-slate-500">未找到相关股票</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 日期范围 */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="font-medium text-slate-900 mb-4">回测区间</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">开始日期</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">结束日期</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                />
              </div>
            </div>
          </div>

          {/* 策略模板 */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="font-medium text-slate-900 mb-4">策略模板</h3>
            <div className="space-y-2">
              {templates.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setCode(t.code);
                    setValidation(null);
                  }}
                  className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/50 transition-colors"
                >
                  <p className="font-medium text-sm text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 右侧: 代码编辑区 */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden h-full flex flex-col">
            {/* Tab 切换 */}
            <div className="flex border-b border-slate-100">
              <button
                type="button"
                onClick={() => setActiveTab('editor')}
                className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${
                  activeTab === 'editor'
                    ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <FileCode className="w-4 h-4" />
                代码编辑
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${
                  activeTab === 'upload'
                    ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Upload className="w-4 h-4" />
                上传文件
              </button>
            </div>

            {/* 编辑器/上传区域 */}
            {activeTab === 'editor' ? (
              <div className="relative flex-1">
                <textarea
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setValidation(null);
                  }}
                  className="w-full h-full min-h-[500px] p-4 font-mono text-sm bg-slate-50 border-0 focus:outline-none focus:ring-0 resize-none leading-relaxed"
                  placeholder="在此编写策略代码..."
                  spellCheck={false}
                />
                <div className="absolute top-3 right-3 flex gap-2">
                  <button
                    type="button"
                    onClick={validateCode}
                    className="p-2 bg-white rounded-lg shadow hover:bg-slate-50 transition-colors"
                    title="验证代码"
                  >
                    <Check className="w-4 h-4 text-slate-600" />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(code)}
                    className="p-2 bg-white rounded-lg shadow hover:bg-slate-50 transition-colors"
                    title="复制代码"
                  >
                    <Copy className="w-4 h-4 text-slate-600" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-lg m-4">
                <Upload className="w-12 h-12 text-slate-300 mb-4" />
                <p className="text-slate-500 mb-4">拖拽文件到此处或点击上传</p>
                <p className="text-xs text-slate-400 mb-4">支持 .js 文件</p>
                <input
                  type="file"
                  accept=".js,.ts"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
                >
                  选择文件
                </label>
              </div>
            )}

            {/* 验证结果 */}
            {validation && (
              <div className={`p-4 ${validation.valid ? 'bg-green-50' : 'bg-red-50'}`}>
                {validation.valid ? (
                  <p className="text-green-600 text-sm flex items-center">
                    <Check className="w-4 h-4 mr-2" />
                    代码语法正确
                  </p>
                ) : (
                  <p className="text-red-600 text-sm flex items-center">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    {validation.error}
                  </p>
                )}
              </div>
            )}

            {/* 操作按钮 */}
            <div className="p-4 border-t border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="text-xs text-slate-400">
                提示: position 范围 0-1.5，1 表示满仓
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={validateCode}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                >
                  验证语法
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isProcessing}
                  className={`px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all ${
                    isProcessing
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      运行中...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      运行回测
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* API 说明 */}
      <div className="mt-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="font-medium text-slate-900 mb-4">策略 API 说明</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div>
            <h4 className="font-medium text-slate-700 mb-2">context 对象</h4>
            <table className="w-full text-left">
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2 text-slate-600 font-mono text-xs">current</td>
                  <td className="py-2 text-slate-500">当天数据 (OHLCV, PE, PB等)</td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-600 font-mono text-xs">history</td>
                  <td className="py-2 text-slate-500">历史数据数组</td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-600 font-mono text-xs">index</td>
                  <td className="py-2 text-slate-500">当前索引位置</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <h4 className="font-medium text-slate-700 mb-2">helpers 辅助函数</h4>
            <table className="w-full text-left">
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2 text-slate-600 font-mono text-xs">sma(period)</td>
                  <td className="py-2 text-slate-500">计算移动平均</td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-600 font-mono text-xs">getPrev(days)</td>
                  <td className="py-2 text-slate-500">获取N天前数据</td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-600 font-mono text-xs">max(field, period)</td>
                  <td className="py-2 text-slate-500">计算区间最大值</td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-600 font-mono text-xs">min(field, period)</td>
                  <td className="py-2 text-slate-500">计算区间最小值</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
