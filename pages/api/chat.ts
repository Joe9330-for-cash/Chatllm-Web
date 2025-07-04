import { NextApiRequest, NextApiResponse } from 'next';
import https from 'https';

// 开发环境SSL配置：忽略证书验证
const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_ENV !== 'development'
});

// 支持的模型列表
export const SUPPORTED_MODELS = {
  'chatgpt-4o-latest': 'chatgpt-4o-latest',
  'deepseek-r1': 'deepseek-r1', 
  'gemini-2.5-pro': 'gemini-2.5-pro',
  'claude-3-7-sonnet-latest': 'claude-3-7-sonnet-latest',
} as const;

export type SupportedModel = keyof typeof SUPPORTED_MODELS;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  model: SupportedModel;
  messages: ChatMessage[];
  stream?: boolean;
}

interface ChatResponse {
  choices: {
    message: {
      content: string;
      role: string;
    };
  }[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { model, messages, stream = false }: ChatRequest = req.body;

    // 验证模型是否支持
    if (!SUPPORTED_MODELS[model]) {
      return res.status(400).json({ 
        error: `Unsupported model: ${model}. Supported models: ${Object.keys(SUPPORTED_MODELS).join(', ')}` 
      });
    }

    console.log(`[Chat API] 调用模型: ${model} -> ${SUPPORTED_MODELS[model]}`);
    console.log(`[Chat API] 消息数量: ${messages.length}`);

    // 准备API请求
    const apiUrl = process.env.OPENAI_API_BASE || 'https://api.laozhang.ai/v1/chat/completions';
    const apiKey = process.env.OPENAI_API_KEY || 'sk-fHiGcdKRdV7SykaZB0D755D91dEe48038f1aB0B7556fE2Fc';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: SUPPORTED_MODELS[model],
        messages, // 直接传递用户的messages，不添加额外的system prompt
        stream,
        max_tokens: 8000, // 增加最大token数，支持更长回答
        temperature: 0.7, // 适中的温度设置
      }),
      // @ts-ignore - 开发环境SSL配置
      ...(process.env.NODE_ENV === 'development' && { agent: httpsAgent }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Chat API] ❌ ${model}: API错误 ${response.status}`);
      return res.status(response.status).json({ 
        error: `API Error: ${response.status} - ${errorText}` 
      });
    }

    const data: ChatResponse = await response.json();
    console.log(`[Chat API] ✅ ${model}: 响应成功, 内容长度: ${data.choices[0]?.message?.content?.length || 0}`);
    
    // 返回格式化的响应
    return res.status(200).json({
      success: true,
      model,
      content: data.choices[0]?.message?.content || 'No response content',
      usage: (data as any).usage, // 可选的使用统计
    });

  } catch (error) {
    console.error(`[Chat API] ❌ 异常:`, error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 