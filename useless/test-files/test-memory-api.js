const { exec } = require('child_process');

console.log('=== 记忆功能API测试 ===\n');

// 测试记忆提取
const testData = {
  userId: 'test_user_001',
  messages: [
    { content: '你好，我叫张三，我今年25岁', type: 'user' },
    { content: '我在北京工作，是一名软件工程师', type: 'user' }
  ],
  conversationId: 1
};

console.log('测试数据:', JSON.stringify(testData, null, 2));

// 使用 curl 测试
const curlCommand = `curl -s -X POST http://localhost:3000/api/memory/extract \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(testData)}'`;

console.log('\n执行命令:', curlCommand);

exec(curlCommand, (error, stdout, stderr) => {
  if (error) {
    console.error('执行错误:', error);
    return;
  }
  if (stderr) {
    console.error('错误输出:', stderr);
    return;
  }
  
  console.log('\n响应结果:');
  try {
    const result = JSON.parse(stdout);
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.log('原始响应:', stdout);
  }
});
