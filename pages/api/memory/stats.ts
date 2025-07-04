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
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: userId' 
      });
    }

    console.log(`[Memory API] 获取记忆统计 - 用户: ${userId}`);

    const memoryManager = getMemoryManager();
    const stats = memoryManager.getMemoryStats(userId as string);

    console.log(`[Memory API] ✅ 统计获取完成`);

    res.status(200).json({
      success: true,
      stats,
    });

  } catch (error) {
    console.error('[Memory API] 记忆统计失败:', error);
    res.status(500).json({
      success: false,
      error: '记忆统计失败',
      details: error instanceof Error ? error.message : '未知错误',
    });
  }
}
