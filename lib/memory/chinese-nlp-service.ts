import OpenAI from 'openai';

export class ChineseNLPService {
  private openai: OpenAI;
  private cache: Map<string, { data: string[], timestamp: number }> = new Map();
  private cacheTimeout = 1000 * 60 * 30; // 30分钟缓存
  
  constructor() {
    this.openai = new OpenAI({
      apiKey: "sk-ckdV60TvXrxPMSqb22D292F176A448828e80A866BaBd2d87",
      baseURL: "https://api.laozhang.ai/v1"
    });
  }

  // 🧠 智能关键词提取
  async extractKeywords(text: string): Promise<string[]> {
    try {
      // 检查缓存
      const cacheKey = text.trim().toLowerCase();
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log(`[NLP服务] 📦 使用缓存结果: "${text}" (缓存${Math.floor((Date.now() - cached.timestamp) / 1000)}秒前)`);
        return cached.data;
      }

      console.log(`[NLP服务] 🔍 智能提取关键词: "${text}"`);
      
      const prompt = `请从以下中文文本中提取关键词，要求：
1. 提取3-8个最重要的关键词
2. 关键词长度为1-4个字符
3. 包含名词、动词、形容词等有意义的词汇
4. 避免无意义的词汇如"的"、"是"、"在"等
5. 如果是问句，提取核心概念而非疑问词
6. 只返回关键词，用逗号分隔，不要其他解释

文本: "${text}"

关键词:`;

      const completion = await this.openai.chat.completions.create({
        model: "deepseek-v3",
        messages: [
          { role: "system", content: "你是一个专业的中文NLP关键词提取助手。" },
          { role: "user", content: prompt }
        ],
        max_tokens: 200,
        temperature: 0.3
      }, {
        timeout: 3000 // 3秒超时
      });

      const keywordsText = completion.choices[0].message.content?.trim() || '';
      
      // 解析关键词
      const keywords = keywordsText
        .split(/[,，、\s]+/)
        .map(k => k.trim())
        .filter(k => k.length > 0 && k.length <= 10)
        .filter(k => !this.isStopWord(k))
        .slice(0, 8); // 最多8个关键词

      console.log(`[NLP服务] ✅ 提取结果: [${keywords.join(', ')}]`);
      
      // 缓存结果 - 延长缓存时间
      this.cache.set(cacheKey, {
        data: keywords,
        timestamp: Date.now()
      });
      
      return keywords;
      
    } catch (error) {
      console.error(`[NLP服务] ❌ 智能提取失败，使用备用方案:`, error);
      return this.fallbackExtraction(text);
    }
  }

  // 🔄 备用关键词提取方案
  private fallbackExtraction(text: string): string[] {
    const keywords: string[] = [];
    
    // 预定义关键词映射
    const keywordMappings = [
      { patterns: [/家庭|家人|亲人|父母|兄弟|姐妹|老婆|太太|妻子|丈夫|老公|孩子|儿子|女儿/], keywords: ['家庭', '家人', '亲属关系'] },
      { patterns: [/工作|职业|公司|CEO|COO|员工|同事|老板|领导/], keywords: ['工作', '职业', '公司'] },
      { patterns: [/个人|自己|我|姓名|名字|年龄|性格|爱好/], keywords: ['个人信息', '基本情况'] },
      { patterns: [/设备|电脑|配置|MacBook|iPhone|技术|编程/], keywords: ['设备', '技术', '配置'] },
      { patterns: [/宠物|猫|狗|动物|喜欢|饲养/], keywords: ['宠物', '动物', '爱好'] },
      { patterns: [/学习|教育|技能|经验|能力|专业/], keywords: ['学习', '技能', '经验'] },
      { patterns: [/健康|医疗|身体|锻炼|运动|保健/], keywords: ['健康', '医疗', '身体'] },
      { patterns: [/金钱|财务|工资|收入|支出|投资/], keywords: ['金钱', '财务', '经济'] },
      { patterns: [/目标|计划|愿望|梦想|追求|理想/], keywords: ['目标', '计划', '愿望'] },
      { patterns: [/QS|公司|企业|团队|项目|业务/], keywords: ['QS公司', '企业', '业务'] }
    ];
    
    // 匹配预定义模式
    for (const mapping of keywordMappings) {
      for (const pattern of mapping.patterns) {
        if (pattern.test(text)) {
          keywords.push(...mapping.keywords);
          break;
        }
      }
    }
    
    // 提取中文词汇（2-4字符）
    const chineseWords = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
    for (const word of chineseWords) {
      if (!this.isStopWord(word) && word.length >= 2 && word.length <= 4) {
        keywords.push(word);
      }
    }
    
    // 去重并限制数量
    return Array.from(new Set(keywords)).slice(0, 6);
  }

  // 🛑 停用词过滤
  private isStopWord(word: string): boolean {
    const stopWords = [
      '的', '是', '在', '了', '和', '与', '或', '但', '而', '因为', '所以', '如果', '那么',
      '这个', '那个', '什么', '哪个', '怎么', '为什么', '多少', '几个', '一些', '一般',
      '可能', '应该', '需要', '希望', '想要', '觉得', '认为', '知道', '了解', '清楚',
      '请', '谢谢', '对不起', '不好意思', '没关系', '不用', '可以', '不可以',
      '关键词', '提取', '文本', '内容', '信息', '数据', '结果', '方案', '问题', '答案'
    ];
    
    return stopWords.includes(word) || word.length < 2 || word.length > 6;
  }

  // 🔄 备用关键词提取方案
  private fallbackKeywordExtraction(text: string): string[] {
    // 简单的中文关键词提取
    const keywords: string[] = [];
    
    // 移除无用词汇
    const cleanText = text.replace(/[，。！？；：""''（）【】\s]/g, ' ');
    
    // 基于常见模式的关键词提取
    const patterns = [
      /(\w{2,4})(公司|企业|机构)/g,
      /(我|他|她|它)+(的)*([\u4e00-\u9fa5]{1,3})/g,
      /[\u4e00-\u9fa5]{2,4}/g
    ];
    
    patterns.forEach(pattern => {
      const matches = cleanText.match(pattern);
      if (matches) {
        keywords.push(...matches.filter(match => match.length >= 2 && match.length <= 4));
      }
    });
    
    // 去重并限制数量
    return Array.from(new Set(keywords)).slice(0, 8);
  }

  // 🔗 生成相关词汇（用于扩展搜索）
  async generateRelatedTerms(keywords: string[]): Promise<string[]> {
    try {
      console.log(`[NLP服务] 🔗 生成相关词汇: ${keywords.join(', ')}`);
      
      if (keywords.length === 0) {
        return [];
      }

      const cacheKey = `related_terms_${keywords.join('_')}`;
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 3600000) { // 1小时缓存
          console.log(`[NLP服务] 📦 使用缓存的相关词汇: ${cached.data.join(', ')}`);
          return cached.data;
        }
      }

      const prompt = `请为以下中文关键词生成5个最相关的同义词或相关词汇，只返回词汇列表，用逗号分隔：
关键词：${keywords.join('、')}

要求：
1. 只返回相关词汇，不要解释
2. 词汇要简洁实用
3. 优先考虑同义词和近义词
4. 格式：词汇1,词汇2,词汇3,词汇4,词汇5`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 100
      }, {
        timeout: 10000  // 10秒超时
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) {
        console.log(`[NLP服务] ⚠️ 生成相关词汇为空，返回原始关键词`);
        return keywords;
      }

      const relatedTerms = content.split(',').map(term => term.trim()).filter(term => term.length > 0);
      console.log(`[NLP服务] ✅ 生成相关词汇: ${relatedTerms.join(', ')}`);
      
      // 缓存结果
      this.cache.set(cacheKey, {
        data: relatedTerms,
        timestamp: Date.now()
      });
      
      return relatedTerms;
    } catch (error) {
      console.error(`[NLP服务] ❌ 生成相关词汇失败:`, error);
      
      // 超时或其他错误时，返回基础的相关词汇
      const fallbackTerms = this.generateFallbackTerms(keywords);
      console.log(`[NLP服务] 🔧 使用备用相关词汇: ${fallbackTerms.join(', ')}`);
      return fallbackTerms;
    }
  }

  // 🔧 生成备用相关词汇（无需API调用）
  private generateFallbackTerms(keywords: string[]): string[] {
    const fallbackMap: { [key: string]: string[] } = {
      '家庭': ['家人', '亲属', '父母', '配偶', '孩子'],
      '关系': ['关联', '联系', '交往', '互动', '沟通'],
      '成员': ['人员', '成份', '组成', '构成', '参与'],
      '工作': ['职业', '事业', '岗位', '职位', '任务'],
      '学习': ['教育', '培训', '进修', '研究', '掌握'],
      '技能': ['能力', '专长', '才能', '技术', '本领'],
      '爱好': ['兴趣', '喜好', '偏好', '热爱', '钟情'],
      '朋友': ['友人', '伙伴', '同伴', '知己', '挚友'],
      '计划': ['规划', '安排', '打算', '目标', '方案'],
      '经验': ['体验', '阅历', '见识', '历练', '感受']
    };

    const result: string[] = [];
    for (const keyword of keywords) {
      if (fallbackMap[keyword]) {
        result.push(...fallbackMap[keyword]);
      } else {
        // 如果没有预定义，添加一些通用相关词
        result.push(keyword);
      }
    }

    return Array.from(new Set(result)).slice(0, 5); // 去重并限制数量
  }

  // 🧹 清理缓存
  clearCache(): void {
    this.cache.clear();
    console.log(`[NLP服务] 🧹 缓存已清理`);
  }
}

// 单例模式
let nlpService: ChineseNLPService | null = null;

export const getChineseNLPService = (): ChineseNLPService => {
  if (!nlpService) {
    nlpService = new ChineseNLPService();
  }
  return nlpService;
}; 