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
    const { userId, query, limit = 5 } = req.query;

    if (!userId || !query) {
      return res.status(400).json({ 
        error: 'Missing required parameters: userId, query' 
      });
    }

    console.log(`[Memory API] 搜索记忆 - 用户: ${userId}, 查询: ${query}`);

    const memoryManager = getMemoryManager();
    const searchResults = memoryManager.searchRelevantMemories(
      userId as string,
      query as string,
      parseInt(limit as string) || 5
    );

    console.log(`[Memory API] ✅ 搜索完成，找到 ${searchResults.length} 条相关记忆`);

    res.status(200).json({
      success: true,
      results: searchResults,
      count: searchResults.length,
    });

  } catch (error) {
    console.error('[Memory API] 记忆搜索失败:', error);
    res.status(500).json({
      success: false,
      error: '记忆搜索失败',
      details: error instanceof Error ? error.message : '未知错误',
    });
  }
}
