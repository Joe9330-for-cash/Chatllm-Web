import { SupportedModel } from '../pages/api/chat';

interface ModelConfig {
  temperature: number;
  max_tokens: number;
  timeout: number;
  retry: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream_options?: any;
  flushThreshold?: number;
  flushInterval?: number;
}

interface ContentAnalysis {
  length: number;
  language: 'chinese' | 'english' | 'mixed';
  hasCode: boolean;
  hasLongText: boolean;
  isCreative: boolean;
  isAnalytical: boolean;
  complexity: 'low' | 'medium' | 'high';
}

class ModelRouter {
  private static instance: ModelRouter;
  private performanceCache: Map<string, { model: SupportedModel; score: number; timestamp: number }> = new Map();
  private readonly cacheExpiryMs = 30 * 60 * 1000; // 30分钟缓存过期

  private constructor() {}

  static getInstance(): ModelRouter {
    if (!ModelRouter.instance) {
      ModelRouter.instance = new ModelRouter();
    }
    return ModelRouter.instance;
  }

  /**
   * 分析输入内容特征
   */
  private analyzeContent(content: string): ContentAnalysis {
    const length = content.length;
    
    // 检测语言
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishChars = (content.match(/[a-zA-Z]/g) || []).length;
    const language = chineseChars > englishChars ? 'chinese' : 
                    englishChars > chineseChars ? 'english' : 'mixed';
    
    // 检测代码
    const codePatterns = [
      /function\s+\w+\s*\(/,
      /class\s+\w+/,
      /import\s+.*from/,
      /```[\s\S]*?```/,
      /\w+\s*=\s*function/,
      /\w+\s*=\s*\(.*\)\s*=>/,
      /if\s*\(.*\)\s*{/,
      /for\s*\(.*\)\s*{/,
      /while\s*\(.*\)\s*{/,
      /def\s+\w+\(/,
      /print\s*\(/,
      /console\.log\s*\(/,
      /SELECT\s+.*FROM/i,
      /CREATE\s+TABLE/i,
      /INSERT\s+INTO/i,
      /UPDATE\s+.*SET/i,
      /DELETE\s+FROM/i,
      /<\w+[^>]*>/,
      /\{\{.*\}\}/,
      /\$\{.*\}/,
    ];
    const hasCode = codePatterns.some(pattern => pattern.test(content));
    
    // 检测长文本
    const hasLongText = length > 500;
    
    // 检测创意性内容
    const creativeKeywords = [
      '创作', '写作', '故事', '诗歌', '小说', '剧本', '创意', '想象', '虚构',
      'write', 'story', 'creative', 'imagine', 'fiction', 'poetry', 'novel',
      '写一个', '编写', '创造', '设计', '构思', '发挥', '幻想'
    ];
    const isCreative = creativeKeywords.some(keyword => content.includes(keyword));
    
    // 检测分析性内容
    const analyticalKeywords = [
      '分析', '解释', '说明', '总结', '归纳', '比较', '对比', '评估', '判断',
      'analyze', 'explain', 'analyze', 'summarize', 'compare', 'evaluate',
      '为什么', '如何', '怎么', '原因', '方法', '步骤', '过程', '机制'
    ];
    const isAnalytical = analyticalKeywords.some(keyword => content.includes(keyword));
    
    // 计算复杂度
    let complexity: 'low' | 'medium' | 'high' = 'low';
    if (hasCode && hasLongText) {
      complexity = 'high';
    } else if (hasCode || hasLongText || isAnalytical) {
      complexity = 'medium';
    }
    
    return {
      length,
      language,
      hasCode,
      hasLongText,
      isCreative,
      isAnalytical,
      complexity
    };
  }

  /**
   * 根据内容特征选择最适合的模型
   */
  selectOptimalModel(content: string, context?: any): SupportedModel {
    const analysis = this.analyzeContent(content);
    
    // 检查缓存
    const cacheKey = this.generateCacheKey(content, analysis);
    const cached = this.performanceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiryMs) {
      console.log(`[Model Router] 🎯 缓存命中: ${cached.model} (分数: ${cached.score})`);
      return cached.model;
    }
    
    let selectedModel: SupportedModel = 'deepseek-r1'; // 默认模型
    let score = 0;
    
    // 模型选择逻辑
    if (analysis.hasCode) {
      // 代码相关任务 - DeepSeek R1 优选
      selectedModel = 'deepseek-r1';
      score = 0.9;
      console.log(`[Model Router] 🔧 检测到代码内容，选择 DeepSeek R1`);
    } else if (analysis.isCreative) {
      // 创意性任务 - GPT-4O 优选
      selectedModel = 'chatgpt-4o-latest';
      score = 0.85;
      console.log(`[Model Router] 🎨 检测到创意内容，选择 GPT-4O`);
    } else if (analysis.hasLongText && analysis.isAnalytical) {
      // 长文本分析 - GPT-4O 优选
      selectedModel = 'chatgpt-4o-latest';
      score = 0.8;
      console.log(`[Model Router] 📊 检测到长文本分析，选择 GPT-4O`);
    } else if (analysis.language === 'chinese' && analysis.complexity === 'high') {
      // 高复杂度中文任务 - DeepSeek R1 优选
      selectedModel = 'deepseek-r1';
      score = 0.85;
      console.log(`[Model Router] 🇨🇳 检测到高复杂度中文任务，选择 DeepSeek R1`);
    } else if (analysis.length > 1000) {
      // 超长文本 - GPT-4O 优选
      selectedModel = 'chatgpt-4o-latest';
      score = 0.75;
      console.log(`[Model Router] 📝 检测到超长文本，选择 GPT-4O`);
    } else {
      // 默认情况 - DeepSeek R1
      selectedModel = 'deepseek-r1';
      score = 0.7;
      console.log(`[Model Router] 🔄 默认选择 DeepSeek R1`);
    }
    
    // 更新缓存
    this.performanceCache.set(cacheKey, {
      model: selectedModel,
      score,
      timestamp: Date.now()
    });
    
    // 清理过期缓存
    this.cleanupCache();
    
    console.log(`[Model Router] ✅ 最终选择: ${selectedModel} (分数: ${score}, 复杂度: ${analysis.complexity})`);
    return selectedModel;
  }

  /**
   * 获取模型专属配置
   */
  getModelConfig(model: SupportedModel): ModelConfig {
    const configs: Record<SupportedModel, ModelConfig> = {
      'deepseek-r1': {
        temperature: 0.7,
        max_tokens: 8000,
        timeout: 25000,
        retry: 2,
        top_p: 0.95,
        frequency_penalty: 0,
        presence_penalty: 0,
        stream_options: { include_usage: true },
        flushThreshold: 1, // 立即发送每个字符
        flushInterval: 3,  // 3ms间隔，最快渲染
      },
      'chatgpt-4o-latest': {
        temperature: 0.8,
        max_tokens: 6000,
        timeout: 30000,
        retry: 3,
        top_p: 0.9,
        frequency_penalty: 0.1,
        presence_penalty: 0.1,
        stream_options: { include_usage: true },
        flushThreshold: 2,
        flushInterval: 8,
      },
      'claude-3-7-sonnet-latest': {
        temperature: 0.7,
        max_tokens: 4000,
        timeout: 25000,
        retry: 2,
        top_p: 0.9,
        frequency_penalty: 0,
        presence_penalty: 0,
        stream_options: { include_usage: true },
        flushThreshold: 3,
        flushInterval: 15,
      },
      'gemini-2.5-pro': {
        temperature: 0.7,
        max_tokens: 4000,
        timeout: 25000,
        retry: 2,
        top_p: 0.9,
        frequency_penalty: 0,
        presence_penalty: 0,
        stream_options: { include_usage: true },
        flushThreshold: 3,
        flushInterval: 20,
      },
    };
    
    const config = configs[model];
    console.log(`[Model Router] ⚙️ 配置 ${model}:`, {
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      timeout: config.timeout,
      flushInterval: config.flushInterval
    });
    
    return config;
  }

  /**
   * 根据历史性能更新模型偏好
   */
  updateModelPerformance(model: SupportedModel, contentHash: string, responseTime: number, success: boolean) {
    const score = success ? Math.max(0, 1 - responseTime / 60000) : 0; // 1分钟内完成得满分
    
    // 更新缓存中的性能分数
    this.performanceCache.forEach((value, key) => {
      if (value.model === model && key.includes(contentHash)) {
        value.score = (value.score * 0.7) + (score * 0.3); // 加权平均
        return;
      }
    });
    
    console.log(`[Model Router] 📊 更新性能: ${model} - 响应时间: ${responseTime}ms, 成功: ${success}, 分数: ${score.toFixed(2)}`);
  }

  /**
   * 获取模型负载均衡建议
   */
  getLoadBalancingRecommendation(): SupportedModel[] {
    const now = Date.now();
    const recentPerformance = new Map<SupportedModel, number[]>();
    
    // 收集最近的性能数据
    this.performanceCache.forEach((value, key) => {
      if (now - value.timestamp < 10 * 60 * 1000) { // 10分钟内的数据
        if (!recentPerformance.has(value.model)) {
          recentPerformance.set(value.model, []);
        }
        recentPerformance.get(value.model)!.push(value.score);
      }
    });
    
    // 计算平均性能并排序
    const modelScores: Array<{ model: SupportedModel; avgScore: number }> = [];
    recentPerformance.forEach((scores, model) => {
      const avgScore = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
      modelScores.push({ model, avgScore });
    });
    
    // 按性能排序
    modelScores.sort((a, b) => b.avgScore - a.avgScore);
    
    const recommendation = modelScores.map(item => item.model);
    console.log(`[Model Router] 🔄 负载均衡建议:`, recommendation);
    
    return recommendation.length > 0 ? recommendation : ['deepseek-r1', 'chatgpt-4o-latest'];
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(content: string, analysis: ContentAnalysis): string {
    const contentHash = this.simpleHash(content.substring(0, 200)); // 只使用前200字符
    return `${contentHash}-${analysis.complexity}-${analysis.hasCode}-${analysis.language}`;
  }

  /**
   * 简单哈希函数
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * 清理过期缓存
   */
  private cleanupCache() {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    this.performanceCache.forEach((value, key) => {
      if (now - value.timestamp > this.cacheExpiryMs) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => {
      this.performanceCache.delete(key);
    });
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const stats = {
      cacheSize: this.performanceCache.size,
      modelDistribution: new Map<SupportedModel, number>(),
      avgPerformance: new Map<SupportedModel, number[]>(),
    };
    
    this.performanceCache.forEach((value, key) => {
      // 统计模型分布
      stats.modelDistribution.set(
        value.model,
        (stats.modelDistribution.get(value.model) || 0) + 1
      );
      
      // 计算平均性能
      const current = stats.avgPerformance.get(value.model) || [];
      stats.avgPerformance.set(value.model, [...current, value.score]);
    });
    
    // 计算平均值
    const finalAvgPerformance = new Map<SupportedModel, number>();
    stats.avgPerformance.forEach((scores, model) => {
      const avg = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
      finalAvgPerformance.set(model, avg);
    });
    
    return {
      cacheSize: stats.cacheSize,
      modelDistribution: stats.modelDistribution,
      avgPerformance: finalAvgPerformance,
    };
  }
}

export default ModelRouter; 