import { getEmbeddingService } from './embedding-service';
import { getMySQLMemoryDB } from './mysql-database';
import { getChineseNLPService } from './chinese-nlp-service';

export interface SearchResult {
  id: number;
  content: string;
  category: string;
  importance: number;
  timestamp: string;
  relevanceScore: number;
  searchType: 'vector' | 'keyword' | 'semantic' | 'hybrid';
  details: {
    vectorSimilarity?: number;
    keywordMatches?: string[];
    semanticContext?: string;
    confidence?: number;
  };
}

export interface SearchConfig {
  vectorThreshold: number;
  keywordWeight: number;
  semanticWeight: number;
  importanceWeight: number;
  temporalDecay: number;
  maxResults: number;
  enableDynamicThreshold: boolean;
  debugMode: boolean;
}

export class EnhancedVectorSearchEngine {
  private embeddingService: any;
  private mysqlDB: any;
  private nlpService: any;
  private searchStats: Map<string, any> = new Map();
  
  private defaultConfig: SearchConfig = {
    vectorThreshold: 0.25,       // 进一步降低初始阈值
    keywordWeight: 0.4,          // 关键词权重
    semanticWeight: 0.4,         // 语义权重  
    importanceWeight: 0.2,       // 重要性权重
    temporalDecay: 0.95,         // 时间衰减因子
    maxResults: 50,              // 最大结果数
    enableDynamicThreshold: true, // 启用动态阈值
    debugMode: false             // 关闭调试模式以提升性能
  };

  constructor(config?: Partial<SearchConfig>) {
    this.embeddingService = getEmbeddingService();
    this.mysqlDB = getMySQLMemoryDB();
    this.nlpService = getChineseNLPService();
    
    if (config) {
      this.defaultConfig = { ...this.defaultConfig, ...config };
    }
  }

  /**
   * 增强版混合搜索
   */
  async enhancedSearch(
    userId: string, 
    query: string, 
    config?: Partial<SearchConfig>
  ): Promise<{
    results: SearchResult[];
    performance: any;
    debugInfo?: any;
  }> {
    const startTime = Date.now();
    const searchConfig = { ...this.defaultConfig, ...config };
    const debugInfo: any = { stages: [], similarities: [], thresholds: [] };
    
    console.log(`[Enhanced Search] 🚀 开始增强搜索: "${query}"`);
    if (searchConfig.debugMode) {
      console.log(`[Enhanced Search] 📊 配置: 向量阈值=${searchConfig.vectorThreshold}, 动态阈值=${searchConfig.enableDynamicThreshold}`);
    }
    
    const results = new Map<number, SearchResult>();
    
    try {
      // 第一阶段：向量搜索（增强版）
      const vectorResults = await this.enhancedVectorSearch(userId, query, searchConfig, debugInfo);
      console.log(`[Enhanced Search] 🎯 向量搜索找到 ${vectorResults.length} 条结果`);
      
      vectorResults.forEach(result => {
        results.set(result.id, result);
      });
      
      // 第二阶段：语义关键词搜索
      const keywordResults = await this.enhancedKeywordSearch(userId, query, searchConfig, debugInfo);
      console.log(`[Enhanced Search] 🔤 关键词搜索找到 ${keywordResults.length} 条结果`);
      
      keywordResults.forEach(result => {
        if (!results.has(result.id)) {
          results.set(result.id, result);
        } else {
          // 合并结果，取最高分
          const existing = results.get(result.id)!;
          existing.relevanceScore = Math.max(existing.relevanceScore, result.relevanceScore);
          existing.searchType = 'hybrid';
          existing.details = { ...existing.details, ...result.details };
        }
      });
      
      // 第三阶段：语义上下文搜索
      const semanticResults = await this.semanticContextSearch(userId, query, searchConfig, debugInfo);
      console.log(`[Enhanced Search] 🧠 语义搜索找到 ${semanticResults.length} 条结果`);
      
      semanticResults.forEach(result => {
        if (!results.has(result.id)) {
          results.set(result.id, result);
        } else {
          const existing = results.get(result.id)!;
          existing.relevanceScore = Math.max(existing.relevanceScore, result.relevanceScore);
          existing.searchType = 'hybrid';
          existing.details = { ...existing.details, ...result.details };
        }
      });
      
      // 第四阶段：智能排序和过滤
      const finalResults = this.intelligentRanking(
        Array.from(results.values()), 
        searchConfig,
        debugInfo
      );
      
      const performance = {
        totalTime: Date.now() - startTime,
        vectorResults: vectorResults.length,
        keywordResults: keywordResults.length,
        semanticResults: semanticResults.length,
        totalCandidates: results.size,
        finalResults: finalResults.length,
        averageRelevance: finalResults.length > 0 
          ? finalResults.reduce((sum, r) => sum + r.relevanceScore, 0) / finalResults.length 
          : 0
      };
      
      console.log(`[Enhanced Search] ✅ 搜索完成: ${finalResults.length} 条结果, 耗时: ${performance.totalTime}ms`);
      
      // 更新搜索统计
      this.updateSearchStats(query, performance);
      
      return {
        results: finalResults,
        performance,
        debugInfo: searchConfig.debugMode ? debugInfo : undefined
      };
      
    } catch (error) {
      console.error('[Enhanced Search] ❌ 搜索失败:', error);
      return {
        results: [],
        performance: { totalTime: Date.now() - startTime, error: error instanceof Error ? error.message : '未知错误' }
      };
    }
  }

