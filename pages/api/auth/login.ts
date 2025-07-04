import { NextApiRequest, NextApiResponse } from 'next';
import { getMySQLMemoryDB } from '@/lib/memory/mysql-database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }

    console.log(`[Login API] 尝试登录: ${username}`);

    // 简单的硬编码验证（生产环境应该使用真实的用户数据库）
    const validUsers = [
      { username: 'admin', password: 'admin123' },
      { username: 'user', password: 'user123' },
      { username: 'test', password: 'test123' }
    ];

    const user = validUsers.find(u => u.username === username && u.password === password);
    
    if (!user) {
      console.log(`[Login API] ❌ 登录失败: 用户名或密码错误`);
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    console.log(`[Login API] ✅ 登录成功: ${username}`);
    
    // 测试MySQL连接
    try {
      const mysqlDB = getMySQLMemoryDB();
      const stats = await mysqlDB.getMemoryStats(username);
      console.log(`[Login API] MySQL连接测试成功，用户${username}的记忆统计:`, stats);
    } catch (mysqlError) {
      console.warn(`[Login API] MySQL连接测试失败:`, mysqlError);
    }

    return res.status(200).json({
      success: true,
      user: {
        username: user.username,
        id: user.username // 简化处理
      },
      message: '登录成功'
    });

  } catch (error) {
    console.error('[Login API] 登录处理失败:', error);
    return res.status(500).json({ 
      error: '服务器错误',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
} 