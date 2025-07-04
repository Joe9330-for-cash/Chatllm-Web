import { NextApiRequest, NextApiResponse } from 'next';
import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

interface LoginRequest {
  username: string;
  password: string;
  isRegister: boolean;
}

interface User {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password, isRegister }: LoginRequest = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: '用户名长度必须在3-20个字符之间' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: '密码长度至少6个字符' });
  }

  try {
    const DB_PATH = path.join(process.cwd(), 'data', 'memories.db');
    const db = new Database(DB_PATH);
    
    // 确保用户表存在
    db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `).run();

    if (isRegister) {
      // 注册逻辑
      const existingUser = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User;
      
      if (existingUser) {
        return res.status(400).json({ error: '用户名已存在' });
      }

      const userId = crypto.randomUUID();
      const passwordHash = hashPassword(password);
      const createdAt = new Date().toISOString();

      db.prepare(`
        INSERT INTO users (id, username, password_hash, created_at) 
        VALUES (?, ?, ?, ?)
      `).run(userId, username, passwordHash, createdAt);

      console.log(`[Auth] 用户注册成功: ${username} (${userId})`);

      return res.status(200).json({
        success: true,
        message: '注册成功',
        user: {
          id: userId,
          username,
          isLoggedIn: true,
        }
      });

    } else {
      // 登录逻辑
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User;
      
      if (!user) {
        return res.status(400).json({ error: '用户名不存在' });
      }

      const passwordHash = hashPassword(password);
      if (user.password_hash !== passwordHash) {
        return res.status(400).json({ error: '密码错误' });
      }

      console.log(`[Auth] 用户登录成功: ${username} (${user.id})`);

      return res.status(200).json({
        success: true,
        message: '登录成功',
        user: {
          id: user.id,
          username: user.username,
          isLoggedIn: true,
        }
      });
    }

  } catch (error) {
    console.error('[Auth] 认证错误:', error);
    return res.status(500).json({ 
      error: '服务器错误，请重试',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
} 