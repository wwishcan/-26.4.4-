import React, { useState, useEffect } from 'react';
import { Play, Settings2, Calendar, Database, Search, X, ActivitySquare } from 'lucide-react';

interface StrategyConfigProps {
  onRunBacktest: (config: any) => void;
  isProcessing: boolean;
}

interface StockSearchResult {
  ts_code: string;
  symbol: string;
  name: string;
  industry: string;
}

const FACTORS = [
  { id: 'pe', label: 'PE 市盈率', desc: '低PE价值策略' },
  { id: 'pb', label: 'PB 市净率', desc: '低PB价值策略' },
  { id: 'ps', label: 'PS 市销率', desc: '低PS成长策略' },
  { id: 'change_ratio', label: '涨跌幅', desc: '动量/反转策略' },
  { id: 'volume', label: '成交量', desc: '量价策略' },
  { id: 'limit_status', label: '涨跌停', desc: '涨停板策略' },
];

const MODELS = [
  { id: 'linear_regression', label: '线性回归', desc: '基础模型' },
  { id: 'random_forest', label: '随机森林', desc: '集成学习' },
  { id: 'lstm', label: 'LSTM', desc: '深度学习' },
];

export default function StrategyConfig({ onRunBacktest, isProcessing }: StrategyConfigProps) {
  const [selectedFactors, setSelectedFactors] = useState<string[]>(['pe', 'pb']);
  const [selectedModel, setSelectedModel] = useState<string>('random_forest');
  const [startDate, setStartDate] = useState('2023-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');

  // 股票选择相关
  const [selectedSymbol, setSelectedSymbol] = useState('600031');
  const [selectedName, setSelectedName] = useState('三一重工');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

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

  const toggleFactor = (id: string) => {
    setSelectedFactors(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFactors.length === 0) {
      alert('请至少选择一个因子。');
      return;
    }

    const config = {
      symbol: selectedSymbol,
      factors: selectedFactors,
      model: selectedModel,
      startDate,
      endDate
    };

    console.log('提交回测配置:', config);
    onRunBacktest(config);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">策略配置</h1>
        <p className="text-slate-500 mt-1">配置您的多因子策略与机器学习模型</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8 bg-white p-8 rounded-2xl shadow-sm border border-slate-100">

        {/* Stock Selection */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2 text-slate-900 font-medium">
            <Search className="w-5 h-5 text-blue-500" />
            <h3>回测标的</h3>
          </div>

          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">当前选择</p>
                  <p className="text-lg font-bold text-slate-900">{selectedName} <span className="text-slate-400 font-normal ml-2">{selectedSymbol}</span></p>
                </div>
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm">
                  <ActivitySquare className="w-5 h-5 text-indigo-600" />
                </div>
              </div>
            </div>

            <div className="flex-1 relative">
              <label className="block text-xs font-medium text-slate-500 mb-1">更换标的</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索代码或名称..."
                  className="w-full pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
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
                    <div className="max-h-60 overflow-y-auto">
                      {searchResults.map((stock) => (
                        <button
                          key={stock.symbol}
                          type="button"
                          className="w-full px-4 py-3 text-left hover:bg-slate-50 flex items-center justify-between border-b border-slate-50 last:border-0"
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
        </div>

        <hr className="border-slate-100" />
        <div className="space-y-4">
          <div className="flex items-center space-x-2 text-slate-900 font-medium">
            <Database className="w-5 h-5 text-indigo-500" />
            <h3>因子选择</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {FACTORS.map(factor => (
              <label
                key={factor.id}
                className={`flex flex-col p-4 rounded-xl border cursor-pointer transition-colors ${
                  selectedFactors.includes(factor.id)
                    ? 'border-indigo-500 bg-indigo-50/50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={selectedFactors.includes(factor.id)}
                    onChange={() => toggleFactor(factor.id)}
                  />
                  <div className={`w-5 h-5 rounded border flex items-center justify-center mr-3 ${
                    selectedFactors.includes(factor.id) ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'
                  }`}>
                    {selectedFactors.includes(factor.id) && <div className="w-2 h-2 bg-white rounded-sm" />}
                  </div>
                  <span className={`text-sm font-medium ${selectedFactors.includes(factor.id) ? 'text-indigo-900' : 'text-slate-700'}`}>
                    {factor.label}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-2 ml-8">{factor.desc}</p>
              </label>
            ))}
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* Model Selection */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2 text-slate-900 font-medium">
            <Settings2 className="w-5 h-5 text-emerald-500" />
            <h3>机器学习模型</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {MODELS.map(model => (
              <label
                key={model.id}
                className={`flex flex-col p-4 rounded-xl border cursor-pointer transition-colors ${
                  selectedModel === model.id
                    ? 'border-emerald-500 bg-emerald-50/50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center">
                  <input
                    type="radio"
                    name="model"
                    className="hidden"
                    checked={selectedModel === model.id}
                    onChange={() => setSelectedModel(model.id)}
                  />
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center mr-3 ${
                    selectedModel === model.id ? 'border-emerald-500' : 'border-slate-300'
                  }`}>
                    {selectedModel === model.id && <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />}
                  </div>
                  <span className={`text-sm font-medium ${selectedModel === model.id ? 'text-emerald-900' : 'text-slate-700'}`}>
                    {model.label}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-2 ml-8">{model.desc}</p>
              </label>
            ))}
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* Date Range */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2 text-slate-900 font-medium">
            <Calendar className="w-5 h-5 text-amber-500" />
            <h3>回测区间</h3>
          </div>
          <div className="flex space-x-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">开始日期</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">结束日期</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={isProcessing}
            className={`w-full flex items-center justify-center py-4 px-6 rounded-xl text-white font-medium transition-all ${
              isProcessing
                ? 'bg-slate-300 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg hover:-translate-y-0.5'
            }`}
          >
            {isProcessing ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-3" />
                正在执行回测...
              </>
            ) : (
              <>
                <Play className="w-5 h-5 mr-2" />
                运行回测
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
