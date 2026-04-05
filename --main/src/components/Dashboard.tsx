import React, { useEffect, useState, useRef } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, IChartApi, ISeriesApi, LineSeries, LineType } from 'lightweight-charts';
import { Activity, TrendingUp, Layers, Search, X, TrendingDown, Volume2 } from 'lucide-react';

interface DashboardStats {
  marketHeat: number;
  activeFactors: number;
  totalStrategies: number;
  dateRange?: { start: string; end: string };
  factorDistribution: { name: string; value: number }[];
}

interface MarketDataPoint {
  trade_date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  vol?: number | null;
  amount: number | null;
  pe: number | null;
  pb: number | null;
  pcf: number | null;
  ps: number | null;
  turnover: number | null;
  change_ratio: number | null;
  circulated_mv: number | null;
  total_mv: number | null;
  limit_up: number | null;
  limit_down: number | null;
  limit_status: number | null;
  pre_close: number | null;
}

interface MarketData {
  updateTime: string;
  symbol: string;
  stockName: string;
  source: string;
  data: MarketDataPoint[];
}

interface StockSearchResult {
  ts_code: string;
  symbol: string;
  name: string;
  industry: string;
}

interface IndicatorData {
  ma5?: (number | null)[];
  ma10?: (number | null)[];
  ma20?: (number | null)[];
  ma60?: (number | null)[];
  bollUpper?: (number | null)[];
  bollMid?: (number | null)[];
  bollLower?: (number | null)[];
  macd?: (number | null)[];
  dif?: (number | null)[];
  dea?: (number | null)[];
}

