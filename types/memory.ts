// 记忆相关的类型定义

export interface Memory {
  id: number;
  userId: string;
  content: string;
  category: MemoryCategory;
  tags: string[];
  source: MemorySource;
  conversationId?: number;
  importance: number; // 1-10的重要性评分
  createdAt: string;
  updatedAt: string;
  extractedFrom?: string; // 原始提取来源
}

// 预定义的核心类别（保持向后兼容）
export type CoreMemoryCategory = 
  | 'personal_info'    // 个人信息：姓名、年龄、居住地等
  | 'work_context'     // 工作相关：公司、职位、项目等
  | 'device_info'      // 设备配置：电脑、硬件、系统等
  | 'skills'           // 技能能力：专业技能、语言、工具等
  | 'education'        // 教育背景：学历、专业、学校等
  | 'contact_info'     // 联系信息：电话、邮箱、地址等
  | 'preferences'      // 偏好设置：喜好、厌恶等
  | 'interests'        // 兴趣爱好：技术、娱乐等
  | 'relationships'    // 人际关系：家庭、朋友、宠物等
  | 'goals'            // 目标计划：短期和长期目标
  | 'projects'         // 项目作品：开发经验、作品展示等
  | 'lifestyle'        // 生活方式：习惯、作息、日常等
  | 'opinions'         // 观点态度：对某事的看法
  | 'experiences'      // 经历体验：过往经验、故事等
  | 'facts'           // 客观事实
  | 'other';          // 其他类别

// 动态扩展的记忆类别系统 - 支持任意字符串作为类别
export type MemoryCategory = CoreMemoryCategory | string;

// 类别验证和规范化
export interface CategoryInfo {
  name: string;           // 类别名称
  displayName: string;    // 显示名称
  description: string;    // 类别描述
  isCore: boolean;        // 是否为核心类别
  createdAt: string;      // 创建时间
  usageCount: number;     // 使用次数
}

export type MemorySource = 
  | 'conversation'     // 从对话中提取
  | 'upload'          // 用户上传
  | 'manual';         // 手动添加

export interface ExtractedMemory {
  content: string;
  category: MemoryCategory;
  tags: string[];
  importance: number;
  extractedFrom: string;
}

export interface MemorySearchResult {
  memory: Memory;
  relevanceScore: number; // 相关性分数 0-1
}

// 类别管理接口
export interface CategoryManager {
  validateCategory(category: string): string;
  registerCategory(category: string, description?: string): CategoryInfo;
  getCategoryInfo(category: string): CategoryInfo | null;
  getAllCategories(): CategoryInfo[];
  getCategoryDisplayName(category: string): string;
}

// 动态类别示例（LLM可以智能创建这些类别）
export const DYNAMIC_CATEGORY_EXAMPLES = [
  'health_medical',     // 健康医疗：疾病、药物、医院等
  'cooking_food',       // 烹饪美食：食谱、餐厅、口味等
  'travel_location',    // 旅行地点：城市、景点、住宿等
  'financial_money',    // 财务金钱：投资、收支、理财等
  'entertainment',      // 娱乐休闲：电影、音乐、游戏等
  'sports_fitness',     // 运动健身：锻炼、比赛、器材等
  'learning_study',     // 学习进修：课程、书籍、知识等
  'family_home',        // 家庭居住：房屋、家具、装修等
  'shopping_purchase',  // 购物消费：商品、品牌、价格等
  'social_community',   // 社交社区：朋友圈、组织、活动等
  'creative_art',       // 创作艺术：绘画、写作、设计等
  'technology_digital', // 科技数码：软件、应用、网站等
  'pet_animal',         // 宠物动物：饲养、护理、品种等
  'vehicle_transport',  // 交通工具：汽车、公交、出行等
  'habit_routine'       // 习惯日常：作息、流程、规律等
] as const;