  /**
   * 增强版向量搜索
   */
  private async enhancedVectorSearch(
    userId: string, 
    query: string, 
    config: SearchConfig,
    debugInfo: any
  ): Promise<SearchResult[]> {
    try {
      // 获取所有有向量的记忆
      const conn = await this.mysqlDB.getConnection();
      const userIdField = await this.mysqlDB.getUserIdFieldName();
      
      const [rows] = await conn.query(
        `SELECT id, content, category, importance, timestamp, embedding FROM memories WHERE ${userIdField} = ? AND embedding IS NOT NULL ORDER BY importance DESC`,
        [userId]
      );
      
      const memories = rows as any[];
      console.log(`[Enhanced Vector Search] 📋 找到 ${memories.length} 条有向量的记忆`);
      
      if (memories.length === 0) {
        return [];
      }
      
      // 生成查询向量
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      console.log(`[Enhanced Vector Search] ✅ 查询向量生成完成，维度: ${queryEmbedding.length}`);
      
      const results: SearchResult[] = [];
      const similarities: number[] = [];
      
      // 计算所有相似度
      for (const memory of memories) {
        try {
          let embedding;
          
          if (typeof memory.embedding === 'string') {
            embedding = JSON.parse(memory.embedding);
          } else if (Array.isArray(memory.embedding)) {
            embedding = memory.embedding;
          } else {
            continue;
          }
          
          const similarity = this.calculateCosineSimilarity(queryEmbedding, embedding);
          similarities.push(similarity);
          
          if (config.debugMode) {
            console.log(`[Enhanced Vector Search] 📊 ID=${memory.id}, 相似度=${similarity.toFixed(4)}, 内容="${memory.content.substring(0, 40)}..."`);
          }
          
          results.push({
            id: memory.id,
            content: memory.content,
            category: memory.category,
            importance: memory.importance,
            timestamp: memory.timestamp,
            relevanceScore: similarity,
            searchType: 'vector',
            details: {
              vectorSimilarity: similarity,
              confidence: similarity > 0.5 ? 0.9 : 0.6
            }
          });
          
        } catch (error) {
          console.warn(`[Enhanced Vector Search] 处理embedding失败: ID=${memory.id}`, error);
        }
      }
      
      // 动态阈值调整
      let threshold = config.vectorThreshold;
      if (config.enableDynamicThreshold && similarities.length > 0) {
        const avgSimilarity = similarities.reduce((sum, s) => sum + s, 0) / similarities.length;
        const maxSimilarity = Math.max(...similarities);
        
        // 动态调整：如果平均相似度很低，降低阈值
        if (avgSimilarity < 0.3 && maxSimilarity > 0.2) {
          threshold = Math.max(0.15, maxSimilarity * 0.6);
          console.log(`[Enhanced Vector Search] 🔧 动态调整阈值: ${config.vectorThreshold} → ${threshold.toFixed(3)}`);
        }
        
        debugInfo.thresholds.push({
          original: config.vectorThreshold,
          adjusted: threshold,
          avgSimilarity,
          maxSimilarity
        });
      }
      
      // 过滤结果
      const filteredResults = results
        .filter(r => r.details.vectorSimilarity! >= threshold)
        .sort((a, b) => b.relevanceScore - a.relevanceScore);
      
      console.log(`[Enhanced Vector Search] ✅ 阈值=${threshold.toFixed(3)}, 过滤后: ${filteredResults.length} 条结果`);
      
      return filteredResults;
      
    } catch (error) {
      console.error('[Enhanced Vector Search] ❌ 向量搜索失败:', error);
      return [];
    }
  }

