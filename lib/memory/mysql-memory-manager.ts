import mysql from 'mysql2/promise';
import { Memory, MemoryCategory } from '../../types/memory';
import { EmbeddingService } from './embedding-service';
import { ChineseNLPService } from './chinese-nlp-service';

export interface MemoryStats {
  total: number;
  categories: Array<{
    category: MemoryCategory;
    count: number;
  }>;
  vectorTotal: number;
  lastUpdated: Date;
}

export interface MySQLConfig {
  host: string;
  user: string;
  password: string;
  database: string;
  charset?: string;
  acquireTimeout?: number;
  timeout?: number;
  reconnect?: boolean;
}

export class MySQLMemoryManager {
  private pool: mysql.Pool;
  private embeddingService: EmbeddingService;
  private chineseNLP: ChineseNLPService;
  private initialized = false;

  constructor(config: MySQLConfig) {
    this.pool = mysql.createPool({
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database,
      charset: config.charset || 'utf8mb4',
      acquireTimeout: config.acquireTimeout || 60000,
      timeout: config.timeout || 60000,
      reconnect: config.reconnect || true,
      connectionLimit: 10,
      queueLimit: 0,
      multipleStatements: true
    } as any);

    this.embeddingService = new EmbeddingService();
    this.chineseNLP = new ChineseNLPService();
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // 测试连接
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      
      this.initialized = true;
      console.log('✅ MySQL记忆管理器初始化成功');
    } catch (error) {
      console.error('❌ MySQL记忆管理器初始化失败:', error);
      throw error;
    }
  }

  async saveMemory(memory: Omit<Memory, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    await this.init();
    
    const query = `
      INSERT INTO memories (
        user_id, content, category, tags, source, conversation_id, 
        importance, extracted_from
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const [result] = await this.pool.execute(query, [
      memory.userId,
      memory.content,
      memory.category,
      memory.tags || '',
      memory.source || '',
      memory.conversationId || null,
      memory.importance || 5,
      memory.extractedFrom || null
    ]);
    
    const memoryId = (result as any).insertId;
    
    // 保存向量数据
    try {
      const embedding = await this.embeddingService.generateEmbedding(memory.content);
      await this.saveVectorMemory(memoryId, memory.userId, memory.content, memory.category, embedding);
    } catch (error) {
      console.warn('向量保存失败，继续执行:', error);
    }
    
    return memoryId;
  }

  async saveVectorMemory(
    memoryId: number,
    userId: string,
    content: string,
    category: string,
    embedding: number[]
  ): Promise<void> {
    const connection = await this.pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // 插入向量记忆
      const [vectorResult] = await connection.execute(`
        INSERT INTO vector_memories (
          user_id, content, category, vector_dimensions
        ) VALUES (?, ?, ?, ?)
      `, [userId, content, category, embedding.length]);
      
      const vectorId = (vectorResult as any).insertId;
      
      // 插入向量数据
      const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      await connection.execute(`
        INSERT INTO memory_vectors (memory_id, vector_data, norm)
        VALUES (?, ?, ?)
      `, [vectorId, JSON.stringify(embedding), norm]);
      
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async searchMemories(
    userId: string,
    query: string,
    limit: number = 10,
    category?: string
  ): Promise<Memory[]> {
    await this.init();
    
    const keywords = await this.chineseNLP.extractKeywords(query);
    const searchTerms = keywords.map(keyword => `%${keyword}%`);
    
    let sql = `
      SELECT * FROM memories 
      WHERE user_id = ? 
      AND (content LIKE ? OR tags LIKE ?)
    `;
    
    const params: any[] = [userId, searchTerms[0] || `%${query}%`, searchTerms[0] || `%${query}%`];
    
    // 添加更多关键词搜索
    for (let i = 1; i < Math.min(searchTerms.length, 5); i++) {
      sql += ` OR content LIKE ? OR tags LIKE ?`;
      params.push(searchTerms[i], searchTerms[i]);
    }
    
    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }
    
    sql += ` ORDER BY importance DESC, created_at DESC LIMIT ?`;
    params.push(limit);
    
    const [rows] = await this.pool.execute(sql, params);
    return rows as Memory[];
  }

  async vectorSearch(
    userId: string,
    query: string,
    limit: number = 10,
    threshold: number = 0.3
  ): Promise<Array<Memory & { similarity: number }>> {
    await this.init();
    
    try {
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      
      // 获取所有向量记忆
      const [vectorRows] = await this.pool.execute(`
        SELECT vm.*, mv.vector_data, mv.norm
        FROM vector_memories vm
        JOIN memory_vectors mv ON vm.id = mv.memory_id
        WHERE vm.user_id = ?
      `, [userId]);
      
      const results: Array<Memory & { similarity: number }> = [];
      
      for (const row of vectorRows as any[]) {
        const embedding = JSON.parse(row.vector_data);
        const similarity = this.calculateCosineSimilarity(queryEmbedding, embedding);
        
        if (similarity >= threshold) {
          results.push({
            id: row.id,
            userId: row.user_id,
            content: row.content,
            category: row.category,
            tags: [],
            source: 'conversation',
            conversationId: undefined,
            importance: 5,
            createdAt: row.timestamp,
            updatedAt: row.timestamp,
            extractedFrom: undefined,
            similarity
          });
        }
      }
      
      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    } catch (error) {
      console.error('向量搜索失败:', error);
      return [];
    }
  }

  private calculateCosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    
    return dotProduct / (normA * normB);
  }

  async hybridSearch(
    userId: string,
    query: string,
    limit: number = 10
  ): Promise<Memory[]> {
    await this.init();
    
    // 并行执行关键词搜索和向量搜索
    const [keywordResults, vectorResults] = await Promise.all([
      this.searchMemories(userId, query, limit),
      this.vectorSearch(userId, query, limit)
    ]);
    
    // 合并结果并去重
    const combined = new Map<number, Memory>();
    
    // 添加关键词搜索结果
    keywordResults.forEach(memory => {
      combined.set(memory.id, memory);
    });
    
    // 添加向量搜索结果
    vectorResults.forEach(memory => {
      if (!combined.has(memory.id)) {
        combined.set(memory.id, memory);
      }
    });
    
    return Array.from(combined.values())
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }

  async getMemoryStats(userId: string): Promise<MemoryStats> {
    await this.init();
    
    const [countResult] = await this.pool.execute(`
      SELECT COUNT(*) as total FROM memories WHERE user_id = ?
    `, [userId]);
    
    const [categoryResult] = await this.pool.execute(`
      SELECT category, COUNT(*) as count 
      FROM memories 
      WHERE user_id = ? 
      GROUP BY category 
      ORDER BY count DESC
    `, [userId]);
    
    const [vectorCountResult] = await this.pool.execute(`
      SELECT COUNT(*) as total FROM vector_memories WHERE user_id = ?
    `, [userId]);
    
    const total = (countResult as any)[0].total;
    const vectorTotal = (vectorCountResult as any)[0].total;
    const categories = (categoryResult as any[]).map(row => ({
      category: row.category as MemoryCategory,
      count: row.count
    }));
    
    return {
      total,
      categories,
      vectorTotal,
      lastUpdated: new Date()
    };
  }

  async searchByCategory(
    userId: string,
    category: string,
    limit: number = 10
  ): Promise<Memory[]> {
    await this.init();
    
    const [rows] = await this.pool.execute(`
      SELECT * FROM memories 
      WHERE user_id = ? AND category = ?
      ORDER BY importance DESC, created_at DESC
      LIMIT ?
    `, [userId, category, limit]);
    
    return rows as Memory[];
  }

  async getMemoryById(id: number): Promise<Memory | null> {
    await this.init();
    
    const [rows] = await this.pool.execute(`
      SELECT * FROM memories WHERE id = ?
    `, [id]);
    
    const memories = rows as Memory[];
    return memories.length > 0 ? memories[0] : null;
  }

  async updateMemory(id: number, updates: Partial<Memory>): Promise<void> {
    await this.init();
    
    const fields = [];
    const values = [];
    
    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && key !== 'created_at' && value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    
    if (fields.length === 0) return;
    
    values.push(id);
    
    await this.pool.execute(`
      UPDATE memories 
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, values);
  }

  async deleteMemory(id: number): Promise<void> {
    await this.init();
    
    const connection = await this.pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // 删除向量数据
      await connection.execute(`
        DELETE mv FROM memory_vectors mv
        JOIN vector_memories vm ON mv.memory_id = vm.id
        WHERE vm.content = (SELECT content FROM memories WHERE id = ?)
      `, [id]);
      
      // 删除向量记忆
      await connection.execute(`
        DELETE FROM vector_memories 
        WHERE content = (SELECT content FROM memories WHERE id = ?)
      `, [id]);
      
      // 删除记忆
      await connection.execute(`
        DELETE FROM memories WHERE id = ?
      `, [id]);
      
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async intelligentSearch(
    userId: string,
    query: string,
    categories: string[] = [],
    limit: number = 50
  ): Promise<Memory[]> {
    await this.init();
    
    // 构建关键词搜索
    const keywords = await this.chineseNLP.extractKeywords(query);
    const searchTerms = keywords.slice(0, 10); // 限制关键词数量
    
    let sql = `
      SELECT *, 
             (CASE 
               WHEN content LIKE ? THEN importance * 2 
               ELSE importance 
             END) as weighted_importance
      FROM memories 
      WHERE user_id = ?
    `;
    
    const params: any[] = [`%${query}%`, userId];
    
    // 添加关键词搜索条件
    if (searchTerms.length > 0) {
      const keywordConditions = searchTerms.map(() => 
        '(content LIKE ? OR tags LIKE ?)'
      ).join(' OR ');
      
      sql += ` AND (${keywordConditions})`;
      
      for (const term of searchTerms) {
        params.push(`%${term}%`, `%${term}%`);
      }
    }
    
    // 添加分类过滤
    if (categories.length > 0) {
      sql += ` AND category IN (${categories.map(() => '?').join(', ')})`;
      params.push(...categories);
    }
    
    sql += ` ORDER BY weighted_importance DESC, created_at DESC LIMIT ?`;
    params.push(limit);
    
    const [rows] = await this.pool.execute(sql, params);
    return rows as Memory[];
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

export default MySQLMemoryManager; 