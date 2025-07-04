import { NextApiRequest, NextApiResponse } from 'next';
import { getIntelligentMemoryManager } from '@/lib/memory/intelligent-manager';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, messages, conversationId } = req.body;

    if (!userId || !messages || !Array.isArray(messages)) {
      return res.status(400).json({ 
        error: 'Missing required parameters: userId, messages' 
      });
    }

    console.log(`[Memory API] 智能记忆提取请求 - 用户: ${userId}, 消息数: ${messages.length}`);

    const intelligentManager = getIntelligentMemoryManager();
    
    // 使用智能记忆管理器进行提取
    const result = await intelligentManager.extractMemories(
      userId, 
      messages, 
      conversationId
    );

    console.log(`[Memory API] ✅ 智能提取完成: ${result.method}方法，提取${result.memories.length}条记忆，置信度${result.confidence}`);

    // 返回详细的提取结果
    res.status(200).json({
      success: true,
      memories: result.memories.map(memory => ({
        id: 0, // 实际ID由数据库生成
        userId,
        content: memory.content,
        category: memory.category,
        tags: memory.tags,
        source: 'conversation',
        conversationId,
        importance: memory.importance,
        createdAt: new Date().toLocaleString(),
        updatedAt: new Date().toLocaleString(),
        extractedFrom: memory.extractedFrom,
      })),
      count: result.memories.length,
      extraction: {
        method: result.method,
        reasoning: result.reasoning,
        confidence: result.confidence,
        performance: result.performance,
      },
    });

  } catch (error) {
    console.error('[Memory API] 记忆提取失败:', error);
    res.status(500).json({
      success: false,
      error: '记忆提取失败',
      details: error instanceof Error ? error.message : '未知错误',
      memories: [],
      count: 0,
    });
  }
}
