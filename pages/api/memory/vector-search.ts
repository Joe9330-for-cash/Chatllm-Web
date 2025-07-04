import { NextApiRequest, NextApiResponse } from 'next';
import { getEmbeddingService } from '@/lib/memory/embedding-service';
import { getMySQLMemoryDB } from '@/lib/memory/mysql-database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, query, limit = 3 } = req.query;

    if (!userId || !query) {
      return res.status(400).json({ error: 'Missing userId or query' });
    }

    console.log(`[Vector Search API] 用户: ${userId}, 查询: "${query}"`);
    console.log(`[Vector Search API] 🔍 开始向量化搜索...`);

    const embeddingService = getEmbeddingService();
    const mysqlDB = getMySQLMemoryDB();
    
    const results = [];
    let searchType = 'mixed';

    // 1. 向量搜索
    try {
      console.log(`[Vector Search API] 🧠 生成查询向量...`);
      const queryVector = await embeddingService.generateEmbedding(query as string);
      
      console.log(`[Vector Search API] 🔍 执行向量相似性搜索...`);
      const vectorResults = await mysqlDB.vectorSearch(
        userId as string,
        query as string,
        parseInt(limit as string) * 2,
        0.3 // 较低的相似性阈值
      );

      console.log(`[Vector Search API] 向量搜索找到 ${vectorResults.length} 条结果`);

      // 转换向量搜索结果
      for (const vectorResult of vectorResults) {
        results.push({
          id: vectorResult.id,
          content: vectorResult.content,
          category: vectorResult.category,
          importance: vectorResult.importance,
          timestamp: vectorResult.timestamp,
          relevanceScore: vectorResult.similarity || vectorResult.relevance_score || 0.5,
          searchType: 'vector',
          details: {
            vectorSimilarity: vectorResult.similarity || vectorResult.relevance_score || 0.5
          }
        });
      }

    } catch (vectorError) {
      console.warn(`[Vector Search API] 向量搜索失败:`, vectorError);
    }

    // 2. 如果向量搜索结果不足，补充关键词搜索
    if (results.length < parseInt(limit as string)) {
      try {
        console.log(`[Vector Search API] 🔤 补充关键词搜索...`);
        
        const keywordResults = await mysqlDB.searchMemories(
          userId as string,
          query as string,
          parseInt(limit as string) * 2
        );

        console.log(`[Vector Search API] 关键词搜索找到 ${keywordResults.length} 条结果`);

        // 添加关键词搜索结果（避免重复）
        for (const memory of keywordResults) {
          const isDuplicate = results.some(r => r.id === memory.id);
          if (!isDuplicate) {
            results.push({
              id: memory.id,
              content: memory.content,
              category: memory.category,
              importance: memory.importance,
              timestamp: memory.timestamp,
              relevanceScore: memory.relevance_score || 0.5, // 关键词搜索的相关性
              searchType: 'keyword',
              details: {
                keywordScore: 0.5
              }
            });
          }
        }

        if (results.length > 0) {
          searchType = results.some(r => r.searchType === 'vector') ? 'hybrid' : 'keyword';
        }

      } catch (keywordError) {
        console.warn(`[Vector Search API] 关键词搜索失败:`, keywordError);
      }
    }

    // 3. 排序和限制结果
    const finalResults = results
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, parseInt(limit as string));

    console.log(`[Vector Search API] ✅ 搜索完成，返回 ${finalResults.length} 条结果`);

    // 打印前几条结果的预览
    if (finalResults.length > 0) {
      finalResults.slice(0, 2).forEach((memory, index) => {
        console.log(`[Vector Search API] 结果${index + 1}: [${memory.category}] 相关性=${memory.relevanceScore.toFixed(3)}, 类型=${memory.searchType}, 内容="${memory.content.substring(0, 50)}..."`);
      });
    }

    return res.status(200).json({
      success: true,
      memories: finalResults,
      totalCount: finalResults.length,
      searchType: searchType,
      query: query,
      performance: {
        vectorResults: results.filter(r => r.searchType === 'vector').length,
        keywordResults: results.filter(r => r.searchType === 'keyword').length,
        totalCandidates: results.length
      }
    });

  } catch (error) {
    console.error('[Vector Search API] ❌ 搜索失败:', error);
    return res.status(500).json({ 
      error: '向量搜索失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
}
