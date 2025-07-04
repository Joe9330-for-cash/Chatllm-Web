import { getEmbeddingService } from './embedding-service';
import { getMySQLMemoryDB } from './mysql-database';
import { Memory } from '@/types/memory';

export interface HybridSearchResult {
  memory: Memory;
  relevanceScore: number;
  searchType: 'keyword' | 'vector' | 'hybrid';
  details: {
    keywordScore?: number;
    vectorSimilarity?: number;
    combinedScore?: number;
  };
}

export interface SearchOptions {
  keywordWeight?: number;    // 关键词搜索权重 (0-1)
  vectorWeight?: number;     // 向量搜索权重 (0-1)
  threshold?: number;        // 最低相关性阈值
  useVector?: boolean;       // 是否启用向量搜索
  limit?: number;           // 结果数量限制
}

export class HybridMemorySearch {
  private mysqlDB = getMySQLMemoryDB();
  private embeddingService = getEmbeddingService();

  async search(
    userId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<HybridSearchResult[]> {
    const {
      keywordWeight = 0.4,
      vectorWeight = 0.6,
      threshold = 0.3,  // 降低阈值，提高搜索召回率
      useVector = true,
      limit = 100  // 大幅增加结果数量，参考OpenAI记忆逻辑
    } = options;

    console.log(`[HybridSearch] 开始混合搜索: "${query}", 向量搜索: ${useVector}`);

    try {
      const results: HybridSearchResult[] = [];

      // 1. 关键词搜索
      let keywordResults;
      try {
        keywordResults = await this.mysqlDB.searchMemories(
          userId,
          query,
          limit * 2 // 获取更多结果用于混合
        );
        console.log(`[HybridSearch] 🧠 关键词搜索找到 ${keywordResults.length} 条结果`);
      } catch (error) {
        console.warn('[HybridSearch] 关键词搜索失败:', error);
        keywordResults = [];
      }

      // 转换关键词搜索结果
      for (const result of keywordResults) {
        results.push({
          memory: result as Memory,
          relevanceScore: (result.relevance_score || 0.5) * keywordWeight,
          searchType: 'keyword',
          details: {
            keywordScore: result.relevance_score || 0.5
          }
        });
      }

      // 2. 向量搜索（如果启用）
      if (useVector) {
        try {
          // 使用MySQL的向量搜索
          const vectorResults = await this.mysqlDB.vectorSearch(
            userId,
            query,
            limit * 2,
            0.3 // 向量搜索统一阈值，平衡精度和召回率
          );

          console.log(`[HybridSearch] 向量搜索找到 ${vectorResults.length} 条结果`);

          // 处理向量搜索结果
          for (const vectorResult of vectorResults) {
            const existingIndex = results.findIndex(r => 
              this.areSameMemory(r.memory, vectorResult as Memory)
            );

            if (existingIndex >= 0) {
              // 合并已存在的结果
              const existing = results[existingIndex];
              const combinedScore = (existing.details.keywordScore || 0) * keywordWeight + 
                                  vectorResult.similarity * vectorWeight;
              
              results[existingIndex] = {
                memory: existing.memory,
                relevanceScore: combinedScore,
                searchType: 'hybrid',
                details: {
                  keywordScore: existing.details.keywordScore,
                  vectorSimilarity: vectorResult.similarity,
                  combinedScore
                }
              };
            } else {
              // 添加新的向量搜索结果
              results.push({
                memory: vectorResult as Memory,
                relevanceScore: vectorResult.similarity * vectorWeight,
                searchType: 'vector',
                details: {
                  vectorSimilarity: vectorResult.similarity
                }
              });
            }
          }

        } catch (vectorError) {
          console.warn('[HybridSearch] 向量搜索失败，回退到关键词搜索:', vectorError);
        }
      }

      // 3. 过滤和排序结果
      const filteredResults = results
        .filter(result => result.relevanceScore >= Math.min(threshold, 0.3)) // 确保至少有一些结果
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, limit);

      console.log(`[HybridSearch] ✅ 混合搜索完成，返回 ${filteredResults.length} 条结果`);

      return filteredResults;

    } catch (error) {
      console.error('[HybridSearch] ❌ 搜索失败:', error);
      
      // 降级到关键词搜索
      try {
        const fallbackResults = await this.mysqlDB.searchMemories(userId, query, limit);
        return fallbackResults.map(result => ({
          memory: result as Memory,
          relevanceScore: result.relevance_score || 0.5,
          searchType: 'keyword' as const,
          details: {
            keywordScore: result.relevance_score || 0.5
          }
        }));
      } catch (fallbackError) {
        console.error('[HybridSearch] 降级搜索也失败:', fallbackError);
        return [];
      }
    }
  }

  // 检查是否为同一条记忆
  private areSameMemory(
    memory1: Memory, 
    memory2: Memory
  ): boolean {
    // 优先比较ID
    if (memory1.id === memory2.id) {
      return true;
    }
    
    // 比较内容（去除空白字符）
    const content1 = memory1.content.trim().toLowerCase();
    const content2 = memory2.content.trim().toLowerCase();
    
    return content1 === content2;
  }

  // 分析搜索性能
  async analyzeSearchPerformance(
    userId: string,
    queries: string[]
  ): Promise<{
    keywordPerformance: number;
    vectorPerformance: number;
    hybridPerformance: number;
    recommendations: string[];
  }> {
    console.log(`[HybridSearch] 开始性能分析，测试 ${queries.length} 个查询`);

    let keywordTotal = 0;
    let vectorTotal = 0;
    let hybridTotal = 0;

    for (const query of queries) {
      // 测试关键词搜索
      const keywordStart = Date.now();
      await this.search(userId, query, { useVector: false, limit: 3 });
      keywordTotal += Date.now() - keywordStart;

      // 测试向量搜索
      const vectorStart = Date.now();
      await this.search(userId, query, { keywordWeight: 0, vectorWeight: 1, limit: 3 });
      vectorTotal += Date.now() - vectorStart;

      // 测试混合搜索
      const hybridStart = Date.now();
      await this.search(userId, query, { limit: 3 });
      hybridTotal += Date.now() - hybridStart;
    }

    const avgKeyword = keywordTotal / queries.length;
    const avgVector = vectorTotal / queries.length;
    const avgHybrid = hybridTotal / queries.length;

    const recommendations = [];
    
    if (avgKeyword < avgVector && avgKeyword < avgHybrid) {
      recommendations.push('关键词搜索速度最快，适合实时查询');
    }
    
    if (avgVector < avgHybrid * 0.8) {
      recommendations.push('向量搜索效率较高，建议增加向量权重');
    }
    
    if (avgHybrid > avgKeyword * 2) {
      recommendations.push('混合搜索较慢，考虑优化或降低向量权重');
    }

    return {
      keywordPerformance: avgKeyword,
      vectorPerformance: avgVector,
      hybridPerformance: avgHybrid,
      recommendations
    };
  }
}

let hybridSearchInstance: HybridMemorySearch | null = null;

export function getHybridSearch(): HybridMemorySearch {
  if (!hybridSearchInstance) {
    hybridSearchInstance = new HybridMemorySearch();
  }
  return hybridSearchInstance;
} 