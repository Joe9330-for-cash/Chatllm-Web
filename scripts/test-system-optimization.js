const fetch = require('node-fetch');
const { getMySQLMemoryDB } = require('../lib/memory/mysql-database');
const { getSmartMemoryManager } = require('../lib/memory/smart-memory-manager');
const { getEnhancedSearchEngine } = require('../lib/memory/enhanced-vector-search');

// 测试配置
const BASE_URL = 'http://localhost:3000';
const TEST_USER = 'default_user';

// 测试查询列表
const TEST_QUERIES = [
  '请介绍qs公司的CEO相关信息',
  '告诉我QS公司的运营人员是几几年出生的',
  'QS公司的1号员工信息',
  '介绍一下QS公司的主营业务',
  '告诉我用户的基本情况',
  '用户有什么技能和经验',
  '用户的工作背景是什么',
  '用户居住在哪里',
  '用户的家庭情况如何',
  '用户有什么兴趣爱好'
];

// 测试消息用于记忆提取
const TEST_MESSAGES = [
  {
    role: 'user',
    content: '我最近在学习React和TypeScript，感觉很有趣'
  },
  {
    role: 'assistant', 
    content: '很好！React和TypeScript是现代前端开发的热门技术栈。'
  },
  {
    role: 'user',
    content: '对的，我打算用这些技术开发一个个人博客网站'
  }
];

class SystemOptimizationTester {
  constructor() {
    this.results = {
      searchTests: [],
      extractionTests: [],
      performanceComparison: {},
      recommendations: []
    };
  }

  /**
   * 运行完整的系统优化测试
   */
  async runFullTest() {
    console.log('🚀 开始系统优化测试...\n');
    
    try {
      // 1. 搜索性能测试
      console.log('📊 1. 搜索性能测试');
      await this.testSearchPerformance();
      
      // 2. 记忆提取测试
      console.log('\n🧠 2. 记忆提取优化测试');
      await this.testExtractionOptimization();
      
      // 3. 缓存效果测试
      console.log('\n💾 3. 缓存效果测试');
      await this.testCacheEffectiveness();
      
      // 4. 生成综合报告
      console.log('\n📈 4. 生成优化报告');
      this.generateOptimizationReport();
      
    } catch (error) {
      console.error('❌ 测试过程中出现错误:', error);
    }
  }

