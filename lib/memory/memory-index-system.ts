import { getMySQLMemoryDB } from './mysql-database';
import { getChineseNLPService } from './chinese-nlp-service';
import { getEmbeddingService } from './embedding-service';

export interface MemoryIndex {
  id: string;
  type: 'topic' | 'entity' | 'relation' | 'concept';
  value: string;
  memoryIds: number[];
  weight: number;
  lastUpdated: number;
  metadata?: any;
}

export interface IndexedMemory {
  id: number;
  content: string;
  category: string;
  topics: string[];
  entities: string[];
  relations: string[];
  concepts: string[];
  embeddings?: number[];
  lastIndexed: number;
}

export class MemoryIndexSystem {
  private mysqlDB: any;
  private nlpService: any;
  private embeddingService: any;
  
  // 内存中的索引缓存
  private topicIndex: Map<string, MemoryIndex> = new Map();
  private entityIndex: Map<string, MemoryIndex> = new Map();
  private relationIndex: Map<string, MemoryIndex> = new Map();
  private conceptIndex: Map<string, MemoryIndex> = new Map();
  
  // 索引配置
  private indexConfig = {
    rebuildInterval: 24 * 60 * 60 * 1000, // 24小时重建索引
    maxIndexSize: 10000,                  // 最大索引条目数
    minMemoryCount: 2,                    // 最少关联记忆数
    enableAutoUpdate: true,               // 启用自动更新
    enableCaching: true,                  // 启用缓存
    cacheExpiry: 2 * 60 * 60 * 1000      // 缓存2小时过期
  };

  constructor() {
    this.mysqlDB = getMySQLMemoryDB();
    this.nlpService = getChineseNLPService();
    this.embeddingService = getEmbeddingService();
    
    // 启动时加载索引
    this.initializeIndexes();
  }

  /**
   * 初始化索引系统
   */
  private async initializeIndexes(): Promise<void> {
    try {
      console.log('[Memory Index] 🚀 初始化记忆索引系统...');
      
      // 检查是否需要重建索引
      const lastRebuild = await this.getLastIndexRebuildTime();
      const needsRebuild = Date.now() - lastRebuild > this.indexConfig.rebuildInterval;
      
      if (needsRebuild) {
        console.log('[Memory Index] 🔄 检测到需要重建索引');
        await this.rebuildAllIndexes();
      } else {
        console.log('[Memory Index] ✅ 加载现有索引');
        await this.loadExistingIndexes();
      }
      
      console.log('[Memory Index] ✅ 索引系统初始化完成');
      
    } catch (error) {
      console.error('[Memory Index] ❌ 索引初始化失败:', error);
    }
  }

  /**
   * 重建所有索引
   */
  async rebuildAllIndexes(): Promise<void> {
    const startTime = Date.now();
    console.log('[Memory Index] 🔨 开始重建所有索引...');
    
    try {
      // 清空现有索引
      this.clearAllIndexes();
      
      // 获取所有记忆
      const memories = await this.getAllMemories();
      console.log(`[Memory Index] 📋 找到 ${memories.length} 条记忆需要索引`);
      
      let processedCount = 0;
      const batchSize = 50;
      
      // 批量处理记忆
      for (let i = 0; i < memories.length; i += batchSize) {
        const batch = memories.slice(i, i + batchSize);
        await this.processBatch(batch);
        
        processedCount += batch.length;
        console.log(`[Memory Index] 📊 已处理 ${processedCount}/${memories.length} 条记忆`);
      }
      
      // 优化索引
      await this.optimizeIndexes();
      
      // 保存索引到数据库
      await this.saveIndexesToDatabase();
      
      // 更新重建时间
      await this.updateIndexRebuildTime();
      
      const duration = Date.now() - startTime;
      console.log(`[Memory Index] ✅ 索引重建完成，耗时: ${duration}ms`);
      
    } catch (error) {
      console.error('[Memory Index] ❌ 索引重建失败:', error);
      throw error;
    }
  }

  /**
   * 批量处理记忆
   */
  private async processBatch(memories: any[]): Promise<void> {
    const promises = memories.map(memory => this.indexSingleMemory(memory));
    await Promise.all(promises);
  }

