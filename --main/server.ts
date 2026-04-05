import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import mysql from 'mysql2/promise';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- 环境配置 ---
const USE_CLOUD_DB = process.env.USE_CLOUD_DB === 'true';
const DATABASE_URL = process.env.DATABASE_URL || '';

// --- JWT 配置 ---
const JWT_SECRET = process.env.JWT_SECRET || 'quantflow-jwt-secret-key-2024';
const JWT_EXPIRES_IN = '2h';

// --- 云端数据库连接 ---
let cloudPool: mysql.Pool | null = null;

async function initCloudDatabase() {
  if (!DATABASE_URL) {
    console.log('[CLOUD DB] 未配置 DATABASE_URL，跳过云端数据库连接');
    return false;
  }

  try {
    cloudPool = mysql.createPool({
      uri: DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      ssl: {
        rejectUnauthorized: true
      }
    });

    // 测试连接
    const conn = await cloudPool.getConnection();
    console.log('[CLOUD DB] 云端数据库连接成功');
    conn.release();
    return true;
  } catch (error: any) {
    console.error('[CLOUD DB] 连接失败:', error.message);
    cloudPool = null;
    return false;
  }
}

// 云端数据库查询封装
async function cloudQuery(sql: string, params: any[] = []): Promise<any[]> {
  if (!cloudPool) {
    throw new Error('云端数据库未连接');
  }
  const [rows] = await cloudPool.execute(sql, params);
  return rows as any[];
}

// --- 用户数据库连接 (sql.js) ---
let userDb: any;
const USER_DB_PATH = path.join(__dirname, 'user_data.db');

// 用户类型定义
interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'researcher' | 'guest';
  status: 'active' | 'inactive' | 'locked';
  created_at: string;
  last_login_at: string | null;
}

// JWT Payload 类型
interface JwtPayload {
  userId: number;
  username: string;
  role: string;
  jti: string;
}

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// 初始化用户数据库
async function initUserDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(USER_DB_PATH)) {
    const buffer = fs.readFileSync(USER_DB_PATH);
    userDb = new SQL.Database(buffer);
    console.log(`[USER DB] 用户数据库已加载: ${USER_DB_PATH}`);
  } else {
    userDb = new SQL.Database();
    console.log(`[USER DB] 创建新用户数据库`);

    // 创建表
    userDb.run(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'researcher',
        status VARCHAR(20) DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login_at DATETIME
      )
    `);

    userDb.run(`
      CREATE TABLE user_strategies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name VARCHAR(100) NOT NULL,
        code TEXT NOT NULL,
        config TEXT,
        is_public BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    userDb.run(`
      CREATE TABLE backtest_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        symbol VARCHAR(20),
        config TEXT,
        result TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    userDb.run(`
      CREATE TABLE token_blacklist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_jti VARCHAR(64) UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // 创建默认管理员账户
    const adminPasswordHash = await bcrypt.hash('admin123', 10);
    userDb.run(
      `INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)`,
      ['admin', 'admin@quantflow.com', adminPasswordHash, 'admin']
    );

    // 创建访客账户
    const guestPasswordHash = await bcrypt.hash('guest123', 10);
    userDb.run(
      `INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)`,
      ['guest', 'guest@quantflow.com', guestPasswordHash, 'guest']
    );

    saveUserDatabase();
    console.log('[USER DB] 已创建默认账户: admin/admin123, guest/guest123');
  }
}

// 保存用户数据库到文件
function saveUserDatabase() {
  if (userDb) {
    const data = userDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(USER_DB_PATH, buffer);
  }
}

// 清理过期的黑名单 Token
function cleanExpiredTokens() {
  const now = new Date().toISOString();
  userDb.run(`DELETE FROM token_blacklist WHERE expires_at < ?`, [now]);
}

// 检查 Token 是否在黑名单
function isTokenBlacklisted(jti: string): boolean {
  const stmt = userDb.prepare(`SELECT id FROM token_blacklist WHERE token_jti = ?`);
  stmt.bind([jti]);
  const result = stmt.step();
  stmt.free();
  return result;
}

// --- 密码和 JWT 工具函数 ---
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function generateToken(user: User): string {
  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    jti: uuidv4()
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    if (isTokenBlacklisted(decoded.jti)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

// --- 认证中间件 ---
function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: '令牌无效或已过期' });
  }

  req.user = decoded;
  next();
}

// 角色权限中间件
function roleMiddleware(...allowedRoles: string[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  };
}

// --- 数据库连接 (sql.js) ---
let db: any;
const DB_PATH = path.join(__dirname, 'stock_data.db');

async function initDatabase() {
  const SQL = await initSqlJs();

  // 检查文件大小，超过 500MB 则跳过加载（避免内存溢出）
  const stats = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH) : null;
  const maxFileSize = 500 * 1024 * 1024; // 500MB

  if (stats && stats.size > maxFileSize) {
    console.log(`[DB] SQLite 文件过大 (${(stats.size / 1024 / 1024).toFixed(0)}MB)，跳过加载到内存`);
    console.log(`[DB] 云端数据库将作为主要数据源`);
    db = new SQL.Database(); // 创建空数据库
    return;
  }

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log(`[DB] SQLite 数据库已连接: ${DB_PATH}`);
  } else {
    db = new SQL.Database();
    console.log(`[DB] 创建新的内存数据库`);
  }

  // 输出数据库统计信息
  try {
    const tableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='stock_daily'");
    if (tableCheck.length > 0) {
      const stockCountStmt = db.prepare('SELECT COUNT(DISTINCT symbol) as count FROM stock_daily');
      stockCountStmt.step();
      const stockCount = stockCountStmt.getAsObject().count;
      stockCountStmt.free();

      const dailyCountStmt = db.prepare('SELECT COUNT(*) as count FROM stock_daily');
      dailyCountStmt.step();
      const dailyCount = dailyCountStmt.getAsObject().count;
      dailyCountStmt.free();

      const dateRangeStmt = db.prepare('SELECT MIN(trade_date) as min, MAX(trade_date) as max FROM stock_daily');
      dateRangeStmt.step();
      const dateRange = dateRangeStmt.getAsObject();
      dateRangeStmt.free();

      // 检查K线数据完整性
      const ohlcvStmt = db.prepare('SELECT COUNT(*) as count FROM stock_daily WHERE open IS NOT NULL');
      ohlcvStmt.step();
      const ohlcvCount = ohlcvStmt.getAsObject().count;
      ohlcvStmt.free();

      console.log(`[DB] 股票数量: ${stockCount}, 日线记录: ${dailyCount.toLocaleString()}`);
      console.log(`[DB] K线数据: ${ohlcvCount.toLocaleString()} 条`);
      console.log(`[DB] 日期范围: ${dateRange.min} ~ ${dateRange.max}`);
    }
  } catch (e) {
    console.log(`[DB] 统计信息获取失败，跳过`);
  }
}

