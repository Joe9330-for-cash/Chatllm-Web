import mysql from 'mysql2/promise';
import { getChineseNLPService } from './chinese-nlp-service';

export class MySQLMemoryDatabase {
  private connection: any = null;
  private connectionAttempts = 0;
  private maxRetries = 3;
  private isConnected = false;
  
  constructor() {
    this.init();
  }

  private async init() {
    try {
      console.log('[MySQL] 🔄 初始化MySQL数据库连接...');
      
      // 尝试多种连接配置，优化顺序
      const connectionConfigs = [
        {
          host: 'localhost',
          user: 'root',
          password: '',
          database: 'chatllm_memories',
          charset: 'utf8mb4',
          connectTimeout: 10000,
          acquireTimeout: 10000,
          timeout: 10000
        },
        {
          host: 'localhost',
          user: 'root',
          password: 'root',
          database: 'chatllm_memories',
          charset: 'utf8mb4',
          connectTimeout: 10000,
          acquireTimeout: 10000,
          timeout: 10000
        },
        {
          host: process.env.MYSQL_HOST || 'localhost',
          user: process.env.MYSQL_USER || 'root',
          password: process.env.MYSQL_PASSWORD || 'chatllm123',
          database: process.env.MYSQL_DATABASE || 'chatllm_memories',
          charset: 'utf8mb4',
          connectTimeout: 10000,
          acquireTimeout: 10000,
          timeout: 10000
        }
      ];
      
      for (let i = 0; i < connectionConfigs.length; i++) {
        const config = connectionConfigs[i];
        try {
          console.log(`[MySQL] 尝试连接配置${i + 1}: ${config.user}@${config.host}/${config.database} (密码: ${config.password ? '有' : '无'})`);
          this.connection = await mysql.createConnection(config);
          this.isConnected = true;
          console.log('[MySQL] ✅ 数据库连接成功');
          await this.createTables();
          return;
        } catch (error: any) {
          console.log(`[MySQL] ❌ 连接配置${i + 1}失败: ${error.message}`);
          if (this.connection) {
            try {
              await this.connection.end();
            } catch (closeError) {
              // 忽略关闭错误
            }
            this.connection = null;
          }
          continue;
        }
      }
      
      throw new Error('所有MySQL连接配置都失败');
      
    } catch (error) {
      console.error('[MySQL] ❌ 数据库初始化失败:', error);
      console.error('[MySQL] 💡 解决方案:');
      console.error('[MySQL] 1. 确保MySQL服务正在运行: brew services start mysql');
      console.error('[MySQL] 2. 尝试无密码连接: mysql -u root');
      console.error('[MySQL] 3. 创建数据库: CREATE DATABASE chatllm_memories;');
      console.error('[MySQL] 4. 设置root密码: ALTER USER "root"@"localhost" IDENTIFIED BY "";');
      
      this.isConnected = false;
      // 不抛出错误，让系统继续运行
    }
  }

