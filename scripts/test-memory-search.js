const { getMySQLMemoryDB } = require('../lib/memory/mysql-database');
const { getChineseNLPService } = require('../lib/memory/chinese-nlp-service');

async function testMemorySearch() {
  console.log('🧪 开始测试记忆搜索优化效果...\n');
  
  try {
    const mysqlDB = getMySQLMemoryDB();
    const nlpService = getChineseNLPService();
    
    // 测试查询列表
    const testQueries = [
      '请描述我的家庭关系',
      '我的个人情况',
      'QS公司1号员工的情况',
      '我的工作经历',
      '我的宠物',
      '我的技能和能力'
    ];
    
    for (const [index, query] of testQueries.entries()) {
      console.log(`\n📝 测试 ${index + 1}: "${query}"`);
      console.log('=' .repeat(60));
      
      // 1. 测试智能关键词提取
      console.log('🔍 关键词提取测试:');
      const keywords = await nlpService.extractKeywords(query);
      console.log(`提取的关键词: [${keywords.join(', ')}]`);
      
      // 2. 测试记忆搜索
      console.log('\n🔍 记忆搜索测试:');
      const results = await mysqlDB.searchMemories('default_user', query, 6);
      
      console.log(`搜索结果: ${results.length} 条记忆`);
      
      if (results.length > 0) {
        console.log('\n📋 搜索结果详情:');
        results.forEach((memory, i) => {
          console.log(`${i + 1}. [${memory.category}] 相关性=${memory.relevance_score} 重要性=${memory.importance}`);
          console.log(`   内容: "${memory.content.substring(0, 80)}..."`);
        });
      } else {
        console.log('⚠️ 没有找到相关记忆');
      }
      
      // 3. 测试向量搜索
      console.log('\n🧠 向量搜索测试:');
      try {
        const vectorResults = await mysqlDB.vectorSearch('default_user', query, 3, 0.8);
        console.log(`向量搜索结果: ${vectorResults.length} 条记忆`);
        
        if (vectorResults.length > 0) {
          vectorResults.forEach((memory, i) => {
            console.log(`${i + 1}. 相似性=${memory.similarity?.toFixed(3)} [${memory.category}]`);
            console.log(`   内容: "${memory.content.substring(0, 80)}..."`);
          });
        }
      } catch (vectorError) {
        console.log(`⚠️ 向量搜索失败: ${vectorError.message}`);
      }
    }
    
    // 4. 测试记忆统计
    console.log('\n📊 记忆统计测试:');
    const stats = await mysqlDB.getMemoryStats('default_user');
    console.log(`总记忆数: ${stats.totalMemories}`);
    console.log(`总类别数: ${stats.totalCategories}`);
    
    console.log('\n✅ 测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// 运行测试
testMemorySearch(); 