import { NextApiRequest, NextApiResponse } from 'next';
import { getHybridSearch } from '@/lib/memory/hybrid-search';
import { getMemoryManager } from '@/lib/memory/manager';
import { getVectorDatabase } from '@/lib/memory/vector-database';

// 获取算法名称
function getAlgorithmName(mode: string): string {
  switch (mode) {
    case 'keyword': return 'Enhanced Keyword Search';
    case 'vector': return 'Vector Similarity Search';
    case 'hybrid': return 'Hybrid Keyword + Vector Search';
    default: return 'Unknown Search Algorithm';
  }
}

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
      limit = 100, // 参考OpenAI记忆逻辑，大幅增加默认结果数量
      mode = 'hybrid',
      threshold = 0.7, // 提高相关性阈值，确保结果质量
      keywordWeight = 0.4,
      vectorWeight = 0.6
    } = req.query;

    if (!userId || !query) {
      return res.status(400).json({ 
        error: 'Missing required parameters: userId, query' 
      });
    }

    console.log(`[Vector Search API] 用户: ${userId}, 查询: "${query}", 模式: ${mode}`);

    // 性能追踪器
    const performanceTracker = {
      searchStart: Date.now(),
      keywordStart: 0,
      keywordEnd: 0,
      vectorStart: 0,
      vectorEnd: 0,
      hybridStart: 0,
      hybridEnd: 0,
      searchComplete: 0
    };

    const hybridSearch = getHybridSearch();
    const memoryManager = getMemoryManager();
    const vectorDB = getVectorDatabase();

    // 根据模式执行不同的搜索策略
    let searchResults;
    let searchType = mode as string;

    switch (mode) {
      case 'keyword':
        // 仅关键词搜索
        performanceTracker.keywordStart = Date.now();
        const keywordResults = memoryManager.searchRelevantMemories(
          userId as string,
          query as string,
          parseInt(limit as string) || 100
        );
        performanceTracker.keywordEnd = Date.now();

        searchResults = keywordResults.map(result => ({
          memory: result.memory,
          relevanceScore: result.relevanceScore,
          searchType: 'keyword',
          details: {
            keywordScore: result.relevanceScore,
            normalizedScore: result.relevanceScore
          }
        }));
        break;

      case 'vector':
        // 仅向量搜索
        performanceTracker.vectorStart = Date.now();
        searchResults = await hybridSearch.search(
          userId as string,
          query as string,
          {
            keywordWeight: 0,
            vectorWeight: 1,
            threshold: parseFloat(threshold as string) || 0.7,
            useVector: true,
            limit: parseInt(limit as string) || 100
          }
        );
        performanceTracker.vectorEnd = Date.now();
        break;

      case 'hybrid':
      default:
        // 混合搜索
        performanceTracker.hybridStart = Date.now();
        searchResults = await hybridSearch.search(
          userId as string,
          query as string,
          {
            keywordWeight: parseFloat(keywordWeight as string) || 0.4,
            vectorWeight: parseFloat(vectorWeight as string) || 0.6,
            threshold: parseFloat(threshold as string) || 0.7,
            useVector: true,
            limit: parseInt(limit as string) || 100
          }
        );
        performanceTracker.hybridEnd = Date.now();
        searchType = 'hybrid';
        break;
    }

    // 详细的结果分析
    const results = searchResults as any[];
    const analysis = {
      query: query as string,
      searchMode: searchType,
      totalResults: results.length,
      highRelevance: results.filter((r: any) => r.relevanceScore > 0.8).length,
      mediumRelevance: results.filter((r: any) => r.relevanceScore > 0.6 && r.relevanceScore <= 0.8).length,
      lowRelevance: results.filter((r: any) => r.relevanceScore <= 0.6).length,
      avgScore: results.length > 0 
        ? (results.reduce((sum: number, r: any) => sum + r.relevanceScore, 0) / results.length).toFixed(3)
        : '0.000',
      searchTypes: {
        keyword: results.filter((r: any) => r.searchType === 'keyword').length,
        vector: results.filter((r: any) => r.searchType === 'vector').length,
        hybrid: results.filter((r: any) => r.searchType === 'hybrid').length
      },
      parameters: {
        threshold: parseFloat(threshold as string) || 0.7,
        keywordWeight: parseFloat(keywordWeight as string) || 0.4,
        vectorWeight: parseFloat(vectorWeight as string) || 0.6,
        limit: parseInt(limit as string) || 100
      }
    };

    // 获取系统状态
    const regularMemories = memoryManager.getUserCoreMemories(userId as string);
    const vectorStats = await vectorDB.getUserMemoryStats(userId as string);

    // 记录搜索完成时间
    performanceTracker.searchComplete = Date.now();
    
    // 生成性能报告
    const totalTime = performanceTracker.searchComplete - performanceTracker.searchStart;
    let searchTime = 0;
    let searchMethod = '';
    
    if (performanceTracker.keywordEnd > 0) {
      searchTime = performanceTracker.keywordEnd - performanceTracker.keywordStart;
      searchMethod = 'keyword';
    } else if (performanceTracker.vectorEnd > 0) {
      searchTime = performanceTracker.vectorEnd - performanceTracker.vectorStart;
      searchMethod = 'vector';
    } else if (performanceTracker.hybridEnd > 0) {
      searchTime = performanceTracker.hybridEnd - performanceTracker.hybridStart;
      searchMethod = 'hybrid';
    }
    
    // 输出记忆搜索性能报告
    console.log('\n' + '─'.repeat(60));
    console.log(`🔍 **记忆搜索性能报告 (${searchMethod.toUpperCase()})**`);
    console.log('─'.repeat(60));
    console.log(`📊 总耗时: ${totalTime}ms`);
    console.log(`🔎 ${searchMethod}搜索: ${searchTime}ms`);
    console.log(`📝 结果处理: ${totalTime - searchTime}ms`);
    console.log(`🎯 搜索效率: ${results.length > 0 ? (results.length / (totalTime / 1000)).toFixed(1) : 0} 结果/s`);
    console.log(`📈 结果统计: 找到${results.length}条记忆，平均相关性${analysis.avgScore}`);
    console.log('─'.repeat(60) + '\n');
    
    console.log(`[Vector Search API] ✅ ${searchType}搜索完成，返回 ${results.length} 条结果`);

    res.status(200).json({
      success: true,
             results: results.map((result: any) => ({
         memory: {
           id: result.memory.id,
           content: result.memory.content,
           category: result.memory.category,
           createdAt: 'createdAt' in result.memory ? result.memory.createdAt : result.memory.timestamp,
           userId: result.memory.userId
         },
         relevanceScore: result.relevanceScore,
         searchType: result.searchType,
         details: result.details
       })),
      analysis,
      mode: searchType,
      metadata: {
        searchTime: Date.now(),
        totalRegularMemories: regularMemories.length,
        totalVectorMemories: vectorStats.totalMemories,
        vectorizedMemories: vectorStats.vectorizedMemories,
        algorithm: getAlgorithmName(searchType),
        vectorSystemStatus: vectorStats.vectorizedMemories > 0 ? 'active' : 'preparing'
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
