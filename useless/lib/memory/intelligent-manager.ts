import { LLMMemoryExtractor, LLMExtractionResult } from './llm-extractor';
import { MemoryExtractor } from './extractor';
import { getMemoryDB } from './database';
import { ExtractedMemory, MemorySource } from '@/types/memory';

export interface IntelligentExtractionResult {
  memories: ExtractedMemory[];
  method: 'llm' | 'traditional' | 'hybrid';
  reasoning: string;
  confidence: number;
  performance: {
    extractionTime: number;
    memoryCount: number;
    method: string;
  };
}

export class IntelligentMemoryManager {
  private llmExtractor: LLMMemoryExtractor;
  private traditionalExtractor: MemoryExtractor;
  private memoryDB: any;
  
  // 优化配置选项
  private options = {
    useLLM: true,              // 强制启用LLM提取
    llmFallback: true,         // 启用降级到传统方法
    hybridMode: false,         // 不使用混合模式
    confidenceThreshold: 0.05, // 进一步降低置信度阈值
    maxRetries: 2,             // 减少重试次数，避免过度重试
    forceJson: true,           // 强制JSON格式
  };

  constructor(options?: {
    useLLM?: boolean;
    llmFallback?: boolean;
    hybridMode?: boolean;
    confidenceThreshold?: number;
    maxRetries?: number;
    forceJson?: boolean;
  }) {
    this.llmExtractor = new LLMMemoryExtractor();
    this.traditionalExtractor = new MemoryExtractor();
    this.memoryDB = getMemoryDB();
    
    if (options) {
      this.options = { ...this.options, ...options };
    }
  }

  async extractMemories(
    userId: string,
    messages: { content: string; type: string }[],
    conversationId?: number
  ): Promise<IntelligentExtractionResult> {
    const startTime = Date.now();
    
    console.log(`[Intelligent Manager] 🚀 开始智能记忆提取，用户: ${userId}`);
    console.log(`[Intelligent Manager] 配置: LLM=${this.options.useLLM}, 置信度阈值=${this.options.confidenceThreshold}`);

    let result: IntelligentExtractionResult;

    // 尝试LLM提取，失败时启用降级处理
    try {
      console.log('[Intelligent Manager] 🔥 尝试LLM提取模式');
      result = await this.enhancedLLMExtraction(messages);
      
      // 如果LLM提取到了记忆，直接使用
      if (result.memories.length > 0) {
        console.log(`[Intelligent Manager] ✅ LLM提取成功: ${result.memories.length} 条记忆`);
      } else {
        console.log(`[Intelligent Manager] ⚠️  LLM没有提取到记忆，原因: ${result.reasoning}`);
        
        // 如果LLM没有提取到记忆且启用了降级，尝试传统方法
        if (this.options.llmFallback) {
          console.log('[Intelligent Manager] 🔄 启用降级处理，尝试传统方法');
          const fallbackResult = await this.traditionalExtraction(messages);
          
          if (fallbackResult.memories.length > 0) {
            console.log(`[Intelligent Manager] ✅ 传统方法提取成功: ${fallbackResult.memories.length} 条记忆`);
            result = fallbackResult;
          }
        }
      }
      
      // 存储提取的记忆
      if (result.memories.length > 0) {
        await this.storeMemories(userId, result.memories, conversationId);
        console.log(`[Intelligent Manager] 💾 成功存储 ${result.memories.length} 条记忆`);
      } else {
        console.log(`[Intelligent Manager] ⚠️  最终没有提取到记忆`);
      }

      result.performance.extractionTime = Date.now() - startTime;
      
      console.log(`[Intelligent Manager] ✅ 提取完成: ${result.memories.length} 条记忆，方法: ${result.method}，耗时: ${result.performance.extractionTime}ms`);
      
      return result;
    } catch (error) {
      console.error('[Intelligent Manager] ❌ 智能提取失败:', error);
      
      // 最终降级处理：尝试传统方法
      if (this.options.llmFallback) {
        console.log('[Intelligent Manager] 🆘 启用最终降级处理');
        try {
          const fallbackResult = await this.traditionalExtraction(messages);
          fallbackResult.performance.extractionTime = Date.now() - startTime;
          fallbackResult.reasoning = `LLM失败，降级到传统方法: ${fallbackResult.reasoning}`;
          
          if (fallbackResult.memories.length > 0) {
            await this.storeMemories(userId, fallbackResult.memories, conversationId);
            console.log(`[Intelligent Manager] 💾 降级处理成功存储 ${fallbackResult.memories.length} 条记忆`);
          }
          
          return fallbackResult;
        } catch (fallbackError) {
          console.error('[Intelligent Manager] 💀 降级处理也失败:', fallbackError);
        }
      }
      
      // 最后的兜底处理：返回空结果
      return {
        memories: [],
        method: 'llm',
        reasoning: `所有提取方法都失败: ${error instanceof Error ? error.message : '未知错误'}`,
        confidence: 0,
        performance: {
          extractionTime: Date.now() - startTime,
          memoryCount: 0,
          method: '所有方法失败',
        },
      };
    }
  }

