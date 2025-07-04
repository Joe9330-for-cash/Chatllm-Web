const Database = require('better-sqlite3');
const mysql = require('mysql2/promise');
const path = require('path');

const config = {
  sqlite: {
    memories: path.join(process.cwd(), 'data', 'memories.db')
  },
  mysql: {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'chatllm_memories'
  }
};

class MemoryPatcher {
  constructor() {
    this.sqliteDb = null;
    this.mysqlConnection = null;
    this.processed = 0;
    this.errors = 0;
  }

  async init() {
    // 连接SQLite
    this.sqliteDb = new Database(config.sqlite.memories, { readonly: true });
    
    // 连接MySQL
    this.mysqlConnection = await mysql.createConnection(config.mysql);
    
    console.log('🔗 数据库连接成功');
  }

  async patchRemainingMemories() {
    console.log('🔧 开始修补剩余记忆数据...');
    
    // 获取所有SQLite记忆
    const allMemories = this.sqliteDb.prepare('SELECT * FROM memories ORDER BY id').all();
    console.log(`📊 SQLite总记忆数: ${allMemories.length}`);
    
    // 获取已存在的MySQL记忆
    const [existingMemories] = await this.mysqlConnection.execute(
      'SELECT user_id, content FROM memories'
    );
    
    console.log(`📊 MySQL现有记忆数: ${existingMemories.length}`);
    
    // 创建已存在记忆的Set用于快速查找
    const existingSet = new Set(
      existingMemories.map(m => `${m.user_id}:${m.content.trim()}`)
    );
    
    // 处理剩余记忆
    for (const memory of allMemories) {
      const key = `${memory.user_id}:${memory.content.trim()}`;
      
      if (!existingSet.has(key)) {
        try {
          // 清理conversation_id值
          let conversationId = memory.conversation_id;
          if (typeof conversationId === 'number' && (conversationId > 2147483647 || conversationId < -2147483648)) {
            conversationId = null; // 超出INT范围设为null
          }
          
          await this.mysqlConnection.execute(
            `INSERT INTO memories (
              user_id, content, category, tags, source, conversation_id, 
              importance, created_at, updated_at, extracted_from
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              memory.user_id,
              memory.content,
              memory.category,
              memory.tags,
              memory.source,
              conversationId,
              memory.importance,
              memory.created_at,
              memory.updated_at,
              memory.extracted_from
            ]
          );
          
          this.processed++;
          
          if (this.processed % 10 === 0) {
            console.log(`📝 已处理 ${this.processed} 条记忆`);
          }
          
        } catch (error) {
          this.errors++;
          console.log(`❌ 处理记忆失败: ${error.message}`);
        }
      }
    }
    
    console.log(`✅ 修补完成 - 新增记忆: ${this.processed}, 错误: ${this.errors}`);
  }

  async verify() {
    console.log('🔍 验证修补结果...');
    
    const [result] = await this.mysqlConnection.execute('SELECT COUNT(*) as count FROM memories');
    const finalCount = result[0].count;
    
    const sqliteCount = this.sqliteDb.prepare('SELECT COUNT(*) as count FROM memories').get().count;
    
    console.log(`📊 最终结果:`);
    console.log(`- SQLite记忆数: ${sqliteCount}`);
    console.log(`- MySQL记忆数: ${finalCount}`);
    console.log(`- 迁移率: ${((finalCount / sqliteCount) * 100).toFixed(1)}%`);
  }

  async cleanup() {
    if (this.sqliteDb) {
      this.sqliteDb.close();
    }
    if (this.mysqlConnection) {
      await this.mysqlConnection.end();
    }
  }

  async run() {
    try {
      await this.init();
      await this.patchRemainingMemories();
      await this.verify();
    } catch (error) {
      console.error('❌ 修补失败:', error);
    } finally {
      await this.cleanup();
    }
  }
}

const patcher = new MemoryPatcher();
patcher.run(); 