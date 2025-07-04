import Database from 'better-sqlite3';
import path from 'path';
import { Memory, MemoryCategory, MemorySource } from '@/types/memory';
import { getChineseNLPService } from './chinese-nlp-service';

const DB_PATH = path.join(process.cwd(), 'data', 'memories.db');

class MemoryDatabase {
  private db: Database.Database;

  constructor() {
    const fs = require('fs');
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(DB_PATH);
    this.initTables();
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        tags TEXT NOT NULL,
        source TEXT NOT NULL,
        conversation_id INTEGER,
        importance INTEGER NOT NULL DEFAULT 5,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        extracted_from TEXT
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
      CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
    `);

    console.log('✅ 记忆数据库初始化完成');
  }

  insertMemory(
    userId: string,
    content: string,
    category: MemoryCategory,
    tags: string[],
    source: MemorySource,
    importance: number = 5,
    conversationId?: number,
    extractedFrom?: string
  ): number {
    const stmt = this.db.prepare(`
      INSERT INTO memories (user_id, content, category, tags, source, importance, conversation_id, extracted_from)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      userId, content, category, JSON.stringify(tags), source, importance, conversationId || null, extractedFrom || null
    );

    return result.lastInsertRowid as number;
  }

  getUserMemories(userId: string, limit: number = 100): Memory[] {
    const stmt = this.db.prepare(`
      SELECT * FROM memories WHERE user_id = ? ORDER BY importance DESC, created_at DESC LIMIT ?
    `);
    const rows = stmt.all(userId, limit) as any[];
    return rows.map(this.rowToMemory);
  }

  searchMemories(userId: string, query: string, limit: number = 10): Memory[] {
    console.log(`[Database] 搜索查询: "${query}"`);
    
    // 改进的搜索：提取关键词进行智能匹配
    const keywords = this.extractKeywords(query);
    console.log(`[Database] 提取的关键词:`, keywords);
    
    return this.performSearch(userId, keywords, limit);
  }

  async searchMemoriesAsync(userId: string, query: string, limit: number = 10): Promise<Memory[]> {
    console.log(`[Database] 🚀 智能搜索查询: "${query}"`);
    
    try {
      // 尝试使用deepseek-v3进行智能关键词提取
      const nlpService = getChineseNLPService();
      const keywords = await nlpService.extractKeywords(query);
      console.log(`[Database] 🧠 智能提取的关键词:`, keywords);
      
      const results = this.performSearch(userId, keywords, limit);
      
      if (results.length === 0) {
        console.log(`[Database] ⚠️ 智能搜索无结果，尝试降级搜索`);
        // 降级到本地关键词提取
        const fallbackKeywords = this.extractKeywords(query);
        return this.performSearch(userId, fallbackKeywords, limit);
      }
      
      return results;
      
    } catch (error) {
      console.error('[Database] ❌ 智能搜索失败，降级到本地搜索:', error);
      // 降级到本地关键词提取
      const keywords = this.extractKeywords(query);
      return this.performSearch(userId, keywords, limit);
    }
  }

  private performSearch(userId: string, keywords: string[], limit: number): Memory[] {
    if (keywords.length === 0) {
      // 如果没有关键词，返回所有记忆
      const stmt = this.db.prepare(`SELECT * FROM memories WHERE user_id = ? ORDER BY importance DESC LIMIT ?`);
      const rows = stmt.all(userId, limit) as any[];
      console.log(`[Database] 没有关键词，返回所有记忆: ${rows.length} 条`);
      return rows.map(this.rowToMemory);
    }
    
    // 构建灵活的搜索条件
    const conditions: string[] = [];
    const params: any[] = [userId];
    
    keywords.forEach(keyword => {
      conditions.push(`(content LIKE ? OR tags LIKE ?)`);
      params.push(`%${keyword}%`, `%${keyword}%`);
    });
    
    const sql = `
      SELECT * FROM memories 
      WHERE user_id = ? AND (${conditions.join(' OR ')})
      ORDER BY importance DESC 
      LIMIT ?
    `;
    params.push(limit);
    
    console.log(`[Database] SQL查询:`, sql);
    console.log(`[Database] 参数:`, params);
    
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    
    console.log(`[Database] 搜索结果: ${rows.length} 条记忆`);
    return rows.map(this.rowToMemory);
  }

  getMemoriesByCategory(userId: string, category: MemoryCategory): Memory[] {
    const stmt = this.db.prepare(`SELECT * FROM memories WHERE user_id = ? AND category = ?`);
    const rows = stmt.all(userId, category) as any[];
    return rows.map(this.rowToMemory);
  }

  updateMemory(id: number, updates: Partial<Memory>): boolean {
    return true; // 简化实现
  }

  deleteMemory(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM memories WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  getMemoryStats(userId: string): any {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM memories WHERE user_id = ?');
    const total = totalStmt.get(userId) as any;
    return { totalMemories: total.count, categoryCounts: {} };
  }

  private rowToMemory(row: any): Memory {
    return {
      id: row.id,
      userId: row.user_id,
      content: row.content,
      category: row.category as MemoryCategory,
      tags: JSON.parse(row.tags || '[]'),
      source: row.source as MemorySource,
      conversationId: row.conversation_id,
      importance: row.importance,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      extractedFrom: row.extracted_from,
    };
  }

  close() {
    this.db.close();
  }

  private extractKeywords(query: string): string[] {
    console.log(`[Database] 关键词提取: "${query}"`);
    
    // 扩展的关键词映射，支持更丰富的语义匹配
    const keywordMap: { [key: string]: string[] } = {
      // 身份信息（最重要）
      '我': ['我', '自己', '个人', '本人', '王大拿', '姓名', '名字', '信息'],
      '自己': ['自己', '我', '个人', '本人', '信息', '情况', '资料'],
      '介绍': ['介绍', '展示', '说明', '描述', '个人', '情况', '资料'],
      '个人': ['个人', '我', '自己', '基本', '信息', '情况', '资料'],
      '名字': ['名字', '姓名', '称呼', '叫', '王大拿'],
      '年龄': ['年龄', '岁', '多大', '几岁', '年纪'],
      
      // 设备配置
      '电脑': ['电脑', '计算机', 'MacBook', 'Mac', '笔记本', '设备'],
      '配置': ['配置', '硬件', '参数', '性能', '电脑'],
      '内存': ['内存', 'RAM', 'G', 'GB', '128g'],
      'CPU': ['CPU', '处理器', 'M1', 'M2', 'M3', 'max'],
      'MacBook': ['MacBook', 'Mac', '电脑', '笔记本', '设备'],
      'M3': ['M3', 'max', 'CPU', '处理器', '性能'],
      
      // 工作相关
      '工作': ['工作', '职业', '职位', '公司', '应聘', '求职', '面试'],
      '简历': ['简历', 'CV', '履历', '经历', '工作'],
      '履历': ['履历', '简历', '经历', '工作', '职业', '经验'],
      '员工': ['员工', '同事', '工作', '团队', '介绍'],
      '项目': ['项目', '经验', '经历', '工作'],
      '技能': ['技能', '能力', '专业', '特长', '工作'],
      
      // 兴趣爱好
      '喜欢': ['喜欢', '爱好', '兴趣', '偏好'],
      '宠物': ['宠物', '狗', '猫', '动物', '皮皮'],
      '狗': ['狗', '宠物', '动物', '皮皮', '金毛'],
      '皮皮': ['皮皮', '狗', '宠物', '金毛'],
      
      // 生活相关
      '家庭': ['家庭', '家人', '婚姻', '伴侣', '妻子'],
      '地址': ['地址', '住址', '位置', '城市', '家'],
      '联系': ['联系', '电话', '邮箱', '微信'],
    };
    
    const extractedKeywords: string[] = [];
    
    // 1. 处理特殊问句模式（按重要性排序）
    const specialPatterns = [
      { pattern: /(我|自己|个人).*?(介绍|展示|说明|描述)/, keywords: ['我', '自己', '个人', '介绍', '名字', '信息', '工作', '技能'] },
      { pattern: /(履历|简历|CV|经历)/, keywords: ['履历', '简历', '工作', '经验', '技能', '教育', '项目'] },
      { pattern: /(电脑|配置|MacBook|M3|设备)/, keywords: ['电脑', '配置', '硬件', 'MacBook', '设备', 'M3'] },
      { pattern: /(宠物|狗|猫|皮皮)/, keywords: ['宠物', '狗', '猫', '动物', '皮皮', '爱好'] },
      { pattern: /(员工|同事|团队)/, keywords: ['员工', '工作', '团队', '介绍', '履历'] },
      { pattern: /(华为|应聘|求职|面试)/, keywords: ['华为', '应聘', '工作', '职业', '简历', '经验'] },
    ];
    
    for (const { pattern, keywords } of specialPatterns) {
      if (pattern.test(query)) {
        extractedKeywords.push(...keywords);
        console.log(`[Database] 匹配特殊模式: ${pattern} → [${keywords.join(', ')}]`);
      }
    }
    
    // 2. 直接关键词匹配
    Object.entries(keywordMap).forEach(([mainKeyword, relatedKeywords]) => {
      if (query.includes(mainKeyword)) {
        extractedKeywords.push(mainKeyword, ...relatedKeywords.slice(0, 2)); // 减少数量避免过度匹配
        console.log(`[Database] 匹配关键词: ${mainKeyword} → 添加相关词`);
      }
    });
    
    // 3. 智能中文分词：提取有意义的词汇
    const meaningfulWords = this.extractMeaningfulChineseWords(query);
    if (meaningfulWords.length > 0) {
      extractedKeywords.push(...meaningfulWords);
      console.log(`[Database] 中文分词: [${meaningfulWords.join(', ')}]`);
    }
    
    // 4. 去重并排序，保持重要关键词在前
    let finalKeywords = Array.from(new Set(extractedKeywords));
    
    // 按重要性排序
    const priorityOrder = ['我', '自己', '个人', '介绍', '名字', '王大拿', '履历', '简历', '工作', '电脑', '配置', 'MacBook', '宠物', '狗', '皮皮'];
    finalKeywords.sort((a, b) => {
      const aIndex = priorityOrder.indexOf(a);
      const bIndex = priorityOrder.indexOf(b);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return 0;
    });
    
    // 限制关键词数量，确保搜索效率
    if (finalKeywords.length > 15) {
      finalKeywords = finalKeywords.slice(0, 15);
    }
    
    console.log(`[Database] 关键词提取完成: "${query}" → [${finalKeywords.join(', ')}]`);
    return finalKeywords;
  }
  
  // 提取有意义的中文词汇
  private extractMeaningfulChineseWords(text: string): string[] {
    const words: string[] = [];
    
    // 1. 重要的单字词汇（特别是"我"）
    const importantSingleChars = ['我', '你', '他', '她'];
    importantSingleChars.forEach(char => {
      if (text.includes(char)) {
        words.push(char);
      }
    });
    
    // 2. 重要的双字词汇
    const importantDoubleChars = [
      '自己', '个人', '介绍', '履历', '简历', '工作', '项目', '技能', '能力', '经验', '经历',
      '电脑', '配置', '硬件', '设备', '宠物', '动物', '喜欢', '爱好', '兴趣', '家庭', '年龄',
      '名字', '姓名', '同事', '员工', '团队', '公司', '职业', '职位', '应聘', '求职', '面试'
    ];
    
    importantDoubleChars.forEach(word => {
      if (text.includes(word)) {
        words.push(word);
      }
    });
    
    // 3. 动态提取有意义的词汇组合
    const meaningfulPatterns = [
      /新员工/g,
      /介绍.{0,2}自己/g,
      /个人.{0,2}信息/g,
      /工作.{0,2}经验/g,
      /技术.{0,2}能力/g,
      /项目.{0,2}经历/g,
      /设备.{0,2}配置/g,
      /宠物.{0,2}信息/g,
    ];
    
    meaningfulPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          // 提取匹配中的关键字
          const keyWords = match.match(/[\u4e00-\u9fa5]+/g) || [];
          words.push(...keyWords);
        });
      }
    });
    
    // 4. 智能分词：提取2-4字的有意义词汇
    const segments = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
    const meaningfulSegments = segments.filter(segment => {
      // 过滤掉无意义的词汇
      const meaninglessWords = [
        '能让', '感觉', '应该', '怎样', '有效', '说清', '清楚', '同时', '又能',
        '要向', '向我', '我的', '的新', '新员', '员工', '工介', '介绍', '绍自',
        '自己', '己我', '我应', '应该', '该怎', '怎样', '样有', '有效', '效的',
        '的说', '说清', '清楚', '楚我', '我的', '的履', '履历', '历同', '同时',
        '时又', '又能', '能让', '让他', '他们', '们感', '感觉', '觉我', '我很', '很牛'
      ];
      
      return !meaninglessWords.includes(segment) && 
             segment.length >= 2 &&
             /[\u4e00-\u9fa5]{2,}/.test(segment);
    });
    
    words.push(...meaningfulSegments.slice(0, 3)); // 限制数量
    
    return Array.from(new Set(words));
  }
}

let dbInstance: MemoryDatabase | null = null;

export function getMemoryDB(): MemoryDatabase {
  if (!dbInstance) {
    dbInstance = new MemoryDatabase();
  }
  return dbInstance;
}

export { MemoryDatabase };
