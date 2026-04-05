/**
 * 数据迁移脚本：本地 SQLite -> TiDB Cloud
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'stock_data.db');
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('请配置 DATABASE_URL 环境变量');
  process.exit(1);
}

async function main() {
  console.log('=== 数据迁移开始 ===\n');

  // 1. 连接本地 SQLite
  console.log('[1/5] 读取本地数据库...');
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);

  // 获取表列表
  const tablesResult = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const tables = tablesResult[0]?.values.map(v => v[0]) || [];
  console.log(`本地表: ${tables.join(', ')}`);

  // 2. 连接 TiDB Cloud
  console.log('\n[2/5] 连接 TiDB Cloud...');
  const pool = mysql.createPool({
    uri: DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: { rejectUnauthorized: true }
  });

  try {
    const conn = await pool.getConnection();
    console.log('TiDB Cloud 连接成功');
    conn.release();
  } catch (e) {
    console.error('TiDB Cloud 连接失败:', e.message);
    process.exit(1);
  }

  // 3. 获取 stock_daily 表结构和数据统计
  console.log('\n[3/5] 分析数据结构...');

  const schemaResult = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='stock_daily'");
  const schema = schemaResult[0]?.values[0]?.[0] || '';
  console.log('\n本地表结构:');
  console.log(schema?.substring(0, 500) + '...\n');

  const countResult = db.exec('SELECT COUNT(*) as cnt FROM stock_daily');
  const totalRows = countResult[0]?.values[0]?.[0] || 0;
  console.log(`总记录数: ${totalRows.toLocaleString()} 行`);

  const stockCountResult = db.exec('SELECT COUNT(DISTINCT symbol) as cnt FROM stock_daily');
  const stockCount = stockCountResult[0]?.values[0]?.[0] || 0;
  console.log(`股票数量: ${stockCount} 只`);

  // 4. 在 TiDB 创建表
  console.log('\n[4/5] 在 TiDB Cloud 创建表...');

  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS stock_daily (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      trade_date DATE NOT NULL,
      symbol VARCHAR(20) NOT NULL,
      open DECIMAL(12,4),
      high DECIMAL(12,4),
      low DECIMAL(12,4),
      close DECIMAL(12,4),
      volume BIGINT,
      amount DECIMAL(18,4),
      pe DECIMAL(12,4),
      pb DECIMAL(12,4),
      pcf DECIMAL(12,4),
      ps DECIMAL(12,4),
      turnover DECIMAL(12,4),
      circulated_mv DECIMAL(18,4),
      total_mv DECIMAL(18,4),
      change_ratio DECIMAL(12,4),
      ret DECIMAL(12,4),
      retwd DECIMAL(12,4),
      limit_up DECIMAL(12,4),
      limit_down DECIMAL(12,4),
      limit_status INT,
      pre_close DECIMAL(12,4),
      INDEX idx_symbol (symbol),
      INDEX idx_date (trade_date),
      INDEX idx_symbol_date (symbol, trade_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  try {
    await pool.execute(createTableSQL);
    console.log('stock_daily 表创建成功');
  } catch (e) {
    if (e.code === 'ER_TABLE_EXISTS_ERROR') {
      console.log('stock_daily 表已存在');
    } else {
      console.error('创建表失败:', e.message);
    }
  }

  // 5. 分批迁移数据
  console.log('\n[5/5] 开始迁移数据...');

  const BATCH_SIZE = 10000;
  let migratedRows = 0;
  let offset = 0;

  const insertSQL = `
    INSERT INTO stock_daily (
      trade_date, symbol, open, high, low, close, volume, amount,
      pe, pb, pcf, ps, turnover, circulated_mv, total_mv,
      change_ratio, ret, retwd, limit_up, limit_down, limit_status, pre_close
    ) VALUES ?
  `;

  while (offset < totalRows) {
    const query = `
      SELECT
        trade_date, symbol, open, high, low, close, volume, amount,
        pe, pb, pcf, ps, turnover, circulated_mv, total_mv,
        change_ratio, ret, retwd, limit_up, limit_down, limit_status, pre_close
      FROM stock_daily
      ORDER BY trade_date, symbol
      LIMIT ${BATCH_SIZE} OFFSET ${offset}
    `;

    const result = db.exec(query);
    if (!result[0] || result[0].values.length === 0) break;

    const rows = result[0].values.map(row => [
      row[0], // trade_date
      row[1], // symbol
      row[2], // open
      row[3], // high
      row[4], // low
      row[5], // close
      row[6], // volume
      row[7], // amount
      row[8], // pe
      row[9], // pb
      row[10], // pcf
      row[11], // ps
      row[12], // turnover
      row[13], // circulated_mv
      row[14], // total_mv
      row[15], // change_ratio
      row[16], // ret
      row[17], // retwd
      row[18], // limit_up
      row[19], // limit_down
      row[20], // limit_status
      row[21], // pre_close
    ]);

    try {
      await pool.query(insertSQL, [rows]);
      migratedRows += rows.length;
      offset += BATCH_SIZE;

      const progress = ((migratedRows / totalRows) * 100).toFixed(1);
      process.stdout.write(`\r迁移进度: ${progress}% (${migratedRows.toLocaleString()}/${totalRows.toLocaleString()})`);
    } catch (e) {
      console.error(`\n批次 ${offset} 插入失败:`, e.message);
      offset += BATCH_SIZE;
    }
  }

  console.log('\n\n=== 迁移完成 ===');
  console.log(`成功迁移: ${migratedRows.toLocaleString()} 行`);

  // 验证
  const [verifyResult] = await pool.execute('SELECT COUNT(*) as cnt FROM stock_daily');
  console.log(`TiDB 表记录: ${verifyResult[0].cnt.toLocaleString()}`);

  await pool.end();
}

main().catch(console.error);
