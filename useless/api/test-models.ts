import { NextApiRequest, NextApiResponse } from 'next';
import { SUPPORTED_MODELS } from './chat';
import https from 'https';

// 开发环境SSL配置：忽略证书验证
const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_ENV !== 'development'
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const testResults = [];
  const apiUrl = process.env.OPENAI_API_BASE || 'https://api.laozhang.ai/v1/chat/completions';
  const apiKey = process.env.OPENAI_API_KEY || 'sk-fHiGcdKRdV7SykaZB0D755D91dEe48038f1aB0B7556fE2Fc';

  for (const [modelKey, modelValue] of Object.entries(SUPPORTED_MODELS)) {
    // 移除详细的控制台日志，减少噪音
    // console.log(`[Model Test] 测试模型: ${modelKey} (${modelValue})`);
    
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelValue,
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: '测试' }
          ],
          stream: false,
        }),
        // @ts-ignore - 开发环境SSL配置
        ...(process.env.NODE_ENV === 'development' && { agent: httpsAgent }),
      });

      if (response.ok) {
        const data = await response.json();
        // console.log(`[Model Test] ✅ ${modelKey}: 成功`);
        testResults.push({
          model: modelKey,
          status: 'success',
          message: '模型可用',
          response_length: data.choices?.[0]?.message?.content?.length || 0
        });
      } else {
        const errorText = await response.text();
        console.log(`[Model Test] ❌ ${modelKey}: 失败 - ${response.status}`);
        testResults.push({
          model: modelKey,
          status: 'error',
          message: `HTTP ${response.status}: ${errorText}`,
          response_length: 0
        });
      }
    } catch (error) {
      console.log(`[Model Test] ❌ ${modelKey}: 异常 - ${error}`);
      testResults.push({
        model: modelKey,
        status: 'error',
        message: error instanceof Error ? error.message : '未知错误',
        response_length: 0
      });
    }
  }

  // 简化终端显示，只在有错误时显示
  const hasErrors = testResults.some(result => result.status === 'error');
  if (hasErrors) {
    console.log('\n========== 模型测试汇总（仅显示错误）==========');
    testResults.forEach(result => {
      if (result.status === 'error') {
        console.log(`❌ ${result.model}: ${result.message}`);
      }
    });
    console.log('================================\n');
  }

  return res.status(200).json({
    success: true,
    timestamp: new Date().toISOString(),
    results: testResults
  });
} 