// TradingView 风格 K 线图组件
const TradingViewChart = ({
  data,
  indicators,
  indicatorData
}: {
  data: MarketDataPoint[];
  indicators: { ma: boolean; macd: boolean; boll: boolean };
  indicatorData: IndicatorData | null;
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#333',
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      width: chartContainerRef.current.clientWidth,
      height: indicators.macd ? 600 : 500,
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#758696',
          width: 1,
          style: 3,
          labelBackgroundColor: '#2962FF',
        },
        horzLine: {
          color: '#758696',
          width: 1,
          style: 3,
          labelBackgroundColor: '#2962FF',
        },
      },
      rightPriceScale: {
        borderColor: '#e1e1e1',
        scaleMargins: {
          top: 0.1,
          bottom: indicators.macd ? 0.25 : 0.2,
        },
      },
      timeScale: {
        borderColor: '#e1e1e1',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // K线数据
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ef5350',
      downColor: '#26a69a',
      borderVisible: false,
      wickUpColor: '#ef5350',
      wickDownColor: '#26a69a',
    });

    // 成交量
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: indicators.macd ? 0.75 : 0.85,
        bottom: indicators.macd ? 0.55 : 0,
      },
    });

    // 准备数据
    // 处理日期格式：API 可能返回 ISO 格式或 YYYYMMDD 格式
    const formatDate = (dateStr: string): string => {
      if (dateStr.includes('T')) {
        // ISO 格式: 2022-06-05T16:00:00.000Z -> 2022-06-05
        return dateStr.split('T')[0];
      } else if (dateStr.length === 8) {
        // YYYYMMDD 格式: 20220605 -> 2022-06-05
        return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
      }
      return dateStr;
    };

    const getVolume = (d: MarketDataPoint): number | null => d.volume ?? d.vol ?? null;

    const candleData = data
      .filter(d => d.open !== null && d.high !== null && d.low !== null && d.close !== null)
      .map(d => ({
        time: formatDate(d.trade_date) as any,
        open: d.open!,
        high: d.high!,
        low: d.low!,
        close: d.close!,
      }));

    const volumeData = data
      .filter(d => getVolume(d) !== null && d.close !== null && d.open !== null)
      .map(d => ({
        time: formatDate(d.trade_date) as any,
        value: getVolume(d)!,
        color: d.close! >= d.open! ? 'rgba(239, 83, 80, 0.5)' : 'rgba(38, 166, 154, 0.5)',
      }));

    candlestickSeries.setData(candleData);
    volumeSeries.setData(volumeData);

    // 添加MA指标
    const maSeries: ISeriesApi<'Line'>[] = [];
    if (indicators.ma && indicatorData) {
      const maColors = { ma5: '#f59e0b', ma10: '#3b82f6', ma20: '#10b981', ma60: '#8b5cf6' };

      if (indicatorData.ma5) {
        const ma5Series = chart.addSeries(LineSeries, {
          color: maColors.ma5,
          lineWidth: 1,
          priceScaleId: 'right',
        });
        const ma5Data = data
          .filter((_, i) => indicatorData.ma5![i] !== null)
          .map((d, i) => ({
            time: formatDate(d.trade_date) as any,
            value: indicatorData.ma5![data.indexOf(d)]!,
          }));
        ma5Series.setData(ma5Data);
        maSeries.push(ma5Series);
      }

      if (indicatorData.ma10) {
        const ma10Series = chart.addSeries(LineSeries, {
          color: maColors.ma10,
          lineWidth: 1,
          priceScaleId: 'right',
        });
        const ma10Data = data
          .filter((_, i) => indicatorData.ma10![i] !== null)
          .map((d, i) => ({
            time: formatDate(d.trade_date) as any,
            value: indicatorData.ma10![data.indexOf(d)]!,
          }));
        ma10Series.setData(ma10Data);
        maSeries.push(ma10Series);
      }

      if (indicatorData.ma20) {
        const ma20Series = chart.addSeries(LineSeries, {
          color: maColors.ma20,
          lineWidth: 1,
          priceScaleId: 'right',
        });
        const ma20Data = data
          .filter((_, i) => indicatorData.ma20![i] !== null)
          .map((d, i) => ({
            time: formatDate(d.trade_date) as any,
            value: indicatorData.ma20![data.indexOf(d)]!,
          }));
        ma20Series.setData(ma20Data);
        maSeries.push(ma20Series);
      }
    }

    // 添加BOLL指标
    if (indicators.boll && indicatorData) {
      if (indicatorData.bollUpper) {
        const bollUpperSeries = chart.addSeries(LineSeries, {
          color: '#f97316',
          lineWidth: 1,
          lineType: LineType.Dashed,
          priceScaleId: 'right',
        });
        const bollUpperData = data
          .filter((_, i) => indicatorData.bollUpper![i] !== null)
          .map((d) => ({
            time: formatDate(d.trade_date) as any,
            value: indicatorData.bollUpper![data.indexOf(d)]!,
          }));
        bollUpperSeries.setData(bollUpperData);
      }

      if (indicatorData.bollMid) {
        const bollMidSeries = chart.addSeries(LineSeries, {
          color: '#6366f1',
          lineWidth: 1,
          priceScaleId: 'right',
        });
        const bollMidData = data
          .filter((_, i) => indicatorData.bollMid![i] !== null)
          .map((d) => ({
            time: formatDate(d.trade_date) as any,
            value: indicatorData.bollMid![data.indexOf(d)]!,
          }));
        bollMidSeries.setData(bollMidData);
      }

      if (indicatorData.bollLower) {
        const bollLowerSeries = chart.addSeries(LineSeries, {
          color: '#f97316',
          lineWidth: 1,
          lineType: LineType.Dashed,
          priceScaleId: 'right',
        });
        const bollLowerData = data
          .filter((_, i) => indicatorData.bollLower![i] !== null)
          .map((d) => ({
            time: formatDate(d.trade_date) as any,
            value: indicatorData.bollLower![data.indexOf(d)]!,
          }));
        bollLowerSeries.setData(bollLowerData);
      }
    }

    // 添加MACD指标（在K线下方）
    if (indicators.macd && indicatorData) {
      const macdPane = chart.addSeries(LineSeries, {
        color: '#ef4444',
        lineWidth: 1,
        priceScaleId: 'macd',
      });

      macdPane.priceScale().applyOptions({
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });

      if (indicatorData.dif) {
        const difSeries = chart.addSeries(LineSeries, {
          color: '#3b82f6',
          lineWidth: 1,
          priceScaleId: 'macd',
        });
        const difData = data
          .filter((_, i) => indicatorData.dif![i] !== null)
          .map((d) => ({
            time: formatDate(d.trade_date) as any,
            value: indicatorData.dif![data.indexOf(d)]!,
          }));
        difSeries.setData(difData);
      }

      if (indicatorData.dea) {
        const deaSeries = chart.addSeries(LineSeries, {
          color: '#f59e0b',
          lineWidth: 1,
          priceScaleId: 'macd',
        });
        const deaData = data
          .filter((_, i) => indicatorData.dea![i] !== null)
          .map((d) => ({
            time: formatDate(d.trade_date) as any,
            value: indicatorData.dea![data.indexOf(d)]!,
          }));
        deaSeries.setData(deaData);
      }
    }

    chart.timeScale().fitContent();

    chartRef.current = chart;
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, indicators, indicatorData]);

  return <div ref={chartContainerRef} className="w-full" style={{ height: indicators.macd ? 600 : 500 }} />;
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState('000001');
  const [selectedName, setSelectedName] = useState('平安银行');

  // 技术指标状态
  const [indicators, setIndicators] = useState({ ma: false, macd: false, boll: false });
  const [indicatorData, setIndicatorData] = useState<IndicatorData | null>(null);

  // 搜索相关状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/dashboard/stats');
        const data = await res.json();
        setStats(data);
      } catch (err) {
        console.error('获取统计数据失败:', err);
      }
    };
    fetchStats();
  }, []);

  useEffect(() => {
    const fetchMarketData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/market/latest?symbol=${selectedSymbol}`);
        const data = await res.json();
        if (data.error) {
          console.error('获取行情数据失败:', data.error);
          setMarketData(null);
        } else {
          setMarketData(data);
          if (data.stockName) {
            setSelectedName(data.stockName);
          }
        }
      } catch (err) {
        console.error('获取行情数据失败:', err);
        setMarketData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchMarketData();
  }, [selectedSymbol]);

  // 获取技术指标数据
  useEffect(() => {
    const fetchIndicators = async () => {
      if (!indicators.ma && !indicators.macd && !indicators.boll) {
        setIndicatorData(null);
        return;
      }

      try {
        const indicatorList = [];
        if (indicators.ma) indicatorList.push('ma');
        if (indicators.macd) indicatorList.push('macd');
        if (indicators.boll) indicatorList.push('boll');

        const res = await fetch(`/api/indicators?symbol=${selectedSymbol}&indicators=${indicatorList.join(',')}`);
        const data = await res.json();
        setIndicatorData(data);
      } catch (err) {
        console.error('获取技术指标失败:', err);
      }
    };

    fetchIndicators();
  }, [selectedSymbol, indicators]);

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

  if (!stats) return <div className="p-8 text-slate-500">正在加载仪表盘...</div>;

  const latestData = marketData?.data?.[marketData.data.length - 1]; // 最新数据（数组末尾）
  const prevData = marketData?.data?.[marketData.data.length - 2]; // 前一日数据
  const latestChange = latestData?.change_ratio;
  const isPositive = latestChange && latestChange > 0;

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">仪表盘</h1>
          <p className="text-slate-500 mt-1">市场概览与K线行情</p>
        </div>

        {/* 搜索框 */}
        <div className="relative w-full md:w-80">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索股票代码或名称 (如: 三一重工)"
              className="w-full pl-10 pr-10 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery.length >= 1 && setShowSearchDropdown(true)}
            />
            {searchQuery && (
              <button
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
                      className="w-full px-4 py-3 text-left hover:bg-slate-50 flex items-center justify-between border-b border-slate-50 last:border-0"
                      onClick={() => handleSelectStock(stock)}
                    >
                      <div>
                        <p className="font-medium text-slate-900">{stock.name}</p>
                        <p className="text-xs text-slate-500">{stock.symbol}</p>
                      </div>
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">
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

      {/* 股票信息看板 */}
      {loading ? (
        <div className="h-48 bg-slate-100 animate-pulse rounded-2xl flex items-center justify-center text-slate-400">
          正在获取数据...
        </div>
      ) : latestData && latestData.close ? (
        <div className={`bg-gradient-to-br ${isPositive ? 'from-red-500 to-orange-500' : 'from-green-500 to-teal-500'} p-6 rounded-2xl shadow-lg text-white`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <span className="bg-white/20 px-3 py-1 rounded text-sm font-medium">
                {marketData?.symbol}
              </span>
              <h2 className="text-2xl font-bold">{selectedName}</h2>
            </div>
            <div className="text-right">
              <p className="text-4xl font-bold">¥{latestData.close?.toFixed(2)}</p>
              <p className={`text-lg flex items-center justify-end gap-1 ${isPositive ? 'text-white' : 'text-white/90'}`}>
                {isPositive ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                {latestChange ? `${isPositive ? '+' : ''}${(latestChange * 100).toFixed(2)}%` : ''}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t border-white/20">
            <div>
              <p className="text-xs opacity-70">今开</p>
              <p className="text-lg font-semibold">{latestData.open?.toFixed(2) || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs opacity-70">最高</p>
              <p className="text-lg font-semibold text-white">{latestData.high?.toFixed(2) || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs opacity-70">最低</p>
              <p className="text-lg font-semibold text-white">{latestData.low?.toFixed(2) || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs opacity-70">成交量</p>
              <p className="text-lg font-semibold">{(latestData.volume ?? latestData.vol) ? `${((latestData.volume ?? latestData.vol) / 10000).toFixed(0)}万手` : 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs opacity-70">成交额</p>
              <p className="text-lg font-semibold">{latestData.amount ? `${(latestData.amount / 100000000).toFixed(2)}亿` : 'N/A'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 mt-4 border-t border-white/20">
            <div>
              <p className="text-xs opacity-70">涨停价</p>
              <p className="text-lg font-semibold text-red-200">{latestData.limit_up?.toFixed(2) || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs opacity-70">跌停价</p>
              <p className="text-lg font-semibold text-green-200">{latestData.limit_down?.toFixed(2) || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs opacity-70">市盈率 PE</p>
              <p className="text-lg font-semibold">{latestData.pe?.toFixed(2) || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs opacity-70">市净率 PB</p>
              <p className="text-lg font-semibold">{latestData.pb?.toFixed(2) || 'N/A'}</p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs opacity-50">
            <span>数据源: {marketData?.source}</span>
            <span>更新时间: {marketData?.updateTime}</span>
          </div>
        </div>
      ) : (
        <div className="h-48 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center text-red-500">
          暂时无法获取该股票数据，请检查股票代码是否正确
        </div>
      )}

      {/* TradingView K 线图 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-slate-900">
            {selectedName} ({selectedSymbol}) K线图
          </h2>
          <div className="flex items-center space-x-4 text-xs">
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
              <span className="text-slate-500">上涨</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-teal-500 rounded-sm"></div>
              <span className="text-slate-500">下跌</span>
            </div>
            <div className="flex items-center space-x-1">
              <Volume2 className="w-4 h-4 text-slate-400" />
              <span className="text-slate-500">成交量</span>
            </div>
          </div>
        </div>

        {/* 技术指标选择器 */}
        <div className="flex items-center space-x-4 mb-4 p-3 bg-slate-50 rounded-lg">
          <span className="text-sm font-medium text-slate-600">技术指标:</span>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={indicators.ma}
              onChange={(e) => setIndicators(prev => ({ ...prev, ma: e.target.checked }))}
              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-600">MA均线</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={indicators.macd}
              onChange={(e) => setIndicators(prev => ({ ...prev, macd: e.target.checked }))}
              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-600">MACD</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={indicators.boll}
              onChange={(e) => setIndicators(prev => ({ ...prev, boll: e.target.checked }))}
              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-600">BOLL布林带</span>
          </label>
        </div>

        {/* 指标图例 */}
        {(indicators.ma || indicators.macd || indicators.boll) && (
          <div className="flex items-center space-x-4 mb-4 text-xs">
            {indicators.ma && (
              <>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-0.5 bg-amber-500"></div>
                  <span className="text-slate-500">MA5</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-0.5 bg-blue-500"></div>
                  <span className="text-slate-500">MA10</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-0.5 bg-emerald-500"></div>
                  <span className="text-slate-500">MA20</span>
                </div>
              </>
            )}
            {indicators.boll && (
              <>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-0.5 border-t-2 border-dashed border-orange-500"></div>
                  <span className="text-slate-500">BOLL上轨</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-0.5 bg-indigo-500"></div>
                  <span className="text-slate-500">BOLL中轨</span>
                </div>
              </>
            )}
            {indicators.macd && (
              <>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-0.5 bg-blue-500"></div>
                  <span className="text-slate-500">DIF</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-0.5 bg-amber-500"></div>
                  <span className="text-slate-500">DEA</span>
                </div>
              </>
            )}
          </div>
        )}

        <div className="w-full">
          {!loading && marketData?.data && marketData.data.length > 0 && (
            <TradingViewChart data={marketData.data} indicators={indicators} indicatorData={indicatorData} />
          )}
          {!loading && (!marketData?.data || marketData.data.length === 0) && (
            <div className="h-[500px] flex items-center justify-center text-slate-400">暂无K线数据</div>
          )}
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">市场热度</p>
              <p className="text-3xl font-semibold text-slate-900 mt-2">{stats.marketHeat}°</p>
              <p className="text-xs text-slate-400 mt-1">上涨股票占比</p>
            </div>
            <div className="p-3 bg-red-50 text-red-600 rounded-lg">
              <Activity className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">活跃因子数</p>
              <p className="text-3xl font-semibold text-slate-900 mt-2">{stats.activeFactors}</p>
              <p className="text-xs text-slate-400 mt-1">当前追踪因子</p>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
              <Layers className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">股票数量</p>
              <p className="text-3xl font-semibold text-slate-900 mt-2">{stats.totalStrategies.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">
                {stats.dateRange ? `${stats.dateRange.start} ~ ${stats.dateRange.end}` : '数据库覆盖'}
              </p>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* 因子分布图 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h2 className="text-lg font-medium text-slate-900 mb-6">因子分布</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.factorDistribution} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
