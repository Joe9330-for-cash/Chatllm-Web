import OpenAI from 'openai';

export class ChineseNLPService {
  private openai: OpenAI;
  
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "sk-ckdV60TvXrxPMSqb22D292F176A448828e80A866BaBd2d87",
      baseURL: process.env.OPENAI_API_BASE || "https://api.laozhang.ai/v1"
    });
  }

  async extractKeywords(query: string): Promise<string[]> {
    console.log(`[ChineseNLP] 🧠 使用deepseek-v3提取关键词: "${query}"`);
    
    try {
      const completion = await this.openai.chat.completions.create({
        model: "deepseek-v3",
        temperature: 0.1,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content: `你是专业的中文关键词提取专家。请从用户查询中提取所有重要的关键词，用于记忆搜索。

规则：
1. 提取核心名词、动词、形容词
2. 保留重要的单字词（如"我"、"你"、"他"）
3. 识别人名、地名、品牌名
4. 识别技术术语和专业词汇
5. 避免无意义的词汇组合
6. 按重要性排序

输出格式：直接返回关键词列表，用逗号分隔，不要任何解释。

示例：
查询："我要向我的新员工介绍自己"
输出：我,自己,介绍,员工,新员工,个人,信息,工作`
          },
          {
            role: "user",
            content: `请从以下查询中提取关键词：${query}`
          }
        ]
      });

      const response = completion.choices[0].message.content;
      if (!response) {
        throw new Error('空响应');
      }

      // 解析关键词
      const keywords = response
        .split(',')
        .map(keyword => keyword.trim())
        .filter(keyword => keyword.length > 0 && keyword.length <= 10) // 过滤过长的词
        .slice(0, 20); // 限制数量

      console.log(`[ChineseNLP] ✅ 提取完成: [${keywords.join(', ')}]`);
      return keywords;

    } catch (error) {
      console.error('[ChineseNLP] ❌ 关键词提取失败:', error);
      
      // 降级处理：使用基础规则
      return this.fallbackKeywordExtraction(query);
    }
  }

  private fallbackKeywordExtraction(query: string): string[] {
    console.log('[ChineseNLP] 🔄 使用降级关键词提取');
    
    // 重要关键词映射
    const keywordMap: { [key: string]: string[] } = {
      '我': ['我', '自己', '个人', '本人'],
      '自己': ['自己', '我', '个人'],
      '介绍': ['介绍', '展示', '说明', '描述'],
      '履历': ['履历', '简历', '经历', '工作经验'],
      '员工': ['员工', '同事', '工作', '团队'],
      '电脑': ['电脑', 'MacBook', '设备', '配置'],
      '宠物': ['宠物', '狗', '猫', '动物'],
      '项目': ['项目', '工作', '经验', '经历'],
      '名字': ['名字', '姓名', '王大拿'],
    };

    const keywords: string[] = [];
    
    // 直接匹配重要关键词
    Object.entries(keywordMap).forEach(([key, related]) => {
      if (query.includes(key)) {
        keywords.push(key, ...related.slice(0, 2));
      }
    });

    // 提取2-3字的有意义词汇
    const segments = query.match(/[\u4e00-\u9fa5]{2,3}/g) || [];
    const meaningfulSegments = segments.filter(segment => 
      !['应该', '怎样', '有效', '感觉', '同时', '又能'].includes(segment)
    );

    keywords.push(...meaningfulSegments.slice(0, 5));

    const result = Array.from(new Set(keywords)).slice(0, 15);
    console.log(`[ChineseNLP] 🔄 降级提取结果: [${result.join(', ')}]`);
    
    return result;
  }

  async analyzeSentiment(text: string): Promise<{
    sentiment: 'positive' | 'negative' | 'neutral';
    confidence: number;
    keywords: string[];
  }> {
    console.log(`[ChineseNLP] 🎭 分析情感: "${text.substring(0, 100)}..."`);
    
    try {
      const completion = await this.openai.chat.completions.create({
        model: "deepseek-v3",
        temperature: 0.1,
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content: `你是专业的中文情感分析专家。请分析用户文本的情感倾向。

输出JSON格式：
{
  "sentiment": "positive/negative/neutral",
  "confidence": 0.95,
  "keywords": ["关键词1", "关键词2"]
}

sentiment: 情感倾向
confidence: 置信度(0-1)
keywords: 情感关键词`
          },
          {
            role: "user",
            content: `请分析以下文本的情感：${text}`
          }
        ]
      });

      const response = completion.choices[0].message.content;
      if (!response) {
        throw new Error('空响应');
      }

      const result = JSON.parse(response);
      console.log(`[ChineseNLP] ✅ 情感分析完成: ${result.sentiment} (${result.confidence})`);
      
      return result;

    } catch (error) {
      console.error('[ChineseNLP] ❌ 情感分析失败:', error);
      
      return {
        sentiment: 'neutral',
        confidence: 0.5,
        keywords: []
      };
    }
  }

  async extractEntities(text: string): Promise<{
    persons: string[];
    organizations: string[];
    locations: string[];
    technologies: string[];
    products: string[];
  }> {
    console.log(`[ChineseNLP] 🏷️ 提取实体: "${text.substring(0, 100)}..."`);
    
    try {
      const completion = await this.openai.chat.completions.create({
        model: "deepseek-v3",
        temperature: 0.1,
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content: `你是专业的中文实体识别专家。请从文本中识别以下实体：

输出JSON格式：
{
  "persons": ["人名1", "人名2"],
  "organizations": ["组织名1", "组织名2"],
  "locations": ["地点1", "地点2"],
  "technologies": ["技术1", "技术2"],
  "products": ["产品1", "产品2"]
}

persons: 人名、姓名
organizations: 公司、组织、机构
locations: 地点、城市、国家
technologies: 技术、编程语言、框架
products: 产品、设备、品牌`
          },
          {
            role: "user",
            content: `请从以下文本中提取实体：${text}`
          }
        ]
      });

      const response = completion.choices[0].message.content;
      if (!response) {
        throw new Error('空响应');
      }

      const result = JSON.parse(response);
      console.log(`[ChineseNLP] ✅ 实体提取完成: ${Object.keys(result).length} 类实体`);
      
      return result;

    } catch (error) {
      console.error('[ChineseNLP] ❌ 实体提取失败:', error);
      
      return {
        persons: [],
        organizations: [],
        locations: [],
        technologies: [],
        products: []
      };
    }
  }
}

// 单例实例
let nlpServiceInstance: ChineseNLPService | null = null;

export function getChineseNLPService(): ChineseNLPService {
  if (!nlpServiceInstance) {
    nlpServiceInstance = new ChineseNLPService();
  }
  return nlpServiceInstance;
} 