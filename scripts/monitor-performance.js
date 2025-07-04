#!/usr/bin/env node

/**
 * MySQL性能监控脚本
 * 
 * 功能：
 * 1. 监控MySQL数据库性能
 * 2. 监控系统资源使用
 * 3. 检查查询性能
 * 4. 生成性能报告
 * 5. 提供优化建议
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// 配置
const config = {
  mysql: {
    host: 'localhost',
    user: 'root',
    password: '', // 根据实际情况调整
    database: 'chatllm_memories',
    charset: 'utf8mb4'
  },
  monitoring: {
    interval: 5000, // 监控间隔（毫秒）
    duration: 60000, // 监控持续时间（毫秒）
    reportFile: 'mysql-performance-report.json'
  }
};

class MySQLPerformanceMonitor {
  constructor() {
    this.connection = null;
    this.monitoring = false;
    this.startTime = null;
    this.performanceData = {
      timestamp: new Date(),
      mysql: {
        connections: [],
        queries: [],
        slowQueries: [],
        processlist: [],
        status: []
      },
      system: {
        cpu: [],
        memory: [],
        disk: []
      },
      summary: {
        averageQueryTime: 0,
        slowQueryCount: 0,
        connectionCount: 0,
        peakMemoryUsage: 0,
        peakCpuUsage: 0
      }
    };
  }

  async init() {
    console.log('🔧 初始化性能监控器...');
    
    try {
      this.connection = await mysql.createConnection(config.mysql);
      console.log('✅ MySQL连接成功');
    } catch (error) {
      console.error('❌ MySQL连接失败:', error.message);
      throw error;
    }
  }

  async collectMySQLStats() {
    try {
      // 获取MySQL状态
      const [statusRows] = await this.connection.execute('SHOW STATUS');
      const status = {};
      statusRows.forEach(row => {
        status[row.Variable_name] = row.Value;
      });

      // 获取进程列表
      const [processRows] = await this.connection.execute('SHOW PROCESSLIST');
      
      // 获取慢查询日志状态
      const [slowQueryRows] = await this.connection.execute(`
        SHOW VARIABLES LIKE 'slow_query_log%'
      `);
      
      // 获取连接数
      const [connectionRows] = await this.connection.execute(`
        SHOW STATUS LIKE 'Threads_connected'
      `);

      // 获取查询缓存状态
      const [queryCacheRows] = await this.connection.execute(`
        SHOW STATUS LIKE 'Qcache%'
      `);

      const mysqlStats = {
        timestamp: new Date(),
        connections: parseInt(connectionRows[0].Value),
        queries: parseInt(status.Queries || 0),
        slowQueries: parseInt(status.Slow_queries || 0),
        uptime: parseInt(status.Uptime || 0),
        processlist: processRows.length,
        queryCache: {
          hits: parseInt(status.Qcache_hits || 0),
          inserts: parseInt(status.Qcache_inserts || 0),
          lowmemPrunes: parseInt(status.Qcache_lowmem_prunes || 0)
        },
        innodb: {
          bufferPoolReads: parseInt(status.Innodb_buffer_pool_reads || 0),
          bufferPoolReadRequests: parseInt(status.Innodb_buffer_pool_read_requests || 0),
          rowsRead: parseInt(status.Innodb_rows_read || 0),
          rowsInserted: parseInt(status.Innodb_rows_inserted || 0),
          rowsUpdated: parseInt(status.Innodb_rows_updated || 0),
          rowsDeleted: parseInt(status.Innodb_rows_deleted || 0)
        }
      };

      this.performanceData.mysql.status.push(mysqlStats);
      
      console.log(`📊 MySQL状态 - 连接: ${mysqlStats.connections}, 查询: ${mysqlStats.queries}, 慢查询: ${mysqlStats.slowQueries}`);
      
      return mysqlStats;
    } catch (error) {
      console.error('❌ 获取MySQL状态失败:', error.message);
      return null;
    }
  }

  async collectSystemStats() {
    try {
      const systemStats = {
        timestamp: new Date(),
        cpu: 0,
        memory: {
          total: 0,
          used: 0,
          free: 0,
          usage: 0
        },
        disk: {
          total: 0,
          used: 0,
          free: 0,
          usage: 0
        }
      };

      // 获取CPU使用率
      try {
        const { stdout: cpuOutput } = await execAsync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1");
        systemStats.cpu = parseFloat(cpuOutput.trim()) || 0;
      } catch (error) {
        console.warn('获取CPU使用率失败:', error.message);
      }

      // 获取内存使用情况
      try {
        const { stdout: memOutput } = await execAsync("free -m | grep '^Mem:'");
        const memValues = memOutput.trim().split(/\s+/);
        if (memValues.length >= 3) {
          systemStats.memory.total = parseInt(memValues[1]);
          systemStats.memory.used = parseInt(memValues[2]);
          systemStats.memory.free = parseInt(memValues[3]);
          systemStats.memory.usage = (systemStats.memory.used / systemStats.memory.total) * 100;
        }
      } catch (error) {
        console.warn('获取内存使用情况失败:', error.message);
      }

      // 获取磁盘使用情况
      try {
        const { stdout: diskOutput } = await execAsync("df -h / | tail -1");
        const diskValues = diskOutput.trim().split(/\s+/);
        if (diskValues.length >= 5) {
          systemStats.disk.total = diskValues[1];
          systemStats.disk.used = diskValues[2];
          systemStats.disk.free = diskValues[3];
          systemStats.disk.usage = parseFloat(diskValues[4].replace('%', ''));
        }
      } catch (error) {
        console.warn('获取磁盘使用情况失败:', error.message);
      }

      this.performanceData.system.cpu.push(systemStats.cpu);
      this.performanceData.system.memory.push(systemStats.memory);
      this.performanceData.system.disk.push(systemStats.disk);

      console.log(`💻 系统状态 - CPU: ${systemStats.cpu.toFixed(1)}%, 内存: ${systemStats.memory.usage.toFixed(1)}%, 磁盘: ${systemStats.disk.usage}%`);
      
      return systemStats;
    } catch (error) {
      console.error('❌ 获取系统状态失败:', error.message);
      return null;
    }
  }

  async testQueryPerformance() {
    const queries = [
      {
        name: '基础查询',
        sql: 'SELECT COUNT(*) as count FROM memories'
      },
      {
        name: '分类统计',
        sql: 'SELECT category, COUNT(*) as count FROM memories GROUP BY category'
      },
      {
        name: '内容搜索',
        sql: "SELECT id, category, content FROM memories WHERE content LIKE '%技能%' LIMIT 10"
      },
      {
        name: '重要性排序',
        sql: 'SELECT id, category, importance FROM memories ORDER BY importance DESC LIMIT 20'
      },
      {
        name: '向量查询',
        sql: 'SELECT vm.id, vm.content FROM vector_memories vm JOIN memory_vectors mv ON vm.id = mv.memory_id LIMIT 10'
      }
    ];

    const results = [];

    for (const query of queries) {
      try {
        const startTime = Date.now();
        const [rows] = await this.connection.execute(query.sql);
        const endTime = Date.now();
        const duration = endTime - startTime;

        const result = {
          name: query.name,
          duration,
          rowCount: rows.length,
          timestamp: new Date()
        };

        results.push(result);
        console.log(`🔍 ${query.name} - ${duration}ms, ${rows.length} 行`);
      } catch (error) {
        console.error(`❌ 查询失败 [${query.name}]:`, error.message);
        results.push({
          name: query.name,
          duration: -1,
          error: error.message,
          timestamp: new Date()
        });
      }
    }

    this.performanceData.mysql.queries.push(...results);
    return results;
  }

  async analyzePerformance() {
    console.log('\n📊 分析性能数据...');
    
    // 分析MySQL性能
    const mysqlStats = this.performanceData.mysql.status;
    if (mysqlStats.length > 0) {
      const latest = mysqlStats[mysqlStats.length - 1];
      const first = mysqlStats[0];
      
      this.performanceData.summary.connectionCount = latest.connections;
      this.performanceData.summary.slowQueryCount = latest.slowQueries - (first.slowQueries || 0);
    }

    // 分析查询性能
    const queries = this.performanceData.mysql.queries;
    if (queries.length > 0) {
      const validQueries = queries.filter(q => q.duration > 0);
      const totalTime = validQueries.reduce((sum, q) => sum + q.duration, 0);
      this.performanceData.summary.averageQueryTime = totalTime / validQueries.length;
    }

    // 分析系统资源
    const memoryStats = this.performanceData.system.memory;
    const cpuStats = this.performanceData.system.cpu;
    
    if (memoryStats.length > 0) {
      this.performanceData.summary.peakMemoryUsage = Math.max(...memoryStats.map(m => m.usage));
    }
    
    if (cpuStats.length > 0) {
      this.performanceData.summary.peakCpuUsage = Math.max(...cpuStats);
    }

    return this.performanceData.summary;
  }

  async generateRecommendations() {
    const recommendations = [];
    const summary = this.performanceData.summary;

    // MySQL性能建议
    if (summary.slowQueryCount > 0) {
      recommendations.push({
        type: 'warning',
        category: 'mysql',
        message: `发现 ${summary.slowQueryCount} 条慢查询，建议优化查询或添加索引`
      });
    }

    if (summary.averageQueryTime > 100) {
      recommendations.push({
        type: 'warning',
        category: 'mysql',
        message: `平均查询时间 ${summary.averageQueryTime.toFixed(2)}ms 较高，建议优化查询性能`
      });
    }

    if (summary.connectionCount > 50) {
      recommendations.push({
        type: 'warning',
        category: 'mysql',
        message: `连接数 ${summary.connectionCount} 较高，建议优化连接池配置`
      });
    }

    // 系统资源建议
    if (summary.peakMemoryUsage > 80) {
      recommendations.push({
        type: 'warning',
        category: 'system',
        message: `内存使用率峰值 ${summary.peakMemoryUsage.toFixed(1)}% 较高，建议监控内存泄漏`
      });
    }

    if (summary.peakCpuUsage > 80) {
      recommendations.push({
        type: 'warning',
        category: 'system',
        message: `CPU使用率峰值 ${summary.peakCpuUsage.toFixed(1)}% 较高，建议优化计算密集任务`
      });
    }

    // 性能优化建议
    if (summary.averageQueryTime > 50) {
      recommendations.push({
        type: 'suggestion',
        category: 'optimization',
        message: '建议添加数据库索引：CREATE INDEX idx_memories_content ON memories(content(100))'
      });
    }

    recommendations.push({
      type: 'suggestion',
      category: 'optimization',
      message: '建议定期运行 OPTIMIZE TABLE 优化表结构'
    });

    return recommendations;
  }

  async generateReport() {
    const summary = await this.analyzePerformance();
    const recommendations = await this.generateRecommendations();
    
    const report = {
      ...this.performanceData,
      recommendations,
      generatedAt: new Date(),
      monitoringDuration: Date.now() - this.startTime
    };

    // 保存报告
    const reportPath = path.join(__dirname, '..', config.monitoring.reportFile);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('📋 MySQL性能监控报告');
    console.log('='.repeat(60));
    console.log(`⏱️  监控时长: ${Math.round(report.monitoringDuration / 1000)}秒`);
    console.log(`🔗 平均连接数: ${summary.connectionCount}`);
    console.log(`⚡ 平均查询时间: ${summary.averageQueryTime.toFixed(2)}ms`);
    console.log(`🐌 慢查询数量: ${summary.slowQueryCount}`);
    console.log(`💾 内存使用峰值: ${summary.peakMemoryUsage.toFixed(1)}%`);
    console.log(`⚙️  CPU使用峰值: ${summary.peakCpuUsage.toFixed(1)}%`);
    
    if (recommendations.length > 0) {
      console.log('\n💡 优化建议:');
      recommendations.forEach((rec, index) => {
        const icon = rec.type === 'warning' ? '⚠️' : '💡';
        console.log(`${index + 1}. ${icon} [${rec.category}] ${rec.message}`);
      });
    }

    console.log(`\n📄 详细报告已保存至: ${reportPath}`);
    console.log('='.repeat(60));

    return report;
  }

  async startMonitoring() {
    this.monitoring = true;
    this.startTime = Date.now();
    
    console.log(`🚀 开始性能监控 (持续 ${config.monitoring.duration / 1000}秒)...`);
    
    // 测试查询性能
    await this.testQueryPerformance();
    
    const monitoringInterval = setInterval(async () => {
      if (!this.monitoring) {
        clearInterval(monitoringInterval);
        return;
      }

      await Promise.all([
        this.collectMySQLStats(),
        this.collectSystemStats()
      ]);
    }, config.monitoring.interval);

    // 设置监控超时
    setTimeout(() => {
      this.monitoring = false;
      clearInterval(monitoringInterval);
      this.generateReport().then(() => {
        console.log('\n✅ 性能监控完成');
        process.exit(0);
      });
    }, config.monitoring.duration);
  }

  async cleanup() {
    if (this.connection) {
      await this.connection.end();
    }
  }

  async run() {
    try {
      await this.init();
      await this.startMonitoring();
    } catch (error) {
      console.error('❌ 性能监控失败:', error.message);
      process.exit(1);
    }
  }
}

// 运行监控
if (require.main === module) {
  const monitor = new MySQLPerformanceMonitor();
  
  // 处理终止信号
  process.on('SIGINT', async () => {
    console.log('\n🛑 收到终止信号，正在生成报告...');
    monitor.monitoring = false;
    await monitor.generateReport();
    await monitor.cleanup();
    process.exit(0);
  });
  
  monitor.run().catch(console.error);
}

module.exports = MySQLPerformanceMonitor; 