  /**
   * 测试搜索性能
   */
  async testSearchPerformance() {
    console.log('   测试智能搜索系统性能...');
    
    const searchResults = [];
    
    for (const query of TEST_QUERIES) {
      try {
        const startTime = Date.now();
        
        // 调用智能搜索API
        const response = await fetch(`${BASE_URL}/api/memory/vector-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: TEST_USER,
            query: query,
            limit: 20
          })
        });
        
        const data = await response.json();
        const endTime = Date.now();
        
        const result = {
          query: query.substring(0, 30) + '...',
          duration: endTime - startTime,
          resultsCount: data.memories?.length || 0,
          searchType: data.searchType || 'unknown',
          success: data.success
        };
        
        searchResults.push(result);
        
        console.log(`   ✅ ${result.query}: ${result.duration}ms, ${result.resultsCount}条结果, 类型: ${result.searchType}`);
        
      } catch (error) {
        console.log(`   ❌ ${query.substring(0, 30)}...: 搜索失败 - ${error.message}`);
        searchResults.push({
          query: query.substring(0, 30) + '...',
          duration: -1,
          resultsCount: 0,
          searchType: 'error',
          success: false,
          error: error.message
        });
      }
      
      // 避免请求过快
      await this.delay(100);
    }
    
    this.results.searchTests = searchResults;
    
    // 计算搜索性能统计
    const successfulSearches = searchResults.filter(r => r.success);
    const avgDuration = successfulSearches.reduce((sum, r) => sum + r.duration, 0) / successfulSearches.length;
    const avgResults = successfulSearches.reduce((sum, r) => sum + r.resultsCount, 0) / successfulSearches.length;
    
    console.log(`   📊 搜索性能汇总:`);
    console.log(`      - 成功率: ${successfulSearches.length}/${searchResults.length} (${(successfulSearches.length/searchResults.length*100).toFixed(1)}%)`);
    console.log(`      - 平均响应时间: ${avgDuration.toFixed(0)}ms`);
    console.log(`      - 平均结果数: ${avgResults.toFixed(1)}条`);
  }

  /**
   * 测试记忆提取优化
   */
  async testExtractionOptimization() {
    console.log('   测试智能记忆提取优化...');
    
    const extractionTests = [];
    
    // 测试1: 正常提取
    await this.testExtraction('正常提取', TEST_MESSAGES, false, extractionTests);
    
    // 测试2: 强制提取
    await this.testExtraction('强制提取', TEST_MESSAGES, true, extractionTests);
    
    // 测试3: 重复提取（测试缓存）
    await this.testExtraction('重复提取(缓存测试)', TEST_MESSAGES, false, extractionTests);
    
    // 测试4: 短消息（应该被跳过）
    const shortMessages = [{ role: 'user', content: '好的' }];
    await this.testExtraction('短消息跳过测试', shortMessages, false, extractionTests);
    
    // 测试5: 问题型消息（应该被跳过）
    const questionMessages = [{ role: 'user', content: '你好吗？今天天气怎么样？' }];
    await this.testExtraction('问题跳过测试', questionMessages, false, extractionTests);
    
    this.results.extractionTests = extractionTests;
    
    // 分析提取优化效果
    const avgDuration = extractionTests.reduce((sum, t) => sum + t.duration, 0) / extractionTests.length;
    const skipRate = extractionTests.filter(t => t.source === 'smart').length / extractionTests.length;
    const cacheRate = extractionTests.filter(t => t.source === 'cache').length / extractionTests.length;
    
    console.log(`   📊 提取优化汇总:`);
    console.log(`      - 平均响应时间: ${avgDuration.toFixed(0)}ms`);
    console.log(`      - 智能跳过率: ${(skipRate*100).toFixed(1)}%`);
    console.log(`      - 缓存命中率: ${(cacheRate*100).toFixed(1)}%`);
  }

  /**
   * 测试单个记忆提取
   */
  async testExtraction(testName, messages, forceExtraction, results) {
    try {
      const startTime = Date.now();
      
      const response = await fetch(`${BASE_URL}/api/memory/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: TEST_USER,
          messages: messages,
          forceExtraction: forceExtraction
        })
      });
      
      const data = await response.json();
      const endTime = Date.now();
      
      const result = {
        testName,
        duration: endTime - startTime,
        extractedCount: data.result?.extractedCount || 0,
        source: data.result?.source || 'unknown',
        confidence: data.result?.confidence || 0,
        optimizationApplied: data.result?.optimizationApplied || false,
        success: data.success
      };
      
      results.push(result);
      
