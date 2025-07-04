import OpenAI from 'openai';
import { getCategoryManager } from './category-manager';

export class IntelligentCategoryGenerator {
  private openai: OpenAI;
  private cache = new Map<string, string>();
  private cacheTimeout = 1000 * 60 * 60; // 1小时缓存
  
  constructor() {
    this.openai = new OpenAI({
      apiKey: "sk-ckdV60TvXrxPMSqb22D292F176A448828e80A866BaBd2d87",
      baseURL: "https://api.laozhang.ai/v1"
    });
  }

  // 🧠 智能类别生成
  async generateCategory(content: string, context?: string[]): Promise<string> {
    try {
      // 检查缓存
      const cacheKey = content.trim().toLowerCase();
      if (this.cache.has(cacheKey)) {
        console.log(`[类别生成] 📦 使用缓存结果: "${content}"`);
        return this.cache.get(cacheKey)!;
      }

      console.log(`[类别生成] 🔍 智能生成类别: "${content.substring(0, 100)}..."`);
      
      const categoryManager = getCategoryManager();
      const existingCategories = categoryManager.getAllCategories()
        .map(cat => `${cat.name}: ${cat.description}`)
        .slice(0, 20); // 只取前20个最常用的类别
      
      const prompt = `请为以下记忆内容生成一个合适的类别名称。

现有类别参考：
${existingCategories.join('\n')}

类别生成规则：
1. 类别名称使用英文小写，单词间用下划线连接（如：work_context）
2. 如果内容适合现有类别，优先使用现有类别
3. 如果需要新类别，创建简洁明确的类别名
4. 类别名称不超过30个字符
5. 避免过于具体或过于宽泛的类别

记忆内容: "${content}"

请只返回类别名称，不要其他解释。`;

      const completion = await this.openai.chat.completions.create({
        model: "deepseek-v3",
        messages: [
          { role: "system", content: "你是一个专业的记忆分类助手，擅长为不同类型的信息生成合适的类别。" },
          { role: "user", content: prompt }
        ],
        max_tokens: 50,
        temperature: 0.3
      }, {
        timeout: 5000 // 5秒超时
      });

      const categoryText = completion.choices[0].message.content?.trim() || '';
      
      // 验证和清理类别名称
      const cleanCategory = this.validateCategoryName(categoryText);
      
      console.log(`[类别生成] ✅ 生成类别: "${cleanCategory}"`);
      
      // 缓存结果
      this.cache.set(cacheKey, cleanCategory);
      
      // 定期清理缓存
      setTimeout(() => {
        this.cache.delete(cacheKey);
      }, this.cacheTimeout);
      
      // 注册新类别
      if (cleanCategory !== 'other') {
        categoryManager.registerCategory(cleanCategory);
      }
      
      return cleanCategory;
      
    } catch (error) {
      console.error(`[类别生成] ❌ 智能生成失败，使用备用方案:`, error);
      return this.fallbackCategoryGeneration(content);
    }
  }

  // 🔄 备用类别生成方案
  private fallbackCategoryGeneration(content: string): string {
    const categoryManager = getCategoryManager();
    
    // 使用现有的智能推荐
    const suggestions = categoryManager.suggestCategory(content);
    if (suggestions.length > 0 && suggestions[0] !== 'other') {
      return suggestions[0];
    }
    
    // 基于关键词的简单分类
    const contentLower = content.toLowerCase();
    
    // 工作相关
    if (contentLower.match(/(工作|公司|项目|会议|同事|老板|客户|业务|任务|职位)/)) {
      return 'work_context';
    }
    
    // 个人信息
    if (contentLower.match(/(我|姓名|年龄|生日|家庭|地址|电话|邮箱|介绍)/)) {
      return 'personal_info';
    }
    
    // 技术技能
    if (contentLower.match(/(编程|代码|技术|框架|语言|开发|系统|软件|算法)/)) {
      return 'skills';
    }
    
    // 学习相关
    if (contentLower.match(/(学习|课程|书籍|知识|研究|文档|教程|培训)/)) {
      return 'learning_study';
    }
    
    // 设备配置
    if (contentLower.match(/(电脑|手机|配置|硬件|系统|设备|软件|工具)/)) {
      return 'device_info';
    }
    
    // 关系人际
    if (contentLower.match(/(朋友|家人|父母|妻子|老婆|丈夫|老公|孩子|宠物|关系)/)) {
      return 'relationships';
    }
    
    // 健康医疗
    if (contentLower.match(/(健康|医院|医生|药|病|治疗|体检|运动|锻炼)/)) {
      return 'health_medical';
    }
    
    // 财务金钱
    if (contentLower.match(/(钱|工资|收入|支出|投资|银行|价格|费用|成本)/)) {
      return 'financial_money';
    }
    
    // 目标计划
    if (contentLower.match(/(目标|计划|愿望|梦想|希望|未来|打算|想要)/)) {
      return 'goals';
    }
    
    // 偏好喜好
    if (contentLower.match(/(喜欢|爱好|兴趣|偏好|讨厌|不喜欢|习惯)/)) {
      return 'preferences';
    }
    
    return 'other';
  }

  // 🔍 验证和清理类别名称
  private validateCategoryName(category: string): string {
    if (!category || typeof category !== 'string') {
      return 'other';
    }

    // 清理和规范化类别名称
    const cleaned = category
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]/g, '_')  // 只保留字母、数字和下划线
      .replace(/_+/g, '_')          // 多个下划线合并为一个
      .replace(/^_|_$/g, '');       // 移除开头和结尾的下划线

    if (cleaned.length === 0) {
      return 'other';
    }

    // 限制长度
    if (cleaned.length > 30) {
      return cleaned.substring(0, 30);
    }

    return cleaned;
  }

  // 🎯 批量类别生成（用于批量处理记忆）
  async generateCategoriesForBatch(contents: string[]): Promise<{ [content: string]: string }> {
    const results: { [content: string]: string } = {};
    
    // 并发处理，但限制并发数量
    const batchSize = 3;
    for (let i = 0; i < contents.length; i += batchSize) {
      const batch = contents.slice(i, i + batchSize);
      const promises = batch.map(async (content) => {
        const category = await this.generateCategory(content);
        return { content, category };
      });
      
      try {
        const batchResults = await Promise.all(promises);
        batchResults.forEach(({ content, category }) => {
          results[content] = category;
        });
      } catch (error) {
        console.error('[类别生成] ❌ 批量处理失败:', error);
        // 单独处理失败的项目
        for (const content of batch) {
          if (!results[content]) {
            results[content] = this.fallbackCategoryGeneration(content);
          }
        }
      }
      
      // 小延迟，避免API限流
      if (i + batchSize < contents.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }

  // 📊 获取类别使用统计
  getCategoryStats(): { [category: string]: number } {
    const categoryManager = getCategoryManager();
    const allCategories = categoryManager.getAllCategories();
    
    const stats: { [category: string]: number } = {};
    allCategories.forEach(cat => {
      stats[cat.name] = cat.usageCount;
    });
    
    return stats;
  }

  // 🧹 清理缓存
  clearCache(): void {
    this.cache.clear();
    console.log(`[类别生成] 🧹 缓存已清理`);
  }
}

// 单例模式
let categoryGenerator: IntelligentCategoryGenerator | null = null;

export const getIntelligentCategoryGenerator = (): IntelligentCategoryGenerator => {
  if (!categoryGenerator) {
    categoryGenerator = new IntelligentCategoryGenerator();
  }
  return categoryGenerator;
}; 