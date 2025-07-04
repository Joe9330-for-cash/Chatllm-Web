#!/usr/bin/env node

/**
 * 完整的MySQL迁移脚本
 * 
 * 功能：
 * 1. 从SQLite导出数据
 * 2. 创建MySQL数据库和表结构
 * 3. 导入数据到MySQL
 * 4. 验证数据完整性
 * 5. 测试记忆功能
 */

const mysql = require('mysql2/promise');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// 配置
const config = {
  sqlite: {
    memories: path.join(__dirname, '..', 'data', 'memories.db'),
    vectors: path.join(__dirname, '..', 'data', 'vector-memories.db')
  },
  mysql: {
    host: 'localhost',
    user: 'root',
    password: '', // 根据实际情况调整
    database: 'chatllm_memories',
    charset: 'utf8mb4'
  }
};

class MySQLMigration {
  constructor() {
    this.connection = null;
    this.sqliteDb = null;
    this.vectorDb = null;
    this.migrationReport = {
      startTime: new Date(),
      endTime: null,
      totalMemories: 0,
      totalVectors: 0,
      migratedMemories: 0,
      migratedVectors: 0,
      errors: []
    };
  }

  async init() {
    console.log('🚀 开始MySQL迁移初始化...');
    
    // 连接MySQL
    this.connection = await mysql.createConnection({
      host: config.mysql.host,
      user: config.mysql.user,
      password: config.mysql.password,
      charset: config.mysql.charset,
      multipleStatements: true
    });

    // 连接SQLite
    this.sqliteDb = new Database(config.sqlite.memories, { readonly: true });
    this.vectorDb = new Database(config.sqlite.vectors, { readonly: true });

    console.log('✅ 数据库连接成功');
  }