  /**
   * 索引单个记忆
   */
  async indexSingleMemory(memory: any): Promise<IndexedMemory> {
    try {
      const content = memory.content;
      
      // 提取主题
      const topics = await this.extractTopics(content);
      
      // 提取实体
      const entities = await this.extractEntities(content);
      
      // 提取关系
      const relations = await this.extractRelations(content, entities);
      
      // 提取概念
      const concepts = await this.extractConcepts(content);
      
      // 更新索引
      this.updateTopicIndex(topics, memory.id);
      this.updateEntityIndex(entities, memory.id);
      this.updateRelationIndex(relations, memory.id);
      this.updateConceptIndex(concepts, memory.id);
      
      const indexedMemory: IndexedMemory = {
        id: memory.id,
        content: memory.content,
        category: memory.category,
        topics,
        entities,
        relations,
        concepts,
        lastIndexed: Date.now()
      };
      
      return indexedMemory;
      
    } catch (error) {
      console.warn(`[Memory Index] 处理记忆${memory.id}失败:`, error);
      throw error;
    }
  }

  /**
   * 智能搜索（使用索引）
   */
  async intelligentSearch(
    userId: string, 
    query: string, 
    options: {
      searchTypes?: ('topic' | 'entity' | 'relation' | 'concept')[];
      maxResults?: number;
      threshold?: number;
      enableFuzzy?: boolean;
    } = {}
  ): Promise<{
    results: any[];
    performance: any;
    indexUsage: any;
  }> {
    const startTime = Date.now();
    const searchTypes = options.searchTypes || ['topic', 'entity', 'relation', 'concept'];
    const maxResults = options.maxResults || 50;
    const threshold = options.threshold || 0.3;
    
    console.log(`[Memory Index] 🔍 智能搜索: "${query}"`);
    console.log(`[Memory Index] 📊 搜索类型: ${searchTypes.join(', ')}`);
    
    const candidateMemoryIds = new Set<number>();
    const indexUsage: any = {};
    
    try {
      // 分析查询
      const queryAnalysis = await this.analyzeQuery(query);
      
      // 基于主题搜索
      if (searchTypes.includes('topic')) {
        const topicMatches = this.searchTopicIndex(queryAnalysis.topics);
        topicMatches.forEach(id => candidateMemoryIds.add(id));
        indexUsage.topicMatches = topicMatches.length;
      }
      
      // 基于实体搜索
      if (searchTypes.includes('entity')) {
        const entityMatches = this.searchEntityIndex(queryAnalysis.entities);
        entityMatches.forEach(id => candidateMemoryIds.add(id));
        indexUsage.entityMatches = entityMatches.length;
      }
      
      // 基于关系搜索
      if (searchTypes.includes('relation')) {
        const relationMatches = this.searchRelationIndex(queryAnalysis.relations);
        relationMatches.forEach(id => candidateMemoryIds.add(id));
        indexUsage.relationMatches = relationMatches.length;
      }
      
      // 基于概念搜索
      if (searchTypes.includes('concept')) {
        const conceptMatches = this.searchConceptIndex(queryAnalysis.concepts);
        conceptMatches.forEach(id => candidateMemoryIds.add(id));
        indexUsage.conceptMatches = conceptMatches.length;
      }
      
      // 获取候选记忆的详细信息
      const candidateIds = Array.from(candidateMemoryIds);
      const memories = await this.getMemoriesByIds(userId, candidateIds);
      
      // 计算相关性分数
      const scoredResults = await this.calculateRelevanceScores(memories, queryAnalysis);
      
      // 过滤和排序
      const finalResults = scoredResults
        .filter(result => result.relevanceScore >= threshold)
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, maxResults);
      
      const performance = {
        totalTime: Date.now() - startTime,
        candidateCount: candidateIds.length,
        finalCount: finalResults.length,
        indexHitRate: candidateIds.length > 0 ? finalResults.length / candidateIds.length : 0
      };
      
      console.log(`[Memory Index] ✅ 搜索完成: ${finalResults.length} 条结果, 耗时: ${performance.totalTime}ms`);
      
      return {
        results: finalResults,
        performance,
        indexUsage
      };
      
    } catch (error) {
      console.error('[Memory Index] ❌ 智能搜索失败:', error);
      return {
        results: [],
        performance: { totalTime: Date.now() - startTime, error: error instanceof Error ? error.message : '未知错误' },
        indexUsage: {}
      };
    }
  }

  /**
   * 分析查询
   */
  private async analyzeQuery(query: string): Promise<{
    topics: string[];
    entities: string[];
    relations: string[];
    concepts: string[];
  }> {
    const [topics, entities, relations, concepts] = await Promise.all([
      this.extractTopics(query),
      this.extractEntities(query),
      this.extractRelations(query, []),
      this.extractConcepts(query)
    ]);
    
    return { topics, entities, relations, concepts };
  }

  /**
   * 提取主题
   */
  private async extractTopics(content: string): Promise<string[]> {
    try {
      // 使用NLP服务提取关键词作为主题
      const keywords = await this.nlpService.extractKeywords(content);
      
      // 过滤和标准化主题
      return keywords
        .filter((topic: string) => topic.length > 1)
        .map((topic: string) => topic.toLowerCase().trim())
        .slice(0, 10); // 最多10个主题
        
    } catch (error) {
      console.warn('[Memory Index] 主题提取失败:', error);
      return [];
    }
  }

  /**
   * 提取实体
   */
  private async extractEntities(content: string): Promise<string[]> {
    try {
      // 简单的实体提取：人名、公司名、地名等
      const entities: string[] = [];
      
      // 匹配人名模式
      const namePattern = /([张王李赵刘陈杨黄周吴徐孙胡朱高林何郭马罗梁宋郑谢韩唐冯于董萧程曹袁邓许傅沈曾彭吕苏卢蒋蔡贾丁魏薛叶阎余潘杜戴夏钟汪田任姜范方石姚谭廖邹熊金陆郝孔白崔康毛邱秦江史顾侯邵孟龙万段雷钱汤尹黎易常武乔贺赖龚文][一-龥]{1,3})/g;
      const names = content.match(namePattern) || [];
      entities.push(...names);
      
      // 匹配公司名模式
      const companyPattern = /([一-龥A-Za-z0-9]+(?:公司|有限公司|股份有限公司|集团|企业|科技|技术))/g;
      const companies = content.match(companyPattern) || [];
      entities.push(...companies);
      
      // 匹配地名模式
      const locationPattern = /([一-龥]+(?:市|省|县|区|镇|街道|路|街))/g;
      const locations = content.match(locationPattern) || [];
      entities.push(...locations);
      
      return Array.from(new Set(entities)).slice(0, 20); // 去重，最多20个实体
      
    } catch (error) {
      console.warn('[Memory Index] 实体提取失败:', error);
      return [];
    }
  }

  /**
   * 提取关系
   */
  private async extractRelations(content: string, entities: string[]): Promise<string[]> {
    try {
      const relations: string[] = [];
      
      // 基于动词的关系提取
      const verbPattern = /(是|为|做|担任|负责|管理|领导|工作|学习|居住|来自|属于|拥有|喜欢|讨厌)/g;
      const verbs = content.match(verbPattern) || [];
      relations.push(...verbs);
      
      // 基于介词的关系
      const prepPattern = /(在|于|从|到|向|对|与|和|跟|同|为了|因为|由于)/g;
      const preps = content.match(prepPattern) || [];
      relations.push(...preps);
      
      return Array.from(new Set(relations)).slice(0, 15); // 去重，最多15个关系
      
    } catch (error) {
      console.warn('[Memory Index] 关系提取失败:', error);
      return [];
    }
  }

  /**
   * 提取概念
   */
  private async extractConcepts(content: string): Promise<string[]> {
    try {
      // 使用NLP服务生成相关词汇作为概念
      const keywords = await this.nlpService.extractKeywords(content);
      
      if (keywords.length === 0) return [];
      
      const relatedTerms = await this.nlpService.generateRelatedTerms(keywords.slice(0, 3));
      
      return relatedTerms.slice(0, 10); // 最多10个概念
      
    } catch (error) {
      console.warn('[Memory Index] 概念提取失败:', error);
      return [];
    }
  }

  /**
   * 更新主题索引
   */
  private updateTopicIndex(topics: string[], memoryId: number): void {
    topics.forEach(topic => {
      if (!this.topicIndex.has(topic)) {
        this.topicIndex.set(topic, {
          id: topic,
          type: 'topic',
          value: topic,
          memoryIds: [],
          weight: 0,
          lastUpdated: Date.now()
        });
      }
      
      const index = this.topicIndex.get(topic)!;
      if (!index.memoryIds.includes(memoryId)) {
        index.memoryIds.push(memoryId);
        index.weight = index.memoryIds.length;
        index.lastUpdated = Date.now();
      }
    });
  }

  /**
   * 更新实体索引
   */
  private updateEntityIndex(entities: string[], memoryId: number): void {
    entities.forEach(entity => {
      if (!this.entityIndex.has(entity)) {
        this.entityIndex.set(entity, {
          id: entity,
          type: 'entity',
          value: entity,
          memoryIds: [],
          weight: 0,
          lastUpdated: Date.now()
        });
      }
      
      const index = this.entityIndex.get(entity)!;
      if (!index.memoryIds.includes(memoryId)) {
        index.memoryIds.push(memoryId);
        index.weight = index.memoryIds.length;
        index.lastUpdated = Date.now();
      }
    });
  }

  /**
   * 更新关系索引
   */
  private updateRelationIndex(relations: string[], memoryId: number): void {
    relations.forEach(relation => {
      if (!this.relationIndex.has(relation)) {
        this.relationIndex.set(relation, {
          id: relation,
          type: 'relation',
          value: relation,
          memoryIds: [],
          weight: 0,
          lastUpdated: Date.now()
        });
      }
      
      const index = this.relationIndex.get(relation)!;
      if (!index.memoryIds.includes(memoryId)) {
        index.memoryIds.push(memoryId);
        index.weight = index.memoryIds.length;
        index.lastUpdated = Date.now();
      }
    });
  }

  /**
   * 更新概念索引
   */
  private updateConceptIndex(concepts: string[], memoryId: number): void {
    concepts.forEach(concept => {
      if (!this.conceptIndex.has(concept)) {
        this.conceptIndex.set(concept, {
          id: concept,
          type: 'concept',
          value: concept,
          memoryIds: [],
          weight: 0,
          lastUpdated: Date.now()
        });
      }
      
      const index = this.conceptIndex.get(concept)!;
      if (!index.memoryIds.includes(memoryId)) {
        index.memoryIds.push(memoryId);
        index.weight = index.memoryIds.length;
        index.lastUpdated = Date.now();
      }
    });
  }

  /**
   * 搜索主题索引
   */
  private searchTopicIndex(topics: string[]): number[] {
    const memoryIds = new Set<number>();
    
    topics.forEach(topic => {
      const exactMatch = this.topicIndex.get(topic);
      if (exactMatch) {
        exactMatch.memoryIds.forEach(id => memoryIds.add(id));
      }
      
      // 模糊匹配
      this.topicIndex.forEach((index, key) => {
        if (key.includes(topic) || topic.includes(key)) {
          index.memoryIds.forEach(id => memoryIds.add(id));
        }
      });
    });
    
    return Array.from(memoryIds);
  }

  /**
   * 搜索实体索引
   */
  private searchEntityIndex(entities: string[]): number[] {
    const memoryIds = new Set<number>();
    
    entities.forEach(entity => {
      const exactMatch = this.entityIndex.get(entity);
      if (exactMatch) {
        exactMatch.memoryIds.forEach(id => memoryIds.add(id));
      }
    });
    
    return Array.from(memoryIds);
  }

  /**
   * 搜索关系索引
   */
  private searchRelationIndex(relations: string[]): number[] {
    const memoryIds = new Set<number>();
    
    relations.forEach(relation => {
      const exactMatch = this.relationIndex.get(relation);
      if (exactMatch) {
        exactMatch.memoryIds.forEach(id => memoryIds.add(id));
      }
    });
    
    return Array.from(memoryIds);
  }

  /**
   * 搜索概念索引
   */
  private searchConceptIndex(concepts: string[]): number[] {
    const memoryIds = new Set<number>();
    
    concepts.forEach(concept => {
      const exactMatch = this.conceptIndex.get(concept);
      if (exactMatch) {
        exactMatch.memoryIds.forEach(id => memoryIds.add(id));
      }
    });
    
    return Array.from(memoryIds);
  }

  /**
   * 计算相关性分数
   */
  private async calculateRelevanceScores(memories: any[], queryAnalysis: any): Promise<any[]> {
    return memories.map(memory => {
      let score = 0;
      
      // 主题匹配分数
      const topicMatches = queryAnalysis.topics.filter((topic: string) => 
        memory.content.toLowerCase().includes(topic.toLowerCase())
      );
      score += topicMatches.length * 0.3;
      
      // 实体匹配分数
      const entityMatches = queryAnalysis.entities.filter((entity: string) => 
        memory.content.includes(entity)
      );
      score += entityMatches.length * 0.4;
      
      // 关系匹配分数
      const relationMatches = queryAnalysis.relations.filter((relation: string) => 
        memory.content.includes(relation)
      );
      score += relationMatches.length * 0.2;
      
      // 概念匹配分数
      const conceptMatches = queryAnalysis.concepts.filter((concept: string) => 
        memory.content.toLowerCase().includes(concept.toLowerCase())
      );
      score += conceptMatches.length * 0.1;
      
      // 重要性加权
      score += (memory.importance || 5) / 10 * 0.2;
      
      return {
        ...memory,
        relevanceScore: Math.min(score, 1.0), // 限制在0-1之间
        matchDetails: {
          topicMatches,
          entityMatches,
          relationMatches,
          conceptMatches
        }
      };
    });
  }

  /**
   * 优化索引
   */
  private async optimizeIndexes(): Promise<void> {
    console.log('[Memory Index] 🔧 优化索引...');
    
    // 移除权重过低的索引条目
    this.optimizeIndex(this.topicIndex);
    this.optimizeIndex(this.entityIndex);
    this.optimizeIndex(this.relationIndex);
    this.optimizeIndex(this.conceptIndex);
    
    console.log('[Memory Index] ✅ 索引优化完成');
  }

  private optimizeIndex(index: Map<string, MemoryIndex>): void {
    const keysToDelete: string[] = [];
    
    index.forEach((value, key) => {
      if (value.memoryIds.length < this.indexConfig.minMemoryCount) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => index.delete(key));
  }

  /**
   * 辅助方法
   */
  private async getAllMemories(): Promise<any[]> {
    // 实现获取所有记忆的逻辑
    return await this.mysqlDB.getMemories('default_user', 10000);
  }

  private async getMemoriesByIds(userId: string, ids: number[]): Promise<any[]> {
    if (ids.length === 0) return [];
    
    const conn = await this.mysqlDB.getConnection();
    const userIdField = await this.mysqlDB.getUserIdFieldName();
    const placeholders = ids.map(() => '?').join(',');
    
    const [rows] = await conn.query(
      `SELECT * FROM memories WHERE ${userIdField} = ? AND id IN (${placeholders})`,
      [userId, ...ids]
    );
    
    return rows as any[];
  }

  private clearAllIndexes(): void {
    this.topicIndex.clear();
    this.entityIndex.clear();
    this.relationIndex.clear();
    this.conceptIndex.clear();
  }

  private async loadExistingIndexes(): Promise<void> {
    // TODO: 从数据库加载已保存的索引
    console.log('[Memory Index] 📥 加载现有索引...');
  }

  private async saveIndexesToDatabase(): Promise<void> {
    // TODO: 保存索引到数据库
    console.log('[Memory Index] 💾 保存索引到数据库...');
  }

  private async getLastIndexRebuildTime(): Promise<number> {
    // TODO: 从数据库获取上次重建时间
    return 0;
  }

  private async updateIndexRebuildTime(): Promise<void> {
    // TODO: 更新重建时间到数据库
  }

  /**
   * 获取索引统计信息
   */
  getIndexStats(): any {
    return {
      topicCount: this.topicIndex.size,
      entityCount: this.entityIndex.size,
      relationCount: this.relationIndex.size,
      conceptCount: this.conceptIndex.size,
      totalIndexSize: this.topicIndex.size + this.entityIndex.size + this.relationIndex.size + this.conceptIndex.size,
      lastUpdated: Date.now()
    };
  }
}

// 单例实例
let memoryIndexSystem: MemoryIndexSystem | null = null;

export function getMemoryIndexSystem(): MemoryIndexSystem {
  if (!memoryIndexSystem) {
    memoryIndexSystem = new MemoryIndexSystem();
  }
  return memoryIndexSystem;
} 