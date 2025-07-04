import { getMemoryManager } from './manager';
import { getEmbeddingService } from './embedding-service';
import { getVectorDatabase, VectorSearchResult } from './vector-database';
import { Memory } from '@/types/memory';

export interface HybridSearchResult {
  memory: Memory | VectorSearchResult['memory'];
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
  private memoryManager = getMemoryManager();
  private embeddingService = getEmbeddingService();
  private vectorDB = getVectorDatabase();

  async search(
    userId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<HybridSearchResult[]> {
    const {
      keywordWeight = 0.4,
      vectorWeight = 0.6,
      threshold = 0.7,  // 提高阈值，确保结果相关性
      useVector = true,
      limit = 100  // 大幅增加结果数量，参考OpenAI记忆逻辑
    } = options;

    console.log(`[HybridSearch] 开始混合搜索: "${query}", 向量搜索: ${useVector}`);

    try {
      const results: HybridSearchResult[] = [];

      // 1. 智能关键词搜索
      let keywordResults;
      try {
        keywordResults = await this.memoryManager.searchRelevantMemoriesAsync(
          userId,
          query,
          limit * 2 // 获取更多结果用于混合
        );
        console.log(`[HybridSearch] 🧠 智能关键词搜索找到 ${keywordResults.length} 条结果`);
      } catch (error) {
        console.warn('[HybridSearch] 智能搜索失败，降级到普通搜索:', error);
        keywordResults = this.memoryManager.searchRelevantMemories(
          userId,
          query,
          limit * 2
        );
      }

      console.log(`[HybridSearch] 关键词搜索找到 ${keywordResults.length} 条结果`);

      // 转换关键词搜索结果
      for (const result of keywordResults) {
        results.push({
          memory: result.memory,
          relevanceScore: result.relevanceScore * keywordWeight,
          searchType: 'keyword',
          details: {
            keywordScore: result.relevanceScore
          }
        });
      }

      // 2. 向量搜索（如果启用）
      if (useVector) {
        try {
          // 生成查询向量
          const queryVector = await this.embeddingService.generateEmbedding(query);
          
          // 向量搜索
          const vectorResults = await this.vectorDB.searchSimilarMemories(
            userId,
            queryVector,
            limit * 2,
            0.2 // 向量搜索保持较低阈值，获取更多候选结果
          );

          console.log(`[HybridSearch] 向量搜索找到 ${vectorResults.length} 条结果`);

          // 处理向量搜索结果
          for (const vectorResult of vectorResults) {
            const existingIndex = results.findIndex(r => 
              this.areSameMemory(r.memory, vectorResult.memory)
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
                 memory: vectorResult.memory,
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
      const fallbackResults = this.memoryManager.searchRelevantMemories(userId, query, limit);
      return fallbackResults.map(result => ({
        memory: result.memory,
        relevanceScore: result.relevanceScore,
        searchType: 'keyword' as const,
        details: {
          keywordScore: result.relevanceScore
        }
      }));
    }
  }

     // 检查是否为同一条记忆
   private areSameMemory(
     memory1: Memory | VectorSearchResult['memory'], 
     memory2: VectorSearchResult['memory']
   ): boolean {
    // 优先比较ID
    if ('id' in memory1 && memory1.id === memory2.id) {
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

    const recommendations: string[] = [];
    
    if (keywordTotal < vectorTotal * 0.5) {
      recommendations.push('关键词搜索性能优异，适合实时搜索');
    }
    
    if (vectorTotal < keywordTotal * 2) {
      recommendations.push('向量搜索性能良好，推荐启用语义搜索');
    }
    
    if (hybridTotal < Math.max(keywordTotal, vectorTotal) * 1.5) {
      recommendations.push('混合搜索性能平衡，推荐作为默认模式');
    }

    return {
      keywordPerformance: keywordTotal / queries.length,
      vectorPerformance: vectorTotal / queries.length,
      hybridPerformance: hybridTotal / queries.length,
      recommendations
    };
  }
}

// 单例实例
let hybridSearchInstance: HybridMemorySearch | null = null;

export function getHybridSearch(): HybridMemorySearch {
  if (!hybridSearchInstance) {
    hybridSearchInstance = new HybridMemorySearch();
  }
  return hybridSearchInstance;
} 