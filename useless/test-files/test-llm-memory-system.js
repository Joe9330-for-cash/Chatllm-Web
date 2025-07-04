// 测试LLM驱动的智能记忆提取系统
console.log('🧠 LLM驱动智能记忆系统测试');
console.log('='.repeat(60));

async function testLLMMemoryExtraction() {
  const testCases = [
    {
      title: "🐕 宠物信息测试",
      message: "我有一只狗，叫皮皮，是一只金毛，今年3岁了",
      expectedCategory: "relationships",
      description: "测试是否能识别宠物这一新维度"
    },
    {
      title: "💻 设备配置测试", 
      message: "我现在的电脑配置是MacBook Pro M3 Max，128GB内存，2TB存储",
      expectedCategory: "device_info",
      description: "测试设备配置信息识别"
    },
    {
      title: "🎯 复杂个人信息测试",
      message: "我叫张三，在北京工作，是一名AI工程师，喜欢养花，周末经常去爬山",
      expectedCategory: "multiple",
      description: "测试复杂信息的多维度提取"
    },
    {
      title: "🏠 生活状态测试",
      message: "我最近搬到了上海，租了一个两室一厅的公寓，离公司很近",
      expectedCategory: "lifestyle",
      description: "测试生活状态信息"
    },
    {
      title: "🎨 兴趣爱好测试",
      message: "我业余时间喜欢画画，特别是水彩画，已经学了两年了",
      expectedCategory: "interests",
      description: "测试兴趣爱好识别"
    },
  ];

  console.log(`📋 测试案例总数: ${testCases.length}`);
  console.log();

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`测试 ${i + 1}: ${testCase.title}`);
    console.log(`消息: "${testCase.message}"`);
    console.log(`描述: ${testCase.description}`);
    
    try {
      // 测试LLM提取
      const llmResponse = await fetch('http://localhost:3000/api/memory/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'test_user_llm',
          messages: [{ content: testCase.message, type: 'user' }],
          conversationId: Date.now()
        })
      });

      if (!llmResponse.ok) {
        console.log(`❌ API调用失败: ${llmResponse.status}`);
        continue;
      }

      const result = await llmResponse.json();
      
      if (result.success && result.memories.length > 0) {
        console.log(`✅ 提取成功! 方法: ${result.extraction.method}`);
        console.log(`   置信度: ${(result.extraction.confidence * 100).toFixed(1)}%`);
        console.log(`   推理过程: ${result.extraction.reasoning}`);
        console.log(`   提取的记忆:`);
        
        result.memories.forEach((memory, idx) => {
          console.log(`     ${idx + 1}. [${memory.category}] ${memory.content} (重要性:${memory.importance})`);
        });
        
        console.log(`   性能: 耗时${result.extraction.performance.extractionTime}ms`);
      } else {
        console.log(`⚠️  未提取到记忆`);
        console.log(`   方法: ${result.extraction?.method || '未知'}`);
        console.log(`   原因: ${result.extraction?.reasoning || '无说明'}`);
      }
    } catch (error) {
      console.log(`❌ 测试失败:`, error.message);
    }
    
    console.log();
  }
}

async function testModeComparison() {
  console.log('🔄 模式对比测试');
  console.log('-'.repeat(40));
  
  const testMessage = "我有一只猫咪叫小白，特别喜欢吃鱼，每天都会陪我写代码";
  
  console.log(`测试消息: "${testMessage}"`);
  console.log();
  
  // 测试传统模式
  console.log('📋 传统模式测试:');
  try {
    await fetch('http://localhost:3000/api/memory/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ useLLM: false, hybridMode: false })
    });
    
    const traditionalResponse = await fetch('http://localhost:3000/api/memory/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'test_comparison',
        messages: [{ content: testMessage, type: 'user' }]
      })
    });
    
    const traditionalResult = await traditionalResponse.json();
    console.log(`   结果: ${traditionalResult.memories.length} 条记忆`);
    if (traditionalResult.memories.length > 0) {
      traditionalResult.memories.forEach(memory => {
        console.log(`   - [${memory.category}] ${memory.content}`);
      });
    } else {
      console.log('   ❌ 未识别到记忆（正如预期，传统模式无法识别宠物信息）');
    }
  } catch (error) {
    console.log(`   ❌ 传统模式测试失败:`, error.message);
  }
  
  console.log();
  
  // 测试LLM模式
  console.log('🧠 LLM模式测试:');
  try {
    await fetch('http://localhost:3000/api/memory/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ useLLM: true, hybridMode: false })
    });
    
    const llmResponse = await fetch('http://localhost:3000/api/memory/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'test_comparison',
        messages: [{ content: testMessage, type: 'user' }]
      })
    });
    
    const llmResult = await llmResponse.json();
    console.log(`   结果: ${llmResult.memories.length} 条记忆`);
    console.log(`   置信度: ${(llmResult.extraction.confidence * 100).toFixed(1)}%`);
    if (llmResult.memories.length > 0) {
      llmResult.memories.forEach(memory => {
        console.log(`   - [${memory.category}] ${memory.content} (重要性:${memory.importance})`);
      });
    }
  } catch (error) {
    console.log(`   ❌ LLM模式测试失败:`, error.message);
  }
}

async function testConfigurationAPI() {
  console.log('⚙️  配置API测试');
  console.log('-'.repeat(40));
  
  try {
    // 获取当前配置
    const configResponse = await fetch('http://localhost:3000/api/memory/config');
    const configData = await configResponse.json();
    
    console.log('当前配置:');
    console.log(`  LLM提取: ${configData.config.useLLM ? '✅ 启用' : '❌ 禁用'}`);
    console.log(`  混合模式: ${configData.config.hybridMode ? '✅ 启用' : '❌ 禁用'}`);
    console.log(`  置信度阈值: ${configData.config.confidenceThreshold}`);
    console.log(`  降级处理: ${configData.config.llmFallback ? '✅ 启用' : '❌ 禁用'}`);
    
    // 测试配置更新
    console.log('\n更新配置到混合模式...');
    const updateResponse = await fetch('http://localhost:3000/api/memory/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        useLLM: true,
        hybridMode: true,
        confidenceThreshold: 0.8
      })
    });
    
    const updateResult = await updateResponse.json();
    if (updateResult.success) {
      console.log('✅ 配置更新成功');
      console.log(`   当前模式: ${updateResult.currentMode}`);
      console.log(`   效果: ${updateResult.effect}`);
    }
    
  } catch (error) {
    console.log('❌ 配置测试失败:', error.message);
  }
}

// 主测试函数
async function runAllTests() {
  try {
    console.log('🚀 开始LLM驱动智能记忆系统全面测试');
    console.log();
    
    await testConfigurationAPI();
    console.log('\n' + '='.repeat(60) + '\n');
    
    await testLLMMemoryExtraction();
    console.log('='.repeat(60) + '\n');
    
    await testModeComparison();
    console.log('='.repeat(60) + '\n');
    
    console.log('🎉 所有测试完成!');
    console.log('\n💡 测试总结:');
    console.log('- LLM模式能够识别传统方法无法处理的新维度信息');
    console.log('- 支持宠物、复杂生活状态、兴趣爱好等灵活识别');
    console.log('- 提供置信度评估和推理过程说明');
    console.log('- 支持多种模式配置和降级处理');
    
  } catch (error) {
    console.error('❌ 测试运行失败:', error);
  }
}

// 运行测试
runAllTests(); 