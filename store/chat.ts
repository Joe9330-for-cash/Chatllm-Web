// import { WebLLMInstance } from '@/hooks/web-llm'; // TODO: 改为API调用

import { testMdStr } from '@/utils/codeblock';

import { ChatConversation, InitInfo, Message, SupportedModel, ChatApiResponse } from '@/types/chat';
// import { ResFromWorkerMessageEventData } from '@/types/web-llm'; // TODO: 改为API响应类型

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const CHATSTORE_KEY = 'chat-web-llm-store';

export const newMessage = (p: Partial<Message>): Message => ({
  id: Date.now(),
  createTime: new Date().toLocaleString(),
  updateTime: new Date().toLocaleString(),
  type: 'user',
  content: '',
  ...p,
});

export const DEFAULT_BOT_GREETING = newMessage({
  type: 'assistant',
  content: 'Hello, I am an AI assistant. How can I help you today?',
});

// 获取模型上下文提示
function getModelContextPrompt(model: SupportedModel): string {
  switch (model) {
    case 'claude-3-7-sonnet-latest':
      return '请保持你作为Claude的身份，由Anthropic开发的AI助手。';
    case 'gemini-2.5-pro':
      return '请保持你作为Gemini的身份，由Google开发的AI助手。';
    case 'deepseek-r1':
      return '请保持你作为DeepSeek的身份，由深度求索开发的AI助手。';
    case 'chatgpt-4o-latest':
      return '请保持你作为GPT-4的身份，由OpenAI开发的AI助手。';
    default:
      return '';
  }
}

function createEmptyConversation(): ChatConversation {
  const curTime = new Date().toLocaleString();

  return {
    id: Date.now(),
    messages: [],
    createTime: curTime,
    updateTime: curTime,
    title: 'New Conversation',
    model: 'chatgpt-4o-latest', // 默认模型
  };
}

export interface ChatStore {
  conversations: ChatConversation[];
  curConversationIndex: number;
  instructionModalStatus: boolean;
  memoryUploadModalStatus: boolean; // 新增：记忆上传模态框状态
  initInfoTmp: InitInfo;
  debugMode: boolean;
  currentModel: SupportedModel; // 新增：当前选择的模型
  streamingMessage: string; // 新增：流式输出临时消息
  streamingReasoning: string; // 新增：流式输出思考过程
  isStreaming: boolean; // 新增：是否正在流式输出
  isThinking: boolean; // 新增：是否正在思考（DeepSeek R1专用）
  streamingStats?: { // 新增：流式输出统计信息
    responseTime?: number;
    totalTokens?: number;
    generatedTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    reasoningTokens?: number;
    usage?: any; // 完整的usage对象
    model?: string;
    thinkingTime?: number; // 新增：思考时间
  };
  thinkingStartTime?: number; // 新增：思考开始时间
  memoryEnabled: boolean; // 新增：是否启用记忆功能
  userId: string; // 新增：用户ID（用于记忆功能）
  user: { // 新增：用户信息
    id: string;
    username: string;
    isLoggedIn: boolean;
  } | null;
  newConversation: () => void;
  delConversation: (index: number) => void;
  chooseConversation: (index: number) => void;
  delAllConversations: () => void;
  curConversation: () => ChatConversation;
  onUserInputContent: (content: string) => Promise<void>;
  onUserInputContentStream: (content: string, enableSmartRouting?: boolean) => Promise<void>; // 新增：流式输入方法
  getMemoryMsgs: () => Message[];
  updateCurConversation: (
    updater: (conversation: ChatConversation) => void,
  ) => void;
  toggleInstuctionModal: (toggle: boolean) => void;
  toggleMemoryUploadModal: (toggle: boolean) => void; // 新增：切换记忆上传模态框
  toggleInitModal: (toggle: boolean) => void;
  setCurrentModel: (model: SupportedModel) => void; // 新增：设置当前模型
  clearStreamingMessage: () => void; // 新增：清空流式消息
  clearStreamingReasoning: () => void; // 新增：清空思考过程
  toggleMemoryMode: (enabled: boolean) => void; // 新增：切换记忆模式
  setUserId: (userId: string) => void; // 新增：设置用户ID
  setUser: (user: { id: string; username: string; isLoggedIn: boolean } | null) => void; // 新增：设置用户
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      curConversationIndex: 0,
      conversations: [createEmptyConversation()],
      instructionModalStatus: true,
      memoryUploadModalStatus: false, // 新增：记忆上传模态框状态
      debugMode: false, // 修改为false启用真实API调用
      currentModel: 'chatgpt-4o-latest', // 默认模型
      streamingMessage: '', // 新增
      streamingReasoning: '', // 新增
      isStreaming: false, // 新增
      isThinking: false, // 新增
      streamingStats: undefined, // 新增
      thinkingStartTime: undefined, // 新增
      memoryEnabled: true, // 新增：默认启用记忆功能
      userId: 'default_user', // 新增：默认用户ID
      user: null, // 新增：用户信息
      initInfoTmp: {
        showModal: false,
        initMsg: [],
      },
      
