import { NextApiRequest, NextApiResponse } from 'next';
// import { getMemoryManager } from '@/lib/memory/manager';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 🚧 未来功能：记忆管理API
  // 当前为存根实现
  
  try {
    const { userId, limit = 10 } = req.query;

    if (!userId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: userId' 
      });
    }

    console.log(`[Manage API] 🚧 存根调用 - 用户: ${userId}, 限制: ${limit}`);

    // 返回存根结果
    res.status(200).json({
      success: true,
      memories: [],
      count: 0,
      note: '🚧 此功能尚未完全实现',
      message: '记忆管理功能在未来版本中提供'
    });

  } catch (error) {
    console.error('[Manage API] 存根错误:', error);
    res.status(500).json({
      success: false,
      error: '🚧 存根API错误',
      details: error instanceof Error ? error.message : '未知错误',
    });
  }
}
