#!/usr/bin/env node

/**
 * MySQL迁移测试脚本
 * 
 * 功能：
 * 1. 测试MySQL连接和数据库创建
 * 2. 验证数据迁移的完整性
 * 3. 测试记忆功能是否正常工作
 * 4. 性能测试
 * 5. 与SQLite数据对比验证
 */

const mysql = require('mysql2/promise');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// 配置
const config = {
  mysql: {
    host: 'localhost',
    user: 'root',
    password: '', // 根据实际情况调整
    database: 'chatllm_memories',
    charset: 'utf8mb4'
  },
  sqlite: {
    memories: path.join(__dirname, '..', 'data', 'memories.db'),
    vectors: path.join(__dirname, '..', 'data', 'vector-memories.db')
  }
};

class MySQLMigrationTester {
  constructor() {
    this.mysqlConnection = null;
    this.sqliteDb = null;
    this.vectorDb = null;
    this.testResults = {
      startTime: new Date(),
      endTime: null,
      tests: [],
      passed: 0,
      failed: 0,
      errors: []
    };
  }

  async init() {
    console.log('🔧 初始化测试环境...');
    
    // 连接MySQL
    this.mysqlConnection = await mysql.createConnection(config.mysql);
    
    // 连接SQLite
    this.sqliteDb = new Database(config.sqlite.memories, { readonly: true });
    this.vectorDb = new Database(config.sqlite.vectors, { readonly: true });
    
    console.log('✅ 测试环境初始化成功');
  }

  async runTest(testName, testFn) {
    console.log(`\n🧪 运行测试: ${testName}`);
    
    try {
      const startTime = Date.now();
      const result = await testFn();
      const duration = Date.now() - startTime;
      
      this.testResults.tests.push({
        name: testName,
        passed: true,
        duration,
        result
      });
      
      this.testResults.passed++;
      console.log(`✅ ${testName} - 通过 (${duration}ms)`);
      
      return result;
    } catch (error) {
      this.testResults.tests.push({
        name: testName,
        passed: false,
        error: error.message
      });
      
      this.testResults.failed++;
      this.testResults.errors.push({
        test: testName,
        error: error.message
      });
      
      console.error(`❌ ${testName} - 失败: ${error.message}`);
      return null;
    }
  }

  async testMySQLConnection() {
    return await this.runTest('MySQL连接测试', async () => {
      await this.mysqlConnection.ping();
      
      // 测试数据库是否存在
      const [rows] = await this.mysqlConnection.execute(
        'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
        [config.mysql.database]
      );
      
      if (rows.length === 0) {
        throw new Error('MySQL数据库不存在');
      }
      
      return { status: 'connected', database: config.mysql.database };
    });
  }

  async testTableStructure() {
    return await this.runTest('表结构测试', async () => {
      const tables = ['memories', 'vector_memories', 'memory_vectors'];
      const results = {};
      
      for (const tableName of tables) {
        const [rows] = await this.mysqlConnection.execute(
          'SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
          [config.mysql.database, tableName]
        );
        
        if (rows[0].count === 0) {
          throw new Error(`表 ${tableName} 不存在`);
        }
        
        // 检查表结构
        const [columns] = await this.mysqlConnection.execute(
          'DESCRIBE ' + tableName
        );
        
        results[tableName] = {
          exists: true,
          columns: columns.length
        };
      }
      
      return results;
    });
  }

