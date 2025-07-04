import { NextApiRequest, NextApiResponse } from 'next';
import { getIntelligentMemoryManager } from '@/lib/memory/intelligent-manager';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, messages, conversationId } = req.body;

    if (!userId || !messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Missing required fields: userId, messages' });
    }

    console.log(`[Memory API] 智能记忆提取请求 - 用户: ${userId}, 消息数: ${messages.length}`);

    const intelligentManager = getIntelligentMemoryManager();
    
    // 使用智能管理器提取记忆
    const extractionResult = await intelligentManager.extractMemories(
      userId,
      messages,
      conversationId
    );

    console.log(`[Memory API] ✅ 智能提取完成: 提取${extractionResult.memories.length}条记忆`);
    console.log(`[Memory API] 提取方法: ${extractionResult.method}, 置信度: ${extractionResult.confidence}`);

    // 返回提取结果
    return res.status(200).json({
      success: true,
      result: {
        memories: extractionResult.memories,
        method: extractionResult.method,
        reasoning: extractionResult.reasoning,
        confidence: extractionResult.confidence,
        performance: extractionResult.performance,
        extractedCount: extractionResult.memories.length
      }
    });

  } catch (error) {
    console.error('[Memory API] ❌ 智能提取失败:', error);
    return res.status(500).json({ 
      error: '记忆提取失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
}