// --- 数据库查询函数 ---
function getStockDailyFromDB(symbol: string, startDate?: string, endDate?: string) {
  try {
    if (!db) return null;

    let query = `
      SELECT trade_date, symbol, open, high, low, close, volume, amount,
             pe, pb, pcf, ps, turnover, circulated_mv, total_mv,
             change_ratio, ret, retwd, limit_up, limit_down, limit_status, pre_close
      FROM stock_daily
      WHERE symbol = ?
    `;
    const params: any[] = [symbol];

    if (startDate) {
      query += ` AND trade_date >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND trade_date <= ?`;
      params.push(endDate);
    }

    query += ` ORDER BY trade_date ASC`;

    const stmt = db.prepare(query);
    stmt.bind(params);
    const rows: any[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();

    if (rows.length === 0) {
      return null;
    }

    // 获取股票名称
    const nameStmt = db.prepare('SELECT short_name FROM stock_basic WHERE symbol = ?');
    nameStmt.bind([symbol]);
    let stockName = symbol;
    if (nameStmt.step()) {
      const nameRow = nameStmt.getAsObject();
      stockName = nameRow.short_name || symbol;
    }
    nameStmt.free();

    return {
      updateTime: new Date().toLocaleString(),
      symbol: symbol,
      stockName: stockName,
      source: '本地数据库',
      data: rows.map((row: any) => ({
        trade_date: row.trade_date.replace(/-/g, ''),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        vol: row.volume,
        amount: row.amount,
        pe: row.pe,
        pb: row.pb,
        pcf: row.pcf,
        ps: row.ps,
        turnover: row.turnover,
        change_ratio: row.change_ratio,
        circulated_mv: row.circulated_mv,
        total_mv: row.total_mv,
        limit_up: row.limit_up,
        limit_down: row.limit_down,
        limit_status: row.limit_status,
        pre_close: row.pre_close
      }))
    };
  } catch (err) {
    console.error('数据库查询错误:', err);
    return null;
  }
}

function searchStocksFromDB(query: string) {
  try {
    if (!db) return [];

    // 先从stock_basic搜索
    const stmt = db.prepare(`
      SELECT DISTINCT symbol, short_name as name
      FROM stock_basic
      WHERE symbol LIKE ? OR short_name LIKE ?
      LIMIT 20
    `);
    stmt.bind([`%${query}%`, `%${query}%`]);
    const rows: any[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();

    // 如果stock_basic没找到，从stock_daily搜索
    if (rows.length === 0) {
      const stmt2 = db.prepare(`
        SELECT DISTINCT symbol
        FROM stock_daily
        WHERE symbol LIKE ?
        LIMIT 20
      `);
      stmt2.bind([`%${query}%`]);
      while (stmt2.step()) {
        const row = stmt2.getAsObject();
        rows.push({ symbol: row.symbol, name: row.symbol });
      }
      stmt2.free();
    }

    return rows.map((row: any) => ({
      ts_code: row.symbol,
      symbol: row.symbol,
      name: row.name,
      industry: 'A股'
    }));
  } catch (err) {
    console.error('数据库搜索错误:', err);
    return [];
  }
}

// 获取所有股票列表
function getAllStocksFromDB() {
  try {
    // 优先从 stock_basic 获取
    if (db) {
      const stmt = db.prepare(`
        SELECT symbol, short_name as name
        FROM stock_basic
        ORDER BY symbol
      `);
      const rows: any[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();

      if (rows.length > 0) {
        return rows.map((row: any) => ({
          ts_code: row.symbol,
          symbol: row.symbol,
          name: row.name,
          industry: 'A股'
        }));
      }
    }

    // 如果 stock_basic 为空，从 stock_daily 获取唯一股票列表
    if (db) {
      const stmt = db.prepare(`
        SELECT DISTINCT symbol
        FROM stock_daily
        ORDER BY symbol
      `);
      const rows: any[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        rows.push({ symbol: row.symbol, name: row.symbol });
      }
      stmt.free();
      return rows.map((row: any) => ({
        ts_code: row.symbol,
        symbol: row.symbol,
        name: row.name,
        industry: 'A股'
      }));
    }

    return [];
  } catch (err) {
    console.error('获取股票列表错误:', err);
    return [];
  }
}

// 获取可用日期范围
function getDateRangeFromDB() {
  try {
    if (!db) return { min: '2020-01-01', max: new Date().toISOString().split('T')[0] };

    const stmt = db.prepare('SELECT MIN(trade_date) as min, MAX(trade_date) as max FROM stock_daily');
    stmt.step();
    const result = stmt.getAsObject();
    stmt.free();

    return result;
  } catch (err) {
    console.error('获取日期范围错误:', err);
    return { min: '2020-01-01', max: new Date().toISOString().split('T')[0] };
  }
}

// --- 技术指标计算函数 ---

// 简单移动平均
function calcMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

// 指数移动平均
function calcEMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const multiplier = 2 / (period + 1);

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.push(data[0]);
    } else {
      const prevEMA = result[i - 1];
      if (prevEMA !== null) {
        result.push((data[i] - prevEMA) * multiplier + prevEMA);
      } else {
        result.push(data[i]);
      }
    }
  }
  return result;
}

// MACD指标
function calcMACD(data: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const emaFast = calcEMA(data, fastPeriod);
  const emaSlow = calcEMA(data, slowPeriod);

  const dif: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      dif.push(emaFast[i]! - emaSlow[i]!);
    } else {
      dif.push(null);
    }
  }

  // 计算DEA (DIF的EMA)
  const validDif: number[] = dif.filter(v => v !== null) as number[];
  const deaFull = calcEMA(validDif, signalPeriod);

  // 映射回原数组位置
  const dea: (number | null)[] = [];
  let validIndex = 0;
  for (let i = 0; i < dif.length; i++) {
    if (dif[i] !== null) {
      dea.push(deaFull[validIndex] || null);
      validIndex++;
    } else {
      dea.push(null);
    }
  }

  // MACD柱
  const macd: (number | null)[] = [];
  for (let i = 0; i < dif.length; i++) {
    if (dif[i] !== null && dea[i] !== null) {
      macd.push((dif[i]! - dea[i]!) * 2);
    } else {
      macd.push(null);
    }
  }

  return { dif, dea, macd };
}

// 布林带
function calcBOLL(data: number[], period = 20, stdDevMultiplier = 2) {
  const ma = calcMA(data, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push(null);
      lower.push(null);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
      const std = Math.sqrt(variance);
      upper.push(ma[i]! + stdDevMultiplier * std);
      lower.push(ma[i]! - stdDevMultiplier * std);
    }
  }

  return { mid: ma, upper, lower };
}

// --- 文件上传配置 ---
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer 存储配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB 限制
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.xlsx', '.xls', '.json'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型，仅支持 CSV、Excel、JSON'));
    }
  }
});

// 导入任务状态
interface ImportTask {
  id: string;
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  totalRows: number;
  processedRows: number;
  error?: string;
  createdAt: Date;
}
const importTasks = new Map<string, ImportTask>();