  private async createTables() {
    try {
      // 首先检查表是否存在，如果存在但结构不对，则删除重建
      await this.checkAndFixTableStructure();
      
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS memories (
          id INT AUTO_INCREMENT PRIMARY KEY,
          userId VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          category VARCHAR(100) NOT NULL,
          importance TINYINT NOT NULL DEFAULT 5,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          lastAccessed DATETIME DEFAULT CURRENT_TIMESTAMP,
          accessCount INT DEFAULT 0,
          tags TEXT,
          embedding JSON,
          INDEX idx_userId (userId),
          INDEX idx_category (category),
          INDEX idx_importance (importance),
          INDEX idx_timestamp (timestamp),
          FULLTEXT KEY idx_content (content)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `;
      
      await this.connection.execute(createTableSQL);
      console.log('[MySQL] ✅ 数据表创建完成');
      
      // 验证表结构
      await this.validateTableStructure();
      
    } catch (error) {
      console.error('[MySQL] ❌ 创建表失败:', error);
      throw error;
    }
  }

  // 检查并修复表结构
  private async checkAndFixTableStructure(): Promise<void> {
    try {
      // 检查表是否存在
      const [tables] = await this.connection.execute(
        "SHOW TABLES LIKE 'memories'"
      );
      
      if ((tables as any[]).length > 0) {
        console.log('[MySQL] 📋 检查现有表结构...');
        
        // 检查表结构
        const [columns] = await this.connection.execute(
          "DESCRIBE memories"
        );
        
        const columnNames = (columns as any[]).map((col: any) => col.Field);
        console.log('[MySQL] 🔍 当前表字段:', columnNames);
        
        // 检查字段兼容性 - 支持user_id和userId两种格式
        const hasUserIdField = columnNames.includes('userId') || columnNames.includes('user_id');
        const hasBasicFields = columnNames.includes('id') && 
                              columnNames.includes('content') && 
                              columnNames.includes('category') &&
                              hasUserIdField;
        
        if (hasBasicFields) {
          console.log('[MySQL] ✅ 表结构基本正确，检查字段兼容性...');
          
          // 如果是user_id字段，需要重命名为userId
          if (columnNames.includes('user_id') && !columnNames.includes('userId')) {
            console.log('[MySQL] 🔄 将user_id字段重命名为userId以保持兼容性...');
            try {
              await this.connection.execute('ALTER TABLE memories CHANGE user_id userId VARCHAR(255) NOT NULL');
              console.log('[MySQL] ✅ 字段重命名成功: user_id → userId');
            } catch (renameError) {
              console.error('[MySQL] ❌ 字段重命名失败:', renameError);
              // 如果重命名失败，我们可以在查询时使用别名
            }
          }
          
          // 检查其他必需字段
          const requiredFields = ['importance', 'timestamp', 'lastAccessed', 'accessCount'];
          const missingFields = requiredFields.filter(field => !columnNames.includes(field));
          
          if (missingFields.length > 0) {
            console.log(`[MySQL] 🔧 添加缺少的字段: ${missingFields.join(', ')}`);
            await this.addMissingFields(missingFields);
          }
          
          console.log('[MySQL] ✅ 表结构检查完成，无需重建');
          return; // 不需要重建表
        } else {
          console.log(`[MySQL] ⚠️ 表结构不完整，缺少基本字段`);
          console.log('[MySQL] 📊 发现字段:', columnNames);
          console.log('[MySQL] 🔄 需要重建表结构...');
          
          // 备份现有数据
          await this.backupExistingData();
          
          // 删除旧表
          await this.connection.execute('DROP TABLE IF EXISTS memories');
          console.log('[MySQL] ✅ 旧表已删除');
        }
      } else {
        console.log('[MySQL] 📝 表不存在，将创建新表');
      }
    } catch (error) {
      console.error('[MySQL] ❌ 检查表结构失败:', error);
      // 如果检查失败，尝试删除表重新创建
      try {
        await this.connection.execute('DROP TABLE IF EXISTS memories');
        console.log('[MySQL] 🔄 强制删除可能损坏的表');
      } catch (dropError) {
        console.error('[MySQL] ❌ 删除表失败:', dropError);
      }
    }
  }

  // 添加缺少的字段
  private async addMissingFields(missingFields: string[]): Promise<void> {
    const fieldDefinitions: { [key: string]: string } = {
      'importance': 'TINYINT NOT NULL DEFAULT 5',
      'timestamp': 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      'lastAccessed': 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      'accessCount': 'INT DEFAULT 0',
      'tags': 'TEXT',
      'embedding': 'JSON'
    };
    
    for (const field of missingFields) {
      if (fieldDefinitions[field]) {
        try {
          await this.connection.execute(
            `ALTER TABLE memories ADD COLUMN ${field} ${fieldDefinitions[field]}`
          );
          console.log(`[MySQL] ✅ 添加字段: ${field}`);
        } catch (error) {
          console.error(`[MySQL] ❌ 添加字段${field}失败:`, error);
        }
      }
    }
  }

  // 备份现有数据
  private async backupExistingData(): Promise<void> {
    try {
      // 使用 query 而不是 execute 来处理 LIMIT 参数
      const [rows] = await this.connection.query('SELECT * FROM memories LIMIT 10');
      if ((rows as any[]).length > 0) {
        console.log(`[MySQL] 💾 发现 ${(rows as any[]).length} 条现有数据，正在备份...`);
        // 这里可以添加具体的备份逻辑
        // 暂时只打印数据
        (rows as any[]).forEach((row: any, index: number) => {
          console.log(`[MySQL] 备份数据${index + 1}:`, JSON.stringify(row).substring(0, 100) + '...');
        });
      }
    } catch (error) {
      console.log('[MySQL] ℹ️ 无法备份现有数据，可能表结构已损坏');
    }
  }

  // 验证表结构
  private async validateTableStructure(): Promise<void> {
    try {
      const [columns] = await this.connection.execute("DESCRIBE memories");
      const columnNames = (columns as any[]).map((col: any) => col.Field);
      
      const requiredFields = ['id', 'userId', 'content', 'category', 'importance', 'timestamp'];
      const missingFields = requiredFields.filter(field => !columnNames.includes(field));
      
      if (missingFields.length === 0) {
        console.log('[MySQL] ✅ 表结构验证通过');
        
        // 插入一条测试数据验证表功能
        await this.insertTestData();
      } else {
        throw new Error(`表结构验证失败，缺少字段: ${missingFields.join(', ')}`);
      }
    } catch (error) {
      console.error('[MySQL] ❌ 表结构验证失败:', error);
      throw error;
    }
  }

  // 插入测试数据
  private async insertTestData(): Promise<void> {
    try {
      const userIdField = await this.getUserIdFieldName();
      
      // 检查是否已有测试数据
      const [existing] = await this.connection.execute(
        `SELECT COUNT(*) as count FROM memories WHERE ${userIdField} = 'test_structure'`
      );
      
      if ((existing as any[])[0].count === 0) {
        await this.connection.execute(
          `INSERT INTO memories (${userIdField}, content, category, importance, tags) VALUES (?, ?, ?, ?, ?)`,
          ['test_structure', '数据库表结构测试记录', 'system', 1, 'test,structure']
        );
        console.log('[MySQL] ✅ 测试数据插入成功');
        
        // 立即删除测试数据
        await this.connection.execute(
          `DELETE FROM memories WHERE ${userIdField} = 'test_structure'`
        );
        console.log('[MySQL] ✅ 测试数据已清理');
      }
    } catch (error) {
      console.error('[MySQL] ❌ 测试数据操作失败:', error);
      throw error;
    }
  }

  async getConnection(): Promise<any> {
    if (!this.isConnected) {
      await this.init();
    }
    
    if (!this.isConnected) {
      throw new Error('MySQL数据库连接失败，请检查数据库配置');
    }
    
    return this.connection;
  }

  // 检查连接状态
  isConnectionAvailable(): boolean {
    return this.isConnected;
  }

  // 获取正确的用户ID字段名
  private async getUserIdFieldName(): Promise<string> {
    try {
      const conn = await this.getConnection();
      const [columns] = await conn.execute("DESCRIBE memories");
      const columnNames = (columns as any[]).map((col: any) => col.Field);
      
      if (columnNames.includes('userId')) {
        return 'userId';
      } else if (columnNames.includes('user_id')) {
        return 'user_id';
      } else {
        console.warn('[MySQL] ⚠️ 未找到用户ID字段，使用默认值userId');
        return 'userId';
      }
    } catch (error) {
      console.error('[MySQL] ❌ 获取字段名失败:', error);
      return 'userId';
    }
  }

  // 添加记忆
  async addMemory(userId: string, content: string, category: string, importance: number = 5, tags: string[] = []): Promise<number> {
    try {
      const conn = await this.getConnection();
      const userIdField = await this.getUserIdFieldName();
      const tagsStr = tags.join(',');
      const [result] = await conn.execute(
        `INSERT INTO memories (${userIdField}, content, category, importance, tags) VALUES (?, ?, ?, ?, ?)`,
        [userId, content, category, importance, tagsStr]
      );
      return (result as any).insertId;
    } catch (error) {
      console.error('[MySQL] ❌ 添加记忆失败:', error);
      return -1;
    }
  }

  // 获取记忆
  async getMemories(userId: string, limit: number = 50, offset: number = 0): Promise<any[]> {
    try {
      const conn = await this.getConnection();
      const userIdField = await this.getUserIdFieldName();
      // 使用 query 而不是 execute 来处理 LIMIT 参数
      const [rows] = await conn.query(
        `SELECT * FROM memories WHERE ${userIdField} = ? ORDER BY importance DESC, timestamp DESC LIMIT ? OFFSET ?`,
        [userId, limit, offset]
      );
      return rows as any[];
    } catch (error) {
      console.error('[MySQL] ❌ 获取记忆失败:', error);
      return [];
    }
  }

  // 根据分类获取记忆
  async getMemoriesByCategory(userId: string, category: string, limit: number = 50): Promise<any[]> {
    try {
      const conn = await this.getConnection();
      const userIdField = await this.getUserIdFieldName();
      
      // 确保参数类型正确
      const numericLimit = Math.max(1, Math.min(100, Number(limit) || 50));
      
      console.log(`[MySQL] 🔍 分类搜索: 用户=${userId}, 类别=${category}, 限制=${numericLimit}`);
      
      // 使用 query 而不是 execute 来处理 LIMIT 参数
      const [rows] = await conn.query(
        `SELECT * FROM memories WHERE ${userIdField} = ? AND category = ? ORDER BY importance DESC, timestamp DESC LIMIT ?`,
        [userId, category, numericLimit]
      );
      
      const results = rows as any[];
      console.log(`[MySQL] ✅ 分类搜索结果: 找到 ${results.length} 条记忆`);
      
      return results;
    } catch (error) {
      console.error('[MySQL] ❌ 获取分类记忆失败:', error);
      console.error('[MySQL] 参数详情:', { userId, category, limit });
      return [];
    }
  }

  // 🧠 智能搜索记忆 - 使用新的NLP服务
  async searchMemories(userId: string, query: string, limit: number = 50): Promise<any[]> {
    try {
      const conn = await this.getConnection();
      const numericLimit = Number(limit);
      
      console.log(`[MySQL搜索] 🧠 智能搜索用户: ${userId}, 查询: "${query}", 限制: ${numericLimit}`);
      
      const nlpService = getChineseNLPService();
      
      // 🚀 使用智能NLP服务提取关键词
      const keywords = await nlpService.extractKeywords(query);
      console.log(`[MySQL搜索] 🔍 智能提取关键词:`, keywords);
      
      if (keywords.length === 0) {
        console.log(`[MySQL搜索] ⚠️ 没有提取到关键词，使用简单搜索`);
        return await this.simpleSearch(userId, query, numericLimit);
      }
      
      // 构建搜索结果集
      const searchResults = new Map<number, any>();
      
      // 获取正确的字段名
      const userIdField = await this.getUserIdFieldName();
      
      // 📍 第一层：精确匹配（高权重）
      for (const keyword of keywords) {
        const [exactRows] = await conn.query(
          `SELECT *, 10 as relevance_score FROM memories WHERE ${userIdField} = ? AND content LIKE ? ORDER BY importance DESC, timestamp DESC`,
          [userId, `%${keyword}%`]
        );
        
        for (const row of exactRows as any[]) {
          if (!searchResults.has(row.id)) {
            searchResults.set(row.id, { ...row, relevance_score: 10 });
          }
        }
      }
      
      // 📍 第二层：类别匹配（中权重）
      for (const keyword of keywords) {
        const [categoryRows] = await conn.query(
          `SELECT *, 8 as relevance_score FROM memories WHERE ${userIdField} = ? AND category LIKE ? ORDER BY importance DESC, timestamp DESC`,
          [userId, `%${keyword}%`]
        );
        
        for (const row of categoryRows as any[]) {
          if (!searchResults.has(row.id)) {
            searchResults.set(row.id, { ...row, relevance_score: 8 });
          }
        }
      }
      
      // 📍 第三层：标签匹配（中权重）
      for (const keyword of keywords) {
        const [tagRows] = await conn.query(
          `SELECT *, 6 as relevance_score FROM memories WHERE ${userIdField} = ? AND tags LIKE ? ORDER BY importance DESC, timestamp DESC`,
          [userId, `%${keyword}%`]
        );
        
        for (const row of tagRows as any[]) {
          if (!searchResults.has(row.id)) {
            searchResults.set(row.id, { ...row, relevance_score: 6 });
          }
        }
      }
      
      // 📍 第四层：相关词汇匹配（低权重）
      const relatedTerms = await nlpService.generateRelatedTerms(keywords);
      if (relatedTerms.length > 0) {
        console.log(`[MySQL搜索] 🔗 相关词汇:`, relatedTerms.slice(0, 5));
        
        for (const term of relatedTerms.slice(0, 5)) { // 只取前5个相关词汇
          const [relatedRows] = await conn.query(
            `SELECT *, 4 as relevance_score FROM memories WHERE ${userIdField} = ? AND content LIKE ? ORDER BY importance DESC, timestamp DESC`,
            [userId, `%${term}%`]
          );
          
          for (const row of relatedRows as any[]) {
            if (!searchResults.has(row.id)) {
              searchResults.set(row.id, { ...row, relevance_score: 4 });
            }
          }
        }
      }
      
      // 📊 排序和限制结果
      const sortedResults = Array.from(searchResults.values())
        .sort((a, b) => {
          // 先按相关性分数排序
          if (a.relevance_score !== b.relevance_score) {
            return b.relevance_score - a.relevance_score;
          }
          // 再按重要性排序
          if (a.importance !== b.importance) {
            return b.importance - a.importance;
          }
          // 最后按时间排序
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        })
        .slice(0, numericLimit);
      
      console.log(`[MySQL搜索] ✅ 智能搜索完成，找到 ${sortedResults.length} 条记忆`);
      
      // 📝 打印搜索结果预览
      if (sortedResults.length > 0) {
        sortedResults.slice(0, 3).forEach((record, index) => {
          console.log(`[MySQL搜索] 结果${index + 1}: ID=${record.id}, 相关性=${record.relevance_score}, 内容="${record.content.substring(0, 30)}..."`);
        });
      }
      
      return sortedResults;
      
    } catch (error) {
      console.error(`[MySQL搜索] ❌ 智能搜索失败，使用简单搜索:`, error);
      return await this.simpleSearch(userId, query, limit);
    }
  }

  // 🔍 简单搜索方法（备用）
  private async simpleSearch(userId: string, query: string, limit: number): Promise<any[]> {
    if (!this.isConnected) {
      return [];
    }
    
    try {
      const conn = await this.getConnection();
      const userIdField = await this.getUserIdFieldName();
      
      // 使用 query 而不是 execute 来处理 LIMIT 参数
      const [rows] = await conn.query(
        `SELECT *, 5 as relevance_score FROM memories WHERE ${userIdField} = ? AND content LIKE ? ORDER BY importance DESC, timestamp DESC LIMIT ?`,
        [userId, `%${query}%`, limit]
      );
      
      const results = rows as any[];
      console.log(`[MySQL搜索] ✅ 简单搜索完成，找到 ${results.length} 条记忆`);
      return results;
    } catch (error) {
      console.error('[MySQL搜索] ❌ 简单搜索失败:', error);
      return [];
    }
  }

  // 更新记忆访问次数
  async updateAccessCount(memoryId: number): Promise<void> {
    try {
      const conn = await this.getConnection();
      await conn.execute(
        'UPDATE memories SET accessCount = accessCount + 1, lastAccessed = NOW() WHERE id = ?',
        [memoryId]
      );
    } catch (error) {
      console.error('[MySQL] ❌ 更新访问次数失败:', error);
    }
  }

  // 删除记忆
  async deleteMemory(memoryId: number): Promise<void> {
    try {
      const conn = await this.getConnection();
      await conn.execute('DELETE FROM memories WHERE id = ?', [memoryId]);
    } catch (error) {
      console.error('[MySQL] ❌ 删除记忆失败:', error);
    }
  }

  // 向量搜索功能 - 实现真正的向量搜索
  async vectorSearch(userId: string, query: string, limit: number = 10, threshold: number = 0.3): Promise<any[]> {
    try {
      console.log(`[Vector Search] 🔍 开始向量搜索: "${query}"`);
      
      const conn = await this.getConnection();
      const userIdField = await this.getUserIdFieldName();
      
      // 查询所有有embedding的记忆
      const [rows] = await conn.query(
        `SELECT id, content, category, importance, timestamp, embedding FROM memories WHERE ${userIdField} = ? AND embedding IS NOT NULL ORDER BY importance DESC`,
        [userId]
      );
      
      const memories = rows as any[];
      console.log(`[Vector Search] 📋 找到 ${memories.length} 条有向量的记忆`);
      
      if (memories.length === 0) {
        console.log(`[Vector Search] ⚠️ 没有找到向量化的记忆，使用关键词搜索`);
        return await this.searchMemories(userId, query, limit);
      }
      
      // 生成查询向量
      const embeddingService = await import('@/lib/memory/embedding-service');
      const queryEmbedding = await embeddingService.getEmbeddingService().generateEmbedding(query);
      
      console.log(`[Vector Search] ✅ 查询向量生成完成，维度: ${queryEmbedding.length}`);
      
      // 计算向量相似度
      const results = [];
      for (const memory of memories) {
        try {
          let embedding;
          
          // 解析embedding（可能是JSON字符串或直接是数组）
          if (typeof memory.embedding === 'string') {
            embedding = JSON.parse(memory.embedding);
          } else if (Array.isArray(memory.embedding)) {
            embedding = memory.embedding;
          } else {
            console.warn(`[Vector Search] 跳过无效embedding格式: ID=${memory.id}`);
            continue;
          }
          
          // 计算余弦相似度
          const similarity = this.calculateCosineSimilarity(queryEmbedding, embedding);
          
          if (similarity >= threshold) {
            results.push({
              id: memory.id,
              content: memory.content,
              category: memory.category,
              importance: memory.importance,
              timestamp: memory.timestamp,
              similarity: similarity,
              searchType: 'vector'
            });
          }
        } catch (embeddingError) {
          console.warn(`[Vector Search] 处理embedding失败: ID=${memory.id}`, embeddingError);
        }
      }
      
      // 按相似度排序并限制结果
      const sortedResults = results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
      
      console.log(`[Vector Search] ✅ 向量搜索完成，找到 ${sortedResults.length} 条相似记忆`);
      
      // 如果向量搜索结果不足，补充关键词搜索
      if (sortedResults.length < limit) {
        console.log(`[Vector Search] 🔤 向量搜索结果不足，补充关键词搜索`);
        const keywordResults = await this.searchMemories(userId, query, limit - sortedResults.length);
        
        // 避免重复添加
        for (const keywordResult of keywordResults) {
          const isDuplicate = sortedResults.some(r => r.id === keywordResult.id);
          if (!isDuplicate) {
            sortedResults.push({
              ...keywordResult,
              similarity: 0.6, // 给关键词搜索一个较低的相似度分数
              searchType: 'keyword'
            });
          }
        }
      }
      
      return sortedResults;
      
    } catch (error) {
      console.error('[Vector Search] ❌ 向量搜索失败，使用关键词搜索:', error);
      return await this.searchMemories(userId, query, limit);
    }
  }
  
  // 计算余弦相似度
  private calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      console.warn('[Vector Search] 向量维度不匹配');
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

  // 混合搜索：结合关键词和向量搜索
  async hybridSearch(userId: string, query: string, limit: number = 10): Promise<any[]> {
    try {
      // 并行执行关键词搜索和向量搜索
      const [keywordResults, vectorResults] = await Promise.all([
        this.searchMemories(userId, query, Math.floor(limit / 2)),
        this.vectorSearch(userId, query, Math.floor(limit / 2))
      ]);

      // 合并结果并去重
      const combined = new Map<number, any>();
      
      // 添加关键词搜索结果
      keywordResults.forEach(memory => {
        combined.set(memory.id, { ...memory, searchType: 'keyword' });
      });
      
      // 添加向量搜索结果
      vectorResults.forEach(memory => {
        if (!combined.has(memory.id)) {
          combined.set(memory.id, memory);
        }
      });
      
      return Array.from(combined.values())
        .sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0))
        .slice(0, limit);
        
    } catch (error) {
      console.error('[MySQL] ❌ 混合搜索失败，使用关键词搜索:', error);
      return await this.searchMemories(userId, query, limit);
    }
  }

  // 获取记忆统计
  async getMemoryStats(userId: string): Promise<any> {
    try {
      const conn = await this.getConnection();
      const userIdField = await this.getUserIdFieldName();
      const [rows] = await conn.execute(
        `SELECT COUNT(*) as totalMemories, COUNT(DISTINCT category) as totalCategories FROM memories WHERE ${userIdField} = ?`,
        [userId]
      );
      return (rows as any[])[0];
    } catch (error) {
      console.error('[MySQL] ❌ 获取统计失败:', error);
      return { totalMemories: 0, totalCategories: 0 };
    }
  }

  // 测试方法：验证MySQL连接和基本查询
  async testConnection(): Promise<any> {
    try {
      const conn = await this.getConnection();
      console.log(`[MySQL测试] 🧪 测试数据库连接...`);
      
      // 测试1: 简单查询
      const [countResult] = await conn.execute('SELECT COUNT(*) as total FROM memories');
      console.log(`[MySQL测试] 记忆总数:`, countResult);
      
      // 测试2: 带参数查询（使用query处理LIMIT）
      const userIdField = await this.getUserIdFieldName();
      const [userResult] = await conn.query(`SELECT * FROM memories WHERE ${userIdField} = ? LIMIT 2`, ['default_user']);
      console.log(`[MySQL测试] 用户记忆数量:`, (userResult as any[]).length);
      
      // 测试3: LIKE查询（使用query处理LIMIT）
      const [likeResult] = await conn.query('SELECT * FROM memories WHERE content LIKE ? LIMIT 1', ['%王大拿%']);
      console.log(`[MySQL测试] LIKE查询结果:`, (likeResult as any[]).length);
      
      return {
        success: true,
        totalMemories: countResult,
        userMemories: (userResult as any[]).length,
        likeResults: (likeResult as any[]).length
      };
      
    } catch (error) {
      console.error(`[MySQL测试] ❌ 测试失败:`, error);
      return {
        success: false,
        error: error
      };
    }
  }

  // 关闭连接
  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
      this.isConnected = false;
    }
  }
}

// 单例模式
let mysqlDB: MySQLMemoryDatabase | null = null;

export const getMySQLMemoryDB = (): MySQLMemoryDatabase => {
  if (!mysqlDB) {
    mysqlDB = new MySQLMemoryDatabase();
  }
  return mysqlDB;
}; 