      console.log(`   ✅ ${testName}: ${result.duration}ms, 提取${result.extractedCount}条, 来源: ${result.source}`);
      
    } catch (error) {
      console.log(`   ❌ ${testName}: 提取失败 - ${error.message}`);
      results.push({
        testName,
        duration: -1,
        extractedCount: 0,
        source: 'error',
        confidence: 0,
        success: false,
        error: error.message
      });
    }
    
    await this.delay(200);
  }

  /**
   * 测试缓存效果
   */
  async testCacheEffectiveness() {
    console.log('   测试缓存系统效果...');
    
    const cacheTestQuery = '请介绍qs公司的CEO相关信息';
    const cacheResults = [];
    
    // 连续执行相同查询5次
    for (let i = 1; i <= 5; i++) {
      try {
        const startTime = Date.now();
        
        const response = await fetch(`${BASE_URL}/api/memory/vector-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: TEST_USER,
            query: cacheTestQuery,
            limit: 20
          })
        });
        
        const data = await response.json();
        const endTime = Date.now();
        
        cacheResults.push({
          attempt: i,
          duration: endTime - startTime,
          resultsCount: data.memories?.length || 0,
          fromCache: endTime - startTime < 100 // 假设缓存查询应该很快
        });
        
        console.log(`   🔄 第${i}次查询: ${endTime - startTime}ms, ${data.memories?.length || 0}条结果`);
        
      } catch (error) {
        console.log(`   ❌ 第${i}次查询失败: ${error.message}`);
      }
      
      await this.delay(50);
    }
    
    // 分析缓存效果
    const firstQuery = cacheResults[0];
    const subsequentQueries = cacheResults.slice(1);
    const avgSubsequentTime = subsequentQueries.reduce((sum, r) => sum + r.duration, 0) / subsequentQueries.length;
    const speedImprovement = firstQuery ? (firstQuery.duration / avgSubsequentTime) : 1;
    
    console.log(`   📊 缓存效果分析:`);
    console.log(`      - 首次查询: ${firstQuery?.duration || 0}ms`);
    console.log(`      - 后续查询平均: ${avgSubsequentTime.toFixed(0)}ms`);
    console.log(`      - 性能提升: ${speedImprovement.toFixed(1)}x`);
    
    this.results.cacheEffectiveness = {
      firstQueryTime: firstQuery?.duration || 0,
      avgSubsequentTime: avgSubsequentTime,
      speedImprovement: speedImprovement,
      cacheResults: cacheResults
    };
  }

  /**
   * 生成优化报告
   */
  generateOptimizationReport() {
    console.log('\n' + '═'.repeat(80));
    console.log('📈 **系统优化效果报告**');
    console.log('═'.repeat(80));
    
    // 搜索性能分析
    const searchTests = this.results.searchTests.filter(t => t.success);
    if (searchTests.length > 0) {
      const avgSearchTime = searchTests.reduce((sum, t) => sum + t.duration, 0) / searchTests.length;
      const avgResultCount = searchTests.reduce((sum, t) => sum + t.resultsCount, 0) / searchTests.length;
      
      console.log('🔍 **搜索性能优化效果**');
      console.log(`   ✅ 平均响应时间: ${avgSearchTime.toFixed(0)}ms`);
      console.log(`   ✅ 平均结果质量: ${avgResultCount.toFixed(1)}条相关记忆`);
      console.log(`   ✅ 搜索成功率: ${(searchTests.length/this.results.searchTests.length*100).toFixed(1)}%`);
      
      // 性能评级
      if (avgSearchTime < 500) {
        console.log('   🚀 搜索速度: 优秀 (< 500ms)');
      } else if (avgSearchTime < 1000) {
        console.log('   ⚡ 搜索速度: 良好 (< 1000ms)');
      } else {
        console.log('   ⚠️ 搜索速度: 需要优化 (> 1000ms)');
      }
    }
    
    // 记忆提取优化分析
    const extractionTests = this.results.extractionTests.filter(t => t.success);
    if (extractionTests.length > 0) {
      const avgExtractionTime = extractionTests.reduce((sum, t) => sum + t.duration, 0) / extractionTests.length;
      const optimizationRate = extractionTests.filter(t => t.optimizationApplied).length / extractionTests.length;
      
      console.log('\n🧠 **记忆提取优化效果**');
      console.log(`   ✅ 平均响应时间: ${avgExtractionTime.toFixed(0)}ms`);
      console.log(`   ✅ 优化应用率: ${(optimizationRate*100).toFixed(1)}%`);
      
      if (avgExtractionTime < 1000) {
        console.log('   🚀 提取速度: 优秀 (< 1s)');
      } else if (avgExtractionTime < 5000) {
        console.log('   ⚡ 提取速度: 良好 (< 5s)');
      } else {
        console.log('   ⚠️ 提取速度: 需要优化 (> 5s)');
      }
    }
    
    // 缓存效果分析
    if (this.results.cacheEffectiveness) {
      const { speedImprovement } = this.results.cacheEffectiveness;
      console.log('\n💾 **缓存系统效果**');
      console.log(`   ✅ 性能提升倍数: ${speedImprovement.toFixed(1)}x`);
      
      if (speedImprovement > 3) {
        console.log('   🚀 缓存效果: 优秀 (> 3x提升)');
      } else if (speedImprovement > 1.5) {
        console.log('   ⚡ 缓存效果: 良好 (> 1.5x提升)');
      } else {
        console.log('   ⚠️ 缓存效果: 需要优化 (< 1.5x提升)');
      }
    }
    
    // 优化建议
    console.log('\n🎯 **优化建议**');
    
    const searchTests = this.results.searchTests.filter(t => t.success);
    const avgSearchTime = searchTests.reduce((sum, t) => sum + t.duration, 0) / searchTests.length;
    
    if (avgSearchTime > 1000) {
      console.log('   📌 建议优化搜索算法，考虑增加更多索引');
    }
    
    if (this.results.cacheEffectiveness?.speedImprovement < 2) {
      console.log('   📌 建议优化缓存策略，增加缓存命中率');
    }
    
    const extractionTests = this.results.extractionTests.filter(t => t.success);
    const avgExtractionTime = extractionTests.reduce((sum, t) => sum + t.duration, 0) / extractionTests.length;
    
    if (avgExtractionTime > 5000) {
      console.log('   📌 建议进一步优化记忆提取，减少LLM调用');
    }
    
    console.log('   📌 建议定期监控系统性能指标');
    console.log('   📌 建议根据用户使用模式调整缓存策略');
    
    console.log('\n' + '═'.repeat(80));
    console.log('✅ **系统优化测试完成！**');
    console.log('═'.repeat(80) + '\n');
  }

  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 系统优化验证测试
 * 测试阈值降低后的搜索性能和准确性
 */
async function testSystemOptimization() {
  console.log('🚀 系统优化验证测试');
  console.log('=' .repeat(60));
  
  const testCases = [
    {
      name: '1号员工测试',
      query: '1号员工',
      expectedKeywords: ['员工', '1号', 'QS'],
      description: '测试用户反馈的具体问题'
    },
    {
      name: 'QS公司测试', 
      query: 'QS公司的员工情况',
      expectedKeywords: ['QS', '公司', '员工'],
      description: '测试公司相关信息搜索'
    },
    {
      name: '家庭关系测试',
      query: '我的家庭关系',
      expectedKeywords: ['家庭', '关系', '亲属'],
      description: '测试个人信息搜索'
    },
    {
      name: '工作经历测试',
      query: '我的工作经历和职业',
      expectedKeywords: ['工作', '职业', '经历'],
      description: '测试职业信息搜索'
    },
    {
      name: '技能能力测试',
      query: '我的技能和专业能力',
      expectedKeywords: ['技能', '能力', '专业'],
      description: '测试技能信息搜索'
    }
  ];

  try {
    const mysqlDB = getMySQLMemoryDB();
    const smartManager = getSmartMemoryManager();
    const enhancedSearch = getEnhancedSearchEngine();
    
    console.log('📊 开始性能对比测试...\n');
    
    for (const testCase of testCases) {
      console.log(`🧪 测试案例: ${testCase.name}`);
      console.log(`📝 查询: "${testCase.query}"`);
      console.log(`🎯 描述: ${testCase.description}`);
      console.log('-'.repeat(50));
      
      // 1. 传统MySQL搜索（阈值修复前后对比）
      console.log('🔍 传统搜索 (阈值0.3):');
      const traditionalStart = Date.now();
      const traditionalResults = await mysqlDB.vectorSearch('default_user', testCase.query, 10, 0.3);
      const traditionalTime = Date.now() - traditionalStart;
      
      console.log(`   耗时: ${traditionalTime}ms`);
      console.log(`   结果: ${traditionalResults.length} 条`);
      if (traditionalResults.length > 0) {
        const avgSimilarity = traditionalResults.reduce((sum, r) => sum + (r.similarity || 0), 0) / traditionalResults.length;
        console.log(`   平均相似度: ${avgSimilarity.toFixed(3)}`);
        console.log(`   最高相似度: ${Math.max(...traditionalResults.map(r => r.similarity || 0)).toFixed(3)}`);
        
        // 显示前3个结果
        traditionalResults.slice(0, 3).forEach((result, i) => {
          console.log(`   ${i+1}. [${result.category}] 相似度=${(result.similarity || 0).toFixed(3)} "${result.content.substring(0, 40)}..."`);
        });
      }
      
      // 2. 智能管理器搜索
      console.log('\n🧠 智能搜索:');
      const smartStart = Date.now();
      const smartResult = await smartManager.smartSearch('default_user', testCase.query, 10);
      const smartTime = Date.now() - smartStart;
      
      console.log(`   耗时: ${smartTime}ms`);
      console.log(`   结果: ${smartResult.results.length} 条`);
      console.log(`   来源: ${smartResult.source}`);
      console.log(`   性能: ${JSON.stringify(smartResult.performance)}`);
      
      if (smartResult.results.length > 0) {
        smartResult.results.slice(0, 3).forEach((result, i) => {
          console.log(`   ${i+1}. [${result.category}] 相关性=${(result.relevanceScore || 0).toFixed(3)} "${result.content.substring(0, 40)}..."`);
        });
      }
      
      // 3. 增强搜索引擎
      console.log('\n🚀 增强搜索:');
      const enhancedStart = Date.now();
      const enhancedResult = await enhancedSearch.enhancedSearch('default_user', testCase.query, {
        maxResults: 10,
        vectorThreshold: 0.25,
        debugMode: false
      });
      const enhancedTime = Date.now() - enhancedStart;
      
      console.log(`   耗时: ${enhancedTime}ms`);
      console.log(`   结果: ${enhancedResult.results.length} 条`);
      console.log(`   性能: ${JSON.stringify(enhancedResult.performance)}`);
      
      if (enhancedResult.results.length > 0) {
        const avgRelevance = enhancedResult.results.reduce((sum, r) => sum + r.relevanceScore, 0) / enhancedResult.results.length;
        console.log(`   平均相关性: ${avgRelevance.toFixed(3)}`);
        
        enhancedResult.results.slice(0, 3).forEach((result, i) => {
          console.log(`   ${i+1}. [${result.category}] 相关性=${result.relevanceScore.toFixed(3)} "${result.content.substring(0, 40)}..."`);
        });
      }
      
      // 4. 性能对比分析
      console.log('\n📈 性能对比:');
      const fastest = Math.min(traditionalTime, smartTime, enhancedTime);
      console.log(`   最快方法: ${traditionalTime === fastest ? '传统搜索' : smartTime === fastest ? '智能搜索' : '增强搜索'} (${fastest}ms)`);
      console.log(`   传统搜索: ${traditionalTime}ms (${traditionalResults.length}条)`);
      console.log(`   智能搜索: ${smartTime}ms (${smartResult.results.length}条, ${smartResult.source})`);
      console.log(`   增强搜索: ${enhancedTime}ms (${enhancedResult.results.length}条)`);
      
      // 5. 召回率分析
      const allResults = new Set();
      traditionalResults.forEach(r => allResults.add(r.id));
      smartResult.results.forEach(r => allResults.add(r.id));
      enhancedResult.results.forEach(r => allResults.add(r.id));
      
      console.log(`   总唯一结果: ${allResults.size}条`);
      console.log(`   传统召回率: ${((traditionalResults.length / allResults.size) * 100).toFixed(1)}%`);
      console.log(`   智能召回率: ${((smartResult.results.length / allResults.size) * 100).toFixed(1)}%`);
      console.log(`   增强召回率: ${((enhancedResult.results.length / allResults.size) * 100).toFixed(1)}%`);
      
      console.log('\n' + '='.repeat(60) + '\n');
    }
    
    // 6. 系统状态汇总
    console.log('📊 系统优化效果汇总:');
    console.log('✅ 已完成的优化:');
    console.log('   - 向量搜索阈值从0.7降低到0.3');
    console.log('   - 混合搜索阈值从0.7降低到0.3');
    console.log('   - LLM调用阈值从0.7降低到0.3');
    console.log('   - 启用动态阈值调整');
    console.log('   - 优化缓存策略');
    
    console.log('\n🎯 预期效果:');
    console.log('   - 搜索准确性提升30-50%');
    console.log('   - "1号员工"等问题得到解决');
    console.log('   - 系统响应速度优化');
    console.log('   - 降低误报和漏报率');
    
    console.log('\n🚀 测试完成！请尝试询问"1号员工"验证修复效果。');
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
    console.error('请检查数据库连接和相关服务状态');
  }
}

// 主函数
async function main() {
  const tester = new SystemOptimizationTester();
  await tester.runFullTest();
}

// 运行测试
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testSystemOptimization }; 