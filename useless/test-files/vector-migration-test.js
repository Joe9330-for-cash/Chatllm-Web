#!/usr/bin/env node

const http = require('http');
const { URL } = require('url');

// 配置
const config = {
  baseUrl: 'http://localhost:3000',
  userId: 'default_user'
};

// HTTP请求工具
function makeRequest(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const parsedUrl = new URL(url);
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      timeout: 30000 // 向量化可能需要更长时间
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
            rawData: data.substring(0, 300)
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

// 向量化测试流程
async function runVectorMigrationTest() {
  console.log('🚀 开始向量化系统迁移和测试\n');

  // 1. 检查服务器状态
  console.log('1️⃣  检查服务器状态...');
  const healthCheck = await makeRequest(`${config.baseUrl}/api/memory/stats?userId=${config.userId}`);
  
  if (!healthCheck.success) {
    console.log('❌ 服务器不可用，停止测试');
    return;
  }

  const originalMemoryCount = healthCheck.data?.stats?.totalMemories || 0;
  console.log(`✅ 服务器正常，发现 ${originalMemoryCount} 条原始记忆`);

  // 2. 检查向量化状态
  console.log('\n2️⃣  检查向量化系统状态...');
  const vectorStats = await makeRequest(`${config.baseUrl}/api/memory/vectorize?userId=${config.userId}&action=stats`);
  
  if (vectorStats.success) {
    const stats = vectorStats.data.userStats;
    console.log(`📊 向量化状态:`);
    console.log(`   原始记忆: ${stats.totalRegularMemories}`);
    console.log(`   向量记忆: ${stats.totalVectorMemories}`);
    console.log(`   已向量化: ${stats.vectorizedMemories}`);
    console.log(`   待迁移: ${stats.pendingVectorization}`);
    console.log(`   向量化率: ${stats.vectorizationRate}`);
  } else {
    console.log('⚠️  获取向量化状态失败');
  }

  // 3. 测试嵌入服务
  console.log('\n3️⃣  测试向量化功能...');
  const vectorTest = await makeRequest(`${config.baseUrl}/api/memory/vectorize?userId=${config.userId}&action=test`);
  
  if (vectorTest.success && vectorTest.data.success) {
    const testResult = vectorTest.data.testResults;
    console.log('✅ 向量化功能测试通过');
    console.log(`   测试记忆: ${testResult.content}`);
    console.log(`   向量维度: ${testResult.vectorDimensions}`);
    console.log(`   连接测试: ${testResult.connectionTest.success ? '成功' : '失败'}`);
    console.log(`   嵌入模型: ${testResult.embeddingModel.model}`);
  } else {
    console.log('❌ 向量化功能测试失败');
    console.log('   错误:', vectorTest.data?.error || vectorTest.error);
  }

  // 4. 执行数据迁移
  if (originalMemoryCount > 0) {
    console.log('\n4️⃣  开始数据迁移...');
    console.log('⏳ 正在向量化现有记忆数据，请稍候...');
    
    const migrationStart = Date.now();
    const migration = await makeRequest(`${config.baseUrl}/api/memory/vectorize?userId=${config.userId}&action=migrate`);
    const migrationTime = Date.now() - migrationStart;
    
    if (migration.success && migration.data.success) {
      const summary = migration.data.summary;
      console.log('✅ 数据迁移完成！');
      console.log(`   处理时间: ${(migrationTime / 1000).toFixed(2)} 秒`);
      console.log(`   成功迁移: ${summary.successful}/${summary.total} 条记忆`);
      console.log(`   成功率: ${summary.successRate}`);
      console.log(`   失败数: ${summary.failed}`);
      
      // 显示迁移详情
      if (migration.data.migrationResults) {
        console.log('\n📋 迁移详情:');
        migration.data.migrationResults.slice(0, 3).forEach((result, index) => {
          console.log(`   ${index + 1}. ${result.success ? '✅' : '❌'} ${result.content}`);
          if (result.success) {
            console.log(`      向量ID: ${result.vectorId}, 维度: ${result.vectorDimensions}`);
          } else {
            console.log(`      错误: ${result.error}`);
          }
        });
        
        if (migration.data.migrationResults.length > 3) {
          console.log(`   ... 还有 ${migration.data.migrationResults.length - 3} 条记录`);
        }
      }
    } else {
      console.log('❌ 数据迁移失败');
      console.log('   错误:', migration.data?.error || migration.error);
    }
  } else {
    console.log('\n4️⃣  跳过数据迁移 (无原始数据)');
  }

  // 5. 测试向量搜索
  console.log('\n5️⃣  测试向量搜索功能...');
  const testQueries = ['王大拿', '编程', '年龄', '个人信息'];
  
  for (const query of testQueries) {
    console.log(`\n�� 测试查询: "${query}"`);
    
    // 测试不同搜索模式
    const modes = ['keyword', 'vector', 'hybrid'];
    
    for (const mode of modes) {
      const searchUrl = `${config.baseUrl}/api/memory/vector-search?userId=${config.userId}&query=${encodeURIComponent(query)}&mode=${mode}&limit=3`;
      const searchResult = await makeRequest(searchUrl);
      
      if (searchResult.success && searchResult.data.success) {
        const results = searchResult.data.results;
        const analysis = searchResult.data.analysis;
        
        console.log(`   ${mode}搜索: ${results.length} 条结果, 平均分数: ${analysis.avgScore}`);
        
        if (results.length > 0) {
          results.slice(0, 1).forEach(result => {
            console.log(`     - ${result.memory.content.substring(0, 40)}... (${result.relevanceScore.toFixed(3)})`);
          });
        }
      } else {
        console.log(`   ${mode}搜索: ❌ 失败`);
      }
    }
  }

  // 6. 最终状态检查
  console.log('\n6️⃣  最终状态检查...');
  const finalStats = await makeRequest(`${config.baseUrl}/api/memory/vectorize?userId=${config.userId}&action=stats`);
  
  if (finalStats.success) {
    const stats = finalStats.data.userStats;
    console.log(`📊 最终向量化状态:`);
    console.log(`   向量记忆总数: ${stats.totalVectorMemories}`);
    console.log(`   完全向量化: ${stats.vectorizedMemories}`);
    console.log(`   向量化率: ${stats.vectorizationRate}`);
    console.log(`   分类分布: ${JSON.stringify(stats.categories)}`);
  }

  // 7. 性能建议
  console.log('\n🎯 系统建议:');
  if (originalMemoryCount > 0) {
    console.log('   ✅ 向量化迁移已完成，可以使用混合搜索模式');
    console.log('   🚀 推荐在聊天中启用智能记忆调取功能');
    console.log('   🔍 建议使用hybrid模式获得最佳搜索效果');
  } else {
    console.log('   📝 建议添加一些记忆数据来测试向量化功能');
    console.log('   💡 可以通过聊天对话自动提取记忆');
  }
  
  console.log('   🔧 可以通过API调整搜索权重和阈值优化效果');
  console.log('   📊 定期检查向量化状态和搜索性能');

  console.log('\n✅ 向量化系统测试完成！');
}

// 执行测试
runVectorMigrationTest().catch(error => {
  console.error('❌ 测试执行失败:', error);
  process.exit(1);
});
