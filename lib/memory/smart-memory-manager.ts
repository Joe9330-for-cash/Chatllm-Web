import { getEnhancedSearchEngine } from './enhanced-vector-search';
import { getMemoryIndexSystem } from './memory-index-system';
import { getPerformanceMonitor } from './performance-monitor';
import { getMySQLMemoryDB } from './mysql-database';
import { getIntelligentMemoryManager } from './intelligent-manager';

export interface SmartMemoryConfig {
  enableCache: boolean;
  cacheExpiry: number;
  batchSize: number;
  llmCallThreshold: number;
  enableSmartExtraction: boolean;
  enableIndexOptimization: boolean;
  maxCacheSize: number;
}

export interface CacheEntry {
  key: string;
  value: any;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

export interface BatchOperation {
  type: 'extract' | 'search' | 'index';
  data: any;
  timestamp: number;
  priority: number;
}

export class SmartMemoryManager {
  private config: SmartMemoryConfig;
  private enhancedSearch: any;
  private indexSystem: any;
  private performanceMonitor: any;
  private mysqlDB: any;
  private intelligentManager: any;
  
  // 缓存系统
  private searchCache: Map<string, CacheEntry> = new Map();
  private extractionCache: Map<string, CacheEntry> = new Map();
  private indexCache: Map<string, CacheEntry> = new Map();
  
  // 批处理队列
  private batchQueue: BatchOperation[] = [];
  private batchProcessing: boolean = false;
  
  // 智能分析
  private queryPatterns: Map<string, number> = new Map();
  private extractionStats: Map<string, { count: number; avgConfidence: number }> = new Map();
  
  constructor(config?: Partial<SmartMemoryConfig>) {
    this.config = {
      enableCache: true,
      cacheExpiry: 10 * 60 * 1000, // 10分钟缓存
      batchSize: 10,
      llmCallThreshold: 0.3, // LLM调用置信度阈值（降低以提高召回率）
      enableSmartExtraction: true,
      enableIndexOptimization: true,
      maxCacheSize: 1000,
      ...config
    };
    
    this.enhancedSearch = getEnhancedSearchEngine();
    this.indexSystem = getMemoryIndexSystem();
    this.performanceMonitor = getPerformanceMonitor();
    this.mysqlDB = getMySQLMemoryDB();
    this.intelligentManager = getIntelligentMemoryManager();
    
    console.log('[Smart Memory Manager] 🚀 智能记忆管理系统已启动');
    console.log('[Smart Memory Manager] 📊 配置:', this.config);
    
    // 启动批处理定时器
    this.startBatchProcessor();
  }

