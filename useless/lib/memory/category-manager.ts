import { CategoryInfo, CoreMemoryCategory, DYNAMIC_CATEGORY_EXAMPLES } from '@/types/memory';

export class MemoryCategoryManager {
  private categories: Map<string, CategoryInfo> = new Map();
  
  // 核心类别定义
  private coreCategories: Record<CoreMemoryCategory, string> = {
    'personal_info': '个人信息：姓名、年龄、居住地等',
    'work_context': '工作相关：公司、职位、项目等', 
    'device_info': '设备配置：电脑、硬件、系统等',
    'skills': '技能能力：专业技能、语言、工具等',
    'education': '教育背景：学历、专业、学校等',
    'contact_info': '联系信息：电话、邮箱、地址等',
    'preferences': '偏好设置：喜好、厌恶等',
    'interests': '兴趣爱好：技术、娱乐等',
    'relationships': '人际关系：家庭、朋友、宠物等',
    'goals': '目标计划：短期和长期目标',
    'projects': '项目作品：开发经验、作品展示等',
    'lifestyle': '生活方式：习惯、作息、日常等',
    'opinions': '观点态度：对某事的看法',
    'experiences': '经历体验：过往经验、故事等',
    'facts': '客观事实',
    'other': '其他类别'
  };

  constructor() {
    this.initializeCoreCategories();
  }

  // 初始化核心类别
  private initializeCoreCategories(): void {
    for (const [category, description] of Object.entries(this.coreCategories)) {
      this.categories.set(category, {
        name: category,
        displayName: this.formatDisplayName(category),
        description,
        isCore: true,
        createdAt: new Date().toISOString(),
        usageCount: 0
      });
    }
  }

  // 格式化显示名称
  private formatDisplayName(category: string): string {
    return category
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // 验证和规范化类别名称
  validateCategory(category: string): string {
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
    if (cleaned.length > 50) {
      return cleaned.substring(0, 50);
    }

    return cleaned;
  }

  // 注册新类别
  registerCategory(category: string, description?: string): CategoryInfo {
    const validCategory = this.validateCategory(category);
    
    if (this.categories.has(validCategory)) {
      const existing = this.categories.get(validCategory)!;
      existing.usageCount++;
      return existing;
    }

    // 创建新类别
    const categoryInfo: CategoryInfo = {
      name: validCategory,
      displayName: description || this.formatDisplayName(validCategory),
      description: description || `自动创建的类别：${this.formatDisplayName(validCategory)}`,
      isCore: false,
      createdAt: new Date().toISOString(),
      usageCount: 1
    };

    this.categories.set(validCategory, categoryInfo);
    console.log(`[CategoryManager] ✨ 创建新类别: ${validCategory} - ${categoryInfo.displayName}`);
    
    return categoryInfo;
  }

  // 获取类别信息
  getCategoryInfo(category: string): CategoryInfo | null {
    const validCategory = this.validateCategory(category);
    return this.categories.get(validCategory) || null;
  }

  // 获取类别显示名称
  getCategoryDisplayName(category: string): string {
    const info = this.getCategoryInfo(category);
    return info ? info.displayName : this.formatDisplayName(category);
  }

  // 获取所有类别
  getAllCategories(): CategoryInfo[] {
    return Array.from(this.categories.values())
      .sort((a, b) => {
        // 核心类别在前，按使用次数排序
        if (a.isCore && !b.isCore) return -1;
        if (!a.isCore && b.isCore) return 1;
        return b.usageCount - a.usageCount;
      });
  }

  // 获取类别建议（用于LLM提示）
  getCategorySuggestions(): string[] {
    const coreCategories = Object.keys(this.coreCategories);
    const dynamicExamples = [...DYNAMIC_CATEGORY_EXAMPLES];
    
    // 获取最常用的自定义类别
    const customCategories = Array.from(this.categories.values())
      .filter(cat => !cat.isCore && cat.usageCount > 0)
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10)
      .map(cat => cat.name);

    return [...coreCategories, ...customCategories, ...dynamicExamples];
  }

  // 智能类别推荐（基于内容分析）
  suggestCategory(content: string): string[] {
    const suggestions: string[] = [];
    const lowerContent = content.toLowerCase();

    // 健康医疗
    if (lowerContent.match(/(健康|医院|药|疾病|体检|医生|治疗|症状)/)) {
      suggestions.push('health_medical');
    }

    // 烹饪美食
    if (lowerContent.match(/(做菜|食谱|餐厅|美食|菜|吃|烹饪|料理)/)) {
      suggestions.push('cooking_food');
    }

    // 旅行地点
    if (lowerContent.match(/(旅行|旅游|出差|城市|景点|酒店|机票|签证)/)) {
      suggestions.push('travel_location');
    }

    // 财务金钱
    if (lowerContent.match(/(钱|收入|支出|投资|理财|银行|股票|基金|价格)/)) {
      suggestions.push('financial_money');
    }

    // 娱乐休闲
    if (lowerContent.match(/(电影|音乐|游戏|看剧|演出|娱乐|放松)/)) {
      suggestions.push('entertainment');
    }

    // 运动健身
    if (lowerContent.match(/(运动|健身|锻炼|跑步|游泳|球|体育|减肥)/)) {
      suggestions.push('sports_fitness');
    }

    // 学习进修
    if (lowerContent.match(/(学习|课程|培训|考试|证书|书|知识|研究)/)) {
      suggestions.push('learning_study');
    }

    // 家庭居住
    if (lowerContent.match(/(家|房子|装修|家具|搬家|房租|物业)/)) {
      suggestions.push('family_home');
    }

    // 购物消费
    if (lowerContent.match(/(买|购物|商店|品牌|购买|消费|商品)/)) {
      suggestions.push('shopping_purchase');
    }

    // 创作艺术
    if (lowerContent.match(/(画|写作|设计|创作|艺术|摄影|音乐创作)/)) {
      suggestions.push('creative_art');
    }

    return suggestions.length > 0 ? suggestions : ['other'];
  }

  // 类别使用统计
  getCategoryStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    this.categories.forEach((info, name) => {
      stats[name] = info.usageCount;
    });
    return stats;
  }
}

// 全局类别管理器实例
let categoryManagerInstance: MemoryCategoryManager | null = null;

export function getCategoryManager(): MemoryCategoryManager {
  if (!categoryManagerInstance) {
    categoryManagerInstance = new MemoryCategoryManager();
  }
  return categoryManagerInstance;
} 