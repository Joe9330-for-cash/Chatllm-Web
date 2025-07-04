import { NextApiRequest, NextApiResponse } from 'next';
// import { getMemoryManager } from '@/lib/memory/manager';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 🚧 未来功能：搜索API
  // 当前为存根实现，建议使用 vector-search.ts
  
  try {
    const { userId, query, limit = 5 } = req.query;

    if (!userId || !query) {
      return res.status(400).json({ 
        error: 'Missing required parameters: userId, query' 
      });
    }

    console.log(`[Search API] 🚧 存根调用 - 用户: ${userId}, 查询: ${query}`);

    // 返回存根结果
    res.status(200).json({
      success: true,
      results: [],
      count: 0,
      note: '🚧 此功能尚未完全实现，建议使用 /api/memory/vector-search',
      message: '当前为存根版本，未来版本将提供完整功能'
    });

  } catch (error) {
    console.error('[Search API] 存根错误:', error);
    res.status(500).json({
      success: false,
      error: '🚧 存根API错误',
      details: error instanceof Error ? error.message : '未知错误',
    });
  }
}