  async testDataIntegrity() {
    return await this.runTest('数据完整性测试', async () => {
      // 获取SQLite中的数据统计
      const sqliteMemories = this.sqliteDb.prepare('SELECT COUNT(*) as count FROM memories').get();
      const sqliteVectors = this.vectorDb.prepare('SELECT COUNT(*) as count FROM vector_memories').get();
      
      // 获取MySQL中的数据统计
      const [mysqlMemories] = await this.mysqlConnection.execute('SELECT COUNT(*) as count FROM memories');
      const [mysqlVectors] = await this.mysqlConnection.execute('SELECT COUNT(*) as count FROM vector_memories');
      
      const sqliteCount = sqliteMemories.count;
      const mysqlCount = mysqlMemories[0].count;
      const sqliteVectorCount = sqliteVectors.count;
      const mysqlVectorCount = mysqlVectors[0].count;
      
      const memoryIntegrity = sqliteCount === mysqlCount;
      const vectorIntegrity = sqliteVectorCount === mysqlVectorCount;
      
      if (!memoryIntegrity) {
        throw new Error(`记忆数据不一致: SQLite=${sqliteCount}, MySQL=${mysqlCount}`);
      }
      
      if (!vectorIntegrity) {
        throw new Error(`向量数据不一致: SQLite=${sqliteVectorCount}, MySQL=${mysqlVectorCount}`);
      }
      
      return {
        memoryCount: { sqlite: sqliteCount, mysql: mysqlCount },
        vectorCount: { sqlite: sqliteVectorCount, mysql: mysqlVectorCount },
        integrity: { memory: memoryIntegrity, vector: vectorIntegrity }
      };
    });
  }

  async testMemorySearch() {
    return await this.runTest('记忆搜索测试', async () => {
      const testQueries = [
        '技能',
        '工作',
        '个人信息',
        '项目经验',
        '教育背景'
      ];
      
      const results = {};
      
      for (const query of testQueries) {
        const [rows] = await this.mysqlConnection.execute(`
          SELECT id, category, LEFT(content, 100) as content_preview
          FROM memories 
          WHERE content LIKE ? 
          ORDER BY importance DESC
          LIMIT 5
        `, [`%${query}%`]);
        
        results[query] = {
          count: rows.length,
          results: rows
        };
      }
      
      return results;
    });
  }

  async testCategoryStats() {
    return await this.runTest('分类统计测试', async () => {
      const [rows] = await this.mysqlConnection.execute(`
        SELECT category, COUNT(*) as count 
        FROM memories 
        GROUP BY category 
        ORDER BY count DESC
      `);
      
      if (rows.length === 0) {
        throw new Error('没有找到分类数据');
      }
      
      return {
        totalCategories: rows.length,
        categories: rows.slice(0, 10) // 前10个分类
      };
    });
  }

  async testVectorQueries() {
    return await this.runTest('向量查询测试', async () => {
      // 测试向量数据的完整性
      const [vectorRows] = await this.mysqlConnection.execute(`
        SELECT COUNT(*) as count
        FROM vector_memories vm
        JOIN memory_vectors mv ON vm.id = mv.memory_id
      `);
      
      const vectorCount = vectorRows[0].count;
      
      if (vectorCount === 0) {
        throw new Error('没有找到向量数据');
      }
      
      // 测试向量数据格式
      const [sampleVector] = await this.mysqlConnection.execute(`
        SELECT vm.id, vm.content, mv.vector_data, mv.norm
        FROM vector_memories vm
        JOIN memory_vectors mv ON vm.id = mv.memory_id
        LIMIT 1
      `);
      
      if (sampleVector.length === 0) {
        throw new Error('无法获取向量样本');
      }
      
      const vectorData = JSON.parse(sampleVector[0].vector_data);
      
      if (!Array.isArray(vectorData) || vectorData.length === 0) {
        throw new Error('向量数据格式错误');
      }
      
      return {
        vectorCount,
        sampleDimensions: vectorData.length,
        sampleNorm: sampleVector[0].norm
      };
    });
  }

