import { MemoryCategory, ExtractedMemory } from '@/types/memory';

const EXTRACTION_PATTERNS = {
  // 基础个人信息
  personal_info: [
    /我叫.{1,10}/g, 
    /我的名字是.{1,10}/g, 
    /我今年.{1,5}岁/g,
    /我是.{1,20}/g,
    /我来自.{1,15}/g,
    /我住在.{1,15}/g
  ],
  
  // 工作相关
  work_context: [
    /我的工作是.{1,20}/g, 
    /我在.{1,20}公司/g, 
    /我负责.{1,30}/g,
    /我的职位是.{1,20}/g,
    /我从事.{1,20}/g,
    /我的岗位.{1,20}/g
  ],
  
  // 设备配置和技术信息 - 新增重要类别
  device_info: [
    /我.{0,5}电脑配置.{1,50}/g,
    /我.{0,5}设备.{1,40}/g,
    /我用.{1,30}电脑/g,
    /我的.{0,10}MacBook.{0,30}/g,
    /我的.{0,10}Mac.{0,30}/g,
    /我有.{1,30}内存/g,
    /我的.{0,10}CPU.{1,30}/g,
    /我的.{0,10}显卡.{1,30}/g,
    /我的硬件.{1,40}/g,
    /我的系统.{1,30}/g,
    /我在用.{1,30}/g
  ],
  
  // 技能和专业能力
  skills: [
    /我会.{1,30}/g,
    /我掌握.{1,30}/g,
    /我擅长.{1,30}/g,
    /我熟悉.{1,30}/g,
    /我学过.{1,30}/g,
    /我了解.{1,30}/g,
    /我使用.{1,30}/g
  ],
  
  // 学习和教育背景
  education: [
    /我毕业于.{1,20}/g,
    /我在.{1,20}大学/g,
    /我的专业是.{1,20}/g,
    /我学的是.{1,20}/g,
    /我读.{1,15}/g,
    /我的学历.{1,20}/g
  ],
  
  // 兴趣爱好
  preferences: [
    /我喜欢.{1,30}/g, 
    /我不喜欢.{1,30}/g,
    /我爱好.{1,30}/g,
    /我的兴趣.{1,30}/g,
    /我经常.{1,30}/g,
    /我平时.{1,30}/g
  ],
  
  // 联系方式和位置
  contact_info: [
    /我的电话.{1,20}/g,
    /我的邮箱.{1,30}/g,
    /我的微信.{1,20}/g,
    /我的地址.{1,30}/g,
    /我住在.{1,20}/g,
    /联系我.{1,30}/g
  ],
  
  // 目标和计划
  goals: [
    /我计划.{1,30}/g, 
    /我想要.{1,30}/g,
    /我希望.{1,30}/g,
    /我的目标.{1,30}/g,
    /我打算.{1,30}/g,
    /我准备.{1,30}/g
  ],
  
  // 观点和态度
  opinions: [
    /我认为.{1,50}/g, 
    /我觉得.{1,50}/g,
    /我的看法.{1,40}/g,
    /我相信.{1,40}/g,
    /在我看来.{1,40}/g
  ],
  
  // 项目和作品
  projects: [
    /我做过.{1,40}/g,
    /我开发.{1,40}/g,
    /我参与.{1,40}/g,
    /我的项目.{1,40}/g,
    /我负责的.{1,40}/g,
    /我完成.{1,40}/g
  ],
  
  // 生活状态和习惯
  lifestyle: [
    /我通常.{1,30}/g,
    /我习惯.{1,30}/g,
    /我每天.{1,30}/g,
    /我的生活.{1,30}/g,
    /我的作息.{1,30}/g
  ]
};

export class MemoryExtractor {
  extractFromMessage(content: string): ExtractedMemory[] {
    const memories: ExtractedMemory[] = [];
    
    for (const [category, patterns] of Object.entries(EXTRACTION_PATTERNS)) {
      for (const pattern of patterns) {
        const matches = content.match(pattern);
        if (matches) {
          for (const match of matches) {
            const cleanMatch = match.trim();
            if (cleanMatch.length > 3) {
              memories.push({
                content: cleanMatch,
                category: category as MemoryCategory,
                tags: [category],
                importance: this.calculateImportance(category as MemoryCategory),
                extractedFrom: content,
              });
            }
          }
        }
      }
    }
    
    return memories;
  }

  extractFromConversation(messages: { content: string; type: string }[]): ExtractedMemory[] {
    const allMemories: ExtractedMemory[] = [];
    const userMessages = messages.filter(msg => msg.type === 'user');
    
    for (const message of userMessages) {
      const memories = this.extractFromMessage(message.content);
      allMemories.push(...memories);
    }
    
    return allMemories;
  }

  private calculateImportance(category: MemoryCategory): number {
    const weights: Record<string, number> = {
      personal_info: 9,
      device_info: 8,      // 设备信息重要性高
      work_context: 8, 
      skills: 7,           // 技能信息重要
      education: 7,
      contact_info: 8,     // 联系方式重要
      preferences: 6, 
      interests: 5,        // 兴趣爱好
      relationships: 7,    // 人际关系和宠物重要
      goals: 7,
      projects: 7,         // 项目经验重要
      lifestyle: 5,
      opinions: 4, 
      experiences: 6,      // 经历体验
      facts: 6, 
      other: 3,
    };
    return weights[category as string] || 5;
  }
}
