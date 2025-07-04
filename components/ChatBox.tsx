import React, { useLayoutEffect, useRef, useState, useEffect } from 'react';

import dynamic from 'next/dynamic';
import Image from 'next/image';

import { IconDelete, IconRename, IconSend } from './Icons';

import { Loading } from '@/pages';
import { useChatStore } from '@/store/chat';
import { SupportedModel } from '@/types/chat';

const Markdown = dynamic(async () => (await import('./markdown')).Markdown, {
  loading: () => <Loading />,
});

// 模型选项配置
const MODEL_OPTIONS: { value: SupportedModel; label: string; description: string }[] = [
  { value: 'chatgpt-4o-latest', label: 'GPT-4O Latest', description: 'OpenAI最新GPT-4O模型' },
  { value: 'deepseek-r1', label: 'DeepSeek R1', description: 'DeepSeek推理模型' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Google Gemini 2.5 Pro' },
  { value: 'claude-3-7-sonnet-latest', label: 'Claude 3.7 Sonnet', description: 'Anthropic Claude 3.7 Sonnet' },
];

function useScrollToBottom() {
  // for auto-scroll
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [userInteracting, setUserInteracting] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isScrollingRef = useRef(false); // 防止循环滚动的标志
  
  const scrollToBottom = () => {
    const dom = scrollRef.current;
    if (dom && !isScrollingRef.current) {
      isScrollingRef.current = true;
      setTimeout(() => {
        dom.scrollTop = dom.scrollHeight;
        // 延迟重置标志，避免立即触发handleScroll
        setTimeout(() => {
          isScrollingRef.current = false;
        }, 100);
      }, 1);
    }
  };

  // 检测用户是否在底部附近（允许50px误差）
  const isNearBottom = () => {
    const dom = scrollRef.current;
    if (!dom) return true;
    const threshold = 50;
    return dom.scrollTop + dom.clientHeight >= dom.scrollHeight - threshold;
  };

  // 智能自动滚动：只有在允许自动滚动时才滚动
  useLayoutEffect(() => {
    if (autoScroll && !userInteracting) {
      scrollToBottom();
    }
  }, [autoScroll, userInteracting]); // 简化逻辑，避免循环

  // 处理用户滚动事件
  const handleScroll = () => {
    // 如果是程序触发的滚动，忽略
    if (isScrollingRef.current) {
      return;
    }
    
    const nearBottom = isNearBottom();
    
    // 清除之前的定时器，避免累积
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    if (nearBottom) {
      // 在底部时，清除用户交互状态，允许自动滚动
      if (userInteracting) {
        setUserInteracting(false);
      }
      if (!autoScroll) {
        setAutoScroll(true);
      }
    } else {
      // 不在底部时，设置用户正在交互，禁用自动滚动
      if (!userInteracting) {
        setUserInteracting(true);
      }
      if (autoScroll) {
        setAutoScroll(false);
      }
      
      // 2秒后清除用户交互状态
      timeoutRef.current = setTimeout(() => {
        setUserInteracting(false);
      }, 2000);
    }
  };

  // 清理定时器
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    scrollRef,
    autoScroll,
    setAutoScroll,
    scrollToBottom,
    handleScroll,
  };
}

const shouldSubmit = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key !== 'Enter') return false;
  if (e.key === 'Enter' && e.nativeEvent.isComposing) return false;
  return e.ctrlKey;
};