      setCurrentModel(model: SupportedModel) {
        set({ currentModel: model });
        // 更新当前会话的模型
        get().updateCurConversation((conversation) => {
          conversation.model = model;
        });
      },

      newConversation() {
        set((state) => {
          const newConv = createEmptyConversation();
          newConv.model = state.currentModel; // 使用当前选择的模型
          return {
            curConversationIndex: 0,
            conversations: [newConv].concat(state.conversations),
          };
        });
      },

      delAllConversations() {
        set({
          curConversationIndex: 0,
          conversations: [createEmptyConversation()],
        });
      },

      chooseConversation(index) {
        set({
          curConversationIndex: index,
        });
      },

      delConversation(index) {
        set((state) => {
          const { conversations, curConversationIndex } = state;

          if (conversations.length === 1) {
            return {
              curConversationIndex: 0,
              conversations: [createEmptyConversation()],
            };
          }
          conversations.splice(index, 1);
          return {
            conversations,
            curConversationIndex:
              curConversationIndex === index
                ? curConversationIndex - 1
                : curConversationIndex,
          };
        });
      },

      curConversation() {
        let index = get().curConversationIndex;
        const conversations = get().conversations;

        if (index < 0 || index >= conversations.length) {
          index = Math.min(conversations.length - 1, Math.max(0, index));
          set(() => ({ curConversationIndex: index }));
        }

        const conversation = conversations[index];
        return conversation;
      },