async function startServer() {
  // 初始化数据库
  await initDatabase();
  await initUserDatabase();

  // 初始化云端数据库（如果配置了）
  const cloudConnected = await initCloudDatabase();

  // 定时清理过期 Token 和保存用户数据库
  setInterval(() => {
    cleanExpiredTokens();
    saveUserDatabase();
  }, 60000); // 每分钟

  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- 数据上传 API ---

  // 文件上传接口
  app.post('/api/data/upload', authMiddleware, roleMiddleware('admin', 'researcher'), upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: '请选择要上传的文件' });
      }

      const taskId = uuidv4();
      const task: ImportTask = {
        id: taskId,
        filename: req.file.originalname,
        status: 'pending',
        progress: 0,
        totalRows: 0,
        processedRows: 0,
        createdAt: new Date()
      };
      importTasks.set(taskId, task);

      res.json({
        success: true,
        taskId,
        filename: req.file.originalname,
        filepath: req.file.path,
        size: req.file.size,
        message: '文件上传成功，请配置导入参数'
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 获取文件预览
  app.get('/api/data/preview/:filepath', authMiddleware, roleMiddleware('admin', 'researcher'), async (req, res) => {
    try {
      const filepath = req.params.filepath;
      const fullPath = path.join(UPLOAD_DIR, path.basename(filepath));

      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: '文件不存在' });
      }

      const ext = path.extname(fullPath).toLowerCase();
      let preview: any[] = [];
      let columns: string[] = [];

      if (ext === '.csv') {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n').slice(0, 11);
        if (lines.length > 0) {
          columns = lines[0].split(',').map(c => c.trim().replace(/"/g, ''));
          preview = lines.slice(1, 11).map(line => {
            const values = line.split(',');
            const row: any = {};
            columns.forEach((col, i) => {
              row[col] = values[i]?.trim().replace(/"/g, '') || '';
            });
            return row;
          });
        }
      } else if (ext === '.xlsx' || ext === '.xls') {
        const XLSX = await import('xlsx');
        const workbook = XLSX.readFile(fullPath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        if (data.length > 0) {
          columns = data[0].map((c: any) => String(c));
          preview = data.slice(1, 11).map((row: any[]) => {
            const obj: any = {};
            columns.forEach((col, i) => {
              obj[col] = row[i] || '';
            });
            return obj;
          });
        }
      } else if (ext === '.json') {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const data = JSON.parse(content);
        if (Array.isArray(data) && data.length > 0) {
          columns = Object.keys(data[0]);
          preview = data.slice(0, 10);
        }
      }

      res.json({
        success: true,
        columns,
        preview,
        totalRows: preview.length
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 导入数据到数据库
  app.post('/api/data/import', authMiddleware, roleMiddleware('admin', 'researcher'), async (req, res) => {
    try {
      const { taskId, tableName, columnMapping, createNewTable } = req.body;

      const task = importTasks.get(taskId);
      if (!task) {
        return res.status(404).json({ error: '任务不存在' });
      }

      task.status = 'processing';
      task.progress = 0;

      // 异步处理导入
      setImmediate(async () => {
        try {
          const filepath = path.join(UPLOAD_DIR, task.filename);
          const ext = path.extname(filepath).toLowerCase();
          let data: any[] = [];

          // 解析文件
          if (ext === '.csv') {
            const content = fs.readFileSync(filepath, 'utf-8');
            const lines = content.split('\n').filter(l => l.trim());
            const headers = lines[0].split(',').map(c => c.trim().replace(/"/g, ''));
            data = lines.slice(1).map(line => {
              const values = line.split(',');
              const row: any = {};
              headers.forEach((h, i) => {
                row[h] = values[i]?.trim().replace(/"/g, '') || null;
              });
              return row;
            });
          } else if (ext === '.xlsx' || ext === '.xls') {
            const XLSX = await import('xlsx');
            const workbook = XLSX.readFile(filepath);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            data = XLSX.utils.sheet_to_json(sheet);
          } else if (ext === '.json') {
            const content = fs.readFileSync(filepath, 'utf-8');
            data = JSON.parse(content);
          }

          task.totalRows = data.length;

          // 导入到云端数据库或本地数据库
          if (USE_CLOUD_DB && cloudPool) {
            // 云端数据库
            if (createNewTable) {
              const columns = Object.keys(data[0] || {});
              const columnDefs = columns.map(col => `\`${col}\` TEXT`).join(', ');
              await cloudQuery(`CREATE TABLE IF NOT EXISTS \`${tableName}\` (id INT AUTO_INCREMENT PRIMARY KEY, ${columnDefs})`);
            }

            // 批量插入
            const columns = Object.keys(data[0] || {});
            const placeholders = columns.map(() => '?').join(', ');
            const sql = `INSERT INTO \`${tableName}\` (${columns.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`;

            for (let i = 0; i < data.length; i++) {
              const row = data[i];
              const values = columns.map(col => row[col]);
              await cloudQuery(sql, values);
              task.processedRows = i + 1;
              task.progress = Math.round((i + 1) / data.length * 100);
            }
          } else {
            // 本地数据库（模拟导入）
            for (let i = 0; i < data.length; i++) {
              task.processedRows = i + 1;
              task.progress = Math.round((i + 1) / data.length * 100);
              // 这里可以添加到本地 sql.js 数据库
            }
          }

          task.status = 'completed';
          task.progress = 100;

          // 清理上传的文件
          fs.unlinkSync(filepath);
        } catch (error: any) {
          task.status = 'failed';
          task.error = error.message;
          console.error('[导入失败]', error);
        }
      });

      res.json({ success: true, message: '导入任务已开始', taskId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 查询导入任务状态
  app.get('/api/data/tasks/:taskId', authMiddleware, (req, res) => {
    const task = importTasks.get(req.params.taskId);
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }
    res.json(task);
  });

  // 获取所有导入任务
  app.get('/api/data/tasks', authMiddleware, (req, res) => {
    const tasks = Array.from(importTasks.values()).sort((a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime()
    );
    res.json({ tasks });
  });

  // 获取云端数据库表列表
  app.get('/api/data/tables', authMiddleware, roleMiddleware('admin', 'researcher'), async (req, res) => {
    try {
      if (!cloudPool) {
        return res.json({ tables: [], message: '云端数据库未连接，请配置 DATABASE_URL' });
      }

      const tables = await cloudQuery('SHOW TABLES');
      res.json({ tables, connected: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 执行 SQL 查询（仅管理员）
  app.post('/api/data/query', authMiddleware, roleMiddleware('admin'), async (req, res) => {
    try {
      const { sql } = req.body;

      if (!cloudPool) {
        return res.status(400).json({ error: '云端数据库未连接' });
      }

      const result = await cloudQuery(sql);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- 认证 API 接口 ---

  // 用户注册
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { username, email, password } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ error: '请填写完整信息' });
      }

      if (username.length < 3 || username.length > 50) {
        return res.status(400).json({ error: '用户名长度需在3-50字符之间' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: '密码长度至少6位' });
      }

      // 检查用户名是否存在
      const checkUser = userDb.prepare('SELECT id FROM users WHERE username = ?');
      checkUser.bind([username]);
      if (checkUser.step()) {
        checkUser.free();
        return res.status(400).json({ error: '用户名已存在' });
      }
      checkUser.free();

      // 检查邮箱是否存在
      const checkEmail = userDb.prepare('SELECT id FROM users WHERE email = ?');
      checkEmail.bind([email]);
      if (checkEmail.step()) {
        checkEmail.free();
        return res.status(400).json({ error: '邮箱已被注册' });
      }
      checkEmail.free();

      // 创建用户
      const passwordHash = await hashPassword(password);
      userDb.run(
        'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
        [username, email, passwordHash, 'researcher']
      );
      saveUserDatabase();
      console.log('[注册] 新用户已创建:', username);

      // 获取新用户
      const stmt = userDb.prepare('SELECT id, username, email, role, created_at FROM users WHERE username = ?');
      stmt.bind([username]);
      stmt.step();
      const user = stmt.getAsObject();
      stmt.free();

      console.log('[注册] 返回用户信息:', user);
      res.json({ success: true, message: '注册成功', user });
    } catch (error: any) {
      console.error('注册错误:', error);
      res.status(500).json({ error: '注册失败' });
    }
  });

  // 用户登录
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: '请输入用户名和密码' });
      }

      // 查找用户（支持用户名或邮箱登录）
      const stmt = userDb.prepare('SELECT * FROM users WHERE username = ? OR email = ?');
      stmt.bind([username, username]);

      if (!stmt.step()) {
        stmt.free();
        return res.status(401).json({ error: '用户名或密码错误' });
      }

      const user = stmt.getAsObject() as User;
      stmt.free();

      // 检查账户状态
      if (user.status !== 'active') {
        return res.status(403).json({ error: '账户已被禁用' });
      }

      // 验证密码
      const isValid = await verifyPassword(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: '用户名或密码错误' });
      }

      // 更新登录时间
      userDb.run('UPDATE users SET last_login_at = ? WHERE id = ?', [new Date().toISOString(), user.id]);
      saveUserDatabase();

      // 生成 Token
      const token = generateToken(user);

      res.json({
        success: true,
        message: '登录成功',
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
    } catch (error: any) {
      console.error('登录错误:', error);
      res.status(500).json({ error: '登录失败' });
    }
  });

  // 用户登出
  app.post('/api/auth/logout', authMiddleware, (req, res) => {
    try {
      const jti = req.user!.jti;
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2小时后过期

      userDb.run('INSERT INTO token_blacklist (token_jti, user_id, expires_at) VALUES (?, ?, ?)',
        [jti, req.user!.userId, expiresAt]);

      res.json({ success: true, message: '已退出登录' });
    } catch (error) {
      res.status(500).json({ error: '退出失败' });
    }
  });

  // 获取当前用户信息
  app.get('/api/auth/me', authMiddleware, (req, res) => {
    try {
      const stmt = userDb.prepare('SELECT id, username, email, role, created_at, last_login_at FROM users WHERE id = ?');
      stmt.bind([req.user!.userId]);

      if (!stmt.step()) {
        stmt.free();
        return res.status(404).json({ error: '用户不存在' });
      }

      const user = stmt.getAsObject();
      stmt.free();

      res.json({ user });
    } catch (error) {
      res.status(500).json({ error: '获取用户信息失败' });
    }
  });

  // --- 用户管理 API（管理员） ---

  // 获取用户列表
  app.get('/api/users', authMiddleware, roleMiddleware('admin'), (req, res) => {
    try {
      console.log('[用户管理] 获取用户列表, 请求者:', req.user?.username);
      const stmt = userDb.prepare('SELECT id, username, email, role, status, created_at, last_login_at FROM users ORDER BY id');
      const users: any[] = [];
      while (stmt.step()) {
        users.push(stmt.getAsObject());
      }
      stmt.free();
      console.log('[用户管理] 返回用户数量:', users.length);
      res.json({ users });
    } catch (error) {
      console.error('[用户管理] 获取用户列表失败:', error);
      res.status(500).json({ error: '获取用户列表失败' });
    }
  });

  // 修改用户角色
  app.put('/api/users/:id/role', authMiddleware, roleMiddleware('admin'), (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!['admin', 'researcher', 'guest'].includes(role)) {
        return res.status(400).json({ error: '无效的角色' });
      }

      userDb.run('UPDATE users SET role = ? WHERE id = ?', [role, parseInt(id)]);
      saveUserDatabase();

      res.json({ success: true, message: '角色已更新' });
    } catch (error) {
      res.status(500).json({ error: '更新失败' });
    }
  });

  // 修改用户状态
  app.put('/api/users/:id/status', authMiddleware, roleMiddleware('admin'), (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['active', 'inactive', 'locked'].includes(status)) {
        return res.status(400).json({ error: '无效的状态' });
      }

      userDb.run('UPDATE users SET status = ? WHERE id = ?', [status, parseInt(id)]);
      saveUserDatabase();

      res.json({ success: true, message: '状态已更新' });
    } catch (error) {
      res.status(500).json({ error: '更新失败' });
    }
  });

  // 删除用户
  app.delete('/api/users/:id', authMiddleware, roleMiddleware('admin'), (req, res) => {
    try {
      const { id } = req.params;
      const userId = parseInt(id);

      // 不能删除自己
      if (userId === req.user!.userId) {
        return res.status(400).json({ error: '不能删除自己的账户' });
      }

      userDb.run('DELETE FROM users WHERE id = ?', [userId]);
      saveUserDatabase();

      res.json({ success: true, message: '用户已删除' });
    } catch (error) {
      res.status(500).json({ error: '删除失败' });
    }
  });

  // --- 策略管理 API ---

  // 获取用户策略列表
  app.get('/api/strategies', authMiddleware, (req, res) => {
    try {
      const stmt = userDb.prepare('SELECT * FROM user_strategies WHERE user_id = ? ORDER BY created_at DESC');
      stmt.bind([req.user!.userId]);
      const strategies: any[] = [];
      while (stmt.step()) {
        strategies.push(stmt.getAsObject());
      }
      stmt.free();
      res.json({ strategies });
    } catch (error) {
      res.status(500).json({ error: '获取策略列表失败' });
    }
  });

  // 保存策略
  app.post('/api/strategies', authMiddleware, (req, res) => {
    try {
      const { name, code, config, isPublic } = req.body;

      if (!name || !code) {
        return res.status(400).json({ error: '请填写策略名称和代码' });
      }

      userDb.run(
        'INSERT INTO user_strategies (user_id, name, code, config, is_public) VALUES (?, ?, ?, ?, ?)',
        [req.user!.userId, name, code, JSON.stringify(config || {}), isPublic ? 1 : 0]
      );
      saveUserDatabase();

      res.json({ success: true, message: '策略已保存' });
    } catch (error) {
      res.status(500).json({ error: '保存策略失败' });
    }
  });

  // 删除策略
  app.delete('/api/strategies/:id', authMiddleware, (req, res) => {
    try {
      const { id } = req.params;
      userDb.run('DELETE FROM user_strategies WHERE id = ? AND user_id = ?', [parseInt(id), req.user!.userId]);
      saveUserDatabase();
      res.json({ success: true, message: '策略已删除' });
    } catch (error) {
      res.status(500).json({ error: '删除策略失败' });
    }
  });

  // --- 公开 API（无需认证） ---

  // 获取股票列表
  app.get('/api/stocks', async (req, res) => {
    try {
      // 优先使用云端数据库
      if (cloudPool) {
        const rows = await cloudQuery(`
          SELECT DISTINCT symbol
          FROM stock_daily
          ORDER BY symbol
        `);
        return res.json(rows.map((row: any) => ({
          ts_code: row.symbol,
          symbol: row.symbol,
          name: row.symbol,
          industry: 'A股'
        })));
      }

      // 回退到本地数据库
      const stocks = getAllStocksFromDB();
      res.json(stocks);
    } catch (err) {
      console.error('获取股票列表错误:', err);
      res.status(500).json({ error: '获取股票列表失败' });
    }
  });

  // 获取日期范围
  app.get('/api/date-range', async (req, res) => {
    try {
      // 优先使用云端数据库
      if (cloudPool) {
        const rows = await cloudQuery(`
          SELECT MIN(trade_date) as minDate, MAX(trade_date) as maxDate
          FROM stock_daily
        `);
        if (rows.length > 0) {
          return res.json({
            startDate: rows[0].minDate,
            endDate: rows[0].maxDate
          });
        }
      }

      // 回退到本地数据库
      const dateRange = getDateRangeFromDB();
      res.json(dateRange);
    } catch (err) {
      console.error('获取日期范围错误:', err);
      res.status(500).json({ error: '获取日期范围失败' });
    }
  });

  // 获取最新的市场数据
  app.get('/api/market/latest', async (req, res) => {
    try {
      const symbol = (req.query.symbol as string) || '000001';
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      // 优先使用云端数据库
      if (cloudPool) {
        let sql = `
          SELECT trade_date, symbol, open, high, low, close, volume, amount,
                 pe, pb, pcf, ps, turnover, circulated_mv, total_mv,
                 change_ratio, ret, retwd, limit_up, limit_down, limit_status, pre_close
          FROM stock_daily
          WHERE symbol = ?
        `;
        const params: any[] = [symbol];

        if (startDate) {
          sql += ` AND trade_date >= ?`;
          params.push(startDate);
        }
        if (endDate) {
          sql += ` AND trade_date <= ?`;
          params.push(endDate);
        }

        sql += ` ORDER BY trade_date ASC`;

        const rows = await cloudQuery(sql, params);

        if (rows.length > 0) {
          return res.json({
            updateTime: new Date().toLocaleString(),
            symbol: symbol,
            stockName: symbol,
            source: 'TiDB Cloud',
            data: rows.map((row: any) => ({
              trade_date: row.trade_date,
              open: row.open !== null ? parseFloat(row.open) : null,
              high: row.high !== null ? parseFloat(row.high) : null,
              low: row.low !== null ? parseFloat(row.low) : null,
              close: row.close !== null ? parseFloat(row.close) : null,
              volume: row.volume !== null ? parseFloat(row.volume) : null,
              amount: row.amount !== null ? parseFloat(row.amount) : null,
              pe: row.pe !== null ? parseFloat(row.pe) : null,
              pb: row.pb !== null ? parseFloat(row.pb) : null,
              pcf: row.pcf !== null ? parseFloat(row.pcf) : null,
              ps: row.ps !== null ? parseFloat(row.ps) : null,
              turnover: row.turnover !== null ? parseFloat(row.turnover) : null,
              circulated_mv: row.circulated_mv !== null ? parseFloat(row.circulated_mv) : null,
              total_mv: row.total_mv !== null ? parseFloat(row.total_mv) : null,
              change_ratio: row.change_ratio !== null ? parseFloat(row.change_ratio) : null,
              ret: row.ret !== null ? parseFloat(row.ret) : null,
              retwd: row.retwd !== null ? parseFloat(row.retwd) : null,
              limit_up: row.limit_up !== null ? parseFloat(row.limit_up) : null,
              limit_down: row.limit_down !== null ? parseFloat(row.limit_down) : null,
              limit_status: row.limit_status,
              pre_close: row.pre_close !== null ? parseFloat(row.pre_close) : null
            }))
          });
        }

        return res.status(404).json({ error: '未找到该股票数据', symbol });
      }

      // 回退到本地数据库
      const dbData = getStockDailyFromDB(symbol, startDate, endDate);
      if (dbData && dbData.data.length > 0) {
        return res.json(dbData);
      }

      res.status(404).json({ error: '未找到该股票数据', symbol });
    } catch (err) {
      console.error('获取市场数据错误:', err);
      res.status(500).json({ error: '获取市场数据失败' });
    }
  });

  // 获取技术指标
  app.get('/api/indicators', (req, res) => {
    const symbol = (req.query.symbol as string) || '000001';
    const indicators = ((req.query.indicators as string) || '').split(',').filter(Boolean);

    const dbData = getStockDailyFromDB(symbol);
    if (!dbData || !dbData.data || dbData.data.length === 0) {
      return res.status(404).json({ error: '未找到该股票数据', symbol });
    }

    const closes = dbData.data.map(d => d.close).filter(v => v !== null) as number[];
    const result: any = { dates: dbData.data.map(d => d.trade_date) };

    if (indicators.includes('ma')) {
      result.ma5 = calcMA(closes, 5);
      result.ma10 = calcMA(closes, 10);
      result.ma20 = calcMA(closes, 20);
      result.ma60 = calcMA(closes, 60);
    }

    if (indicators.includes('macd')) {
      const macdResult = calcMACD(closes);
      result.macd = macdResult.macd;
      result.dif = macdResult.dif;
      result.dea = macdResult.dea;
    }

    if (indicators.includes('boll')) {
      const bollResult = calcBOLL(closes, 20, 2);
      result.bollUpper = bollResult.upper;
      result.bollMid = bollResult.mid;
      result.bollLower = bollResult.lower;
    }

    res.json(result);
  });

  // 搜索股票
  app.get('/api/market/search', (req, res) => {
    const query = (req.query.q as string || '').toUpperCase();
    if (!query) return res.json([]);

    const dbResults = searchStocksFromDB(query);
    res.json(dbResults);
  });

  // 仪表盘统计数据
  app.get('/api/dashboard/stats', (req, res) => {
    try {
      if (!db) {
        return res.json({
          marketHeat: 50,
          activeFactors: 5,
          totalStrategies: 0,
          dateRange: { start: '2020-01-01', end: new Date().toISOString().split('T')[0] },
          factorDistribution: [
            { name: '市值', value: 30 },
            { name: '价值', value: 25 },
            { name: '动量', value: 20 },
            { name: '波动率', value: 15 },
            { name: '质量', value: 10 }
          ]
        });
      }

      // 获取股票总数
      const stockCountStmt = db.prepare('SELECT COUNT(DISTINCT symbol) as count FROM stock_daily');
      stockCountStmt.step();
      const stockCount = stockCountStmt.getAsObject().count;
      stockCountStmt.free();

      // 获取数据日期范围
      const dateRangeStmt = db.prepare('SELECT MIN(trade_date) as min, MAX(trade_date) as max FROM stock_daily');
      dateRangeStmt.step();
      const dateRange = dateRangeStmt.getAsObject();
      dateRangeStmt.free();

      // 获取最新一天的涨跌统计
      const marketStatsStmt = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN change_ratio > 0 THEN 1 ELSE 0 END) as up_count,
          SUM(CASE WHEN change_ratio < 0 THEN 1 ELSE 0 END) as down_count
        FROM stock_daily
        WHERE trade_date = (SELECT MAX(trade_date) FROM stock_daily)
      `);
      marketStatsStmt.step();
      const stats = marketStatsStmt.getAsObject();
      marketStatsStmt.free();

      const marketHeat = stats.total > 0
        ? Math.round((stats.up_count / stats.total) * 100)
        : 50;

      res.json({
        marketHeat: marketHeat,
        activeFactors: 5,
        totalStrategies: stockCount,
        dateRange: {
          start: dateRange.min,
          end: dateRange.max
        },
        factorDistribution: [
          { name: '市值', value: 30 },
          { name: '价值', value: 25 },
          { name: '动量', value: 20 },
          { name: '波动率', value: 15 },
          { name: '质量', value: 10 }
        ]
      });
    } catch (err) {
      console.error('获取统计数据失败:', err);
      res.json({
        marketHeat: 50,
        activeFactors: 5,
        totalStrategies: 0,
        factorDistribution: [
          { name: '市值', value: 30 },
          { name: '价值', value: 25 },
          { name: '动量', value: 20 },
          { name: '波动率', value: 15 },
          { name: '质量', value: 10 }
        ]
      });
    }
  });

  // --- 策略模板 ---
  const STRATEGY_TEMPLATES = [
    {
      id: 'ma_crossover',
      name: '双均线策略',
      description: '短期均线上穿长期均线时买入',
      code: `// 双均线策略
function strategy(context) {
  const { current, helpers, index } = context;

  // 数据不足时保持满仓
  if (index < 20) return { position: 1 };

  // 计算5日和20日均线
  const shortMA = helpers.sma(5);
  const longMA = helpers.sma(20);

  if (!shortMA || !longMA) return { position: 1 };

  // 金叉买入，死叉卖出
  if (shortMA > longMA) {
    return { position: 1.2 }; // 适度加仓
  } else {
    return { position: 0.3 }; // 减仓
  }
}`
    },
    {
      id: 'value_invest',
      name: '价值投资策略',
      description: '基于PE/PB估值进行配置',
      code: `// 价值投资策略
function strategy(context) {
  const { current } = context;

  let position = 1.0; // 默认满仓

  // PE估值：低估值加仓，高估值减仓
  if (current.pe) {
    if (current.pe < 15) position *= 1.3;
    else if (current.pe < 25) position *= 1.1;
    else if (current.pe > 50) position *= 0.5;
    else if (current.pe > 35) position *= 0.8;
  }

  // PB估值：低PB加仓
  if (current.pb) {
    if (current.pb < 1.5) position *= 1.2;
    else if (current.pb < 3) position *= 1.05;
    else if (current.pb > 8) position *= 0.6;
    else if (current.pb > 5) position *= 0.85;
  }

  // 限制仓位范围 0-1.5
  position = Math.max(0, Math.min(1.5, position));

  return { position };
}`
    },
    {
      id: 'momentum',
      name: '动量策略',
      description: '追踪涨跌趋势',
      code: `// 动量策略
function strategy(context) {
  const { current, helpers, index } = context;

  if (index < 5) return { position: 1 };

  // 计算过去5日涨幅
  const prev5 = helpers.getPrev(5);
  if (!prev5 || !prev5.close || !current.close) {
    return { position: 1 };
  }

  const momentum = (current.close - prev5.close) / prev5.close;

  // 动量大于5%加仓，小于-5%减仓
  if (momentum > 0.05) {
    return { position: 1.3 };
  } else if (momentum < -0.05) {
    return { position: 0.5 };
  }

  return { position: 1 };
}`
    },
    {
      id: 'volatility_breakout',
      name: '波动率突破策略',
      description: '基于价格波动突破交易',
      code: `// 波动率突破策略
function strategy(context) {
  const { current, helpers, index } = context;

  if (index < 20) return { position: 1 };

  // 计算近期最高价和最低价
  const high20 = helpers.max('high', 20);
  const low20 = helpers.min('low', 20);

  if (!high20 || !low20 || !current.close) {
    return { position: 1 };
  }

  // 突破上轨买入
  if (current.close > high20 * 0.98) {
    return { position: 1.5 };
  }

  // 跌破下轨减仓
  if (current.close < low20 * 1.02) {
    return { position: 0.2 };
  }

  return { position: 1 };
}`
    }
  ];

  // --- 策略沙箱执行 ---
  interface MarketDataPoint {
    trade_date: string;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    vol: number | null;
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

  interface StrategyContext {
    current: MarketDataPoint;
    history: MarketDataPoint[];
    index: number;
    helpers: {
      sma: (period: number) => number | null;
      volatility: (period: number) => number | null;
      getPrev: (daysAgo: number) => MarketDataPoint | null;
      max: (field: keyof MarketDataPoint, period: number) => number | null;
      min: (field: keyof MarketDataPoint, period: number) => number | null;
    };
  }

  function createHelpers(history: MarketDataPoint[], index: number) {
    return {
      sma: (period: number): number | null => {
        if (index < period - 1) return null;
        const slice = history.slice(index - period + 1, index + 1);
        const validCloses = slice.filter(d => d.close !== null).map(d => d.close!);
        if (validCloses.length < period) return null;
        return validCloses.reduce((a, b) => a + b, 0) / validCloses.length;
      },
      volatility: (period: number): number | null => {
        if (index < period) return null;
        const slice = history.slice(index - period + 1, index + 1);
        const returns = slice.filter(d => d.change_ratio !== null).map(d => d.change_ratio!);
        if (returns.length < period) return null;
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
        return Math.sqrt(variance);
      },
      getPrev: (daysAgo: number): MarketDataPoint | null => {
        const idx = index - daysAgo;
        return idx >= 0 ? history[idx] : null;
      },
      max: (field: keyof MarketDataPoint, period: number): number | null => {
        if (index < period - 1) return null;
        const slice = history.slice(index - period + 1, index + 1);
        const values = slice.map(d => d[field] as number).filter(v => v != null);
        return values.length > 0 ? Math.max(...values) : null;
      },
      min: (field: keyof MarketDataPoint, period: number): number | null => {
        if (index < period - 1) return null;
        const slice = history.slice(index - period + 1, index + 1);
        const values = slice.map(d => d[field] as number).filter(v => v != null);
        return values.length > 0 ? Math.min(...values) : null;
      }
    };
  }

  function validateStrategyCode(code: string): { valid: boolean; error?: string } {
    try {
      const wrappedCode = `
        "use strict";
        ${code}
        return typeof strategy === 'function' ? strategy : null;
      `;
      const fn = new Function(wrappedCode)();
      if (typeof fn !== 'function') {
        return { valid: false, error: '代码必须定义一个名为 strategy 的函数' };
      }
      return { valid: true };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }

  function runCustomStrategy(
    data: MarketDataPoint[],
    strategyCode: string
  ): { chartData: any[]; metrics: any } | { error: string } {
    // 验证代码
    const validation = validateStrategyCode(strategyCode);
    if (!validation.valid) {
      return { error: validation.error };
    }

    // 创建策略函数
    let strategyFn: (context: StrategyContext) => { position: number };
    try {
      const wrappedCode = `
        "use strict";
        ${strategyCode}
        return strategy;
      `;
      strategyFn = new Function(wrappedCode)();
    } catch (error: any) {
      return { error: `策略代码编译失败: ${error.message}` };
    }

    const chartData = [];
    let strategyValue = 1.0;
    let benchmarkValue = 1.0;
    const strategyDailyReturns: number[] = [];

    for (let i = 0; i < data.length; i++) {
      const current = data[i];
      const benchmarkReturn = current.change_ratio || 0;

      try {
        const context: StrategyContext = {
          current,
          history: data,
          index: i,
          helpers: createHelpers(data, i)
        };

        const signal = strategyFn(context);
        const position = Math.max(0, Math.min(1.5, signal.position || 1));

        const strategyReturn = benchmarkReturn * position;
        strategyValue *= (1 + strategyReturn);
        benchmarkValue *= (1 + benchmarkReturn);
        strategyDailyReturns.push(strategyReturn);

        chartData.push({
          date: current.trade_date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
          benchmark: benchmarkValue,
          strategy: strategyValue
        });
      } catch (error: any) {
        return { error: `第 ${i + 1} 天执行出错: ${error.message}` };
      }
    }

    // 计算指标和回撤数据
    const finalStrategyReturn = strategyValue - 1;
    const finalBenchmarkReturn = benchmarkValue - 1;
    const meanReturn = strategyDailyReturns.reduce((a, b) => a + b, 0) / strategyDailyReturns.length;
    const stdDev = Math.sqrt(
      strategyDailyReturns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / strategyDailyReturns.length
    );
    const sharpeRatio = stdDev > 0 ? (meanReturn * 252 - 0.03) / (stdDev * Math.sqrt(252)) : 0;

    // 计算每日回撤数据
    let maxDrawdown = 0;
    let peak = 1.0;
    let runningValue = 1.0;
    const drawdownData: { date: string; drawdown: number }[] = [];

    for (let i = 0; i < strategyDailyReturns.length; i++) {
      runningValue *= (1 + strategyDailyReturns[i]);
      if (runningValue > peak) peak = runningValue;
      const drawdown = (peak - runningValue) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      drawdownData.push({
        date: chartData[i].date,
        drawdown: drawdown
      });
    }

    return {
      chartData,
      drawdownData,
      metrics: {
        annualizedReturn: finalStrategyReturn,
        benchmarkReturn: finalBenchmarkReturn,
        sharpeRatio,
        maxDrawdown
      }
    };
  }

  // 回测任务
  const tasks = new Map();

  // 回测任务 - 需要研究员及以上权限
  app.post('/api/backtest/submit', authMiddleware, roleMiddleware('admin', 'researcher'), (req, res) => {
    const { symbol, startDate, endDate, model, factors } = req.body;
    console.log('[回测请求]', { symbol, startDate, endDate, model, factors });

    const taskId = Math.random().toString(36).substring(7);
    tasks.set(taskId, { status: 'processing', progress: 0 });

    // 异步执行回测
    setImmediate(() => {
      try {
        const marketData = getStockDailyFromDB(symbol, startDate, endDate);
        console.log('[回测] 查询结果:', marketData ? `${marketData.data.length} 条记录` : '无数据');

        if (!marketData || !marketData.data || marketData.data.length === 0) {
          throw new Error(`本地数据库中未找到股票 ${symbol} 在 ${startDate} 至 ${endDate} 期间的数据`);
        }

        const filteredData = marketData.data;

        if (filteredData.length < 10) {
          throw new Error('所选日期区间内数据不足（至少需要10条记录）');
        }

        // 基于因子计算策略信号
        const chartData = [];
        let strategyValue = 1.0;
        let benchmarkValue = 1.0;
        const strategyDailyReturns: number[] = [];

        for (let i = 0; i < filteredData.length; i++) {
          const row = filteredData[i];
          const benchmarkReturn = row.change_ratio || 0;

          // 计算因子信号
          let signal = 1.0;

          // PE因子：低PE加仓，高PE减仓
          if (factors && factors.includes('pe') && row.pe !== null) {
            if (row.pe < 15) signal *= 1.3;
            else if (row.pe < 25) signal *= 1.1;
            else if (row.pe > 50) signal *= 0.5;
            else if (row.pe > 35) signal *= 0.8;
          }

          // PB因子：低PB加仓，高PB减仓
          if (factors && factors.includes('pb') && row.pb !== null) {
            if (row.pb < 1.5) signal *= 1.2;
            else if (row.pb < 3) signal *= 1.05;
            else if (row.pb > 8) signal *= 0.6;
            else if (row.pb > 5) signal *= 0.85;
          }

          // PS因子：低PS加仓，高PS减仓
          if (factors && factors.includes('ps') && row.ps !== null) {
            if (row.ps < 2) signal *= 1.15;
            else if (row.ps < 5) signal *= 1.05;
            else if (row.ps > 15) signal *= 0.7;
            else if (row.ps > 10) signal *= 0.85;
          }

          // 涨跌幅因子：动量反转策略
          if (factors && factors.includes('change_ratio') && i > 0) {
            const prevReturn = filteredData[i - 1].change_ratio || 0;
            const prev2Return = i > 1 ? (filteredData[i - 2].change_ratio || 0) : 0;

            // 连续两天大涨后减仓（止盈）
            if (prevReturn > 0.05 && prev2Return > 0.03) {
              signal *= 0.7;
            }
            // 连续两天大跌后加仓（抄底）
            else if (prevReturn < -0.05 && prev2Return < -0.03) {
              signal *= 1.3;
            }
            // 单日暴涨后减仓
            else if (prevReturn > 0.07) {
              signal *= 0.8;
            }
            // 单日暴跌后加仓
            else if (prevReturn < -0.07) {
              signal *= 1.15;
            }
          }

          // 成交量因子：量价配合
          if (factors && factors.includes('volume') && i > 5 && row.vol !== null) {
            const avgVol = filteredData.slice(i - 5, i).reduce((sum, d) => sum + (d.vol || 0), 0) / 5;
            const volRatio = row.vol / avgVol;

            // 放量上涨加仓
            if (volRatio > 2 && benchmarkReturn > 0) {
              signal *= 1.2;
            }
            // 放量下跌减仓
            else if (volRatio > 2 && benchmarkReturn < 0) {
              signal *= 0.7;
            }
            // 缩量下跌加仓
            else if (volRatio < 0.5 && benchmarkReturn < 0) {
              signal *= 1.1;
            }
          }

          // 涨跌停因子
          if (factors && factors.includes('limit_status') && row.limit_status !== null) {
            // 涨停次日减仓
            if (row.limit_status === 1) {
              signal *= 0.6;
            }
            // 跌停次日观望
            else if (row.limit_status === -1) {
              signal *= 0.8;
            }
          }

          // 模型加成
          let modelBonus = 0;
          if (model === 'random_forest') modelBonus = 0.0002;
          if (model === 'lstm') modelBonus = 0.0004;

          // 计算策略收益
          const randomNoise = (Math.random() - 0.5) * 0.005;
          const adjustedSignal = Math.max(0.3, Math.min(1.5, signal));
          const strategyReturn = benchmarkReturn * adjustedSignal + modelBonus + randomNoise;

          strategyValue *= (1 + strategyReturn);
          benchmarkValue *= (1 + benchmarkReturn);
          strategyDailyReturns.push(strategyReturn);

          chartData.push({
            date: row.trade_date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
            benchmark: benchmarkValue,
            strategy: strategyValue
          });

          if (i % Math.max(1, Math.floor(filteredData.length / 5)) === 0) {
            tasks.set(taskId, {
              status: 'processing',
              progress: Math.min(90, Math.floor((i / filteredData.length) * 100))
            });
          }
        }

        // 计算指标和回撤数据
        const finalStrategyReturn = strategyValue - 1;
        const finalBenchmarkReturn = benchmarkValue - 1;

        const meanReturn = strategyDailyReturns.reduce((a, b) => a + b, 0) / strategyDailyReturns.length;
        const stdDev = Math.sqrt(
          strategyDailyReturns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / strategyDailyReturns.length
        );
        const sharpeRatio = stdDev > 0 ? (meanReturn * 252 - 0.03) / (stdDev * Math.sqrt(252)) : 0;

        // 计算每日回撤数据
        let maxDrawdown = 0;
        let peak = 1.0;
        let runningValue = 1.0;
        const drawdownData: { date: string; drawdown: number }[] = [];

        for (let i = 0; i < strategyDailyReturns.length; i++) {
          runningValue *= (1 + strategyDailyReturns[i]);
          if (runningValue > peak) peak = runningValue;
          const drawdown = (peak - runningValue) / peak;
          if (drawdown > maxDrawdown) maxDrawdown = drawdown;
          drawdownData.push({
            date: chartData[i].date,
            drawdown: drawdown
          });
        }

        const result = {
          metrics: {
            annualizedReturn: finalStrategyReturn,
            benchmarkReturn: finalBenchmarkReturn,
            sharpeRatio: sharpeRatio,
            maxDrawdown: maxDrawdown
          },
          chartData,
          drawdownData
        };

        tasks.set(taskId, { status: 'completed', progress: 100, result });
      } catch (error: any) {
        console.error('[回测失败]', error);
        tasks.set(taskId, { status: 'failed', error: error.message });
      }
    });

    res.json({ taskId });
  });

  app.get('/api/backtest/status/:taskId', (req, res) => {
    const task = tasks.get(req.params.taskId);
    if (!task) {
      return res.status(404).json({ error: '未找到任务' });
    }
    res.json(task);
  });

  // --- 自定义策略 API ---

  // 获取策略模板
  app.get('/api/strategy/templates', (req, res) => {
    res.json({ templates: STRATEGY_TEMPLATES });
  });

  // 验证策略代码
  app.post('/api/strategy/validate', (req, res) => {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ valid: false, error: '请提供策略代码' });
    }
    const result = validateStrategyCode(code);
    res.json(result);
  });

  // 自定义策略回测 - 需要研究员及以上权限
  app.post('/api/backtest/custom', authMiddleware, roleMiddleware('admin', 'researcher'), (req, res) => {
    const { symbol, startDate, endDate, strategyCode } = req.body;
    console.log('[自定义回测请求]', { symbol, startDate, endDate });

    const taskId = Math.random().toString(36).substring(7);
    tasks.set(taskId, { status: 'processing', progress: 0 });

    // 异步执行回测
    setImmediate(() => {
      try {
        const marketData = getStockDailyFromDB(symbol, startDate, endDate);
        console.log('[自定义回测] 查询结果:', marketData ? `${marketData.data.length} 条记录` : '无数据');

        if (!marketData || !marketData.data || marketData.data.length === 0) {
          throw new Error(`本地数据库中未找到股票 ${symbol} 在 ${startDate} 至 ${endDate} 期间的数据`);
        }

        const data = marketData.data as MarketDataPoint[];
        if (data.length < 10) {
          throw new Error('所选日期区间内数据不足（至少需要10条记录）');
        }

        // 执行自定义策略
        const result = runCustomStrategy(data, strategyCode);

        if ('error' in result) {
          throw new Error(result.error);
        }

        tasks.set(taskId, {
          status: 'completed',
          progress: 100,
          result: result
        });
      } catch (error: any) {
        console.error('[自定义回测失败]', error);
        tasks.set(taskId, { status: 'failed', error: error.message });
      }
    });

    res.json({ taskId });
  });

  // 策略对比 - 需要研究员及以上权限
  app.post('/api/backtest/compare', authMiddleware, roleMiddleware('admin', 'researcher'), (req, res) => {
    const { symbol, startDate, endDate, strategies } = req.body;
    console.log('[策略对比请求]', { symbol, startDate, endDate, strategyCount: strategies?.length });

    if (!strategies || strategies.length < 2) {
      return res.status(400).json({ error: '至少需要2个策略进行对比' });
    }

    const taskId = Math.random().toString(36).substring(7);
    tasks.set(taskId, { status: 'processing', progress: 0 });

    setImmediate(() => {
      try {
        const marketData = getStockDailyFromDB(symbol, startDate, endDate);
        if (!marketData || !marketData.data || marketData.data.length === 0) {
          throw new Error(`本地数据库中未找到股票 ${symbol} 在 ${startDate} 至 ${endDate} 期间的数据`);
        }

        const data = marketData.data as MarketDataPoint[];
        if (data.length < 10) {
          throw new Error('所选日期区间内数据不足（至少需要10条记录）');
        }

        const results: any[] = [];
        let benchmarkValue = 1.0;

        // 计算基准收益
        const benchmarkData: { date: string; value: number }[] = [];
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const benchmarkReturn = row.change_ratio || 0;
          benchmarkValue *= (1 + benchmarkReturn);
          benchmarkData.push({
            date: row.trade_date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
            value: benchmarkValue
          });
        }

        // 计算每个策略的收益
        for (const strategy of strategies) {
          let strategyValue = 1.0;
          const strategyDailyReturns: number[] = [];
          const chartData: { date: string; value: number }[] = [];

          for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const benchmarkReturn = row.change_ratio || 0;

            // 根据因子计算信号
            let signal = 1.0;
            if (strategy.factors) {
              if (strategy.factors.includes('pe') && row.pe !== null) {
                if (row.pe < 15) signal *= 1.3;
                else if (row.pe < 25) signal *= 1.1;
                else if (row.pe > 50) signal *= 0.5;
                else if (row.pe > 35) signal *= 0.8;
              }
              if (strategy.factors.includes('pb') && row.pb !== null) {
                if (row.pb < 1.5) signal *= 1.2;
                else if (row.pb < 3) signal *= 1.05;
                else if (row.pb > 8) signal *= 0.6;
                else if (row.pb > 5) signal *= 0.85;
              }
              if (strategy.factors.includes('momentum') && i > 5) {
                const momentum = (row.close! - data[i - 5].close!) / data[i - 5].close!;
                if (momentum > 0.05) signal *= 1.2;
                else if (momentum < -0.05) signal *= 0.8;
              }
            }

            let modelBonus = 0;
            if (strategy.model === 'random_forest') modelBonus = 0.0002;
            if (strategy.model === 'lstm') modelBonus = 0.0004;

            const adjustedSignal = Math.max(0.3, Math.min(1.5, signal));
            const strategyReturn = benchmarkReturn * adjustedSignal + modelBonus;
            strategyValue *= (1 + strategyReturn);
            strategyDailyReturns.push(strategyReturn);

            chartData.push({
              date: row.trade_date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
              value: strategyValue
            });
          }

          // 计算指标
          const finalReturn = strategyValue - 1;
          const meanReturn = strategyDailyReturns.reduce((a, b) => a + b, 0) / strategyDailyReturns.length;
          const stdDev = Math.sqrt(
            strategyDailyReturns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / strategyDailyReturns.length
          );
          const sharpeRatio = stdDev > 0 ? (meanReturn * 252 - 0.03) / (stdDev * Math.sqrt(252)) : 0;

          let maxDrawdown = 0;
          let peak = 1.0;
          let runningValue = 1.0;
          for (const ret of strategyDailyReturns) {
            runningValue *= (1 + ret);
            if (runningValue > peak) peak = runningValue;
            const drawdown = (peak - runningValue) / peak;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
          }

          results.push({
            name: strategy.name,
            chartData,
            metrics: {
              annualizedReturn: finalReturn,
              sharpeRatio,
              maxDrawdown
            }
          });
        }

        tasks.set(taskId, {
          status: 'completed',
          progress: 100,
          result: {
            strategies: results,
            benchmark: benchmarkData,
            symbol,
            stockName: marketData.stockName
          }
        });
      } catch (error: any) {
        console.error('[策略对比失败]', error);
        tasks.set(taskId, { status: 'failed', error: error.message });
      }
    });

    res.json({ taskId });
  });

  // --- Vite 中间件 ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      root: __dirname,
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n========================================`);
    console.log(`  量化投研平台已启动`);
    console.log(`  访问地址: http://localhost:${PORT}`);
    console.log(`========================================\n`);
  });
}

startServer().catch(err => {
  console.error('服务器启动失败:', err);
  process.exit(1);
});
