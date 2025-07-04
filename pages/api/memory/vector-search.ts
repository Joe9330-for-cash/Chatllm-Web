import { NextApiRequest, NextApiResponse } from 'next';
import { getMySQLMemoryDB } from '@/lib/memory/mysql-database';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      userId, 
      query, 
      limit = 100
    } = req.query;

    if (!userId || !query) {
      return res.status(400).json({ 
        error: 'Missing required parameters: userId, query' 
      });
    }

    console.log(`[Vector Search API] 用户: ${userId}, 查询: "${query}"`);

    const mysqlDB = getMySQLMemoryDB();
    
    // 使用MySQL的简单搜索功能
    const memories = await mysqlDB.searchMemories(
      userId as string,
      query as string,
      parseInt(limit as string) || 100
    );

    // 转换为期望的格式
    const results = memories.map(memory => ({
      memory: {
        id: memory.id,
        content: memory.content,
        category: memory.category,
        createdAt: memory.timestamp,
        userId: memory.userId
      },
      relevanceScore: 0.5, // 简化的相关性分数
      searchType: 'mysql_text_search',
      details: {
        keywordScore: 0.5,
        normalizedScore: 0.5
      }
    }));

    console.log(`[Vector Search API] ✅ MySQL搜索完成，返回 ${results.length} 条结果`);

    res.status(200).json({
      success: true,
      results: results,
      analysis: {
        query: query as string,
        searchMode: 'mysql_text_search',
        totalResults: results.length,
        highRelevance: 0,
        mediumRelevance: results.length,
        lowRelevance: 0,
        avgScore: '0.500',
        searchTypes: {
          keyword: 0,
          vector: 0,
          hybrid: 0,
          mysql_text_search: results.length
        },
        parameters: {
          threshold: 0.5,
          keywordWeight: 1.0,
          vectorWeight: 0.0,
          limit: parseInt(limit as string) || 100
        }
      },
      mode: 'mysql_text_search',
      metadata: {
        searchTime: Date.now(),
        algorithmName: 'MySQL Text Search',
        systemInfo: {
          totalMemories: memories.length,
          vectorMemories: 0,
          coreMemories: memories.length,
          searchCapabilities: ['keyword', 'content_search']
        }
      }
    });

  } catch (error) {
    console.error('[Vector Search API] 搜索失败:', error);
    res.status(500).json({
      success: false,
      error: '向量搜索失败',
      details: error instanceof Error ? error.message : '未知错误',
    });
  }
}
