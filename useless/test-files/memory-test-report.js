#!/usr/bin/env node

const http = require('http');
const { URL } = require('url');

// 测试配置
const config = {
  baseUrl: 'http://localhost:3000',
  userId: 'default_user',
  testQueries: ['王大拿', '年龄', '编程', '信息']
};

// HTTP请求工具
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const parsedUrl = new URL(url);
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      timeout: 10000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        try {
          const parsed = JSON.parse(data);
          resolve({
            success: true,
            data: parsed,
            status: res.statusCode,
            responseTime
          });
        } catch (error) {
          resolve({
            success: false,
            error: 'Invalid JSON response',
            status: res.statusCode,
            responseTime,
            rawData: data.substring(0, 200)
          });
        }
      });
    });

    req.on('error', (error) => {
      const responseTime = Date.now() - startTime;
      resolve({
        success: false,
        error: error.message,
        status: 'NETWORK_ERROR',
        responseTime
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const responseTime = Date.now() - startTime;
      resolve({
        success: false,
        error: '请求超时',
        status: 'TIMEOUT',
        responseTime
      });
    });

    req.end();
  });
}

// 测试报告生成器
class TestReporter {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }

  addResult(name, success, details = {}) {
    this.results.push({
      name,
      success,
      details,
      timestamp: Date.now()
    });
  }

  generateReport() {
    const endTime = Date.now();
    const duration = endTime - this.startTime;
    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;

    console.log('\n' + '='.repeat(80));
    console.log('🧪 **ChatLLM-Web 记忆系统测试报告**');
    console.log('='.repeat(80));
    console.log(`📊 测试概览: ${passed} 通过, ${failed} 失败, 总计 ${this.results.length} 项测试`);
    console.log(`⏱️  测试时长: ${(duration / 1000).toFixed(2)} 秒`);
    console.log(`✅ 成功率: ${((passed / this.results.length) * 100).toFixed(1)}%`);
    
    console.log('\n📋 **详细测试结果**\n');
    
    this.results.forEach((result, index) => {
      const status = result.success ? '✅ 通过' : '❌ 失败';
      console.log(`${index + 1}. ${status} - ${result.name}`);
      
      if (result.details.responseTime) {
        console.log(`   响应时间: ${result.details.responseTime}ms`);
      }
      
      if (result.details.status) {
        console.log(`   状态: ${result.details.status}`);
      }
      
      if (result.details.resultCount !== undefined) {
        console.log(`   结果数: ${result.details.resultCount}`);
      }
      
      if (result.details.error) {
        console.log(`   错误: ${result.details.error}`);
      }
      
      if (result.details.data) {
        console.log(`   数据: ${JSON.stringify(result.details.data).substring(0, 100)}...`);
      }
      
      console.log('');
    });

    return {
      passed,
      failed,
      total: this.results.length,
      successRate: (passed / this.results.length) * 100,
      duration: duration / 1000
    };
  }
}

