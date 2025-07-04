import { NextApiRequest, NextApiResponse } from 'next';
import { getSmartMemoryManager } from '@/lib/memory/smart-memory-manager';
import { getPerformanceMonitor } from '@/lib/memory/performance-monitor';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, messages, conversationId, forceExtraction = false } = req.body;

    if (!userId || !messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Missing required fields: userId, messages' });
    }

    console.log(`[Memory API] 智能记忆提取请求 - 用户: ${userId}, 消息数: ${messages.length}`);

    const smartMemoryManager = getSmartMemoryManager();
    const performanceMonitor = getPerformanceMonitor();
    
    // 使用智能记忆管理系统提取记忆
    const extractionResult = await smartMemoryManager.smartExtraction(
      userId,
      messages,
      forceExtraction
    );

    console.log(`[Memory API] ✅ 智能提取完成: 提取${extractionResult.extractedMemories.length}条记忆`);
    console.log(`[Memory API] 提取来源: ${extractionResult.source}, 置信度: ${extractionResult.confidence}`);
    console.log(`[Memory API] 性能数据: ${JSON.stringify(extractionResult.performance)}`);

    // 返回提取结果
    return res.status(200).json({
      success: true,
      result: {
        memories: extractionResult.extractedMemories,
        source: extractionResult.source,
        confidence: extractionResult.confidence,
        performance: extractionResult.performance,
        extractedCount: extractionResult.extractedMemories.length,
        optimizationApplied: extractionResult.source !== 'llm',
        systemStats: smartMemoryManager.getSystemStats()
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
