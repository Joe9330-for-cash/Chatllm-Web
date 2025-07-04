import { NextApiRequest, NextApiResponse } from 'next';
import { getMemoryManager } from '@/lib/memory/manager';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, limit = 10 } = req.query;

    if (!userId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: userId' 
      });
    }

    console.log(`[Memory API] 获取用户记忆 - 用户: ${userId}, 限制: ${limit}`);

    const memoryManager = getMemoryManager();
    const memories = memoryManager.getUserCoreMemories(userId as string);

    console.log(`[Memory API] ✅ 获取完成，返回 ${memories.length} 条记忆`);

    res.status(200).json({
      success: true,
      memories: memories.slice(0, parseInt(limit as string) || 10),
      count: memories.length,
    });

  } catch (error) {
    console.error('[Memory API] 记忆获取失败:', error);
    res.status(500).json({
      success: false,
      error: '记忆获取失败',
      details: error instanceof Error ? error.message : '未知错误',
    });
  }
}
