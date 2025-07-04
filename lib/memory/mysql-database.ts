const mysql = require('mysql2/promise');

export class MySQLMemoryDatabase {
  private connection: any = null;

  constructor() {
    this.init();
  }

  private async init() {
    try {
      this.connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '', // 目前无密码
        database: 'chatllm_memories',
        charset: 'utf8mb4',
        collation: 'utf8mb4_unicode_ci'
      });

      console.log('✅ MySQL连接成功');
      
      // 创建记忆表
      await this.createTables();
    } catch (error) {
      console.error('❌ MySQL连接失败:', error);
      throw error;
    }
  }

  private async createTables() {
    try {
      // 创建记忆表
      await this.connection!.execute(`
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
          INDEX idx_timestamp (timestamp)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 创建向量表（用于相似性搜索）
      await this.connection!.execute(`
        CREATE TABLE IF NOT EXISTS memory_vectors (
          id INT AUTO_INCREMENT PRIMARY KEY,
          memory_id INT NOT NULL,
          vector JSON NOT NULL,
          FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      console.log('✅ MySQL数据表创建完成');
    } catch (error) {
      console.error('❌ MySQL表创建失败:', error);
      throw error;
    }
  }

  async getConnection(): Promise<any> {
    if (!this.connection) {
      await this.init();
    }
    return this.connection!;
  }

  // 添加记忆
  async addMemory(userId: string, content: string, category: string, importance: number = 5, tags: string[] = []): Promise<number> {
    const conn = await this.getConnection();
    const [result] = await conn.execute(
      'INSERT INTO memories (userId, content, category, importance, tags) VALUES (?, ?, ?, ?, ?)',
      [userId, content, category, importance, JSON.stringify(tags)]
    );
    return (result as any).insertId;
  }

  // 获取记忆
  async getMemories(userId: string, limit: number = 50, offset: number = 0): Promise<any[]> {
    const conn = await this.getConnection();
    const [rows] = await conn.execute(
      'SELECT * FROM memories WHERE userId = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?',
      [userId, limit, offset]
    );
    return rows as any[];
  }

  // 根据分类获取记忆
  async getMemoriesByCategory(userId: string, category: string, limit: number = 50): Promise<any[]> {
    const conn = await this.getConnection();
    const [rows] = await conn.execute(
      'SELECT * FROM memories WHERE userId = ? AND category = ? ORDER BY importance DESC, timestamp DESC LIMIT ?',
      [userId, category, limit]
    );
    return rows as any[];
  }

  // 搜索记忆 - 智能搜索（移植自SQLite版本）
  async searchMemories(userId: string, query: string, limit: number = 10): Promise<any[]> {
    const conn = await this.getConnection();
    
    // 确保limit是数字类型
    const numericLimit = Number(limit);
    console.log(`[MySQL搜索] 🧠 智能搜索用户: ${userId}, 查询: "${query}", 限制: ${numericLimit}`);
    
    try {
      // 🚀 智能关键词提取
      const keywords = this.extractKeywords(query);
      console.log(`[MySQL搜索] 🔍 提取关键词:`, keywords);
      
      // 构建多层级搜索策略
      const searchResults = new Map<number, any>();
      
      // 第一层：精确匹配
      for (const keyword of keywords) {
        const [exactRows] = await conn.query(
          'SELECT *, 10 as relevance_score FROM memories WHERE userId = ? AND content LIKE ? ORDER BY importance DESC, timestamp DESC',
          [userId, `%${keyword}%`]
        );
        
        for (const row of exactRows as any[]) {
          if (!searchResults.has(row.id)) {
            searchResults.set(row.id, { ...row, relevance_score: 10 });
          }
        }
      }
      
      // 第二层：模糊匹配（分词）
      const fuzzyKeywords = this.generateFuzzyKeywords(query);
      console.log(`[MySQL搜索] 🔍 模糊关键词:`, fuzzyKeywords);
      
      for (const keyword of fuzzyKeywords) {
        const [fuzzyRows] = await conn.query(
          'SELECT *, 5 as relevance_score FROM memories WHERE userId = ? AND content LIKE ? ORDER BY importance DESC, timestamp DESC',
          [userId, `%${keyword}%`]
        );
        
        for (const row of fuzzyRows as any[]) {
          if (!searchResults.has(row.id)) {
            searchResults.set(row.id, { ...row, relevance_score: 5 });
          }
        }
      }
      
      // 第三层：标签匹配
      for (const keyword of keywords) {
        const [tagRows] = await conn.query(
          'SELECT *, 3 as relevance_score FROM memories WHERE userId = ? AND tags LIKE ? ORDER BY importance DESC, timestamp DESC',
          [userId, `%${keyword}%`]
        );
        
        for (const row of tagRows as any[]) {
          if (!searchResults.has(row.id)) {
            searchResults.set(row.id, { ...row, relevance_score: 3 });
          }
        }
      }
      
      // 按相关性排序并限制结果
      const sortedResults = Array.from(searchResults.values())
        .sort((a, b) => {
          // 先按相关性分数排序，再按重要性和时间排序
          if (a.relevance_score !== b.relevance_score) {
            return b.relevance_score - a.relevance_score;
          }
          if (a.importance !== b.importance) {
            return b.importance - a.importance;
          }
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        })
        .slice(0, numericLimit);
      
      console.log(`[MySQL搜索] ✅ 智能搜索完成，找到 ${sortedResults.length} 条记忆`);
      
      // 打印前几条结果的预览
      if (sortedResults.length > 0) {
        sortedResults.slice(0, 2).forEach((record, index) => {
          console.log(`[MySQL搜索] 结果${index + 1}: ID=${record.id}, 相关性=${record.relevance_score}, 内容="${record.content.substring(0, 30)}..."`);
        });
      }
      
      return sortedResults;
      
    } catch (error) {
      console.error(`[MySQL搜索] ❌ 智能搜索失败，使用简单搜索:`, error);
      
      // 回退到简单搜索
      const [rows] = await conn.query(
        'SELECT * FROM memories WHERE userId = ? AND content LIKE ? ORDER BY importance DESC, timestamp DESC LIMIT ?',
        [userId, `%${query}%`, numericLimit]
      );
      
      const results = rows as any[];
      console.log(`[MySQL搜索] ✅ 简单搜索完成，找到 ${results.length} 条记忆`);
      return results;
    }
  }

  // 🧠 智能关键词提取
  private extractKeywords(query: string): string[] {
    const keywords: string[] = [];
    
    // 常见问题模式映射
    const questionPatterns = [
      { pattern: /我的名字是？?|我叫什么|我的姓名/, keywords: ['名字', '叫', '姓名'] },
      { pattern: /我的工作|我的职业|我在哪里工作/, keywords: ['工作', '职业', '公司', 'COO'] },
      { pattern: /我的个人情况|自我介绍|个人信息/, keywords: ['个人', '信息', '情况'] },
      { pattern: /我的电脑|我的设备|我的配置/, keywords: ['电脑', '设备', '配置', 'MacBook'] },
      { pattern: /我的宠物|我的猫|我的狗/, keywords: ['宠物', '猫', '狗'] },
    ];
    
    // 检查问题模式
    for (const pattern of questionPatterns) {
      if (pattern.pattern.test(query)) {
        keywords.push(...pattern.keywords);
      }
    }
    
    // 提取中文关键词（简单分词）
    const chineseWords = query.match(/[\u4e00-\u9fa5]+/g) || [];
    for (const word of chineseWords) {
      if (word.length >= 2) {
        keywords.push(word);
      }
    }
    
         // 去重
     return Array.from(new Set(keywords));
  }

  // 🔍 生成模糊关键词
  private generateFuzzyKeywords(query: string): string[] {
    const fuzzyKeywords: string[] = [];
    
    // 单字分解
    const chars = query.match(/[\u4e00-\u9fa5]/g) || [];
    for (const char of chars) {
      if (char.length === 1) {
        fuzzyKeywords.push(char);
      }
    }
    
    // 常见同义词替换
    const synonyms = [
      { original: '名字', alternatives: ['叫', '姓名', '称呼'] },
      { original: '工作', alternatives: ['职业', '职位', '公司'] },
      { original: '个人', alternatives: ['自己', '我'] },
      { original: '情况', alternatives: ['信息', '状况', '介绍'] },
    ];
    
    for (const synonym of synonyms) {
      if (query.includes(synonym.original)) {
        fuzzyKeywords.push(...synonym.alternatives);
      }
    }
    
         return Array.from(new Set(fuzzyKeywords));
  }

  // 测试方法：验证MySQL连接和基本查询
  async testConnection(): Promise<any> {
    const conn = await this.getConnection();
    console.log(`[MySQL测试] 🧪 测试数据库连接...`);
    
    try {
      // 测试1: 简单查询
      const [countResult] = await conn.execute('SELECT COUNT(*) as total FROM memories');
      console.log(`[MySQL测试] 记忆总数:`, countResult);
      
      // 测试2: 带参数查询
      const [userResult] = await conn.execute('SELECT * FROM memories WHERE userId = ? LIMIT 2', ['default_user']);
      console.log(`[MySQL测试] 用户记忆数量:`, (userResult as any[]).length);
      
      // 测试3: LIKE查询
      const [likeResult] = await conn.execute('SELECT * FROM memories WHERE content LIKE ? LIMIT 1', ['%王大拿%']);
      console.log(`[MySQL测试] LIKE查询结果:`, (likeResult as any[]).length);
      
      return {
        success: true,
        totalMemories: countResult,
        userMemories: (userResult as any[]).length,
        likeResults: (likeResult as any[]).length
      };
      
    } catch (error) {
      console.error(`[MySQL测试] ❌ 测试失败:`, error);
      throw error;
    }
  }

  // 更新记忆访问次数
  async updateAccessCount(memoryId: number): Promise<void> {
    const conn = await this.getConnection();
    await conn.execute(
      'UPDATE memories SET accessCount = accessCount + 1, lastAccessed = NOW() WHERE id = ?',
      [memoryId]
    );
  }

  // 删除记忆
  async deleteMemory(memoryId: number): Promise<void> {
    const conn = await this.getConnection();
    await conn.execute('DELETE FROM memories WHERE id = ?', [memoryId]);
  }

  // 获取记忆统计
  async getMemoryStats(userId: string): Promise<any> {
    const conn = await this.getConnection();
    const [rows] = await conn.execute(
      'SELECT COUNT(*) as totalMemories, COUNT(DISTINCT category) as totalCategories FROM memories WHERE userId = ?',
      [userId]
    );
    return (rows as any[])[0];
  }

  // 关闭连接
  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
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