export function ChatBox() {
  const [userInput, setUserInput] = useState('');
  const [modelStatus, setModelStatus] = useState<Record<string, boolean>>({});
  const [useStreaming, setUseStreaming] = useState(true);
  const [hasTestedModels, setHasTestedModels] = useState(false);

  const [curConversationIndex, currentModel, setCurrentModel] = useChatStore((state) => [
    state.curConversationIndex,
    state.currentModel,
    state.setCurrentModel,
  ]);
  const chatStore = useChatStore();
  
  const streamingMessage = useChatStore((state) => state.streamingMessage);
  const streamingReasoning = useChatStore((state) => state.streamingReasoning);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const isThinking = useChatStore((state) => state.isThinking);

  const onInput = (text: string) => {
    setUserInput(text);
  };
  
  const { scrollRef, setAutoScroll, scrollToBottom, handleScroll } = useScrollToBottom();

  // 只在首次加载时检查模型状态，添加防重复调用机制
  useEffect(() => {
    if (hasTestedModels) return;

    const checkModelStatus = async () => {
      try {
        console.log('[模型检测] 首次启动，开始检测模型状态...');
        setHasTestedModels(true);
        
        // 添加延迟，确保API服务器完全启动
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const response = await fetch('/api/test-models', {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          const statusMap: Record<string, boolean> = {};
          data.results.forEach((result: any) => {
            statusMap[result.model] = result.status === 'success';
          });
          setModelStatus(statusMap);
          
          console.log('\n🚀 ========== LLM模型状态检测完成 ==========');
          data.results.forEach((result: any) => {
            const status = result.status === 'success' ? '✅' : '❌';
            const responseInfo = result.status === 'success' 
              ? `(响应长度: ${result.response_length}字符)` 
              : `(${result.message})`;
            console.log(`${status} ${result.model}: ${result.message} ${responseInfo}`);
          });
          console.log('⏰ 检测时间:', new Date(data.timestamp).toLocaleString());
          console.log('🎯 ==========================================\n');
        } else {
          console.error('[模型检测] 测试失败:', response.status);
          // 不立即重置hasTestedModels，避免重复调用
        }
      } catch (error) {
        console.error('[模型检测] 测试异常:', error);
        // 不立即重置hasTestedModels，避免重复调用
      }
    };

    checkModelStatus();
  }, [hasTestedModels]); // 添加依赖数组

  const submitUserInput = async () => {
    if (userInput.length <= 0) return;
    
    const inputContent = userInput;
    // 立即清空输入框，避免重复提交
    setUserInput('');
    
    if (useStreaming) {
      console.log(`[前端] 发送流式消息，模型: ${currentModel}`);
      await chatStore.onUserInputContentStream(inputContent);
    } else {
      chatStore.onUserInputContent(inputContent);
    }
    
    scrollToBottom();
    setAutoScroll(true);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (shouldSubmit(e)) {
      submitUserInput();
    }
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value as SupportedModel;
    console.log('[Model Switch] 从', currentModel, '切换到', newModel);
    
    // 显示确认对话框
    if (chatStore.curConversation().messages.length > 0) {
      const shouldSwitch = window.confirm(
        `切换模型会影响对话上下文理解。建议：\n\n` +
        `1. 新建对话使用新模型\n` +
        `2. 或者在当前对话中明确告知模型切换\n\n` +
        `是否确认在当前对话中切换到 ${e.target.options[e.target.selectedIndex].text}？`
      );
      
      if (!shouldSwitch) {
        // 用户取消，恢复原选择
        e.target.value = currentModel;
        return;
      }
    }
    
    // 批量更新，减少重新渲染次数
    const modelName = MODEL_OPTIONS.find(opt => opt.value === newModel)?.label || newModel;
    const hasMessages = chatStore.curConversation().messages.length > 0;
    
    // 一次性更新所有状态
    setCurrentModel(newModel);
    chatStore.updateCurConversation((conversation) => {
      conversation.model = newModel;
      console.log('[Model Switch] 会话模型已更新为:', newModel);
      
      // 如果有对话历史，同时添加系统提示
      if (hasMessages) {
        conversation.messages.push({
          id: Date.now(),
          createTime: new Date().toLocaleString(),
          updateTime: new Date().toLocaleString(),
          type: 'init',
          content: `🔄 模型已切换到 ${modelName}`,
        });
      }
    });
  };

  return (
    <>
      <div className="top-0 p-2 flex flex-col relative max-h-[100vh] h-[100vh]">
        {/* 顶部标题栏和模型选择 */}
        <div className="w-full px-4 flex justify-between items-center py-2 border-b border-solid border-black border-opacity-10">
          <div className="transition-all duration-200">
            <div className="my-1 text-xl font-bold overflow-hidden text-ellipsis whitespace-nowrap block max-w-[50vw]">
              {chatStore.curConversation()?.title ?? ''}
            </div>
            <div className="text-base-content text-xs opacity-40 font-bold">
              {chatStore.curConversation()?.messages?.length ?? 0} messages
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* 流式输出开关 */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-base-content opacity-70">
                流式:
              </label>
              <input 
                type="checkbox" 
                className="toggle toggle-sm" 
                checked={useStreaming}
                onChange={(e) => setUseStreaming(e.target.checked)}
              />
            </div>
            
            {/* 模型选择下拉框 */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-base-content opacity-70">
                模型:
              </label>
              <select 
                className="select select-bordered select-sm w-48" 
                value={currentModel}
                onChange={handleModelChange}
              >
                {MODEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} title={option.description}>
                    {option.label}
                    {modelStatus[option.value] === true && ' ✓'}
                    {modelStatus[option.value] === false && ' ✗'}
                  </option>
                ))}
              </select>
            </div>

            {/* 原有的操作按钮 */}
            <div className="flex justify-between">
              <button
                onClick={() => {
                  const conversationName = window.prompt('Enter name: ');
                  if (!conversationName) {
                    return;
                  }
                  chatStore.updateCurConversation((conversation) => {
                    conversation.title = conversationName;
                  });
                }}
                className="btn btn-ghost btn-xs"
              >
                <IconRename />
              </button>
              <button
                onClick={() => chatStore.delConversation(curConversationIndex)}
                className="btn btn-ghost btn-xs"
              >
                <IconDelete />
              </button>
            </div>
          </div>
        </div>

        {/* 聊天消息区域 */}
        <div
          className="h-full overflow-auto py-4 border-b border-solid border-black border-opacity-10"
          ref={scrollRef}
          onScroll={handleScroll}
        >
          {chatStore.curConversation()?.messages.map((item, i) => (
            <div
              key={i}
              className={`chat ${
                item.type === 'user' ? 'chat-end' : 'chat-start'
              }`}
            >
              <div className="chat-image avatar">
                <div className="w-10 rounded-full">
                  <Image
                    src={
                      item.type === 'assistant' ? '/ai-avatar.svg' : '/user.jpg'
                    }
                    alt=""
                    width={40}
                    height={40}
                  />
                </div>
              </div>
              <div className="chat-header">
                <time className="text-xs opacity-50 mx-2">
                  {item.updateTime}
                </time>
                {item.type === 'assistant' && (
                  <span className="text-xs opacity-50 mx-2">
                    {item.model || chatStore.curConversation()?.model || currentModel}
                    {modelStatus[item.model || chatStore.curConversation()?.model || currentModel] === true && ' ✅'}
                    {modelStatus[item.model || chatStore.curConversation()?.model || currentModel] === false && ' ❌'}
                  </span>
                )}
              </div>
              <div className="chat-bubble">
                {item.isLoading ? (
                  <Loading />
                ) : item.type === 'assistant' ? (
                  <div className="space-y-3">
                    {/* 思考过程显示（仅DeepSeek R1） */}
                    {item.reasoning && (
                      <div className="bg-base-200 bg-opacity-50 p-3 rounded-lg border-l-4 border-primary">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-primary">🤔 思考过程</span>
                          <span className="text-xs opacity-60">DeepSeek R1</span>
                        </div>
                        <div className="text-sm text-base-content opacity-80 whitespace-pre-wrap max-h-40 overflow-y-auto">
                          {item.reasoning}
                        </div>
                      </div>
                    )}
                    {/* 最终回答 */}
                    <Markdown message={item} fontSize={14} defaultShow={true} />
                  </div>
                ) : (
                  <div>{item.content}</div>
                )}
                {item.isError && (
                  <div className="text-error text-sm mt-2">
                    ⚠️ Error occurred
                  </div>
                )}
              </div>
              <div className="chat-footer opacity-50">{item.statsText}</div>
            </div>
          ))}

          {/* 思考状态提示 - 显眼的顶部提示 */}
          {isStreaming && isThinking && !streamingMessage && (
            <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
              <div className="alert alert-info shadow-lg animate-pulse">
                <div>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  <div>
                    <h3 className="font-bold">
                      {streamingReasoning ? '🧠 深度思考中...' : '🤔 正在思考...'}
                    </h3>
                    <div className="text-xs opacity-75">
                      {currentModel} {streamingReasoning ? '- 思考过程可见' : '- 准备回答'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 流式输出消息 */}
          {(streamingMessage || streamingReasoning) && (
            <div className="chat chat-start">
              <div className="chat-image avatar">
                <div className="w-10 rounded-full">
                  <Image
                    src="/ai-avatar.svg"
                    alt=""
                    width={40}
                    height={40}
                  />
                </div>
              </div>
              <div className="chat-header">
                <time className="text-xs opacity-50 mx-2">
                  {isThinking && !streamingMessage ? '🧠 深度思考中...' : '💬 正在回答...'}
                </time>
                <span className="text-xs opacity-50 mx-2">
                  {currentModel} 
                  {modelStatus[currentModel] === true && ' ✅'}
                  {modelStatus[currentModel] === false && ' ❌'}
                </span>
              </div>
              <div className="chat-bubble">
                <div className="space-y-3">
                  {/* 流式思考过程 */}
                  {streamingReasoning && (
                    <div className="bg-base-200 bg-opacity-50 p-3 rounded-lg border-l-4 border-primary">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-primary">🤔 思考过程</span>
                        <span className="text-xs opacity-60">DeepSeek R1</span>
                        {isThinking && <span className="loading loading-dots loading-xs"></span>}
                      </div>
                      <div className="text-sm text-base-content opacity-80 whitespace-pre-wrap max-h-40 overflow-y-auto">
                        {streamingReasoning}
                        {isThinking && <span className="animate-pulse ml-1">▋</span>}
                      </div>
                    </div>
                  )}
                  
                  {/* 流式最终回答 */}
                  {streamingMessage && (
                    <div>
                      <Markdown message={{
                        id: 0,
                        type: 'assistant',
                        content: streamingMessage,
                        createTime: '',
                        updateTime: '',
                        isLoading: false,
                        isError: false
                      }} fontSize={14} defaultShow={true} />
                      <span className="animate-pulse ml-1">▋</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 输入区域 */}
        <div className="relative bottom-0 p-4">
          <div className="bg-base-100 flex items-center justify-center h-full z-30">
            <textarea
              className="textarea textarea-primary textarea-bordered textarea-sm w-[50%]"
              placeholder={`${useStreaming ? '🔄 流式模式' : '📝 普通模式'} - Ctrl + Enter 发送消息`}
              value={userInput}
              onInput={(e) => onInput(e.currentTarget.value)}
              onFocus={() => setAutoScroll(true)}
              onBlur={() => setAutoScroll(false)}
              onKeyDown={onInputKeyDown}
              disabled={isStreaming}
            ></textarea>
            <button
              onClick={submitUserInput}
              className="btn btn-ghost btn-xs relative right-12 top-2"
              disabled={isStreaming || userInput.length === 0}
            >
              {isStreaming ? (
                <div className="loading loading-spinner loading-xs"></div>
              ) : (
                <IconSend />
              )}
            </button>
          </div>
          {/* 状态指示器 */}
          <div className="text-center text-xs opacity-60 mt-1">
            {isThinking && !streamingMessage && !streamingReasoning && '🤔 正在思考...'}
            {streamingReasoning && !streamingMessage && currentModel === 'deepseek-r1' && '🧠 DeepSeek R1 深度思考中...'}
            {isStreaming && streamingMessage && '🔄 正在生成回复...'}
            {useStreaming && !isStreaming && '⚡ 流式输出已启用'}
            {!useStreaming && !isStreaming && '📝 普通模式'}
            {currentModel === 'deepseek-r1' && useStreaming && !isStreaming && ' | 💭 思考过程可见'}
          </div>
        </div>
      </div>
    </>
  );
}
