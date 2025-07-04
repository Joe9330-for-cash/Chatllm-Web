import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export interface VectorMemory {
  id: number;
  content: string;
  vector: number[];
  userId: string;
  category?: string;
  timestamp: string;
  metadata?: any;
}

export interface VectorSearchResult {
  memory: VectorMemory;
  similarity: number;
  distance: number;
}

export class VectorMemoryDatabase {
  private db: Database.Database;
  private isInitialized = false;

  constructor() {
    // 确保数据目录存在
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'vector-memories.db');
    this.db = new Database(dbPath);
    
    // 启用WAL模式以提高并发性能
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 1000000');
    this.db.pragma('temp_store = memory');
    
    console.log(`[VectorDB] 数据库已连接: ${dbPath}`);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // 加载VSS扩展
      console.log('[VectorDB] 正在加载VSS扩展...');
      
      // 创建向量记忆表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS vector_memories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          content TEXT NOT NULL,
          category TEXT,
          metadata TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          vector_dimensions INTEGER DEFAULT 1536,
          
          UNIQUE(user_id, content)
        );
      `);

      // 创建向量存储表（使用JSON存储向量，后续可优化）
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS memory_vectors (
          memory_id INTEGER PRIMARY KEY,
          vector_data TEXT NOT NULL,
          norm REAL,
          
          FOREIGN KEY (memory_id) REFERENCES vector_memories(id) ON DELETE CASCADE
        );
      `);

      // 创建索引
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_vector_memories_user ON vector_memories(user_id);
        CREATE INDEX IF NOT EXISTS idx_vector_memories_category ON vector_memories(category);
        CREATE INDEX IF NOT EXISTS idx_vector_memories_timestamp ON vector_memories(timestamp);
      `);

      console.log('[VectorDB] ✅ 向量数据库初始化完成');
      this.isInitialized = true;

    } catch (error) {
      console.error('[VectorDB] ❌ 初始化失败:', error);
      throw error;
    }
  }

  async storeMemoryVector(
    userId: string,
    content: string,
    vector: number[],
    category?: string,
    metadata?: any
  ): Promise<number> {
    await this.initialize();

    try {
      // 计算向量的L2范数
      const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
      
      // 存储记忆
      const insertMemory = this.db.prepare(`
        INSERT OR REPLACE INTO vector_memories 
        (user_id, content, category, metadata, vector_dimensions)
        VALUES (?, ?, ?, ?, ?)
      `);

      const memoryResult = insertMemory.run(
        userId,
        content,
        category || 'general',
        metadata ? JSON.stringify(metadata) : null,
        vector.length
      );

      const memoryId = memoryResult.lastInsertRowid as number;

      // 存储向量数据
      const insertVector = this.db.prepare(`
        INSERT OR REPLACE INTO memory_vectors 
        (memory_id, vector_data, norm)
        VALUES (?, ?, ?)
      `);

      insertVector.run(
        memoryId,
        JSON.stringify(vector),
        norm
      );

      console.log(`[VectorDB] ✅ 存储向量记忆 ID: ${memoryId}, 维度: ${vector.length}`);
      return memoryId;

    } catch (error) {
      console.error('[VectorDB] ❌ 存储向量失败:', error);
      throw error;
    }
  }

  async searchSimilarMemories(
    userId: string,
    queryVector: number[],
    limit: number = 5,
    threshold: number = 0.7
  ): Promise<VectorSearchResult[]> {
    await this.initialize();

    try {
      // 计算查询向量的范数
      const queryNorm = Math.sqrt(queryVector.reduce((sum, val) => sum + val * val, 0));

      // 获取用户的所有向量记忆
      const stmt = this.db.prepare(`
        SELECT 
          vm.id,
          vm.user_id,
          vm.content,
          vm.category,
          vm.metadata,
          vm.timestamp,
          mv.vector_data,
          mv.norm
        FROM vector_memories vm
        JOIN memory_vectors mv ON vm.id = mv.memory_id
        WHERE vm.user_id = ?
        ORDER BY vm.timestamp DESC
      `);

      interface MemoryRow {
        id: number;
        user_id: string;
        content: string;
        category: string;
        metadata: string | null;
        timestamp: string;
        vector_data: string;
        norm: number;
      }

      const memories = stmt.all(userId) as MemoryRow[];
      const results: VectorSearchResult[] = [];

      // 计算余弦相似度
      for (const memory of memories) {
        try {
          const storedVector: number[] = JSON.parse(memory.vector_data);
          
          // 计算点积
          let dotProduct = 0;
          for (let i = 0; i < Math.min(queryVector.length, storedVector.length); i++) {
            dotProduct += queryVector[i] * storedVector[i];
          }

          // 余弦相似度 = 点积 / (||a|| * ||b||)
          const similarity = dotProduct / (queryNorm * memory.norm);
          
          if (similarity >= threshold) {
            results.push({
              memory: {
                id: memory.id,
                content: memory.content,
                vector: storedVector,
                userId: memory.user_id,
                category: memory.category,
                timestamp: memory.timestamp,
                metadata: memory.metadata ? JSON.parse(memory.metadata) : null
              },
              similarity,
              distance: 1 - similarity
            });
          }
        } catch (vectorError) {
          console.warn(`[VectorDB] 跳过损坏的向量数据 ID: ${memory.id}`);
        }
      }

      // 按相似度排序并限制结果数量
      results.sort((a, b) => b.similarity - a.similarity);
      const limitedResults = results.slice(0, limit);

      console.log(`[VectorDB] ✅ 向量搜索完成，找到 ${limitedResults.length} 条相似记忆`);
      return limitedResults;

    } catch (error) {
      console.error('[VectorDB] ❌ 向量搜索失败:', error);
      throw error;
    }
  }

  async getUserMemoryStats(userId: string): Promise<{
    totalMemories: number;
    vectorizedMemories: number;
    avgVectorDimensions: number;
    categories: { [key: string]: number };
  }> {
    await this.initialize();

    try {
      const totalStmt = this.db.prepare(`
        SELECT COUNT(*) as count FROM vector_memories WHERE user_id = ?
      `);
      const totalResult = totalStmt.get(userId) as { count: number };

      const vectorizedStmt = this.db.prepare(`
        SELECT COUNT(*) as count 
        FROM vector_memories vm
        JOIN memory_vectors mv ON vm.id = mv.memory_id
        WHERE vm.user_id = ?
      `);
      const vectorizedResult = vectorizedStmt.get(userId) as { count: number };

      const avgDimStmt = this.db.prepare(`
        SELECT AVG(vector_dimensions) as avg_dim 
        FROM vector_memories 
        WHERE user_id = ?
      `);
      const avgDimResult = avgDimStmt.get(userId) as { avg_dim: number };

      const categoriesStmt = this.db.prepare(`
        SELECT category, COUNT(*) as count 
        FROM vector_memories 
        WHERE user_id = ? 
        GROUP BY category
      `);
      const categoriesResult = categoriesStmt.all(userId) as { category: string; count: number }[];

      const categories: { [key: string]: number } = {};
      categoriesResult.forEach(row => {
        categories[row.category] = row.count;
      });

      return {
        totalMemories: totalResult.count,
        vectorizedMemories: vectorizedResult.count,
        avgVectorDimensions: Math.round(avgDimResult.avg_dim || 1536),
        categories
      };

    } catch (error) {
      console.error('[VectorDB] ❌ 获取统计信息失败:', error);
      throw error;
    }
  }

  async deleteMemory(memoryId: number): Promise<boolean> {
    await this.initialize();

    try {
      const stmt = this.db.prepare(`DELETE FROM vector_memories WHERE id = ?`);
      const result = stmt.run(memoryId);
      
      console.log(`[VectorDB] ✅ 删除记忆 ID: ${memoryId}`);
      return result.changes > 0;

    } catch (error) {
      console.error('[VectorDB] ❌ 删除记忆失败:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      console.log('[VectorDB] 数据库连接已关闭');
    }
  }

  // 获取数据库实例（用于高级操作）
  getDatabase(): Database.Database {
    return this.db;
  }
}

// 单例实例
let vectorDatabaseInstance: VectorMemoryDatabase | null = null;

export function getVectorDatabase(): VectorMemoryDatabase {
  if (!vectorDatabaseInstance) {
    vectorDatabaseInstance = new VectorMemoryDatabase();
  }
  return vectorDatabaseInstance;
} 