  async testPerformance() {
    return await this.runTest('性能测试', async () => {
      const performanceResults = {};
      
      // 测试基础查询性能
      const basicQueryStart = Date.now();
      const [basicRows] = await this.mysqlConnection.execute(`
        SELECT COUNT(*) as count FROM memories
      `);
      const basicQueryTime = Date.now() - basicQueryStart;
      performanceResults.basicQuery = { time: basicQueryTime, count: basicRows[0].count };
      
      // 测试搜索性能
      const searchStart = Date.now();
      const [searchRows] = await this.mysqlConnection.execute(`
        SELECT id, category, content FROM memories 
        WHERE content LIKE '%技能%' 
        ORDER BY importance DESC 
        LIMIT 10
      `);
      const searchTime = Date.now() - searchStart;
      performanceResults.searchQuery = { time: searchTime, results: searchRows.length };
      
      // 测试分类统计性能
      const statsStart = Date.now();
      const [statsRows] = await this.mysqlConnection.execute(`
        SELECT category, COUNT(*) as count 
        FROM memories 
        GROUP BY category 
        ORDER BY count DESC
      `);
      const statsTime = Date.now() - statsStart;
      performanceResults.statsQuery = { time: statsTime, categories: statsRows.length };
      
      // 测试向量查询性能
      const vectorStart = Date.now();
      const [vectorRows] = await this.mysqlConnection.execute(`
        SELECT vm.id, vm.content, mv.vector_data
        FROM vector_memories vm
        JOIN memory_vectors mv ON vm.id = mv.memory_id
        LIMIT 10
      `);
      const vectorTime = Date.now() - vectorStart;
      performanceResults.vectorQuery = { time: vectorTime, results: vectorRows.length };
      
      return performanceResults;
    });
  }

  async testDatabaseSize() {
    return await this.runTest('数据库大小测试', async () => {
      const [rows] = await this.mysqlConnection.execute(`
        SELECT 
          table_name,
          round(((data_length + index_length) / 1024 / 1024), 2) as size_mb
        FROM information_schema.tables 
        WHERE table_schema = ?
        ORDER BY (data_length + index_length) DESC
      `, [config.mysql.database]);
      
      const totalSize = rows.reduce((sum, row) => sum + row.size_mb, 0);
      
      return {
        totalSize: totalSize,
        tables: rows
      };
    });
  }

  async generateTestReport() {
    this.testResults.endTime = new Date();
    const duration = this.testResults.endTime - this.testResults.startTime;
    
    const report = {
      ...this.testResults,
      duration: `${Math.round(duration / 1000)}秒`,
      successRate: `${Math.round((this.testResults.passed / (this.testResults.passed + this.testResults.failed)) * 100)}%`
    };
    
    // 保存报告
    const reportPath = path.join(__dirname, '..', 'mysql-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 MySQL迁移测试报告');
    console.log('='.repeat(60));
    console.log(`⏱️  总耗时: ${report.duration}`);
    console.log(`✅ 通过测试: ${report.passed}`);
    console.log(`❌ 失败测试: ${report.failed}`);
    console.log(`📊 成功率: ${report.successRate}`);
    
    if (report.errors.length > 0) {
      console.log('\n🔍 错误详情:');
      report.errors.forEach((error, index) => {
        console.log(`${index + 1}. [${error.test}] ${error.error}`);
      });
    }
    
    console.log(`\n📄 详细报告已保存至: ${reportPath}`);
    console.log('='.repeat(60));
    
    return report;
  }

  async cleanup() {
    if (this.mysqlConnection) {
      await this.mysqlConnection.end();
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
      
      // 运行所有测试
      await this.testMySQLConnection();
      await this.testTableStructure();
      await this.testDataIntegrity();
      await this.testMemorySearch();
      await this.testCategoryStats();
      await this.testVectorQueries();
      await this.testPerformance();
      await this.testDatabaseSize();
      
      const report = await this.generateTestReport();
      
      if (report.failed === 0) {
        console.log('\n🎉 所有测试通过！MySQL迁移验证成功。');
      } else {
        console.log('\n⚠️  部分测试失败，请检查错误报告。');
      }
      
    } catch (error) {
      console.error('❌ 测试运行失败:', error.message);
    } finally {
      await this.cleanup();
    }
  }
}

// 运行测试
if (require.main === module) {
  const tester = new MySQLMigrationTester();
  tester.run().catch(console.error);
}

module.exports = MySQLMigrationTester; 