// 主测试函数
async function runTest() {
  const reporter = new TestReporter();
  
  console.log('🚀 开始ChatLLM-Web记忆系统测试\n');

  // 1. 服务器健康检查
  console.log('1️⃣  服务器健康检查...');
  const healthUrl = `${config.baseUrl}/api/memory/stats?userId=${config.userId}`;
  const healthResult = await makeRequest(healthUrl);
  
  if (healthResult.success && healthResult.data.success) {
    reporter.addResult('服务器健康检查', true, {
      responseTime: healthResult.responseTime,
      status: healthResult.status,
      resultCount: healthResult.data.stats?.totalMemories || 0
    });
    console.log(`✅ 服务器运行正常，用户有 ${healthResult.data.stats?.totalMemories || 0} 条记忆`);
  } else {
    reporter.addResult('服务器健康检查', false, {
      responseTime: healthResult.responseTime,
      error: healthResult.error || '服务器响应异常',
      status: healthResult.status
    });
    console.log('❌ 服务器健康检查失败');
  }

  // 2. 基础搜索测试
  console.log('\n2️⃣  基础记忆搜索测试...');
  for (const query of config.testQueries) {
    const searchUrl = `${config.baseUrl}/api/memory/search?userId=${config.userId}&query=${encodeURIComponent(query)}&limit=3`;
    const searchResult = await makeRequest(searchUrl);
    
    if (searchResult.success && searchResult.data.success) {
      const resultCount = searchResult.data.results?.length || 0;
      reporter.addResult(`基础搜索-${query}`, resultCount > 0, {
        responseTime: searchResult.responseTime,
        resultCount,
        status: searchResult.status
      });
      console.log(`   "${query}": ${resultCount > 0 ? '✅' : '⚠️'} 找到 ${resultCount} 条记忆`);
    } else {
      reporter.addResult(`基础搜索-${query}`, false, {
        responseTime: searchResult.responseTime,
        error: searchResult.error,
        status: searchResult.status
      });
      console.log(`   "${query}": ❌ 搜索失败`);
    }
  }

  // 3. 向量化状态检查
  console.log('\n3️⃣  向量化系统状态检查...');
  const vectorStatsUrl = `${config.baseUrl}/api/memory/vectorize?userId=${config.userId}&action=stats`;
  const vectorStatsResult = await makeRequest(vectorStatsUrl);
  
  if (vectorStatsResult.success && vectorStatsResult.data.success) {
    const stats = vectorStatsResult.data.userStats || {};
    reporter.addResult('向量化状态检查', true, {
      responseTime: vectorStatsResult.responseTime,
      status: vectorStatsResult.status,
      data: stats
    });
    console.log(`✅ 向量化系统就绪`);
    console.log(`   总记忆: ${stats.totalMemories}, 待向量化: ${stats.pendingVectorization}`);
  } else {
    reporter.addResult('向量化状态检查', false, {
      responseTime: vectorStatsResult.responseTime,
      error: vectorStatsResult.error,
      status: vectorStatsResult.status
    });
    console.log('❌ 向量化状态检查失败');
  }

  // 4. 向量化测试
  console.log('\n4️⃣  向量化功能测试...');
  const vectorTestUrl = `${config.baseUrl}/api/memory/vectorize?userId=${config.userId}&action=test`;
  const vectorTestResult = await makeRequest(vectorTestUrl);
  
  if (vectorTestResult.success && vectorTestResult.data.success) {
    reporter.addResult('向量化功能测试', true, {
      responseTime: vectorTestResult.responseTime,
      status: vectorTestResult.status,
      data: vectorTestResult.data.testResults
    });
    console.log('✅ 向量化功能测试通过');
  } else {
    reporter.addResult('向量化功能测试', false, {
      responseTime: vectorTestResult.responseTime,
      error: vectorTestResult.error,
      status: vectorTestResult.status
    });
    console.log('❌ 向量化功能测试失败');
  }

  // 5. 向量搜索测试
  console.log('\n5️⃣  向量搜索测试...');
  for (const query of config.testQueries.slice(0, 2)) {
    const vectorSearchUrl = `${config.baseUrl}/api/memory/vector-search?userId=${config.userId}&query=${encodeURIComponent(query)}&limit=3&mode=enhanced`;
    const vectorSearchResult = await makeRequest(vectorSearchUrl);
    
    if (vectorSearchResult.success && vectorSearchResult.data.success) {
      const resultCount = vectorSearchResult.data.results?.length || 0;
      const avgScore = vectorSearchResult.data.analysis?.avgScore || '0.000';
      reporter.addResult(`向量搜索-${query}`, resultCount > 0, {
        responseTime: vectorSearchResult.responseTime,
        resultCount,
        status: vectorSearchResult.status,
        data: { avgScore }
      });
      console.log(`   "${query}": ${resultCount > 0 ? '✅' : '⚠️'} 找到 ${resultCount} 条记忆，平均得分: ${avgScore}`);
    } else {
      reporter.addResult(`向量搜索-${query}`, false, {
        responseTime: vectorSearchResult.responseTime,
        error: vectorSearchResult.error,
        status: vectorSearchResult.status
      });
      console.log(`   "${query}": ❌ 向量搜索失败`);
    }
  }

  // 生成报告
  const summary = reporter.generateReport();
  
  // 系统建议
  console.log('🔍 **系统状态分析**');
  if (summary.successRate >= 80) {
    console.log('   ✅ 系统整体运行良好！');
  } else if (summary.successRate >= 60) {
    console.log('   ⚠️  系统基本正常，但有一些功能需要优化');
  } else {
    console.log('   ❌ 系统存在较多问题，需要检查配置');
  }
  
  console.log('\n📝 **下一步建议**');
  console.log('   1. 如果基础搜索正常，系统核心功能已就绪');
  console.log('   2. 向量化功能已准备好，可以集成OpenAI API');
  console.log('   3. 考虑添加更多测试记忆数据来验证搜索效果');
  console.log('   4. 监控API响应时间，优化性能瓶颈');
  
  console.log('\n' + '='.repeat(80));
  
  return summary;
}

// 执行测试
runTest().catch(error => {
  console.error('❌ 测试执行失败:', error);
  process.exit(1);
});