  /**
   * 增强版关键词搜索
   */
  private async enhancedKeywordSearch(
    userId: string, 
    query: string, 
    config: SearchConfig,
    debugInfo: any
  ): Promise<SearchResult[]> {
    try {
      const keywordResults = await this.mysqlDB.searchMemories(userId, query, config.maxResults);
      
      return keywordResults.map((memory: any) => ({
        id: memory.id,
        content: memory.content,
        category: memory.category,
        importance: memory.importance,
        timestamp: memory.timestamp,
        relevanceScore: (memory.relevance_score || 5) / 10, // 标准化到0-1
        searchType: 'keyword' as const,
        details: {
          keywordMatches: [], // TODO: 提取匹配的关键词
          confidence: 0.8
        }
      }));
      
    } catch (error) {
      console.error('[Enhanced Vector Search] ❌ 关键词搜索失败:', error);
      return [];
    }
  }

  /**
   * 语义上下文搜索
   */
  private async semanticContextSearch(
    userId: string, 
    query: string, 
    config: SearchConfig,
    debugInfo: any
  ): Promise<SearchResult[]> {
    try {
      // 提取查询的语义概念
      const keywords = await this.nlpService.extractKeywords(query);
      const relatedTerms = await this.nlpService.generateRelatedTerms(keywords);
      
      const allTerms = [...keywords, ...relatedTerms.slice(0, 5)];
      const results: SearchResult[] = [];
      
      for (const term of allTerms) {
        const termResults = await this.mysqlDB.searchMemories(userId, term, Math.floor(config.maxResults / allTerms.length));
        
        termResults.forEach((memory: any) => {
          const relevanceScore = 0.6; // 语义搜索基础分数
          
          results.push({
            id: memory.id,
            content: memory.content,
            category: memory.category,
            importance: memory.importance,
            timestamp: memory.timestamp,
            relevanceScore,
            searchType: 'semantic',
            details: {
              semanticContext: term,
              confidence: 0.7
            }
          });
        });
      }
      
      return results;
      
    } catch (error) {
      console.error('[Enhanced Vector Search] ❌ 语义搜索失败:', error);
      return [];
    }
  }

  /**
   * 智能排序算法
   */
  private intelligentRanking(
    results: SearchResult[], 
    config: SearchConfig,
    debugInfo: any
  ): SearchResult[] {
    const now = Date.now();
    
    const scoredResults = results.map(result => {
      // 时间衰减因子
      const timestamp = new Date(result.timestamp).getTime();
      const daysPassed = (now - timestamp) / (1000 * 60 * 60 * 24);
      const temporalScore = Math.pow(config.temporalDecay, daysPassed);
      
      // 重要性加权
      const importanceScore = result.importance / 10;
      
      // 综合评分
      const finalScore = 
        result.relevanceScore * (1 - config.importanceWeight) + 
        importanceScore * config.importanceWeight + 
        temporalScore * 0.1;
      
      return {
        ...result,
        relevanceScore: finalScore
      };
    });
    
    return scoredResults
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, config.maxResults);
  }

  /**
   * 计算余弦相似度
   */
  private calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      return 0;
    }
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * 更新搜索统计
   */
  private updateSearchStats(query: string, performance: any): void {
    const stats = {
      query,
      timestamp: Date.now(),
      ...performance
    };
    
    this.searchStats.set(`${Date.now()}-${Math.random()}`, stats);
    
    // 保持最近100次搜索记录
    if (this.searchStats.size > 100) {
      const oldestKey = Array.from(this.searchStats.keys())[0];
      this.searchStats.delete(oldestKey);
    }
  }

  /**
   * 获取搜索统计
   */
  getSearchStats(): any[] {
    return Array.from(this.searchStats.values());
  }

  /**
   * 重置搜索统计
   */
  resetSearchStats(): void {
    this.searchStats.clear();
  }
}

// 单例实例
let enhancedSearchEngine: EnhancedVectorSearchEngine | null = null;

export function getEnhancedSearchEngine(config?: Partial<SearchConfig>): EnhancedVectorSearchEngine {
  if (!enhancedSearchEngine) {
    enhancedSearchEngine = new EnhancedVectorSearchEngine(config);
  }
  return enhancedSearchEngine;
} 