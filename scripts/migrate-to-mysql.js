const sqlite3 = require('better-sqlite3');
const mysql = require('mysql2/promise');
const path = require('path');

// 数据迁移脚本：SQLite → MySQL
async function migrateSQLiteToMySQL() {
  console.log('🔄 开始数据迁移：SQLite → MySQL');
  
  try {
    // 连接SQLite数据库
    const sqlitePath = path.join(process.cwd(), 'data', 'memories.db');
    const vectorSqlitePath = path.join(process.cwd(), 'data', 'vector-memories.db');
    
    console.log('📂 连接SQLite数据库...');
    const sqliteDB = sqlite3(sqlitePath);
    
    let vectorDB = null;
    try {
      vectorDB = sqlite3(vectorSqlitePath);
      console.log('✅ 向量数据库连接成功');
    } catch (e) {
      console.log('⚠️ 向量数据库不存在，跳过向量数据迁移');
    }
    
    // 连接MySQL数据库
    console.log('🔗 连接MySQL数据库...');
    const mysqlDB = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      user: process.env.MYSQL_USER || 'chatllm_user',
      password: process.env.MYSQL_PASSWORD || 'chatllm_pass',
      database: process.env.MYSQL_DATABASE || 'chatllm_memories'
    });
    
    console.log('✅ MySQL连接成功');
    
    // 迁移基础记忆数据
    console.log('📦 迁移基础记忆数据...');
    const memories = sqliteDB.prepare('SELECT * FROM memories').all();
    console.log(`找到 ${memories.length} 条记忆记录`);
    
    if (memories.length > 0) {
      // 清空MySQL表
      await mysqlDB.execute('DELETE FROM memories WHERE 1=1');
      console.log('🗑️ 清空MySQL记忆表');
      
      // 批量插入数据
      const insertSQL = `
        INSERT INTO memories (
          userId, content, category, importance, 
          timestamp, lastAccessed, accessCount, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      let insertedCount = 0;
      for (const memory of memories) {
        try {
          await mysqlDB.execute(insertSQL, [
            memory.user_id || memory.userId,
            memory.content,
            memory.category,
            memory.importance || 5,
            memory.created_at || memory.timestamp || new Date(),
            memory.updated_at || memory.lastAccessed || new Date(),
            memory.accessCount || 0,
            memory.tags || JSON.stringify([])
          ]);
          insertedCount++;
        } catch (error) {
          console.warn(`⚠️ 记忆插入失败: ${memory.id}`, error.message);
        }
      }
      
      console.log(`✅ 成功迁移 ${insertedCount}/${memories.length} 条记忆记录`);
    }
    
    // 迁移向量数据（如果存在）
    if (vectorDB) {
      console.log('🧠 迁移向量记忆数据...');
      
      try {
        const vectorMemories = vectorDB.prepare('SELECT * FROM vector_memories').all();
        console.log(`找到 ${vectorMemories.length} 条向量记忆记录`);
        
        if (vectorMemories.length > 0) {
          // 更新MySQL表结构以支持向量数据
          try {
            await mysqlDB.execute(`
              ALTER TABLE memories 
              ADD COLUMN IF NOT EXISTS vector_id INT,
              ADD COLUMN IF NOT EXISTS embedding_vector JSON
            `);
          } catch (e) {
            // 列已存在，忽略错误
          }
          
          // 获取向量数据
          const vectors = vectorDB.prepare('SELECT * FROM memory_vectors').all();
          const vectorMap = {};
          
          vectors.forEach(vector => {
            vectorMap[vector.memory_id] = {
              vector_data: vector.vector_data,
              norm: vector.norm
            };
          });
          
          // 更新MySQL中的向量数据
          let vectorUpdateCount = 0;
          for (const vectorMemory of vectorMemories) {
            try {
              const vectorData = vectorMap[vectorMemory.id];
              if (vectorData) {
                await mysqlDB.execute(
                  'UPDATE memories SET vector_id = ?, embedding_vector = ? WHERE userId = ? AND content = ?',
                  [
                    vectorMemory.id,
                    vectorData.vector_data,
                    vectorMemory.user_id,
                    vectorMemory.content
                  ]
                );
                vectorUpdateCount++;
              }
            } catch (error) {
              console.warn(`⚠️ 向量数据更新失败: ${vectorMemory.id}`, error.message);
            }
          }
          
          console.log(`✅ 成功迁移 ${vectorUpdateCount}/${vectorMemories.length} 条向量记录`);
        }
      } catch (error) {
        console.warn('⚠️ 向量数据迁移失败:', error.message);
      }
    }
    
    // 验证迁移结果
    console.log('🔍 验证迁移结果...');
    const [totalRows] = await mysqlDB.execute('SELECT COUNT(*) as count FROM memories');
    const [categoryStats] = await mysqlDB.execute(`
      SELECT category, COUNT(*) as count 
      FROM memories 
      GROUP BY category 
      ORDER BY count DESC
    `);
    
    console.log(`📊 迁移统计:`);
    console.log(`  总记忆数: ${totalRows[0].count}`);
    console.log(`  分类统计:`);
    categoryStats.forEach(stat => {
      console.log(`    ${stat.category}: ${stat.count}条`);
    });
    
    // 关闭连接
    sqliteDB.close();
    if (vectorDB) vectorDB.close();
    await mysqlDB.end();
    
    console.log('🎉 数据迁移完成！');
    
    // 生成迁移报告
    const report = {
      timestamp: new Date().toISOString(),
      source: 'SQLite',
      target: 'MySQL',
      totalMemories: totalRows[0].count,
      categories: categoryStats.length,
      vectorSupport: vectorDB !== null
    };
    
    require('fs').writeFileSync(
      'migration-report.json', 
      JSON.stringify(report, null, 2)
    );
    
    console.log('📋 迁移报告已保存至 migration-report.json');
    
  } catch (error) {
    console.error('❌ 数据迁移失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateSQLiteToMySQL();
}

module.exports = { migrateSQLiteToMySQL }; 