      async onUserInputContent(content) {
        const currentModel = get().currentModel;
        const startTime = Date.now(); // 记录开始时间
        
        const userMessage: Message = newMessage({
          type: 'user',
          content,
        });

        const botMessage: Message = newMessage({
          type: 'assistant',
          content: '',
          isLoading: true,
          model: currentModel, // 记录使用的模型
        });

        console.log('[User Input] ', userMessage);
        
        // 更新UI，显示用户消息和loading状态的AI消息
        get().updateCurConversation((conversation) => {
          conversation.messages.push(userMessage, botMessage);
        });

        if (get().debugMode) {
          // 调试模式，使用测试数据
          setTimeout(() => {
            get().updateCurConversation((conversation) => {
              const msgs = conversation.messages;
              msgs[msgs.length - 1].content = testMdStr;
              msgs[msgs.length - 1].isError = false;
              msgs[msgs.length - 1].isLoading = false;
              msgs[msgs.length - 1].isStreaming = true;
            });
          }, 3000);
          return;
        }

        try {
          // 准备消息历史
          const conversation = get().curConversation();
          let recentMsgs: Array<{role: 'system' | 'user' | 'assistant', content: string}> = conversation.messages
            .filter(msg => msg.type !== 'init')
            .slice(-10) // 只取最近10条消息作为上下文
            .map(msg => ({
              role: msg.type === 'assistant' ? 'assistant' as const : 'user' as const,
              content: msg.content,
            }));

          console.log('[API Call] 当前选择的模型:', currentModel);
          
          // 记忆功能：搜索相关记忆并添加到上下文（非流式模式）
          if (get().memoryEnabled) {
            try {
              console.log('[Memory] [非流式] 开始搜索相关记忆...');
              
              // 先尝试获取用户的所有记忆作为备选
              const statsResponse = await fetch(`/api/memory/stats?userId=${get().userId}`);
              const statsData = await statsResponse.json();
              console.log(`[Memory] [非流式] 用户总记忆数: ${statsData.stats?.totalMemories || 0}`);
              
              // 搜索相关记忆
              const searchUrl = `/api/memory/vector-search?userId=${get().userId}&query=${encodeURIComponent(content)}&limit=50`;
              console.log(`[Memory] 向量搜索URL: ${searchUrl}`);
              
              const response = await fetch(searchUrl);
              const data = await response.json();
              console.log(`[Memory] [非流式] 搜索响应:`, data);
              
              if (data.success && data.results && data.results.length > 0) {
                const memoryTexts = data.results.map((result: any) => 
                  `[${result.memory.category}] ${result.memory.content} (相关性:${(result.relevanceScore * 100).toFixed(1)}%)`
                );
                const memoryContext = `基于我对用户的了解：\n${memoryTexts.join('\n')}\n\n请结合这些信息来回答用户的问题。`;
                
                recentMsgs.unshift({
                  role: 'system' as const,
                  content: memoryContext,
                });
                console.log(`[Memory] [非流式] ✅ 添加了 ${data.results.length} 条相关记忆到上下文`);
              } else {
                console.log('[Memory] [非流式] 未找到相关记忆，尝试获取最重要的记忆作为上下文');
                
                // 如果搜索无果，尝试获取最重要的记忆
                if (statsData.stats?.totalMemories > 0) {
                  const fallbackResponse = await fetch(`/api/memory/manage?userId=${get().userId}&limit=3`);
                  const fallbackData = await fallbackResponse.json();
                  
                  if (fallbackData.success && fallbackData.memories?.length > 0) {
                    const fallbackTexts = fallbackData.memories.map((memory: any) => 
                      `[${memory.category}] ${memory.content}`
                    );
                    const fallbackContext = `我了解到关于用户的一些信息：\n${fallbackTexts.join('\n')}\n\n请适当参考这些信息。`;
                    
                    recentMsgs.unshift({
                      role: 'system' as const,
                      content: fallbackContext,
                    });
                    console.log(`[Memory] [非流式] ✅ 使用备选记忆 ${fallbackData.memories.length} 条`);
                  }
                }
              }
            } catch (memoryError) {
              console.warn('[Memory] [非流式] 记忆搜索失败，继续正常对话:', memoryError);
            }
          }
          
          // 如果是新对话或者刚切换了模型，添加明确的身份指导
          const hasModelContext = recentMsgs.some(msg => 
            msg.content.includes('我是') || msg.content.includes('I am')
          );
          
          if (!hasModelContext) {
            // 为不同模型添加适当的上下文提示
            const contextPrompt = getModelContextPrompt(get().currentModel);
            if (contextPrompt) {
              recentMsgs.unshift({
                role: 'system' as const,
                content: contextPrompt,
              });
            }
          }

          console.log('[API Call] 准备发送到API的消息:', recentMsgs);

          // 调用API
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: currentModel,
              messages: recentMsgs, // 直接发送消息，不添加额外的system prompt
            }),
          });

          const data: ChatApiResponse = await response.json();
          console.log('[API Response] 返回的模型:', data.model);
          console.log('[API Response] 返回的内容长度:', data.content?.length || 0);

          if (!response.ok || !data.success) {
            throw new Error(data.error || `HTTP ${response.status}`);
          }

          // 计算响应时间
          const responseTime = Date.now() - startTime;
          
          // 更新AI消息
          get().updateCurConversation((conversation) => {
            const msgs = conversation.messages;
            const lastMsg = msgs[msgs.length - 1];
            lastMsg.content = data.content;
            lastMsg.isLoading = false;
            lastMsg.isError = false;
            lastMsg.updateTime = new Date().toLocaleString();
            lastMsg.responseTime = responseTime;
            
            // 保存token统计和响应时间信息
            if (data.usage) {
              lastMsg.tokens = data.usage;
              // 使用更准确的生成token计算速率
              const reasoningTokens = data.usage.completion_tokens_details?.reasoning_tokens || 0;
              const generatedTokens = data.usage.completion_tokens + reasoningTokens;
              const tokensPerSecond = (generatedTokens / (responseTime / 1000)).toFixed(1);
              
              // 根据模型显示不同的统计信息
              if (reasoningTokens > 0) {
                // DeepSeek R1 显示详细统计
                lastMsg.statsText = `生成: ${generatedTokens} (回答: ${data.usage.completion_tokens} + 思考: ${reasoningTokens}) | 时间: ${(responseTime / 1000).toFixed(1)}s | 速率: ${tokensPerSecond} tokens/s`;
              } else {
                // 其他模型显示简化统计
                lastMsg.statsText = `生成: ${generatedTokens} | 输入: ${data.usage.prompt_tokens} | 时间: ${(responseTime / 1000).toFixed(1)}s | 速率: ${tokensPerSecond} tokens/s`;
              }
            } else {
              lastMsg.statsText = `时间: ${(responseTime / 1000).toFixed(1)}s`;
            }
          });
          
          // 记忆功能：完全异步的记忆提取和存储（非流式模式，不阻塞用户体验）
          if (get().memoryEnabled && data.content) {
            // 立即异步执行，不延迟
            (async () => {
              try {
                const memoryStartTime = Date.now();
                console.log('[Memory] [非流式] 🚀 开始后台异步记忆处理...');
                const conversation = get().curConversation();
                
                // 只传递用户消息用于记忆提取
                const userMessages = conversation.messages
                  .filter(msg => msg.type === 'user')
                  .slice(-3) // 只分析最近3条用户消息
                  .map(msg => ({ content: msg.content, type: msg.type }));
                
                if (userMessages.length > 0) {
                  const response = await fetch('/api/memory/extract', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      userId: get().userId,
                      messages: userMessages,
                      conversationId: conversation.id,
                    }),
                  });
                  
                  const data = await response.json();
                  const memoryTime = Date.now() - memoryStartTime;
                  
                  if (data.success) {
                    console.log(`[Memory] [非流式] ✅ 后台记忆处理完成: ${data.count} 条新记忆，耗时: ${memoryTime}ms`);
                  } else {
                    console.log(`[Memory] [非流式] ⚠️  后台记忆处理完成: 未提取到新记忆，耗时: ${memoryTime}ms`);
                  }
                }
              } catch (memoryError) {
                console.warn('[Memory] [非流式] ❌ 后台记忆处理失败:', memoryError);
              }
            })();
          }

        } catch (error) {
          console.error('Chat API Error:', error);
          // 更新UI显示错误
          get().updateCurConversation((conversation) => {
            const msgs = conversation.messages;
            const lastMsg = msgs[msgs.length - 1];
            lastMsg.content = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            lastMsg.isLoading = false;
            lastMsg.isError = true;
            lastMsg.updateTime = new Date().toLocaleString();
          });
        }
      },

      // 新增：流式输入处理方法
      async onUserInputContentStream(content, enableSmartRouting = true) {
        // 获取当前模型和开始时间
        const currentModel = get().currentModel;
        const startTime = Date.now(); // 记录开始时间
        
        const userMessage: Message = newMessage({
          type: 'user',
          content,
        });

        console.log('[Stream User Input] ', userMessage);
        
        // 更新UI，显示用户消息
        get().updateCurConversation((conversation) => {
          conversation.messages.push(userMessage);
        });
        
        // 设置流式状态
        set({ 
          isStreaming: true, 
          streamingMessage: '', 
          streamingReasoning: '',
          isThinking: true, // 所有模型初始都显示"正在思考"状态
          thinkingStartTime: undefined, // 先不设置，等API开始时再设置
        });

        if (get().debugMode) {
          // 调试模式，模拟流式输出
          const debugResponse = `[调试模式] 使用模型: ${get().currentModel}\n\n你发送了: "${content}"`;
          for (let i = 0; i < debugResponse.length; i += 3) {
            const chunk = debugResponse.slice(i, i + 3);
            set(state => ({ streamingMessage: state.streamingMessage + chunk }));
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        } else {
          try {
            // 准备消息历史
            const conversation = get().curConversation();
            let recentMsgs: Array<{role: 'system' | 'user' | 'assistant', content: string}> = conversation.messages
              .filter(msg => msg.type !== 'init')
              .slice(-10)
              .map(msg => ({
                role: msg.type === 'assistant' ? 'assistant' as const : 'user' as const,
                content: msg.content,
              }));

            console.log('[Stream API Call] 当前选择的模型:', currentModel);
            
            // 并行处理架构：记忆搜索、LLM预连接、消息准备并行进行
            console.log(`[并行架构] 🚀 启动三重并行处理 - 记忆功能: ${get().memoryEnabled ? '启用' : '禁用'}`);
            const parallelStartTime = Date.now();
            
            // 并行任务1：记忆搜索（异步）
            const memorySearchPromise = get().memoryEnabled ? (async () => {
              try {
                console.log('[并行Memory] 🚀 开始异步记忆搜索...');
                const memoryStartTime = Date.now();
                
                // 并行执行统计和搜索
                const [statsResponse, searchResponse] = await Promise.all([
                  fetch(`/api/memory/stats?userId=${get().userId}`),
                  fetch(`/api/memory/vector-search?userId=${get().userId}&query=${encodeURIComponent(content)}&limit=50`)
                ]);
                
                const [statsData, searchData] = await Promise.all([
                  statsResponse.json(),
                  searchResponse.json()
                ]);
                
                const memoryTime = Date.now() - memoryStartTime;
                console.log(`[并行Memory] ⏱️ 记忆搜索耗时: ${memoryTime}ms`);
                console.log(`[并行Memory] 搜索到 ${searchData.results?.length || 0} 条记忆`);
                
                if (searchData.success && searchData.results && searchData.results.length > 0) {
                  const memoryTexts = searchData.results.map((result: any) => 
                    `[${result.memory.category}] ${result.memory.content} (相关性:${(result.relevanceScore * 100).toFixed(1)}%)`
                  );
                  const memoryContext = `基于我对用户的了解：\n${memoryTexts.join('\n')}\n\n请结合这些信息来回答用户的问题。`;
                  
                  console.log(`[并行Memory] ✅ 成功准备 ${searchData.results.length} 条相关记忆`);
                  return {
                    role: 'system' as const,
                    content: memoryContext,
                  };
                } else if (statsData.stats?.totalMemories > 0) {
                  // 备选记忆策略
                  const fallbackResponse = await fetch(`/api/memory/manage?userId=${get().userId}&limit=3`);
                  const fallbackData = await fallbackResponse.json();
                  
                  if (fallbackData.success && fallbackData.memories?.length > 0) {
                    const fallbackTexts = fallbackData.memories.map((memory: any) => 
                      `[${memory.category}] ${memory.content}`
                    );
                    const fallbackContext = `我了解到关于用户的一些信息：\n${fallbackTexts.join('\n')}\n\n请适当参考这些信息。`;
                    
                    console.log(`[并行Memory] ✅ 使用备选记忆 ${fallbackData.memories.length} 条`);
                    return {
                      role: 'system' as const,
                      content: fallbackContext,
                    };
                  }
                }
                
                return null;
              } catch (memoryError) {
                console.warn('[并行Memory] ❌ 记忆搜索失败:', memoryError);
                return null;
              }
            })() : Promise.resolve(null);

            // 并行任务2：准备基础消息和模型上下文
            const prepareMessagesTask = (async () => {
              console.log('[并行Messages] 🔧 开始准备消息队列...');
              // 如果是新对话或者刚切换了模型，添加明确的身份指导
              const hasModelContext = recentMsgs.some(msg => 
                msg.content.includes('我是') || msg.content.includes('I am')
              );
              
              if (!hasModelContext) {
                // 为不同模型添加适当的上下文提示
                const contextPrompt = getModelContextPrompt(currentModel);
                if (contextPrompt) {
                  recentMsgs.unshift({
                    role: 'system' as const,
                    content: contextPrompt,
                  });
                }
              }
              
              console.log('[并行Messages] ✅ 消息队列准备完成');
              return recentMsgs;
            })();

            // 并行任务3：LLM连接预热（DNS预解析和连接建立）
            const llmPreconnectTask = (async () => {
              try {
                console.log('[并行LLM] 🔗 开始LLM连接预热...');
                const preconnectStartTime = Date.now();
                
                // 发送一个轻量级的预热请求（仅建立连接，不等待完整响应）
                const preconnectController = new AbortController();
                const preconnectTimeout = setTimeout(() => preconnectController.abort(), 3000); // 3秒预连接超时
                
                try {
                  const preconnectResponse = await fetch('/api/test-models', {
                    method: 'GET',
                    signal: preconnectController.signal,
                    headers: {
                      'Connection': 'keep-alive',
                      'Cache-Control': 'no-cache',
                    },
                  });
                  
                  clearTimeout(preconnectTimeout);
                  const preconnectTime = Date.now() - preconnectStartTime;
                  console.log(`[并行LLM] ✅ 连接预热完成，耗时: ${preconnectTime}ms`);
                  return true;
                } catch (preconnectError: any) {
                  clearTimeout(preconnectTimeout);
                  console.log(`[并行LLM] ⚠️ 连接预热失败，将使用常规连接: ${preconnectError.message}`);
                  return false;
                }
              } catch (error) {
                console.log(`[并行LLM] ❌ 预连接任务异常: ${error}`);
                return false;
              }
            })();

            // 等待三个并行任务完成
            console.log('[并行架构] 🔄 等待三重并行任务完成...');
            const [memoryContext, preparedMsgs, preconnectResult] = await Promise.all([
              memorySearchPromise,
              prepareMessagesTask,
              llmPreconnectTask
            ]);

            const parallelTime = Date.now() - parallelStartTime;
            console.log(`[并行架构] ⏱️ 并行处理总耗时: ${parallelTime}ms`);

            // 如果记忆搜索成功，添加到消息开头
            if (memoryContext) {
              preparedMsgs.unshift(memoryContext);
              console.log('[并行架构] ✅ 记忆上下文已添加到消息队列');
            }

            console.log(`[并行架构] 🚀 开始LLM流式调用... (预连接: ${preconnectResult ? '成功' : '跳过'})`);

            // 调用流式API - 使用并行处理后的消息
            const response = await fetch('/api/chat-stream', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: currentModel,
                messages: preparedMsgs, // 使用并行处理后的消息
                enableSmartRouting: enableSmartRouting, // 智能路由参数
              }),
            });

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            // 处理流式响应
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
              throw new Error('No response body');
            }

            let buffer = '';
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // 保留最后一个可能不完整的行

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const dataStr = line.slice(6).trim();
                  if (!dataStr) continue;
                  
                  try {
                    const data = JSON.parse(dataStr);
                    console.log(`[前端流式调试] 🔍 解析到数据:`, data);
                    
                    if (data.type === 'thinking_start') {
                      // 处理思考开始信号 - 设置真正的思考开始时间
                      set(state => ({ 
                        thinkingStartTime: data.timestamp || Date.now()
                      }));
                    } else if (data.type === 'reasoning' && data.content) {
                      // 处理思考过程 - 保持思考状态，但改为深度思考
                      console.log(`[前端流式调试] 接收到思考过程，长度: ${data.content.length}`);
                      set(state => ({ 
                        streamingReasoning: state.streamingReasoning + data.content,
                        isThinking: true // 保持思考状态
                      }));
                    } else if (data.content) {
                      // 处理最终回答内容 - 第一次收到content时结束思考状态并计算思考时间
                      console.log(`[前端流式调试] 🎯 接收到回答内容，长度: ${data.content.length}, 内容: "${data.content.substring(0, 50)}..."`);
                      set(state => {
                        const isFirstContent = state.streamingMessage === '';
                        const thinkingTime = isFirstContent && state.thinkingStartTime 
                          ? Math.max(0, Date.now() - state.thinkingStartTime) 
                          : undefined;
                        
                        console.log(`[思考时间] ${currentModel} 思考用时: ${thinkingTime ? (thinkingTime / 1000).toFixed(1) : 0}s`);
                        console.log(`[前端状态更新] 当前流式消息长度: ${state.streamingMessage.length}, 新增: ${data.content.length}`);
                        
                        return {
                          streamingMessage: state.streamingMessage + data.content,
                          isThinking: false, // 开始输出答案，思考结束
                          ...(thinkingTime && { 
                            streamingStats: {
                              ...state.streamingStats,
                              thinkingTime
                            }
                          })
                        };
                      });
                    } else if (data.done) {
                      // 流式输出完成，处理统计信息
                      console.log(`[Stream] ✅ ${currentModel}: 流式输出完成`);
                      
                      // 如果有统计信息，更新最后一条消息
                      if (data.responseTime || data.totalTokens || data.generatedTokens) {
                        const finalStreamingMessage = get().streamingMessage;
                        const finalStreamingReasoning = get().streamingReasoning;
                        
                        if (finalStreamingMessage || finalStreamingReasoning) {
                          // 更新即将添加到对话中的消息统计信息，保留已有的思考时间
                          set(state => ({
                            streamingStats: {
                              ...state.streamingStats, // 保留之前的thinkingTime
                              responseTime: data.responseTime,
                              totalTokens: data.totalTokens,
                              generatedTokens: data.generatedTokens,
                              promptTokens: data.promptTokens,
                              completionTokens: data.completionTokens,
                              reasoningTokens: data.reasoningTokens,
                              usage: data.usage,
                              model: data.model
                            }
                          }));
                        }
                      }
                      break;
                    } else if (data.error) {
                      throw new Error(data.error);
                    }
                  } catch (e) {
                    // 忽略JSON解析错误
                    console.debug('[Stream] JSON解析错误:', dataStr);
                  }
                }
              }
            }
          } catch (error) {
            console.error('流式API调用失败:', error);
            set({ 
              streamingMessage: `错误: ${error instanceof Error ? error.message : '未知错误'}` 
            });
          }
        }

        // 计算响应时间
        const responseTime = Date.now() - startTime;
        
        // 将流式消息添加到对话中
        const finalStreamingMessage = get().streamingMessage;
        const finalStreamingReasoning = get().streamingReasoning;
        
        if (finalStreamingMessage || finalStreamingReasoning) {
          const streamingStats = get().streamingStats;
          
          const assistantMessage: Message = newMessage({
            type: 'assistant',
            content: finalStreamingMessage,
            reasoning: finalStreamingReasoning || undefined, // 如果有思考过程，则保存
            model: currentModel, // 记录请求的模型
            actualModel: streamingStats?.model || currentModel, // 记录实际使用的模型
            responseTime: streamingStats?.responseTime || responseTime, // 使用API返回的响应时间或本地计算的
            tokens: streamingStats?.usage || (streamingStats?.totalTokens ? {
              total_tokens: streamingStats.totalTokens,
              generated_tokens: streamingStats.generatedTokens,
              completion_tokens: streamingStats.completionTokens,
              prompt_tokens: streamingStats.promptTokens,
              reasoning_tokens: streamingStats.reasoningTokens
            } : undefined),
          });

          // 生成统计文本
          const parts = [];
          const actualModel = streamingStats?.model || currentModel;
          if (actualModel !== currentModel) {
            parts.push(`模型: ${actualModel} (智能选择)`);
          } else {
            parts.push(`模型: ${currentModel}`);
          }
          if (streamingStats?.generatedTokens || streamingStats?.totalTokens) {
            const generatedTokens = streamingStats.generatedTokens || streamingStats.totalTokens || 0;
            parts.push(`生成: ${generatedTokens}`);
            const actualResponseTime = streamingStats?.responseTime || responseTime;
            const tokensPerSecond = (generatedTokens / (actualResponseTime / 1000)).toFixed(1);
            
            // 如果有思考时间，单独显示
            if (streamingStats.thinkingTime) {
              const answerTime = Math.max(0, actualResponseTime - streamingStats.thinkingTime);
              parts.push(`思考: ${(streamingStats.thinkingTime / 1000).toFixed(1)}s`);
              parts.push(`回答: ${(answerTime / 1000).toFixed(1)}s`);
              parts.push(`总时间: ${(actualResponseTime / 1000).toFixed(1)}s`);
            } else {
              parts.push(`时间: ${(actualResponseTime / 1000).toFixed(1)}s`);
            }
            parts.push(`速率: ${tokensPerSecond} tokens/s`);
          } else {
            const actualResponseTime = streamingStats?.responseTime || responseTime;
            if (streamingStats?.thinkingTime) {
              const answerTime = Math.max(0, actualResponseTime - streamingStats.thinkingTime);
              parts.push(`思考: ${(streamingStats.thinkingTime / 1000).toFixed(1)}s`);
              parts.push(`回答: ${(answerTime / 1000).toFixed(1)}s`);
              parts.push(`总时间: ${(actualResponseTime / 1000).toFixed(1)}s`);
            } else {
              parts.push(`时间: ${(actualResponseTime / 1000).toFixed(1)}s`);
            }
          }
          
          // 保存思考时间到消息对象
          if (streamingStats?.thinkingTime) {
            assistantMessage.thinkingTime = streamingStats.thinkingTime;
          }
          
          assistantMessage.statsText = parts.join(' | ');

          get().updateCurConversation((conversation) => {
            conversation.messages.push(assistantMessage);
          });
        }

        // 记忆功能：完全异步的记忆提取和存储（不阻塞用户体验）
        if (get().memoryEnabled && finalStreamingMessage) {
          // 立即异步执行，不延迟
          (async () => {
            try {
              const memoryStartTime = Date.now();
              console.log('[Memory] 🚀 开始后台异步记忆处理...');
              const conversation = get().curConversation();
              
              // 只传递用户消息用于记忆提取
              const userMessages = conversation.messages
                .filter(msg => msg.type === 'user')
                .slice(-3) // 只分析最近3条用户消息
                .map(msg => ({ content: msg.content, type: msg.type }));
              
              if (userMessages.length > 0) {
                const response = await fetch('/api/memory/extract', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    userId: get().userId,
                    messages: userMessages,
                    conversationId: conversation.id,
                  }),
                });
                
                const data = await response.json();
                const memoryTime = Date.now() - memoryStartTime;
                
                if (data.success) {
                  console.log(`[Memory] ✅ 后台记忆处理完成: ${data.count} 条新记忆，耗时: ${memoryTime}ms`);
                } else {
                  console.log(`[Memory] ⚠️  后台记忆处理完成: 未提取到新记忆，耗时: ${memoryTime}ms`);
                }
              }
            } catch (memoryError) {
              console.warn('[Memory] ❌ 后台记忆处理失败:', memoryError);
            }
          })();
        }

        // 清理流式状态
        set({ 
          isStreaming: false, 
          streamingMessage: '', 
          streamingReasoning: '', 
          isThinking: false,
          streamingStats: undefined,
          thinkingStartTime: undefined
        });
      },

      clearStreamingMessage: () => {
        set({ streamingMessage: '' });
      },

      clearStreamingReasoning: () => {
        set({ streamingReasoning: '' });
      },

      getMemoryMsgs() {
        const conversation = get().curConversation();
        return conversation.messages.slice(-10); // 返回最近10条消息
      },

      updateCurConversation(updater) {
        set((state) => {
          const conversations = [...state.conversations];
          updater(conversations[state.curConversationIndex]);
          return { conversations };
        });
      },

      toggleInstuctionModal(toggle) {
        set(() => ({
          instructionModalStatus: toggle,
        }));
      },

      toggleMemoryUploadModal(toggle) {
        set(() => ({
          memoryUploadModalStatus: toggle,
        }));
      },

      toggleInitModal(toggle) {
        set((state) => ({
          initInfoTmp: {
            ...state.initInfoTmp,
            showModal: toggle,
          },
        }));
      },

      toggleMemoryMode(enabled: boolean) {
        set({ memoryEnabled: enabled });
        console.log(`[Memory] 记忆功能${enabled ? '启用' : '禁用'}`);
      },

      setUserId(userId: string) {
        set({ userId });
        console.log(`[Memory] 用户ID设置为: ${userId}`);
      },

      setUser(user: { id: string; username: string; isLoggedIn: boolean } | null) {
        set({ user });
        // 同时更新userId
        if (user) {
          set({ userId: user.id });
        }
      },
    }),
    {
      name: CHATSTORE_KEY,
    },
  ),
);
