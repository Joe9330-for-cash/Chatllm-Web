import { getMemoryDB } from './database';
import { MemoryExtractor } from './extractor';
import { Memory, MemoryCategory, MemorySearchResult } from '@/types/memory';

export class MemoryManager {
  private db = getMemoryDB();
  private extractor = new MemoryExtractor();

  async extractAndStoreFromConversation(
    userId: string,
    messages: { content: string; type: string }[],
    conversationId?: number
  ): Promise<Memory[]> {
    console.log(`[Memory] 开始提取记忆，用户: ${userId}`);
    
    const extractedMemories = this.extractor.extractFromConversation(messages);
    const storedMemories: Memory[] = [];

    for (const extracted of extractedMemories) {
      const existingMemories = this.db.searchMemories(userId, extracted.content, 5);
      const isDuplicate = existingMemories.some(existing => 
        existing.category === extracted.category &&
        this.calculateSimilarity(existing.content, extracted.content) > 0.7
      );

      if (!isDuplicate) {
        const memoryId = this.db.insertMemory(
          userId, extracted.content, extracted.category, extracted.tags,
          'conversation', extracted.importance, conversationId, extracted.extractedFrom
        );

        const memory = this.getMemoryById(memoryId, userId);
        if (memory) {
          storedMemories.push(memory);
          console.log(`[Memory] ✅ 新增记忆: ${extracted.content.substring(0, 30)}...`);
        }
      }
    }

    return storedMemories;
  }

  searchRelevantMemories(userId: string, query: string, limit: number = 5): MemorySearchResult[] {
    console.log(`[Memory Manager] 开始搜索 userId=${userId}, query="${query}", limit=${limit}`);
    
    const memories = this.db.searchMemories(userId, query, limit * 2);
    console.log(`[Memory Manager] 数据库搜索到 ${memories.length} 条记忆`);
    
    if (memories.length === 0) {
      console.log(`[Memory Manager] ⚠️  数据库无搜索结果，返回空数组`);
      return [];
    }
    
    const results: MemorySearchResult[] = memories.map(memory => {
      // 简化相关性计算，确保有结果
      const score = 0.5 + (memory.importance / 20); // 确保至少0.5分
      console.log(`[Memory Manager] 记忆: "${memory.content}" 相关性分数: ${score.toFixed(3)}`);
      return { memory, relevanceScore: score };
    });

    console.log(`[Memory Manager] ✅ 返回 ${results.length} 条搜索结果`);
    return results.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, limit);
  }

  async searchRelevantMemoriesAsync(userId: string, query: string, limit: number = 5): Promise<MemorySearchResult[]> {
    console.log(`[Memory Manager] 🚀 开始智能搜索 userId=${userId}, query="${query}", limit=${limit}`);
    
    try {
      const memories = await this.db.searchMemoriesAsync(userId, query, limit * 2);
      console.log(`[Memory Manager] 🧠 智能搜索到 ${memories.length} 条记忆`);
      
      if (memories.length === 0) {
        console.log(`[Memory Manager] ⚠️ 智能搜索无结果，降级到普通搜索`);
        return this.searchRelevantMemories(userId, query, limit);
      }
      
      const results: MemorySearchResult[] = memories.map(memory => {
        const score = 0.5 + (memory.importance / 20);
        console.log(`[Memory Manager] 🧠 智能记忆: "${memory.content}" 相关性分数: ${score.toFixed(3)}`);
        return { memory, relevanceScore: score };
      });

      console.log(`[Memory Manager] ✅ 智能搜索返回 ${results.length} 条结果`);
      return results.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, limit);
      
    } catch (error) {
      console.error('[Memory Manager] ❌ 智能搜索失败，降级到普通搜索:', error);
      return this.searchRelevantMemories(userId, query, limit);
    }
  }

  getUserCoreMemories(userId: string): Memory[] {
    return this.db.getUserMemories(userId, 10);
  }

  getMemoriesByCategory(userId: string, category: MemoryCategory): Memory[] {
    return this.db.getMemoriesByCategory(userId, category);
  }

  addManualMemory(userId: string, content: string, category: MemoryCategory, tags: string[] = [], importance: number = 5): Memory | null {
    const memoryId = this.db.insertMemory(userId, content, category, tags, 'manual', importance);
    return this.getMemoryById(memoryId, userId);
  }

  updateMemory(id: number, updates: Partial<Memory>): boolean {
    return this.db.updateMemory(id, updates);
  }

  deleteMemory(id: number): boolean {
    return this.db.deleteMemory(id);
  }

  getMemoryStats(userId: string) {
    return this.db.getMemoryStats(userId);
  }

  buildContextPrompt(relevantMemories: MemorySearchResult[]): string {
    if (relevantMemories.length === 0) return '';

    const memoryTexts = relevantMemories.map(result => 
      `[${result.memory.category}] ${result.memory.content}`
    );

    return `基于我对用户的了解：\n${memoryTexts.join('\n')}\n\n请结合这些信息来回答用户的问题。`;
  }

  private getMemoryById(id: number, userId: string): Memory | null {
    const memories = this.db.getUserMemories(userId, 1000);
    return memories.find(m => m.id === id) || null;
  }

  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    const intersection = words1.filter(x => set2.has(x));
    const union = Array.from(new Set([...words1, ...words2]));
    
    return intersection.length / union.length;
  }

    private calculateRelevanceScore(query: string, memory: Memory): number {
    // 简化的相关性计算，确保跨对话记忆能有效工作
    const queryWords = query.toLowerCase().split(/\s+/);
    const contentWords = memory.content.toLowerCase();
    
    // 基础匹配分数
    let matchScore = 0;
    
    // 1. 直接包含匹配 (高权重)
    queryWords.forEach(word => {
      if (contentWords.includes(word)) {
        matchScore += 0.4;
      }
    });
    
    // 2. 分类匹配 (适度权重)
    if (queryWords.some(word => 
      memory.category.includes(word) || 
      memory.tags.some((tag: string) => tag.toLowerCase().includes(word))
    )) {
      matchScore += 0.2;
    }
    
    // 3. 重要性基础分 (确保重要记忆不被遗漏)
    const importanceScore = memory.importance / 20; // 降低重要性权重
    
    // 4. 兜底分数 (确保有记忆时至少有基础分数)
    const baseScore = 0.1;
    
    const totalScore = Math.max(baseScore, matchScore + importanceScore);
    
    return Math.min(1.0, totalScore); // 确保不超过1.0
  }
}

let managerInstance: MemoryManager | null = null;

export function getMemoryManager(): MemoryManager {
  if (!managerInstance) {
    managerInstance = new MemoryManager();
  }
  return managerInstance;
}
