import { NextApiRequest, NextApiResponse } from 'next';
// import { getIntelligentMemoryManager } from '@/lib/memory/intelligent-manager';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // 🚧 未来功能：配置管理API
  // 当前为存根实现，避免编译错误
  
  if (req.method === 'GET') {
    // 返回默认配置
    res.status(200).json({
      success: true,
      config: {
        useLLM: false,
        llmFallback: true,
        hybridMode: false,
        confidenceThreshold: 0.7
      },
      modes: {
        llm: 'LLM智能提取 - 使用AI理解语义，适应新信息维度',
        traditional: '传统规则提取 - 基于正则表达式，稳定但局限',
        hybrid: '混合模式 - 结合两种方法，最佳效果',
      },
      description: {
        useLLM: '是否启用LLM提取（推荐）',
        llmFallback: 'LLM失败时是否降级到传统方法',
        hybridMode: '是否使用混合模式（两种方法都用）',
        confidenceThreshold: 'LLM置信度阈值（0-1）',
      },
      note: '🚧 此功能尚未完全实现，当前为存根版本'
    });
  } else if (req.method === 'POST') {
    // 配置更新存根
    res.status(200).json({
      success: true,
      message: '🚧 配置更新功能尚未实现',
      note: '此功能在未来版本中提供'
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
} 