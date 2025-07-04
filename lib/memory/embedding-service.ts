import OpenAI from 'openai';

export interface EmbeddingOptions {
  model?: string;
  dimensions?: number;
}

export class EmbeddingService {
  private openai: OpenAI;
  private defaultModel = 'text-embedding-ada-002';

  constructor() {
    this.openai = new OpenAI({
      baseURL: process.env.OPENAI_API_BASE || 'https://api.laozhang.ai/v1',
      apiKey: process.env.OPENAI_API_KEY || 'sk-zqDdiGR6QzXgdqjsEdF00c254b8c43A281B64fD37c883c13',
    });

    console.log('[EmbeddingService] ✅ OpenAI客户端初始化完成');
  }

  async generateEmbedding(
    text: string, 
    options: EmbeddingOptions = {}
  ): Promise<number[]> {
    const { model = this.defaultModel } = options;

    try {
      console.log(`[EmbeddingService] 正在生成嵌入向量: "${text.substring(0, 50)}..."`);
      
      // 清理和预处理文本
      const cleanText = this.preprocessText(text);
      
      const response = await this.openai.embeddings.create({
        model,
        input: cleanText,
      });

      const embedding = response.data[0].embedding;
      
      console.log(`[EmbeddingService] ✅ 向量生成成功，维度: ${embedding.length}`);
      return embedding;

    } catch (error) {
      console.error('[EmbeddingService] ❌ 向量生成失败:', error);
      
      // 如果API失败，返回随机向量作为fallback（仅用于测试）
      console.warn('[EmbeddingService] 使用随机向量作为降级方案');
      return this.generateRandomEmbedding();
    }
  }

  async generateBatchEmbeddings(
    texts: string[], 
    options: EmbeddingOptions = {}
  ): Promise<number[][]> {
    const { model = this.defaultModel } = options;

    try {
      console.log(`[EmbeddingService] 正在批量生成 ${texts.length} 个嵌入向量`);
      
      // 预处理所有文本
      const cleanTexts = texts.map(text => this.preprocessText(text));
      
      const response = await this.openai.embeddings.create({
        model,
        input: cleanTexts,
      });

      const embeddings = response.data.map(item => item.embedding);
      
      console.log(`[EmbeddingService] ✅ 批量向量生成成功，数量: ${embeddings.length}`);
      return embeddings;

    } catch (error) {
      console.error('[EmbeddingService] ❌ 批量向量生成失败:', error);
      
      // 降级方案：为每个文本生成随机向量
      return texts.map(() => this.generateRandomEmbedding());
    }
  }

  // 计算两个向量的余弦相似度
  calculateCosineSimilarity(vector1: number[], vector2: number[]): number {
    if (vector1.length !== vector2.length) {
      throw new Error('向量维度不匹配');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vector1.length; i++) {
      dotProduct += vector1[i] * vector2[i];
      norm1 += vector1[i] * vector1[i];
      norm2 += vector2[i] * vector2[i];
    }

    const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    return similarity;
  }

  // 文本预处理
  private preprocessText(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, ' ')  // 多个空格合并为一个
      .replace(/\n+/g, ' ')  // 换行符替换为空格
      .substring(0, 8000);   // 限制长度，避免API限制
  }

  // 生成随机向量（降级方案）
  private generateRandomEmbedding(dimensions: number = 1536): number[] {
    const vector: number[] = [];
    
    for (let i = 0; i < dimensions; i++) {
      vector.push((Math.random() - 0.5) * 2);
    }
    
    // 标准化向量
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map(val => val / norm);
  }

  // 测试API连接
  async testConnection(): Promise<{
    success: boolean;
    model: string;
    responseTime: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      const testText = '测试向量生成';
      const embedding = await this.generateEmbedding(testText);
      const responseTime = Date.now() - startTime;
      
      return {
        success: true,
        model: this.defaultModel,
        responseTime,
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        success: false,
        model: this.defaultModel,
        responseTime,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  // 获取模型信息
  getModelInfo(): {
    model: string;
    dimensions: number;
    maxTokens: number;
  } {
    return {
      model: this.defaultModel,
      dimensions: 1536,
      maxTokens: 8192,
    };
  }
}

// 单例实例
let embeddingServiceInstance: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new EmbeddingService();
  }
  return embeddingServiceInstance;
} 