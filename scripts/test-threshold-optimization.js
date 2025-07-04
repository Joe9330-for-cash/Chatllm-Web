const { getMySQLMemoryDB } = require('../lib/memory/mysql-database');
const { getSmartMemoryManager } = require('../lib/memory/smart-memory-manager');
const { getEnhancedSearchEngine } = require('../lib/memory/enhanced-vector-search');

/**
 * 阈值优化验证测试
 * 专门测试阈值降低后的搜索性能和准确性
 */
async function testThresholdOptimization() {
  console.log('🚀 阈值优化验证测试');
  console.log('测试修复向量搜索阈值从0.7降低到0.3的效果');
  console.log('=' .repeat(60));
  
  const testCases = [
    {
      name: '1号员工测试（用户反馈问题）',
      query: '1号员工',
      description: '测试用户反馈的具体问题，应该能找到QS公司的员工信息'
    },
    {
      name: 'QS公司测试', 
      query: 'QS公司的员工情况',
      description: '测试公司相关信息搜索'
    },
    {
      name: '家庭关系测试',
      query: '我的家庭关系',
      description: '测试个人信息搜索'
    },
    {
      name: '工作经历测试',
      query: '我的工作经历和职业',
      description: '测试职业信息搜索'
    }
  ];

  try {
    const mysqlDB = getMySQLMemoryDB();
    const smartManager = getSmartMemoryManager();
    const enhancedSearch = getEnhancedSearchEngine();
    
    console.log('📊 开始阈值对比测试...\n');
    
    for (const [index, testCase] of testCases.entries()) {
      console.log(`🧪 测试 ${index + 1}: ${testCase.name}`);
      console.log(`📝 查询: "${testCase.query}"`);
      console.log(`🎯 描述: ${testCase.description}`);
      console.log('-'.repeat(50));
      
      // 1. 高阈值搜索（0.7）- 模拟修复前
      console.log('❌ 高阈值搜索 (0.7) - 修复前:');
      const highThresholdStart = Date.now();
      const highThresholdResults = await mysqlDB.vectorSearch('default_user', testCase.query, 10, 0.7);
      const highThresholdTime = Date.now() - highThresholdStart;
      
      console.log(`   耗时: ${highThresholdTime}ms`);
      console.log(`   结果: ${highThresholdResults.length} 条`);
      if (highThresholdResults.length > 0) {
        const maxSimilarity = Math.max(...highThresholdResults.map(r => r.similarity || 0));
        console.log(`   最高相似度: ${maxSimilarity.toFixed(3)}`);
        highThresholdResults.slice(0, 2).forEach((result, i) => {
          console.log(`   ${i+1}. [${result.category}] 相似度=${(result.similarity || 0).toFixed(3)} "${result.content.substring(0, 30)}..."`);
        });
      } else {
        console.log('   ⚠️ 未找到任何结果 - 这就是问题所在！');
      }
      
      // 2. 低阈值搜索（0.3）- 修复后
      console.log('\n✅ 低阈值搜索 (0.3) - 修复后:');
      const lowThresholdStart = Date.now();
      const lowThresholdResults = await mysqlDB.vectorSearch('default_user', testCase.query, 10, 0.3);
      const lowThresholdTime = Date.now() - lowThresholdStart;
      
      console.log(`   耗时: ${lowThresholdTime}ms`);
      console.log(`   结果: ${lowThresholdResults.length} 条`);
      if (lowThresholdResults.length > 0) {
        const avgSimilarity = lowThresholdResults.reduce((sum, r) => sum + (r.similarity || 0), 0) / lowThresholdResults.length;
        const maxSimilarity = Math.max(...lowThresholdResults.map(r => r.similarity || 0));
        console.log(`   平均相似度: ${avgSimilarity.toFixed(3)}`);
        console.log(`   最高相似度: ${maxSimilarity.toFixed(3)}`);
        
        lowThresholdResults.slice(0, 3).forEach((result, i) => {
          console.log(`   ${i+1}. [${result.category}] 相似度=${(result.similarity || 0).toFixed(3)} "${result.content.substring(0, 35)}..."`);
        });
      }
      
      // 3. 智能搜索测试
      console.log('\n🧠 智能搜索测试:');
      const smartStart = Date.now();
      const smartResult = await smartManager.smartSearch('default_user', testCase.query, 10);
      const smartTime = Date.now() - smartStart;
      
      console.log(`   耗时: ${smartTime}ms`);
      console.log(`   结果: ${smartResult.results.length} 条`);
      console.log(`   来源: ${smartResult.source}`);
      
      if (smartResult.results.length > 0) {
        smartResult.results.slice(0, 3).forEach((result, i) => {
          console.log(`   ${i+1}. [${result.category}] 相关性=${(result.relevanceScore || 0).toFixed(3)} "${result.content.substring(0, 35)}..."`);
        });
      }
      
      // 4. 改进效果分析
      console.log('\n📈 改进效果分析:');
      const improvement = lowThresholdResults.length - highThresholdResults.length;
      const improvementPercent = highThresholdResults.length > 0 
        ? ((improvement / highThresholdResults.length) * 100).toFixed(1)
        : (lowThresholdResults.length > 0 ? '∞' : '0');
      
      console.log(`   结果数量改进: +${improvement} 条 (${improvementPercent}%)`);
      console.log(`   高阈值问题: ${highThresholdResults.length === 0 ? '❌ 找不到结果' : '✅ 有结果但可能不全'}`);
      console.log(`   低阈值效果: ${lowThresholdResults.length > 0 ? '✅ 成功找到相关记忆' : '❌ 仍需优化'}`);
      console.log(`   智能搜索效果: ${smartResult.results.length > 0 ? '✅ 运行正常' : '❌ 需要检查'}`);
      
      console.log('\n' + '='.repeat(60) + '\n');
    }
    
    // 5. 总体优化效果汇总
    console.log('📊 阈值优化总结:');
    console.log('✅ 已完成的修复:');
    console.log('   ├─ mysql-database.ts: 向量搜索阈值 0.7 → 0.3');
    console.log('   ├─ hybrid-search.ts: 混合搜索阈值 0.7 → 0.3');
    console.log('   ├─ mysql-memory-manager.ts: 向量搜索阈值 0.7 → 0.3');
    console.log('   ├─ smart-memory-manager.ts: LLM调用阈值 0.7 → 0.3');
    console.log('   └─ enhanced-vector-search.ts: 进一步优化到 0.25');
    
    console.log('\n🎯 预期解决的问题:');
    console.log('   ✅ "1号员工"搜索问题');
    console.log('   ✅ 记忆拆分和理解偏差');
    console.log('   ✅ 向量化查询召回率低');
    console.log('   ✅ 相关记忆被过度过滤');
    
    console.log('\n🚀 测试完成！');
    console.log('💡 现在可以尝试询问"1号员工"或"QS公司员工"验证修复效果。');
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
    console.error('错误详情:', error.message);
    console.error('请检查数据库连接和相关服务状态');
  }
}

// 简化的快速测试
async function quickTest() {
  console.log('⚡ 快速验证测试');
  console.log('-'.repeat(40));
  
  try {
    const mysqlDB = getMySQLMemoryDB();
    
    const testQuery = '1号员工';
    console.log(`🔍 测试查询: "${testQuery}"`);
    
    // 对比高低阈值
    const highResults = await mysqlDB.vectorSearch('default_user', testQuery, 5, 0.7);
    const lowResults = await mysqlDB.vectorSearch('default_user', testQuery, 5, 0.3);
    
    console.log(`❌ 高阈值(0.7): ${highResults.length} 条结果`);
    console.log(`✅ 低阈值(0.3): ${lowResults.length} 条结果`);
    
    if (lowResults.length > highResults.length) {
      console.log('🎉 修复成功！现在能找到更多相关记忆了');
    } else if (lowResults.length === 0) {
      console.log('⚠️ 可能需要检查数据库中是否有相关记忆');
    }
    
  } catch (error) {
    console.error('❌ 快速测试失败:', error.message);
  }
}

// 执行测试
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--quick')) {
    quickTest().catch(console.error);
  } else {
    testThresholdOptimization().catch(console.error);
  }
}

module.exports = { testThresholdOptimization, quickTest }; 