import { NextApiRequest, NextApiResponse } from 'next';
import { SUPPORTED_MODELS, SupportedModel } from './chat';
import { getEmbeddingService } from '@/lib/memory/embedding-service';
import { getVectorDatabase } from '@/lib/memory/vector-database';
import { getMemoryDB } from '@/lib/memory/database';
import https from 'https';

// 改进的HTTPS代理配置，包含连接池和超时设置
const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_ENV !== 'development',
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 60000 // 60秒超时
});

// 重试配置
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1秒基础延迟
  maxDelay: 8000,  // 最大8秒延迟
  retryableErrors: ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH']
};

// 延迟函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 计算指数退避延迟
const getRetryDelay = (attempt: number): number => {
  const delay = Math.min(
    RETRY_CONFIG.baseDelay * Math.pow(2, attempt),
    RETRY_CONFIG.maxDelay
  );
  // 添加随机抖动
  return delay + Math.random() * 1000;
};

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  model: SupportedModel;
  messages: ChatMessage[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let model: SupportedModel = 'chatgpt-4o-latest'; // 默认模型
  
  try {
    const requestData: ChatRequest = req.body;
    model = requestData.model;
    const messages = requestData.messages;

    // 验证模型是否支持
    if (!SUPPORTED_MODELS[model]) {
      return res.status(400).json({ 
        error: `Unsupported model: ${model}` 
      });
    }

    console.log(`[Stream API] 开始流式调用模型: ${model}`);
    
    // 🧠 记忆搜索和上下文增强
    let enhancedMessages = [...messages];
    try {
      // 获取最后一条用户消息用于搜索记忆
      const lastUserMessage = messages.filter(m => m.role === 'user').slice(-1)[0];
      if (lastUserMessage) {
        console.log(`[Stream API] 🔍 搜索相关记忆: "${lastUserMessage.content.substring(0, 50)}..."`);
        
        // 直接调用记忆搜索逻辑
        const embeddingService = getEmbeddingService();
        const vectorDB = getVectorDatabase();
        const memoryDB = getMemoryDB();
        
                 const userId = 'default_user';
         const query = lastUserMessage.content;
         const limit = 100; // 大幅增加搜索数量
        
        console.log(`[Stream API] 🔍 开始记忆搜索...`);
        
        const results = [];
        
        // 1. 向量搜索
        try {
                     const queryVector = await embeddingService.generateEmbedding(query);
           const vectorResults = await vectorDB.searchSimilarMemories(
             userId,
             queryVector,
             limit * 5, // 大幅增加候选数量
             0.05 // 极低相似性阈值，获取更多候选
           );
          
          console.log(`[Stream API] 🎯 向量搜索找到 ${vectorResults.length} 条结果`);
          
          // 转换向量搜索结果
          for (const vectorResult of vectorResults) {
            results.push({
              id: vectorResult.memory.id,
              content: vectorResult.memory.content,
              category: vectorResult.memory.category,
              importance: (vectorResult.memory as any).importance || 5,
              timestamp: (vectorResult.memory as any).timestamp || (vectorResult.memory as any).createdAt,
              relevanceScore: vectorResult.similarity,
              searchType: 'vector'
            });
          }
        } catch (vectorError) {
          console.warn(`[Stream API] ⚠️ 向量搜索失败:`, vectorError);
        }
        
                 // 2. 补充关键词搜索（无论向量搜索结果多少都执行）
         try {
           const keywordResults = memoryDB.searchMemories(userId, query, limit * 3);
           
           console.log(`[Stream API] 🔤 关键词搜索找到 ${keywordResults.length} 条结果`);
           
           // 添加关键词搜索结果（避免重复）
           for (const memory of keywordResults) {
             const isDuplicate = results.some(r => r.id === memory.id);
             if (!isDuplicate) {
               results.push({
                 id: memory.id,
                 content: memory.content,
                 category: memory.category,
                 importance: memory.importance,
                 timestamp: memory.createdAt,
                 relevanceScore: 0.8, // 给关键词搜索更高的相关性
                 searchType: 'keyword'
               });
             }
           }
         } catch (keywordError) {
           console.warn(`[Stream API] ⚠️ 关键词搜索失败:`, keywordError);
         }
         
         // 3. 如果是个人介绍相关查询，额外搜索个人信息
         if (query.includes('介绍') || query.includes('自己') || query.includes('基本情况')) {
           try {
             console.log(`[Stream API] 🔍 检测到个人介绍查询，搜索个人信息...`);
             
             // 搜索个人信息类别的记忆
             const personalCategories = ['personal_info', 'preferences', 'skills', 'experiences', 'lifestyle'];
             
             for (const category of personalCategories) {
               const categoryResults = memoryDB.getMemoriesByCategory(userId, category);
               console.log(`[Stream API] 📋 ${category} 类别找到 ${categoryResults.length} 条记忆`);
               
               for (const memory of categoryResults) {
                 const isDuplicate = results.some(r => r.id === memory.id);
                 if (!isDuplicate) {
                   results.push({
                     id: memory.id,
                     content: memory.content,
                     category: memory.category,
                     importance: memory.importance,
                     timestamp: memory.createdAt,
                     relevanceScore: 0.9, // 给个人信息最高的相关性
                     searchType: 'category'
                   });
                 }
               }
             }
           } catch (personalError) {
             console.warn(`[Stream API] ⚠️ 个人信息搜索失败:`, personalError);
           }
         }
        
                 // 4. 排序和限制结果
         const relevantMemories = results
           .sort((a, b) => b.relevanceScore - a.relevanceScore)
           .slice(0, limit);
         
         console.log(`[Stream API] 📊 搜索结果汇总:`);
         console.log(`[Stream API] - 向量搜索: ${results.filter(r => r.searchType === 'vector').length} 条`);
         console.log(`[Stream API] - 关键词搜索: ${results.filter(r => r.searchType === 'keyword').length} 条`);
         console.log(`[Stream API] - 类别搜索: ${results.filter(r => r.searchType === 'category').length} 条`);
         console.log(`[Stream API] - 总候选记忆: ${results.length} 条`);
         console.log(`[Stream API] - 最终使用记忆: ${relevantMemories.length} 条`);
        
        console.log(`[Stream API] 🎯 找到 ${relevantMemories.length} 条相关记忆`);
        
        if (relevantMemories.length > 0) {
                     // 构建详细的记忆上下文
           const filteredMemories = relevantMemories
             .filter((m: any) => m.relevanceScore > 0.7) // 提高相关性阈值到0.7
             .slice(0, 50); // 取前50条最相关的记忆
          
          console.log(`[Stream API] 📋 构建记忆上下文: ${filteredMemories.length} 条记忆`);
          
          // 按类别分组显示记忆
          const memoryByCategory: { [key: string]: any[] } = {};
          filteredMemories.forEach((memory: any) => {
            if (!memoryByCategory[memory.category]) {
              memoryByCategory[memory.category] = [];
            }
            memoryByCategory[memory.category].push(memory);
          });
          
          // 构建分类记忆上下文
          let memoryContext = '';
          Object.keys(memoryByCategory).forEach(category => {
            memoryContext += `\n## ${category}:\n`;
            memoryByCategory[category].forEach((memory: any, index: number) => {
              memoryContext += `- ${memory.content} (相关性: ${memory.relevanceScore.toFixed(3)})\n`;
            });
          });
          
          if (memoryContext.trim()) {
            // 在消息前添加系统提示，包含记忆上下文
            const systemMessage: ChatMessage = {
              role: 'system',
              content: `你是一个智能助手。以下是用户的相关记忆信息，请在回答时充分参考这些信息：

${memoryContext}

请基于这些记忆信息来回答用户的问题，让回答更加个性化和准确。如果记忆信息与问题相关，请在回答中体现出来。回答时要体现出你对用户的了解。`
            };
            
            enhancedMessages = [systemMessage, ...messages];
            console.log(`[Stream API] ✅ 记忆上下文已添加 (${memoryContext.length}字符)`);
            
            // 打印所有记忆详情
            console.log(`[Stream API] 📊 记忆调用详情:`);
            filteredMemories.forEach((memory: any, index: number) => {
              console.log(`[Stream API] 记忆${index + 1}: [${memory.category}] 相关性=${memory.relevanceScore.toFixed(3)} "${memory.content.substring(0, 60)}..."`);
            });
          }
        }
      }
    } catch (memoryError) {
      console.warn(`[Stream API] ⚠️ 记忆搜索异常:`, memoryError);
      // 记忆搜索失败不影响正常聊天
    }
    
    // 记录开始时间和性能追踪
    const startTime = Date.now();
    const performanceTracker = {
      requestStart: startTime,
      llmConnectionStart: 0,
      llmConnectionEnd: 0,
      firstTokenTime: 0,
      firstContentTime: 0,
      responseComplete: 0
    };

    // 设置SSE响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    });

    // 准备API请求
    const apiUrl = process.env.OPENAI_API_BASE || 'https://api.laozhang.ai/v1/chat/completions';
    const apiKey = process.env.OPENAI_API_KEY || 'sk-fHiGcdKRdV7SykaZB0D755D91dEe48038f1aB0B7556fE2Fc';

    // 检查是否需要重试的错误
    const isRetryableError = (error: any): boolean => {
      if (!error) return false;
      
      // 检查网络错误代码
      const code = error.code || error.cause?.code;
      if (RETRY_CONFIG.retryableErrors.includes(code)) {
        return true;
      }
      
      // 检查错误消息
      const message = error.message || '';
      return message.includes('fetch failed') || 
             message.includes('socket disconnected') || 
             message.includes('ECONNRESET') ||
             message.includes('network');
    };

    // 带重试的fetch函数
    const fetchWithRetry = async (url: string, options: any, attempt: number = 0): Promise<Response> => {
      try {
        console.log(`[Stream API] 尝试连接 (${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}): ${model}`);
        
        // 记录LLM连接开始时间
        if (attempt === 0) {
          performanceTracker.llmConnectionStart = Date.now();
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
        
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          // @ts-ignore - 开发环境SSL配置
          ...(process.env.NODE_ENV === 'development' && { agent: httpsAgent }),
        });
        
        clearTimeout(timeoutId);
        
        // 记录LLM连接完成时间
        performanceTracker.llmConnectionEnd = Date.now();
        
        return response;
        
      } catch (error: any) {
        console.log(`[Stream API] 连接失败 (尝试 ${attempt + 1}): ${error.message}`);
        
        if (attempt < RETRY_CONFIG.maxRetries && isRetryableError(error)) {
          const delayMs = getRetryDelay(attempt);
          console.log(`[Stream API] ${delayMs}ms后重试...`);
          await delay(delayMs);
          return fetchWithRetry(url, options, attempt + 1);
        }
        
        throw error;
      }
    };

    const response = await fetchWithRetry(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'ChatLLM-Web/1.0',
        'Connection': 'keep-alive',
      },
      body: JSON.stringify({
        model: SUPPORTED_MODELS[model],
        messages: enhancedMessages, // 使用增强后的消息（包含记忆上下文）
        stream: true, // 启用流式输出
        max_tokens: 8000, // 增加最大token数，支持更长回答
        temperature: 0.7, // 适中的温度设置
        stream_options: { include_usage: true }, // 为所有模型启用使用量统计
        ...(model === 'gemini-2.5-pro' && {
          // 为Gemini特别优化的参数
          top_p: 0.9,
          frequency_penalty: 0,
          presence_penalty: 0,
        }),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[Stream API] ❌ ${model}: API错误 ${response.status}`);
      res.write(`data: ${JSON.stringify({ error: `API Error: ${response.status} - ${errorText}` })}\n\n`);
      res.end();
      return;
    }

    console.log(`[Stream API] ✅ ${model}: 开始接收流式数据`);

    // 发送思考开始信号给前端
    res.write(`data: ${JSON.stringify({ 
      type: 'thinking_start',
      model: model,
      timestamp: Date.now()
    })}\n\n`);

    // 处理流式响应
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastFlushTime = Date.now();
    let totalTokens = 0; // Token统计
    let generatedTokens = 0; // 新增：实际生成的token数（completion + reasoning）
    let promptTokens = 0; // 新增：输入token数
    let completionTokens = 0; // 新增：完成token数
    let reasoningTokens = 0; // 新增：思考token数
    let firstTokenReceived = false; // 第一个token标记
    let firstContentReceived = false; // 第一个内容标记

    if (!reader) {
      res.write(`data: ${JSON.stringify({ error: 'No response body' })}\n\n`);
      res.end();
      return;
    }

    // 不再需要缓冲函数，直接实时发送

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        // 流式数据读取完成
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim() === '') continue;
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          if (dataStr.trim() === '[DONE]') {
            // 流式输出完成
            
            // 记录响应完成时间
            performanceTracker.responseComplete = Date.now();
            
            // 计算响应时间并发送统计信息
            const responseTime = Date.now() - startTime;
            
            // 生成性能报告 - 确保时间都是正数
            const performanceReport = {
              totalTime: responseTime,
              connectionTime: Math.max(0, performanceTracker.llmConnectionEnd - performanceTracker.llmConnectionStart),
              timeToFirstToken: performanceTracker.firstTokenTime ? Math.max(0, performanceTracker.firstTokenTime - performanceTracker.llmConnectionEnd) : 0,
              timeToFirstContent: performanceTracker.firstContentTime ? Math.max(0, performanceTracker.firstContentTime - performanceTracker.llmConnectionEnd) : 0,
              streamingTime: Math.max(0, performanceTracker.responseComplete - (performanceTracker.firstContentTime || performanceTracker.llmConnectionEnd))
            };
            
            // 输出详细性能报告到终端
            console.log('\n' + '═'.repeat(80));
            console.log(`🚀 **${model.toUpperCase()} 性能分析报告**`);
            console.log('═'.repeat(80));
            console.log(`📊 总耗时: ${responseTime}ms`);
            console.log(`🔗 LLM连接: ${performanceReport.connectionTime}ms`);
            console.log(`⚡ 首token延迟: ${performanceReport.timeToFirstToken}ms`);
            console.log(`💬 首内容延迟: ${performanceReport.timeToFirstContent}ms`);
            console.log(`📝 流式输出: ${performanceReport.streamingTime}ms`);
            console.log(`🎯 生成速率: ${generatedTokens > 0 ? (generatedTokens / (responseTime / 1000)).toFixed(1) : 0} tokens/s`);
            console.log(`📈 Token统计: 生成${generatedTokens} | 输入${promptTokens} | 总计${totalTokens}`);
            console.log('═'.repeat(80) + '\n');
            
            console.log(`[Stream API] ✅ ${model}: 流式输出完成，耗时: ${responseTime}ms, Generated: ${generatedTokens}, Total: ${totalTokens}`);
            
            res.write(`data: ${JSON.stringify({ 
              done: true, 
              responseTime,
              totalTokens,
              generatedTokens, // 新增：实际生成的tokens
              promptTokens, // 新增：输入tokens
              completionTokens, // 新增：完成tokens
              reasoningTokens, // 新增：思考tokens
              usage: { // 新增：完整usage信息
                total_tokens: totalTokens,
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                generated_tokens: generatedTokens,
                reasoning_tokens: reasoningTokens
              },
              model
            })}\n\n`);
            res.end();
            return;
          }

                      try {
            const chunk = JSON.parse(dataStr);
            const delta = chunk.choices?.[0]?.delta;
            
            // 记录第一个token时间
            if (!firstTokenReceived && (delta?.content || delta?.reasoning)) {
              performanceTracker.firstTokenTime = Date.now();
              firstTokenReceived = true;
            }
            
            // 处理usage统计信息
            if (chunk.usage) {
              totalTokens = chunk.usage.total_tokens || 0;
              completionTokens = chunk.usage.completion_tokens || 0;
              promptTokens = chunk.usage.prompt_tokens || 0;
              reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens || 0;
              generatedTokens = completionTokens + reasoningTokens;
              
              console.log(`[Stream API] ${model} Token统计:`, {
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                reasoning_tokens: reasoningTokens,
                generated_tokens: generatedTokens,
                total_tokens: totalTokens
              });
            }
            
            // 有些模型在最后一个chunk中返回usage信息
            if (chunk.choices?.[0]?.finish_reason && !totalTokens) {
              // 如果没有usage信息，尝试从其他字段获取
              if (chunk.usage) {
                totalTokens = chunk.usage.total_tokens || 0;
                completionTokens = chunk.usage.completion_tokens || 0;
                promptTokens = chunk.usage.prompt_tokens || 0;
                reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens || 0;
                generatedTokens = completionTokens + reasoningTokens;
              }
            }
            
            if (delta) {
              // 处理思考过程（DeepSeek R1专用）
              if (delta.reasoning && model === 'deepseek-r1') {
                res.write(`data: ${JSON.stringify({ 
                  type: 'reasoning',
                  content: delta.reasoning,
                  model: model 
                })}\n\n`);
              }
              
              // 处理最终回答内容
              if (delta.content) {
                // 记录第一个内容时间
                if (!firstContentReceived) {
                  performanceTracker.firstContentTime = Date.now();
                  firstContentReceived = true;
                }
                
                // 🚀 真正的流式输出：立即发送每个字符，不缓冲
                res.write(`data: ${JSON.stringify({ 
                  content: delta.content,
                  model: model 
                })}\n\n`);
                lastFlushTime = Date.now();
              }
            }
          } catch (e) {
            // 忽略JSON解析错误
          }
        }
      }
    }

  } catch (error: any) {
    const errorCode = error.code || error.cause?.code;
    const errorMessage = error.message || 'Unknown error';
    
    console.log(`[Stream API] ❌ 流式处理异常:`, {
      model,
      error: errorMessage,
      code: errorCode,
      stack: error.stack?.substring(0, 500) // 截取前500字符的堆栈
    });

    // 根据错误类型提供不同的错误信息
    let userFriendlyMessage = '流式处理失败';
    let retryable = false;

    if (RETRY_CONFIG.retryableErrors.includes(errorCode)) {
      userFriendlyMessage = '网络连接不稳定，请稍后重试';
      retryable = true;
    } else if (errorMessage.includes('abort')) {
      userFriendlyMessage = '请求超时，请重试';
      retryable = true;
    } else if (errorMessage.includes('fetch failed')) {
      userFriendlyMessage = 'API服务暂时不可用，请稍后重试';
      retryable = true;
    } else if (errorMessage.includes('socket disconnected')) {
      userFriendlyMessage = '连接中断，请重试';
      retryable = true;
    }

    // 如果响应还没有开始，发送JSON错误
    if (!res.headersSent) {
      res.status(500).json({ 
        error: userFriendlyMessage,
        details: errorMessage,
        code: errorCode,
        retryable,
        model
      });
    } else {
      // 如果已经开始流式响应，发送SSE错误事件
      try {
        res.write(`data: ${JSON.stringify({ 
          error: userFriendlyMessage,
          details: errorMessage,
          code: errorCode,
          retryable,
          model,
          timestamp: Date.now()
        })}\n\n`);
        res.end();
      } catch (writeError) {
        console.error(`[Stream API] 写入错误响应失败:`, writeError);
        // 强制结束响应
        res.end();
      }
    }
  }
} 