  // 增强的LLM提取逻辑
  private async enhancedLLMExtraction(messages: { content: string; type: string }[]): Promise<IntelligentExtractionResult> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        console.log(`[Intelligent Manager] 尝试LLM提取 (${attempt}/${this.options.maxRetries})`);
        
        const llmResult = await this.llmExtractor.extractFromConversation(messages);
        
        console.log(`[Intelligent Manager] LLM返回: ${llmResult.memories.length} 条记忆, 置信度: ${llmResult.confidence}`);
        
        // 更宽松的置信度检查
        if (llmResult.confidence >= this.options.confidenceThreshold) {
          console.log(`[Intelligent Manager] ✅ 置信度满足要求 (${llmResult.confidence} >= ${this.options.confidenceThreshold})`);
          
          return {
            memories: llmResult.memories,
            method: 'llm',
            reasoning: llmResult.reasoning,
            confidence: llmResult.confidence,
            performance: {
              extractionTime: 0, // 会在调用方设置
              memoryCount: llmResult.memories.length,
              method: `LLM智能提取(尝试${attempt}次)`,
            },
          };
        } else {
          console.log(`[Intelligent Manager] ⚠️  置信度不足 (${llmResult.confidence} < ${this.options.confidenceThreshold})，继续尝试...`);
          
          // 如果有记忆内容，直接接受，不再依赖置信度
          if (llmResult.memories.length > 0) {
            console.log(`[Intelligent Manager] 🔄 发现记忆内容，直接接受 (${llmResult.memories.length}条)`);
            return {
              memories: llmResult.memories,
              method: 'llm',
              reasoning: `${llmResult.reasoning} (有记忆内容，直接接受)`,
              confidence: Math.max(llmResult.confidence, 0.5), // 最低置信度设为0.5
              performance: {
                extractionTime: 0,
                memoryCount: llmResult.memories.length,
                method: `LLM智能提取(有内容直接接受)`,
              },
            };
          }
        }
        
