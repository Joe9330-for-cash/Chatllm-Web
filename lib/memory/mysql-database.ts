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

  // 搜索记忆
  async searchMemories(userId: string, query: string, limit: number = 10): Promise<any[]> {
    const conn = await this.getConnection();
    console.log(`[MySQL搜索] 用户: ${userId}, 查询: "${query}", 长度: ${query.length}`);
    
    const [rows] = await conn.execute(
      'SELECT * FROM memories WHERE userId = ? AND (content LIKE ? OR tags LIKE ?) ORDER BY importance DESC, timestamp DESC LIMIT ?',
      [userId, `%${query}%`, `%${query}%`, limit]
    );
    
    console.log(`[MySQL搜索] 查询结果: ${(rows as any[]).length} 条记录`);
    return rows as any[];
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