  /**
   * 智能搜索 - 集成多种搜索策略
   */
  async smartSearch(
    userId: string, 
    query: string, 
    limit: number = 20
  ): Promise<{
    results: any[];
    source: 'cache' | 'index' | 'enhanced' | 'hybrid';
    performance: any;
  }> {
    const perfContext = this.performanceMonitor.createContext('smart-search', 0);
    const startTime = Date.now();
    
    try {
      console.log(`[Smart Memory Manager] 🔍 智能搜索: "${query}"`);
      
      // 1. 缓存检查
      if (this.config.enableCache) {
        const cacheResult = this.checkSearchCache(userId, query, limit);
        if (cacheResult) {
          console.log(`[Smart Memory Manager] 💾 缓存命中: ${cacheResult.results.length} 条结果`);
          perfContext.updateMemoryCount(cacheResult.results.length);
          perfContext.end(true);
          return {
            results: cacheResult.results,
            source: 'cache',
            performance: { duration: Date.now() - startTime, fromCache: true }
          };
        }
      }
      
      // 2. 索引搜索
      const indexResult = await this.indexSystem.intelligentSearch(userId, query, {
        maxResults: limit,
        threshold: 0.3
      });
      
      // 3. 如果索引搜索结果不够，使用增强搜索
      let finalResults = indexResult.results;
      let searchSource: 'index' | 'enhanced' | 'hybrid' = 'index';
      
      if (indexResult.results.length < limit * 0.7) {
        console.log(`[Smart Memory Manager] 🔧 索引结果不足，启用增强搜索`);
        
        const enhancedResult = await this.enhancedSearch.enhancedSearch(userId, query, {
          maxResults: limit,
          vectorThreshold: 0.25,
          debugMode: false
        });
        
        // 合并结果
        finalResults = this.mergeSearchResults(indexResult.results, enhancedResult.results);
        searchSource = indexResult.results.length > 0 ? 'hybrid' : 'enhanced';
      }
      
      // 4. 缓存结果
      if (this.config.enableCache && finalResults.length > 0) {
        this.cacheSearchResult(userId, query, limit, finalResults);
      }
      
      // 5. 更新查询模式
      this.updateQueryPatterns(query);
      
      const performance = {
        duration: Date.now() - startTime,
        indexResults: indexResult.results.length,
        finalResults: finalResults.length,
        indexPerformance: indexResult.performance
      };
      
      console.log(`[Smart Memory Manager] ✅ 搜索完成: ${finalResults.length} 条结果, 来源: ${searchSource}`);
      
      perfContext.updateMemoryCount(finalResults.length);
      perfContext.end(true);
      
      return {
        results: finalResults.slice(0, limit),
        source: searchSource,
        performance
      };
      
    } catch (error) {
      console.error('[Smart Memory Manager] ❌ 智能搜索失败:', error);
      perfContext.end(false, { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * 智能记忆提取 - 减少LLM调用
   */
  async smartExtraction(
    userId: string, 
    messages: any[], 
    forceExtraction: boolean = false
  ): Promise<{
    extractedMemories: any[];
    source: 'cache' | 'smart' | 'llm';
    confidence: number;
    performance: any;
  }> {
    const perfContext = this.performanceMonitor.createContext('smart-extraction', 0);
    const startTime = Date.now();
    
    try {
      console.log(`[Smart Memory Manager] 🧠 智能提取: ${messages.length} 条消息`);
      
      // 1. 缓存检查
      if (this.config.enableCache && !forceExtraction) {
        const cacheResult = this.checkExtractionCache(messages);
        if (cacheResult) {
          console.log(`[Smart Memory Manager] 💾 提取缓存命中`);
          perfContext.updateMemoryCount(cacheResult.memories.length);
          perfContext.end(true);
          return {
            extractedMemories: cacheResult.memories,
            source: 'cache',
            confidence: cacheResult.confidence,
            performance: { duration: Date.now() - startTime, fromCache: true }
          };
        }
      }
      
      // 2. 智能分析决定是否需要LLM提取
      const extractionNeeded = this.shouldExtractMemories(messages);
      
      if (!extractionNeeded.needed && !forceExtraction) {
        console.log(`[Smart Memory Manager] 🚫 智能跳过提取: ${extractionNeeded.reason}`);
        return {
          extractedMemories: [],
          source: 'smart',
          confidence: 0.9,
          performance: { duration: Date.now() - startTime, skipped: true }
        };
      }
      
      // 3. 批量提取或即时提取
      let extractionResult;
      if (this.config.enableSmartExtraction && !forceExtraction) {
        // 添加到批处理队列
        this.addToBatchQueue({
          type: 'extract',
          data: { userId, messages },
          timestamp: Date.now(),
          priority: extractionNeeded.priority
        });
        
        // 如果高优先级，立即处理
        if (extractionNeeded.priority > 8) {
          extractionResult = await this.intelligentManager.extractMemories(userId, messages);
        } else {
          // 返回空结果，等待批处理
          return {
            extractedMemories: [],
            source: 'smart',
            confidence: 0.8,
            performance: { duration: Date.now() - startTime, batched: true }
          };
        }
      } else {
        // 立即提取
        extractionResult = await this.intelligentManager.extractMemories(userId, messages);
      }
      
      // 4. 缓存结果
      if (this.config.enableCache && extractionResult.memories.length > 0) {
        this.cacheExtractionResult(messages, extractionResult);
      }
      
      // 5. 更新提取统计
      this.updateExtractionStats(messages, extractionResult);
      
      const performance = {
        duration: Date.now() - startTime,
        extractedCount: extractionResult.memories.length,
        confidence: extractionResult.confidence
      };
      
      console.log(`[Smart Memory Manager] ✅ 提取完成: ${extractionResult.memories.length} 条记忆`);
      
      perfContext.updateMemoryCount(extractionResult.memories.length);
      perfContext.end(true);
      
      return {
        extractedMemories: extractionResult.memories,
        source: 'llm',
        confidence: extractionResult.confidence,
        performance
      };
      
    } catch (error) {
      console.error('[Smart Memory Manager] ❌ 智能提取失败:', error);
      perfContext.end(false, { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * 检查搜索缓存
   */
  private checkSearchCache(userId: string, query: string, limit: number): { results: any[] } | null {
    const cacheKey = `search:${userId}:${query}:${limit}`;
    const entry = this.searchCache.get(cacheKey);
    
    if (entry && Date.now() - entry.timestamp < this.config.cacheExpiry) {
      entry.accessCount++;
      entry.lastAccessed = Date.now();
      return entry.value;
    }
    
    return null;
  }

  /**
   * 缓存搜索结果
   */
  private cacheSearchResult(userId: string, query: string, limit: number, results: any[]): void {
    const cacheKey = `search:${userId}:${query}:${limit}`;
    
    this.searchCache.set(cacheKey, {
      key: cacheKey,
      value: { results },
      timestamp: Date.now(),
      accessCount: 1,
      lastAccessed: Date.now()
    });
    
    // 清理过期缓存
    this.cleanupCache(this.searchCache);
  }

  /**
   * 检查提取缓存
   */
  private checkExtractionCache(messages: any[]): { memories: any[]; confidence: number } | null {
    const cacheKey = this.generateMessageCacheKey(messages);
    const entry = this.extractionCache.get(cacheKey);
    
    if (entry && Date.now() - entry.timestamp < this.config.cacheExpiry) {
      entry.accessCount++;
      entry.lastAccessed = Date.now();
      return entry.value;
    }
    
    return null;
  }

  /**
   * 缓存提取结果
   */
  private cacheExtractionResult(messages: any[], result: any): void {
    const cacheKey = this.generateMessageCacheKey(messages);
    
    this.extractionCache.set(cacheKey, {
      key: cacheKey,
      value: { memories: result.memories, confidence: result.confidence },
      timestamp: Date.now(),
      accessCount: 1,
      lastAccessed: Date.now()
    });
    
    // 清理过期缓存
    this.cleanupCache(this.extractionCache);
  }

  /**
   * 生成消息缓存键
   */
  private generateMessageCacheKey(messages: any[]): string {
    const content = messages.map(m => m.content).join('|');
    return `extract:${this.simpleHash(content)}`;
  }

  /**
   * 简单哈希函数
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 判断是否需要提取记忆
   */
  private shouldExtractMemories(messages: any[]): { needed: boolean; reason: string; priority: number } {
    const latestMessage = messages[messages.length - 1];
    const content = latestMessage?.content || '';
    
    // 内容长度检查
    if (content.length < 10) {
      return { needed: false, reason: '内容过短', priority: 0 };
    }
    
    // 重复内容检查
    if (this.isRepeatedContent(content)) {
      return { needed: false, reason: '重复内容', priority: 0 };
    }
    
    // 问题型消息检查
    if (this.isQuestionOnly(content)) {
      return { needed: false, reason: '仅为问题', priority: 0 };
    }
    
    // 高价值内容检查
    const priority = this.calculateExtractionPriority(content);
    
    return {
      needed: true,
      reason: '包含有价值信息',
      priority
    };
  }

  /**
   * 检查是否为重复内容
   */
  private isRepeatedContent(content: string): boolean {
    // 简单的重复检查逻辑
    const recentExtractions = Array.from(this.extractionCache.values())
      .filter(entry => Date.now() - entry.timestamp < 5 * 60 * 1000) // 5分钟内
      .map(entry => entry.key);
    
    const currentHash = this.simpleHash(content);
    return recentExtractions.some(key => key.includes(currentHash));
  }

  /**
   * 检查是否仅为问题
   */
  private isQuestionOnly(content: string): boolean {
    const questionPatterns = [
      /^[什么|谁|哪里|哪个|如何|怎么|为什么|什么时候]/,
      /\?$/,
      /？$/,
      /^请.*[？?]$/
    ];
    
    return questionPatterns.some(pattern => pattern.test(content.trim()));
  }

  /**
   * 计算提取优先级
   */
  private calculateExtractionPriority(content: string): number {
    let priority = 5; // 基础优先级
    
    // 长度加权
    if (content.length > 100) priority += 2;
    if (content.length > 500) priority += 2;
    
    // 关键词加权
    const highValueKeywords = ['公司', '项目', '客户', '合同', '会议', '决策', '计划'];
    const keywordCount = highValueKeywords.filter(keyword => content.includes(keyword)).length;
    priority += keywordCount;
    
    // 时间信息加权
    if (/\d{4}年|\d{1,2}月|\d{1,2}日/.test(content)) priority += 1;
    
    // 数字信息加权
    if (/\d+%|\d+元|\d+万|\d+个/.test(content)) priority += 1;
    
    return Math.min(priority, 10); // 最高优先级为10
  }

  /**
   * 合并搜索结果
   */
  private mergeSearchResults(indexResults: any[], enhancedResults: any[]): any[] {
    const merged = new Map();
    
    // 添加索引搜索结果
    indexResults.forEach(result => {
      merged.set(result.id, { ...result, source: 'index' });
    });
    
    // 添加增强搜索结果
    enhancedResults.forEach(result => {
      if (!merged.has(result.id)) {
        merged.set(result.id, { ...result, source: 'enhanced' });
      } else {
        // 合并，取最高相关性分数
        const existing = merged.get(result.id);
        if (result.relevanceScore > existing.relevanceScore) {
          merged.set(result.id, { ...result, source: 'hybrid' });
        }
      }
    });
    
    return Array.from(merged.values()).sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * 添加到批处理队列
   */
  private addToBatchQueue(operation: BatchOperation): void {
    this.batchQueue.push(operation);
    
    // 如果队列满了，立即处理
    if (this.batchQueue.length >= this.config.batchSize) {
      this.processBatchQueue();
    }
  }

  /**
   * 启动批处理器
   */
  private startBatchProcessor(): void {
    setInterval(() => {
      if (this.batchQueue.length > 0 && !this.batchProcessing) {
        this.processBatchQueue();
      }
    }, 30000); // 每30秒处理一次
  }

  /**
   * 处理批处理队列
   */
  private async processBatchQueue(): Promise<void> {
    if (this.batchProcessing || this.batchQueue.length === 0) return;
    
    this.batchProcessing = true;
    console.log(`[Smart Memory Manager] 🔄 开始处理批处理队列: ${this.batchQueue.length} 个操作`);
    
    try {
      // 按优先级排序
      this.batchQueue.sort((a, b) => b.priority - a.priority);
      
      const batch = this.batchQueue.splice(0, this.config.batchSize);
      
      for (const operation of batch) {
        try {
          if (operation.type === 'extract') {
            await this.intelligentManager.extractMemories(
              operation.data.userId,
              operation.data.messages
            );
          }
          // 可以添加其他操作类型
        } catch (error) {
          console.error(`[Smart Memory Manager] 批处理操作失败:`, error);
        }
      }
      
      console.log(`[Smart Memory Manager] ✅ 批处理完成: ${batch.length} 个操作`);
      
    } catch (error) {
      console.error('[Smart Memory Manager] 批处理失败:', error);
    } finally {
      this.batchProcessing = false;
    }
  }

  /**
   * 更新查询模式
   */
  private updateQueryPatterns(query: string): void {
    const pattern = query.toLowerCase().trim();
    const count = this.queryPatterns.get(pattern) || 0;
    this.queryPatterns.set(pattern, count + 1);
    
    // 保持最近的模式
    if (this.queryPatterns.size > 1000) {
      const entries = Array.from(this.queryPatterns.entries());
      entries.sort((a, b) => b[1] - a[1]);
      this.queryPatterns.clear();
      entries.slice(0, 500).forEach(([pattern, count]) => {
        this.queryPatterns.set(pattern, count);
      });
    }
  }

  /**
   * 更新提取统计
   */
  private updateExtractionStats(messages: any[], result: any): void {
    const content = messages.map(m => m.content).join(' ');
    const contentType = this.classifyContent(content);
    
    const stats = this.extractionStats.get(contentType) || { count: 0, avgConfidence: 0 };
    stats.count++;
    stats.avgConfidence = (stats.avgConfidence * (stats.count - 1) + result.confidence) / stats.count;
    
    this.extractionStats.set(contentType, stats);
  }

  /**
   * 内容分类
   */
  private classifyContent(content: string): string {
    if (content.includes('公司') || content.includes('业务')) return 'business';
    if (content.includes('项目') || content.includes('工作')) return 'project';
    if (content.includes('学习') || content.includes('技术')) return 'learning';
    if (content.includes('个人') || content.includes('生活')) return 'personal';
    return 'general';
  }

  /**
   * 清理缓存
   */
  private cleanupCache(cache: Map<string, CacheEntry>): void {
    if (cache.size <= this.config.maxCacheSize) return;
    
    const entries = Array.from(cache.entries());
    
    // 移除过期条目
    entries.forEach(([key, entry]) => {
      if (Date.now() - entry.timestamp > this.config.cacheExpiry) {
        cache.delete(key);
      }
    });
    
    // 如果还是太大，移除最少使用的条目
    if (cache.size > this.config.maxCacheSize) {
      const sortedEntries = Array.from(cache.entries())
        .sort((a, b) => a[1].accessCount - b[1].accessCount);
      
      const toRemove = sortedEntries.slice(0, cache.size - this.config.maxCacheSize + 100);
      toRemove.forEach(([key]) => cache.delete(key));
    }
  }

  /**
   * 获取系统统计信息
   */
  getSystemStats(): any {
    return {
      cacheStats: {
        searchCacheSize: this.searchCache.size,
        extractionCacheSize: this.extractionCache.size,
        indexCacheSize: this.indexCache.size
      },
      batchStats: {
        queueSize: this.batchQueue.length,
        isProcessing: this.batchProcessing
      },
      queryPatterns: Array.from(this.queryPatterns.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
      extractionStats: Object.fromEntries(this.extractionStats),
      performance: this.performanceMonitor.getDetailedStats()
    };
  }

  /**
   * 清理系统资源
   */
  cleanup(): void {
    this.searchCache.clear();
    this.extractionCache.clear();
    this.indexCache.clear();
    this.batchQueue.length = 0;
    this.queryPatterns.clear();
    this.extractionStats.clear();
    
    console.log('[Smart Memory Manager] 🧹 系统资源已清理');
  }
}

// 单例实例
let smartMemoryManager: SmartMemoryManager | null = null;

export function getSmartMemoryManager(config?: Partial<SmartMemoryConfig>): SmartMemoryManager {
  if (!smartMemoryManager) {
    smartMemoryManager = new SmartMemoryManager(config);
  }
  return smartMemoryManager;
} 