        lastError = new Error(`置信度过低: ${llmResult.confidence}`);
        
      } catch (error) {
        console.warn(`[Intelligent Manager] LLM提取尝试${attempt}失败:`, error);
        lastError = error instanceof Error ? error : new Error('未知错误');
        
        // 短暂延迟后重试
        if (attempt < this.options.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    throw lastError || new Error('所有LLM提取尝试均失败');
  }

  // 传统方法作为LLM失败时的降级处理
  private async traditionalExtraction(messages: { content: string; type: string }[]): Promise<IntelligentExtractionResult> {
    console.log('[Intelligent Manager] 🔄 启用传统提取方法');
    
    try {
      const userMessages = messages.filter(msg => msg.type === 'user' || !msg.type);
      const latestMessage = userMessages[userMessages.length - 1];
      
      if (!latestMessage) {
        return {
          memories: [],
          method: 'traditional',
          reasoning: '没有找到用户消息',
          confidence: 0,
          performance: {
            extractionTime: 0,
            memoryCount: 0,
            method: '传统方法-无消息',
          },
        };
      }
      
      const extractedMemories = this.traditionalExtractor.extractFromMessage(latestMessage.content);
      
      console.log(`[Intelligent Manager] 传统方法提取结果: ${extractedMemories.length} 条记忆`);
      
      return {
        memories: extractedMemories,
        method: 'traditional',
        reasoning: `传统规则提取，识别${extractedMemories.length}条记忆`,
        confidence: extractedMemories.length > 0 ? 0.6 : 0.1,
        performance: {
          extractionTime: 0,
          memoryCount: extractedMemories.length,
          method: '传统规则提取',
        },
      };
    } catch (error) {
      console.error('[Intelligent Manager] 传统方法提取失败:', error);
      
      return {
        memories: [],
        method: 'traditional',
        reasoning: `传统方法提取失败: ${error instanceof Error ? error.message : '未知错误'}`,
        confidence: 0,
        performance: {
          extractionTime: 0,
          memoryCount: 0,
          method: '传统方法失败',
        },
      };
    }
  }

  // 禁用混合方法
  private async hybridExtraction(messages: { content: string; type: string }[]): Promise<IntelligentExtractionResult> {
    console.log('[Intelligent Manager] ❌ 混合提取方法已禁用');
    return await this.enhancedLLMExtraction(messages);
  }

  private isSimilarMemory(memory1: ExtractedMemory, memory2: ExtractedMemory): boolean {
    // 简单的相似性检测
    if (memory1.category === memory2.category) {
      const content1 = memory1.content.toLowerCase();
      const content2 = memory2.content.toLowerCase();
      
      // 检查是否有50%以上的重叠
      const words1 = content1.split(/\s+/);
      const words2 = content2.split(/\s+/);
      const intersection = words1.filter(word => words2.includes(word));
      
      return intersection.length / Math.max(words1.length, words2.length) > 0.5;
    }
    return false;
  }

  private async storeMemories(
    userId: string,
    memories: ExtractedMemory[],
    conversationId?: number
  ): Promise<void> {
    const { getVectorDatabase } = await import('./vector-database');
    const { getEmbeddingService } = await import('./embedding-service');
    
    const vectorDB = getVectorDatabase();
    const embeddingService = getEmbeddingService();
    
    for (const memory of memories) {
      try {
        // 1. 存储到传统数据库
        const memoryId = this.memoryDB.insertMemory(
          userId,
          memory.content,
          memory.category,
          memory.tags,
          'conversation' as MemorySource,
          memory.importance,
          conversationId,
          memory.extractedFrom
        );
        console.log(`[Intelligent Manager] 存储记忆 ${memoryId}: [${memory.category}] ${memory.content}`);
        
        // 2. 同时进行向量化存储
        try {
          const vector = await embeddingService.generateEmbedding(memory.content);
          await vectorDB.storeMemoryVector(
            userId,
            memory.content,
            vector,
            memory.category,
            {
              tags: memory.tags,
              importance: memory.importance,
              extractedFrom: memory.extractedFrom,
              conversationId,
              traditionalId: memoryId // 关联传统数据库的ID
            }
          );
          console.log(`[Intelligent Manager] ✅ 向量化存储完成 ID: ${memoryId}`);
        } catch (vectorError) {
          console.error(`[Intelligent Manager] ⚠️  向量化存储失败 ID: ${memoryId}:`, vectorError);
          // 向量化失败不影响传统存储
        }
        
      } catch (error) {
        console.error('[Intelligent Manager] 存储记忆失败:', error);
      }
    }
  }

  // 更新配置
  updateOptions(newOptions: Partial<typeof this.options>): void {
    this.options = { ...this.options, ...newOptions };
    console.log('[Intelligent Manager] 配置已更新:', this.options);
  }

  getOptions(): typeof this.options {
    return { ...this.options };
  }

  // 获取提取统计
  getExtractionStats(): any {
    return {
      llmEnabled: this.options.useLLM,
      confidenceThreshold: this.options.confidenceThreshold,
      fallbackEnabled: this.options.llmFallback,
      maxRetries: this.options.maxRetries,
    };
  }
}

let managerInstance: IntelligentMemoryManager | null = null;

export function getIntelligentMemoryManager(): IntelligentMemoryManager {
  if (!managerInstance) {
    managerInstance = new IntelligentMemoryManager();
  }
  return managerInstance;
} 