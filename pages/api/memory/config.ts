import { NextApiRequest, NextApiResponse } from 'next';
import { getIntelligentMemoryManager } from '@/lib/memory/intelligent-manager';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const intelligentManager = getIntelligentMemoryManager();

  if (req.method === 'GET') {
    // 获取当前配置
    try {
      const currentConfig = intelligentManager.getOptions();
      
      res.status(200).json({
        success: true,
        config: currentConfig,
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
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: '获取配置失败',
        details: error instanceof Error ? error.message : '未知错误',
      });
    }
  } else if (req.method === 'POST') {
    // 更新配置
    try {
      const { 
        useLLM, 
        llmFallback, 
        hybridMode, 
        confidenceThreshold 
      } = req.body;

      console.log('[Memory Config] 更新配置请求:', req.body);

      // 验证参数
      const updates: any = {};
      if (typeof useLLM === 'boolean') updates.useLLM = useLLM;
      if (typeof llmFallback === 'boolean') updates.llmFallback = llmFallback;
      if (typeof hybridMode === 'boolean') updates.hybridMode = hybridMode;
      if (typeof confidenceThreshold === 'number' && confidenceThreshold >= 0 && confidenceThreshold <= 1) {
        updates.confidenceThreshold = confidenceThreshold;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          error: '无有效的配置参数',
        });
      }

      // 更新配置
      intelligentManager.updateOptions(updates);
      const newConfig = intelligentManager.getOptions();
      
      console.log('[Memory Config] ✅ 配置已更新:', newConfig);

      // 确定当前模式
      let currentMode = 'traditional';
      if (newConfig.hybridMode) {
        currentMode = 'hybrid';
      } else if (newConfig.useLLM) {
        currentMode = 'llm';
      }

      res.status(200).json({
        success: true,
        message: '配置更新成功',
        config: newConfig,
        currentMode,
        effect: getModeDescription(currentMode),
      });

    } catch (error) {
      console.error('[Memory Config] 配置更新失败:', error);
      res.status(500).json({
        success: false,
        error: '配置更新失败',
        details: error instanceof Error ? error.message : '未知错误',
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }

  // 获取模式描述
  function getModeDescription(mode: string): string {
    switch (mode) {
      case 'llm':
        return '✨ 已启用LLM智能提取 - 能够理解"我有一只狗叫皮皮"等新维度信息';
      case 'hybrid':
        return '🔄 已启用混合模式 - 结合LLM智能提取和传统规则，提供最佳覆盖';
      case 'traditional':
        return '📋 使用传统规则提取 - 基于预定义模式，稳定但可能遗漏新信息';
      default:
        return '未知模式';
    }
  }
} 