  async createDatabase() {
    console.log('📋 创建MySQL数据库...');
    
    // 创建数据库 - 使用query方法
    await this.connection.query(`DROP DATABASE IF EXISTS ${config.mysql.database}`);
    await this.connection.query(`CREATE DATABASE ${config.mysql.database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await this.connection.query(`USE ${config.mysql.database}`);

    // 创建表结构 - 分别执行每个CREATE TABLE语句
    const createMemoriesTable = `
      CREATE TABLE memories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        category VARCHAR(100) NOT NULL,
        tags TEXT,
        source VARCHAR(255),
        conversation_id INT,
        importance TINYINT NOT NULL DEFAULT 5,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        extracted_from TEXT,
        
        INDEX idx_memories_user_id (user_id),
        INDEX idx_memories_category (category),
        INDEX idx_memories_importance (importance),
        INDEX idx_memories_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;
    
    const createVectorMemoriesTable = `
      CREATE TABLE vector_memories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        category VARCHAR(100),
        metadata TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        vector_dimensions INT DEFAULT 1536,
        
        INDEX idx_vector_memories_user (user_id),
        INDEX idx_vector_memories_category (category),
        INDEX idx_vector_memories_timestamp (timestamp),
        UNIQUE KEY unique_user_content (user_id, content(255))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;
    
    const createMemoryVectorsTable = `
      CREATE TABLE memory_vectors (
        memory_id INT PRIMARY KEY,
        vector_data JSON NOT NULL,
        norm FLOAT,
        
        FOREIGN KEY (memory_id) REFERENCES vector_memories(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    await this.connection.query(createMemoriesTable);
    await this.connection.query(createVectorMemoriesTable);
    await this.connection.query(createMemoryVectorsTable);
    
    console.log('✅ 数据库和表结构创建完成');
  }

  async exportSQLiteData() {
    console.log('📤 导出SQLite数据...');
    
    // 导出记忆数据
    const memories = this.sqliteDb.prepare(`
      SELECT * FROM memories ORDER BY id
    `).all();
    
    this.migrationReport.totalMemories = memories.length;
    console.log(`📊 总记忆数: ${memories.length}`);

    // 导出向量数据
    const vectorMemories = this.vectorDb.prepare(`
      SELECT vm.*, mv.vector_data, mv.norm
      FROM vector_memories vm
      LEFT JOIN memory_vectors mv ON vm.id = mv.memory_id
      ORDER BY vm.id
    `).all();
    
    this.migrationReport.totalVectors = vectorMemories.length;
    console.log(`📊 总向量数: ${vectorMemories.length}`);

    return { memories, vectorMemories };
  }

  async importToMySQL(data) {
    console.log('📥 导入数据到MySQL...');
    
    // 导入记忆数据
    if (data.memories.length > 0) {
      const insertMemoryQuery = `
        INSERT INTO memories (
          user_id, content, category, tags, source, conversation_id, 
          importance, created_at, updated_at, extracted_from
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      for (const memory of data.memories) {
        try {
          await this.connection.execute(insertMemoryQuery, [
            memory.user_id,
            memory.content,
            memory.category,
            memory.tags,
            memory.source,
            memory.conversation_id,
            memory.importance,
            memory.created_at,
            memory.updated_at,
            memory.extracted_from
          ]);
          this.migrationReport.migratedMemories++;
        } catch (error) {
          this.migrationReport.errors.push({
            type: 'memory_import',
            data: memory,
            error: error.message
          });
        }
      }
    }

    // 导入向量数据
    if (data.vectorMemories.length > 0) {
      const insertVectorMemoryQuery = `
        INSERT INTO vector_memories (
          user_id, content, category, metadata, timestamp, vector_dimensions
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      const insertVectorQuery = `
        INSERT INTO memory_vectors (memory_id, vector_data, norm) VALUES (?, ?, ?)
      `;
      
      for (const vectorMemory of data.vectorMemories) {
        try {
          // 插入向量记忆
          const [result] = await this.connection.execute(insertVectorMemoryQuery, [
            vectorMemory.user_id,
            vectorMemory.content,
            vectorMemory.category,
            vectorMemory.metadata,
            vectorMemory.timestamp,
            vectorMemory.vector_dimensions
          ]);
          
          // 插入向量数据
          if (vectorMemory.vector_data) {
            await this.connection.execute(insertVectorQuery, [
              result.insertId,
              vectorMemory.vector_data,
              vectorMemory.norm
            ]);
          }
          
          this.migrationReport.migratedVectors++;
        } catch (error) {
          this.migrationReport.errors.push({
            type: 'vector_import',
            data: vectorMemory,
            error: error.message
          });
        }
      }
    }

    console.log(`✅ 数据导入完成 - 记忆: ${this.migrationReport.migratedMemories}/${this.migrationReport.totalMemories}, 向量: ${this.migrationReport.migratedVectors}/${this.migrationReport.totalVectors}`);
  }

  async validateData() {
    console.log('🔍 验证数据完整性...');
    
    // 验证记忆数据
    const [memoryRows] = await this.connection.execute('SELECT COUNT(*) as count FROM memories');
    const memoryCount = memoryRows[0].count;
    
    // 验证向量数据
    const [vectorRows] = await this.connection.execute('SELECT COUNT(*) as count FROM vector_memories');
    const vectorCount = vectorRows[0].count;
    
    // 验证向量数据完整性
    const [vectorDataRows] = await this.connection.execute('SELECT COUNT(*) as count FROM memory_vectors');
    const vectorDataCount = vectorDataRows[0].count;
    
    console.log(`📊 验证结果:`);
    console.log(`- 记忆数据: ${memoryCount}/${this.migrationReport.totalMemories}`);
    console.log(`- 向量记忆: ${vectorCount}/${this.migrationReport.totalVectors}`);
    console.log(`- 向量数据: ${vectorDataCount}`);
    
    // 测试查询
    const [sampleMemories] = await this.connection.execute(`
      SELECT id, user_id, category, LEFT(content, 50) as content_preview 
      FROM memories 
      ORDER BY id 
      LIMIT 5
    `);
    
    console.log(`📋 样本记忆数据:`);
    sampleMemories.forEach(memory => {
      console.log(`- [${memory.id}] ${memory.category}: ${memory.content_preview}...`);
    });
    
    return {
      memoryCount,
      vectorCount,
      vectorDataCount,
      success: memoryCount === this.migrationReport.totalMemories && 
               vectorCount === this.migrationReport.totalVectors
    };
  }

  async testMemoryFunctions() {
    console.log('🧪 测试记忆功能...');
    
    try {
      // 测试记忆搜索
      const [searchResults] = await this.connection.execute(`
        SELECT id, category, LEFT(content, 100) as content_preview
        FROM memories 
        WHERE content LIKE '%技能%' OR content LIKE '%工作%'
        ORDER BY importance DESC
        LIMIT 3
      `);
      
      console.log('🔍 搜索测试结果:');
      searchResults.forEach(result => {
        console.log(`- [${result.id}] ${result.category}: ${result.content_preview}...`);
      });
      
      // 测试分类统计
      const [categoryStats] = await this.connection.execute(`
        SELECT category, COUNT(*) as count 
        FROM memories 
        GROUP BY category 
        ORDER BY count DESC
      `);
      
      console.log('📊 分类统计:');
      categoryStats.forEach(stat => {
        console.log(`- ${stat.category}: ${stat.count} 条记忆`);
      });
      
      return true;
    } catch (error) {
      console.error('❌ 功能测试失败:', error.message);
      return false;
    }
  }

  async createMigrationReport() {
    this.migrationReport.endTime = new Date();
    const duration = this.migrationReport.endTime - this.migrationReport.startTime;
    
    const report = {
      ...this.migrationReport,
      duration: `${Math.round(duration / 1000)}秒`,
      success: this.migrationReport.migratedMemories === this.migrationReport.totalMemories &&
               this.migrationReport.migratedVectors === this.migrationReport.totalVectors,
      errorCount: this.migrationReport.errors.length
    };
    
    // 保存报告
    const reportPath = path.join(__dirname, '..', 'mysql-migration-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 MySQL迁移报告');
    console.log('='.repeat(60));
    console.log(`⏱️  总耗时: ${report.duration}`);
    console.log(`📊 记忆数据: ${report.migratedMemories}/${report.totalMemories}`);
    console.log(`📊 向量数据: ${report.migratedVectors}/${report.totalVectors}`);
    console.log(`❌ 错误数量: ${report.errorCount}`);
    console.log(`✅ 迁移状态: ${report.success ? '成功' : '失败'}`);
    
    if (report.errors.length > 0) {
      console.log('\n🔍 错误详情:');
      report.errors.forEach((error, index) => {
        console.log(`${index + 1}. [${error.type}] ${error.error}`);
      });
    }
    
    console.log(`\n📄 详细报告已保存至: ${reportPath}`);
    console.log('='.repeat(60));
    
    return report;
  }

  async cleanup() {
    if (this.connection) {
      await this.connection.end();
    }
    if (this.sqliteDb) {
      this.sqliteDb.close();
    }
    if (this.vectorDb) {
      this.vectorDb.close();
    }
  }

  async run() {
    try {
      await this.init();
      await this.createDatabase();
      
      const data = await this.exportSQLiteData();
      await this.importToMySQL(data);
      
      const validation = await this.validateData();
      const testResults = await this.testMemoryFunctions();
      
      const report = await this.createMigrationReport();
      
      if (validation.success && testResults) {
        console.log('\n🎉 MySQL迁移完成！数据库已准备就绪。');
        console.log('💡 请更新应用配置以使用MySQL数据库。');
      } else {
        console.log('\n⚠️  迁移完成但存在问题，请检查错误报告。');
      }
      
    } catch (error) {
      console.error('❌ 迁移失败:', error.message);
      this.migrationReport.errors.push({
        type: 'critical_error',
        error: error.message
      });
    } finally {
      await this.cleanup();
    }
  }
}

// 运行迁移
if (require.main === module) {
  const migration = new MySQLMigration();
  migration.run().catch(console.error);
}

module.exports = MySQLMigration; 