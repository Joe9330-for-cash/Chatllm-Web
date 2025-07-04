import { ExtractedMemory, MemoryCategory } from '@/types/memory';
import { getCategoryManager } from './category-manager';

export interface LLMExtractionResult {
  memories: ExtractedMemory[];
  reasoning: string;
  confidence: number;
}

export class LLMMemoryExtractor {
  private apiKey: string;
  private apiBaseUrl: string;
  private maxTokensPerChunk = 2000; // 每段最大token数
  private maxContentLength = 8000;  // 单次处理最大字符数

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || 'sk-zqDdiGR6QzXgdqjsEdF00c254b8c43A281B64fD37c883c13';
    this.apiBaseUrl = process.env.OPENAI_API_BASE || 'https://api.laozhang.ai/v1';
  }

  async extractFromMessage(content: string, context?: string[]): Promise<LLMExtractionResult> {
    console.log(`[LLM Extractor] 🚀 开始智能提取记忆: "${content.substring(0, 100)}..."`);
    console.log(`[LLM Extractor] 📊 输入内容长度: ${content.length} 字符`);
    
    // 如果内容太长，进行分段处理
    if (content.length > this.maxContentLength) {
      console.log(`[LLM Extractor] 文本过长(${content.length}字符)，启用分段处理`);
      return await this.extractFromLongText(content, context);
    }
    
    const extractionPrompt = this.buildExtractionPrompt(content, context);
    console.log(`[LLM Extractor] 📝 提示词长度: ${extractionPrompt.length} 字符`);
    
    try {
      const response = await this.callLLM(extractionPrompt);
      console.log(`[LLM Extractor] 🎯 LLM响应长度: ${response.length} 字符`);
      console.log(`[LLM Extractor] 📄 LLM响应前200字符: "${response.substring(0, 200)}..."`);
      
      const result = this.parseExtractionResult(response, content);
      
      console.log(`[LLM Extractor] ✅ 提取完成，发现 ${result.memories.length} 条记忆，置信度: ${result.confidence}`);
      return result;
    } catch (error) {
      console.error('[LLM Extractor] ❌ 提取失败:', error);
      console.error('[LLM Extractor] 🔧 启用降级处理...');
      
      // 降级处理：使用简单的启发式规则
      return this.fallbackExtraction(content);
    }
  }

  // 处理长文本的分段提取
  private async extractFromLongText(content: string, context?: string[]): Promise<LLMExtractionResult> {
    const chunks = this.splitIntoChunks(content);
    console.log(`[LLM Extractor] 将长文本分为 ${chunks.length} 段处理`);
    
    const allMemories: ExtractedMemory[] = [];
    const allReasonings: string[] = [];
    let totalConfidence = 0;
    let successfulChunks = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`[LLM Extractor] 处理第 ${i + 1}/${chunks.length} 段 (${chunk.length}字符)`);
      
      try {
        const chunkResult = await this.extractFromMessage(chunk, context);
        allMemories.push(...chunkResult.memories);
        allReasonings.push(`段${i + 1}: ${chunkResult.reasoning}`);
        totalConfidence += chunkResult.confidence;
        successfulChunks++;
      } catch (error) {
        console.warn(`[LLM Extractor] 第${i + 1}段处理失败:`, error);
        allReasonings.push(`段${i + 1}: 处理失败`);
      }
    }

    // 去重处理
    const deduplicatedMemories = this.deduplicateMemories(allMemories);
    console.log(`[LLM Extractor] 分段提取完成: 原始${allMemories.length}条 → 去重后${deduplicatedMemories.length}条`);

    return {
      memories: deduplicatedMemories,
      reasoning: allReasonings.join('; '),
      confidence: successfulChunks > 0 ? totalConfidence / successfulChunks : 0.3,
    };
  }

  // 智能分段：按语义和长度切分
  private splitIntoChunks(content: string): string[] {
    const chunks: string[] = [];
    
    // 首先按段落分割
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    let currentChunk = '';
    
    for (const paragraph of paragraphs) {
      // 如果当前chunk加上新段落超过限制，就保存当前chunk
      if (currentChunk && (currentChunk.length + paragraph.length) > this.maxContentLength) {
        chunks.push(currentChunk.trim());
        currentChunk = paragraph;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }
    
    // 添加最后一个chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    // 如果还有超长的chunk，进一步分割
    const finalChunks: string[] = [];
    for (const chunk of chunks) {
      if (chunk.length > this.maxContentLength) {
        const subChunks = this.splitByLength(chunk, this.maxContentLength);
        finalChunks.push(...subChunks);
      } else {
        finalChunks.push(chunk);
      }
    }
    
    return finalChunks;
  }

  // 按长度强制分割
  private splitByLength(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let start = 0;
    
    while (start < text.length) {
      let end = start + maxLength;
      
      // 如果不是最后一段，尝试在句号或换行处断开
      if (end < text.length) {
        const lastBreak = Math.max(
          text.lastIndexOf('。', end),
          text.lastIndexOf('\n', end),
          text.lastIndexOf('；', end)
        );
        if (lastBreak > start) {
          end = lastBreak + 1;
        }
      }
      
      chunks.push(text.substring(start, end));
      start = end;
    }
    
    return chunks;
  }

  // 记忆去重
  private deduplicateMemories(memories: ExtractedMemory[]): ExtractedMemory[] {
    const unique: ExtractedMemory[] = [];
    
    for (const memory of memories) {
      const isDuplicate = unique.some(existing => 
        this.isSimilarContent(existing.content, memory.content) && 
        existing.category === memory.category
      );
      
      if (!isDuplicate) {
        unique.push(memory);
      }
    }
    
    return unique;
  }

  // 内容相似性检测
  private isSimilarContent(content1: string, content2: string): boolean {
    const normalize = (str: string) => str.toLowerCase().replace(/\s+/g, '').trim();
    const norm1 = normalize(content1);
    const norm2 = normalize(content2);
    
    // 如果内容完全相同
    if (norm1 === norm2) return true;
    
    // 如果一个包含另一个且长度差异不大
    const minLength = Math.min(norm1.length, norm2.length);
    const maxLength = Math.max(norm1.length, norm2.length);
    
    if (maxLength / minLength < 1.5) {
      return norm1.includes(norm2) || norm2.includes(norm1);
    }
    
    return false;
  }

  private buildExtractionPrompt(content: string, context?: string[]): string {
    const contextInfo = context && context.length > 0 
      ? `\n之前的对话上下文:\n${context.slice(-3).join('\n')}\n` 
      : '';

    // 检测是否为文档内容
    const isDocument = content.length > 500 || content.includes('公司') || content.includes('项目') || content.includes('简历') || content.includes('职位');
    const documentHint = isDocument ? '\n注意：这是一个文档内容，可能包含多种类型的信息，请仔细提取所有有价值的记忆。' : '';

    // 获取类别建议
    const categoryManager = getCategoryManager();
    const categorySuggestions = categoryManager.getCategorySuggestions().slice(0, 30);
    
    return `你是一个专业的记忆提取专家。请从用户消息中智能提取值得长期记住的信息。${documentHint}

${contextInfo}
用户当前消息: "${content.substring(0, 3000)}${content.length > 3000 ? '...' : ''}"

请分析这条消息，提取所有有价值的记忆信息。特别注意：
- 对于文档内容，请提取关键的事实信息
- 每条记忆应该是独立且有意义的事实
- 重视具体的数字、名称、技能、经历等
- 即使信息看起来平常，如果对个人画像有帮助，也要提取

🆕 动态分类系统：
你可以使用现有类别，也可以根据内容创建新的类别！

常用类别参考：
- 核心类别：personal_info, device_info, preferences, relationships, skills, experiences, goals, lifestyle, work_context, education, contact_info, projects, other
- 扩展类别：health_medical(健康医疗), cooking_food(烹饪美食), travel_location(旅行地点), financial_money(财务金钱), entertainment(娱乐休闲), sports_fitness(运动健身), learning_study(学习进修), family_home(家庭居住), shopping_purchase(购物消费), creative_art(创作艺术), technology_digital(科技数码), pet_animal(宠物动物), vehicle_transport(交通工具), habit_routine(习惯日常)

⚡ 智能分类指南：
- 如果内容涉及健康、医疗、药物等，使用 health_medical
- 如果内容涉及烹饪、美食、餐厅等，使用 cooking_food  
- 如果内容涉及旅行、城市、景点等，使用 travel_location
- 如果内容涉及金钱、投资、理财等，使用 financial_money
- 如果内容涉及娱乐、电影、音乐等，使用 entertainment
- 如果内容涉及运动、健身、锻炼等，使用 sports_fitness
- 如果内容涉及学习、课程、知识等，使用 learning_study
- 如果内容涉及家庭、房屋、装修等，使用 family_home
- 如果内容涉及购物、消费、品牌等，使用 shopping_purchase
- 如果内容涉及艺术、创作、设计等，使用 creative_art
- 或者根据内容创建新的更精确的类别名称（用英文小写+下划线格式）

CRITICAL: 请严格按照以下JSON格式回答，确保语法正确，不要使用markdown代码块：
{
  "reasoning": "简要分析过程，说明提取了哪些信息",
  "confidence": 0.95,
  "memories": [
    {
      "content": "简洁的记忆内容",
      "category": "记忆类别",
      "importance": 8,
      "reason": "重要性说明",
      "tags": ["标签1", "标签2"]
    }
  ]
}

重要要求：
- 直接返回JSON，不要包装在代码块中
- 每条记忆内容要简洁明确，包含具体信息
- tags数组必须完整闭合
- 确保JSON语法完全正确
- 即使只有一条有价值信息，也要提取出来
- 尽量不要返回空的memories数组，除非真的没有任何有价值信息
- 🌟 鼓励创建新的类别名称，让分类更精确和有意义！`;
  }

  private async callLLM(prompt: string): Promise<string> {
    console.log(`[LLM Extractor] 🌐 准备调用LLM API: ${this.apiBaseUrl}`);
    console.log(`[LLM Extractor] 🔑 API Key前缀: ${this.apiKey.substring(0, 10)}...`);
    
    try {
      const response = await fetch(`${this.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: '你是专业的记忆分析专家。务必返回完整有效的JSON格式，不要使用markdown代码块，直接返回纯JSON。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1, // 降低温度保证一致性
          max_tokens: 3000, // 增加token限制避免截断
          stop: ["\n```", "```"], // 防止markdown代码块
        }),
      });

      console.log(`[LLM Extractor] 📡 API响应状态: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[LLM Extractor] ❌ API调用失败: ${response.status} - ${errorText}`);
        throw new Error(`LLM API调用失败: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log(`[LLM Extractor] 📦 API响应数据结构:`, {
        choices: data.choices?.length,
        model: data.model,
        usage: data.usage
      });
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error('[LLM Extractor] ❌ API响应格式异常:', data);
        throw new Error('API响应格式异常');
      }
      
      const content = data.choices[0].message.content;
      console.log(`[LLM Extractor] ✅ 成功获取LLM响应: ${content.length} 字符`);
      
      return content;
    } catch (error) {
      console.error('[LLM Extractor] ❌ LLM API调用异常:', error);
      throw error;
    }
  }

  private parseExtractionResult(llmResponse: string, originalContent: string): LLMExtractionResult {
    console.log(`[LLM Extractor] 🔍 开始解析LLM响应 (${llmResponse.length}字符)`);
    
    try {
      // 清理响应，移除markdown代码块
      let cleanedResponse = llmResponse.trim();
      
      // 移除可能的代码块标记
      cleanedResponse = cleanedResponse.replace(/^```json\s*/i, '');
      cleanedResponse = cleanedResponse.replace(/^```\s*/i, '');
      cleanedResponse = cleanedResponse.replace(/\s*```$/i, '');
      cleanedResponse = cleanedResponse.trim();
      
      console.log(`[LLM Extractor] 🧹 清理后响应: "${cleanedResponse.substring(0, 200)}..."`);
      
      // 尝试直接解析
      try {
        const parsed = JSON.parse(cleanedResponse);
        console.log(`[LLM Extractor] ✅ JSON解析成功`);
        console.log(`[LLM Extractor] 📊 解析结果预览:`, {
          memories: parsed.memories?.length || 0,
          confidence: parsed.confidence,
          reasoning: parsed.reasoning?.substring(0, 50) + '...'
        });
        
        return this.validateAndProcessResult(parsed, originalContent);
      } catch (firstError: any) {
        console.warn('[LLM Extractor] ⚠️ 直接解析失败，尝试智能修复...');
        console.warn('[LLM Extractor] 解析错误:', firstError.message);
        return this.repairAndParseJSON(cleanedResponse, originalContent);
      }
      
    } catch (error) {
      console.error('[LLM Extractor] ❌ 解析完全失败:', error);
      console.error('[LLM Extractor] 原始响应:', llmResponse.substring(0, 500));
      
      // 最后的降级处理
      return this.extractFromPlainText(llmResponse, originalContent);
    }
  }

  // 智能修复JSON格式
  private repairAndParseJSON(jsonStr: string, originalContent: string): LLMExtractionResult {
    console.log('[LLM Extractor] 🔧 尝试智能修复JSON...');
    
    const repairAttempts = [
      // 1. 修复常见的截断问题
      () => {
        let repaired = jsonStr;
        
        // 检查tags数组是否未闭合
        const tagsMatch = repaired.match(/"tags":\s*\[[^\]]*$/m);
        if (tagsMatch) {
          console.log('[LLM Extractor] 修复未闭合的tags数组');
          repaired = repaired.replace(/"tags":\s*\[[^\]]*$/m, '"tags": ["extracted"]');
        }
        
        // 检查整体JSON是否未闭合
        const openBraces = (repaired.match(/\{/g) || []).length;
        const closeBraces = (repaired.match(/\}/g) || []).length;
        if (openBraces > closeBraces) {
          console.log('[LLM Extractor] 补充缺失的闭合括号');
          repaired += '}'.repeat(openBraces - closeBraces);
        }
        
        return repaired;
      },
      
      // 2. 修复memories数组
      () => {
        let repaired = jsonStr;
        
        // 如果memories数组未闭合
        if (repaired.includes('"memories":[') && !repaired.includes('"memories":[]') && !repaired.match(/memories":\s*\[[\s\S]*\]/)) {
          console.log('[LLM Extractor] 修复memories数组');
          const beforeMemories = repaired.split('"memories":[')[0];
          repaired = beforeMemories + '"memories":[]' + '}';
        }
        
        return repaired;
      },
      
      // 3. 提取部分有效JSON
      () => {
        console.log('[LLM Extractor] 尝试提取部分有效JSON');
        const matches = jsonStr.match(/\{[^}]*"reasoning"[^}]*"confidence"[^}]*\}/);
        if (matches) {
          return matches[0] + ', "memories": []}';
        }
        return '{"reasoning": "解析失败", "confidence": 0.3, "memories": []}';
      }
    ];
    
    for (let i = 0; i < repairAttempts.length; i++) {
      try {
        const repairedJson = repairAttempts[i]();
        console.log(`[LLM Extractor] 修复尝试${i + 1}: "${repairedJson.substring(0, 100)}..."`);
        
        const parsed = JSON.parse(repairedJson);
        console.log(`[LLM Extractor] ✅ 修复成功！使用方法${i + 1}`);
        
        return this.validateAndProcessResult(parsed, originalContent);
      } catch (error) {
        console.warn(`[LLM Extractor] 修复尝试${i + 1}失败:`, error);
      }
    }
    
    // 所有修复都失败，返回基础结果
    console.warn('[LLM Extractor] 所有修复尝试失败，返回基础结果');
    return {
      memories: [],
      reasoning: 'JSON解析失败，但系统正常运行',
      confidence: 0.3,
    };
  }

  // 验证和处理解析结果
  private validateAndProcessResult(parsed: any, originalContent: string): LLMExtractionResult {
    console.log('[LLM Extractor] 🔍 验证解析结果...');
    console.log('[LLM Extractor] 原始解析对象:', {
      type: typeof parsed,
      keys: Object.keys(parsed || {}),
      memoriesType: typeof parsed?.memories,
      memoriesLength: parsed?.memories?.length
    });
    
    // 确保基本结构
    if (!parsed.memories || !Array.isArray(parsed.memories)) {
      console.warn('[LLM Extractor] ⚠️ memories不是数组，创建空数组');
      parsed.memories = [];
    }
    
    // 处理记忆数组
    const memories: ExtractedMemory[] = parsed.memories.map((memory: any, index: number) => {
      console.log(`[LLM Extractor] 处理记忆 ${index + 1}:`, {
        content: memory.content?.substring(0, 50) + '...',
        category: memory.category,
        importance: memory.importance
      });
      
      try {
        return {
          content: memory.content || `提取的记忆${index + 1}`,
          category: this.mapToValidCategory(memory.category || 'other'),
          tags: Array.isArray(memory.tags) ? memory.tags : [memory.category || 'other'],
          importance: Math.min(10, Math.max(1, memory.importance || 5)),
          extractedFrom: originalContent.substring(0, 300), // 限制长度
        };
      } catch (error) {
        console.warn(`[LLM Extractor] 处理记忆${index}失败:`, error);
        return {
          content: '处理失败的记忆',
          category: 'other' as any,
          tags: ['other'],
          importance: 5,
          extractedFrom: originalContent.substring(0, 200),
        };
      }
    });

    // 确保置信度是有效数字
    let confidence = parsed.confidence;
    if (typeof confidence !== 'number' || isNaN(confidence)) {
      console.warn('[LLM Extractor] ⚠️ 置信度不是有效数字，设为默认值');
      confidence = memories.length > 0 ? 0.8 : 0.3;
    }
    confidence = Math.min(1, Math.max(0, confidence));

    const result = {
      memories,
      reasoning: parsed.reasoning || '智能分析完成',
      confidence,
    };
    
    console.log(`[LLM Extractor] ✅ 验证完成: ${result.memories.length} 条记忆, 置信度: ${result.confidence}`);
    
    return result;
  }

  // 从纯文本响应中提取信息（最后的降级处理）
  private extractFromPlainText(response: string, originalContent: string): LLMExtractionResult {
    console.log('[LLM Extractor] 🚨 使用文本解析降级处理');
    
    const memories: ExtractedMemory[] = [];
    
    // 基于关键词的智能提取
    const keywordRules = [
      {
        pattern: /(我是|我叫|我的名字|年龄|岁|性别|男|女)/,
        category: 'personal_info',
        importance: 8,
        content: '包含个人基本信息'
      },
      {
        pattern: /(项目|创业|工作|职业|公司|CEO|COO|股份)/,
        category: 'work_context',
        importance: 9,
        content: '包含工作项目信息'
      },
      {
        pattern: /(电脑|MacBook|CPU|内存|GB|配置|硬件)/,
        category: 'device_info',
        importance: 7,
        content: '包含设备配置信息'
      },
      {
        pattern: /(已婚|结婚|妻子|老婆|家庭|伴侣)/,
        category: 'relationships',
        importance: 8,
        content: '包含家庭关系信息'
      },
      {
        pattern: /(身高|体重|健康|运动|锻炼|减肥)/,
        category: 'lifestyle',
        importance: 6,
        content: '包含健康生活信息'
      }
    ];
    
    for (const rule of keywordRules) {
      if (rule.pattern.test(originalContent)) {
        memories.push({
          content: rule.content,
          category: rule.category as any,
          tags: [rule.category],
          importance: rule.importance,
          extractedFrom: originalContent.substring(0, 200),
        });
      }
    }
    
    console.log(`[LLM Extractor] 文本解析提取: ${memories.length} 条记忆`);
    
    return {
      memories,
      reasoning: '文本解析降级处理',
      confidence: memories.length > 0 ? 0.4 : 0.2,
    };
  }

  private mapToValidCategory(category: string): MemoryCategory {
    // 使用智能类别管理器，支持动态分类
    const categoryManager = getCategoryManager();
    
    // 验证和规范化类别名称
    const validCategory = categoryManager.validateCategory(category);
    
    // 注册新类别（如果不存在）
    categoryManager.registerCategory(validCategory);
    
    console.log(`[LLM Extractor] 🏷️ 类别映射: "${category}" → "${validCategory}"`);
    
    return validCategory;
  }

  private fallbackExtraction(content: string): LLMExtractionResult {
    console.log('[LLM Extractor] 🔧 启用增强降级处理');
    console.log(`[LLM Extractor] 📝 内容长度: ${content.length} 字符`);
    
    const memories: ExtractedMemory[] = [];
    
    // 检测是否为文档内容
    const isDocument = content.length > 500 || content.includes('公司') || content.includes('项目') || content.includes('简历');
    
    if (isDocument) {
      console.log('[LLM Extractor] 📄 检测到文档内容，启用文档解析');
      
      // 公司信息提取
      const companyMatches = content.match(/公司[^。]*?([^。]*)(有限公司|股份有限公司|集团|公司)/g);
      if (companyMatches) {
        for (const match of companyMatches.slice(0, 3)) {
          memories.push({
            content: match.trim(),
            category: 'work_context',
            tags: ['company', 'work'],
            importance: 8,
            extractedFrom: content.substring(0, 300),
          });
        }
      }
      
      // 项目信息提取
      const projectMatches = content.match(/(项目|产品|业务|服务)[^。]*?([^。]*)/g);
      if (projectMatches) {
        for (const match of projectMatches.slice(0, 3)) {
          if (match.length > 10) {
            memories.push({
              content: match.trim(),
              category: 'projects',
              tags: ['projects', 'business'],
              importance: 7,
              extractedFrom: content.substring(0, 300),
            });
          }
        }
      }
      
      // 职位信息提取
      const positionMatches = content.match(/(CEO|COO|CTO|经理|总监|主管|员工|职位|岗位)[^。]*?([^。]*)/g);
      if (positionMatches) {
        for (const match of positionMatches.slice(0, 2)) {
          memories.push({
            content: match.trim(),
            category: 'work_context',
            tags: ['position', 'work'],
            importance: 7,
            extractedFrom: content.substring(0, 300),
          });
        }
      }
      
      // 技术信息提取
      const techMatches = content.match(/(AI|人工智能|机器学习|深度学习|算法|数据|系统|平台|技术|软件)[^。]*?([^。]*)/g);
      if (techMatches) {
        for (const match of techMatches.slice(0, 2)) {
          if (match.length > 8) {
            memories.push({
              content: match.trim(),
              category: 'skills',
              tags: ['technology', 'skills'],
              importance: 6,
              extractedFrom: content.substring(0, 300),
            });
          }
        }
      }
      
      // 数字信息提取（可能是财务、规模等重要信息）
      const numberMatches = content.match(/(\d+(?:\.\d+)?(?:万|亿|千|百)?(?:元|人|个|家|项|年|月|日))[^。]*?([^。]*)/g);
      if (numberMatches) {
        for (const match of numberMatches.slice(0, 3)) {
          memories.push({
            content: match.trim(),
            category: 'facts',
            tags: ['numbers', 'facts'],
            importance: 6,
            extractedFrom: content.substring(0, 300),
          });
        }
      }
      
    } else {
      console.log('[LLM Extractor] 💬 检测到对话内容，启用对话解析');
      
      // 个人信息检测
      if (content.match(/我(是|叫|名字|年龄|岁)/)) {
        memories.push({
          content: '包含个人基本信息',
          category: 'personal_info',
          tags: ['personal_info'],
          importance: 7,
          extractedFrom: content.substring(0, 200),
        });
      }

      // 设备信息检测
      if (content.match(/(电脑|配置|MacBook|CPU|内存|显卡)/i)) {
        memories.push({
          content: '包含设备配置信息',
          category: 'device_info',
          tags: ['device_info', 'hardware'],
          importance: 6,
          extractedFrom: content.substring(0, 200),
        });
      }

      // 工作项目信息
      if (content.match(/(项目|创业|公司|工作|职业|AI|IPTV|汽配)/)) {
        memories.push({
          content: '包含工作项目相关信息',
          category: 'work_context',
          tags: ['work_context', 'projects'],
          importance: 8,
          extractedFrom: content.substring(0, 200),
        });
      }

      // 宠物信息检测
      if (content.match(/我(有|养).*?(狗|猫|鸟|鱼|宠物)/)) {
        memories.push({
          content: '包含宠物相关信息',
          category: 'relationships',
          tags: ['宠物', 'relationships'],
          importance: 6,
          extractedFrom: content.substring(0, 200),
        });
      }
    }
    
    // 如果没有提取到任何记忆，创建一个通用记忆
    if (memories.length === 0) {
      console.log('[LLM Extractor] ⚠️ 没有提取到具体记忆，创建通用记忆');
      memories.push({
        content: `用户提供了${content.length}字符的内容信息`,
        category: 'other',
        tags: ['general'],
        importance: 3,
        extractedFrom: content.substring(0, 200),
      });
    }
    
    const finalConfidence = Math.min(0.8, Math.max(0.3, memories.length * 0.1 + 0.2));
    console.log(`[LLM Extractor] 🎯 降级处理完成: ${memories.length} 条记忆, 置信度: ${finalConfidence}`);

    return {
      memories,
      reasoning: isDocument ? '文档内容启发式提取' : '对话内容启发式提取',
      confidence: finalConfidence,
    };
  }

  async extractFromConversation(
    messages: { content: string; type: string }[]
  ): Promise<LLMExtractionResult> {
    console.log(`[LLM Extractor] 🔄 开始会话记忆提取，收到 ${messages.length} 条消息`);
    console.log(`[LLM Extractor] 📋 消息列表:`, messages.map((msg, i) => ({
      index: i,
      type: msg.type,
      contentLength: msg.content.length,
      preview: msg.content.substring(0, 50) + '...'
    })));
    
    // 更宽松的消息过滤：支持没有type字段或type为user的消息
    const userMessages = messages.filter(msg => !msg.type || msg.type === 'user').slice(-5);
    console.log(`[LLM Extractor] 👤 过滤后的用户消息: ${userMessages.length} 条`);
    
    if (userMessages.length === 0) {
      console.log(`[LLM Extractor] ⚠️ 没有找到用户消息`);
      return { memories: [], reasoning: '无用户消息', confidence: 0 };
    }

    // 获取最新消息
    const latestMessage = userMessages[userMessages.length - 1].content;
    console.log(`[LLM Extractor] 📝 最新消息长度: ${latestMessage.length} 字符`);
    console.log(`[LLM Extractor] 📄 最新消息预览: "${latestMessage.substring(0, 100)}..."`);
    
    // 获取上下文
    const context = userMessages.slice(0, -1).map(msg => msg.content);
    console.log(`[LLM Extractor] 🔗 上下文消息数: ${context.length} 条`);
    
    try {
      console.log(`[LLM Extractor] 🚀 调用 extractFromMessage...`);
      const result = await this.extractFromMessage(latestMessage, context);
      console.log(`[LLM Extractor] ✅ extractFromMessage 返回结果: ${result.memories.length} 条记忆，置信度: ${result.confidence}`);
      return result;
    } catch (error) {
      console.error(`[LLM Extractor] ❌ extractFromMessage 调用失败:`, error);
      
      // 降级处理
      console.log(`[LLM Extractor] 🔧 启用 extractFromConversation 降级处理`);
      return this.fallbackExtraction(latestMessage);
    }
  }
} 