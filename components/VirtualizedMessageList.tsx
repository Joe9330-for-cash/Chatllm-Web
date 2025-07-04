import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { Markdown } from './markdown';
import { Loading } from '@/pages';
import { Message } from '@/types/chat';

interface VirtualizedMessageListProps {
  messages: Message[];
  streamingMessage?: string;
  streamingReasoning?: string;
  isStreaming?: boolean;
  isThinking?: boolean;
  currentModel: string;
  modelStatus: Record<string, boolean>;
  containerHeight?: number;
  onScroll?: (event: React.UIEvent<HTMLDivElement>) => void;
}

interface VirtualItem {
  index: number;
  height: number;
  offsetTop: number;
  message: Message;
}

const ITEM_HEIGHT = 120; // 预估的消息高度
const BUFFER_SIZE = 5; // 缓冲区大小，渲染额外的消息数量
const OVERSCAN = 3; // 额外渲染的消息数量

// 优化的消息组件
const MessageItem = React.memo(({ 
  message, 
  index, 
  currentModel, 
  modelStatus, 
  style 
}: { 
  message: Message; 
  index: number; 
  currentModel: string; 
  modelStatus: Record<string, boolean>; 
  style: React.CSSProperties;
}) => {
  const itemRef = useRef<HTMLDivElement>(null);
  
  // 防抖的高度计算
  const [itemHeight, setItemHeight] = useState(ITEM_HEIGHT);
  
  useEffect(() => {
    if (itemRef.current) {
      const height = itemRef.current.offsetHeight;
      if (height !== itemHeight) {
        setItemHeight(height);
      }
    }
  }, [message.content, itemHeight]);

  return (
    <div
      ref={itemRef}
      style={style}
      className={`chat ${message.type === 'user' ? 'chat-end' : 'chat-start'}`}
    >
      <div className="chat-image avatar">
        <div className="w-10 rounded-full">
          <Image
            src={message.type === 'assistant' ? '/ai-avatar.svg' : '/user.jpg'}
            alt=""
            width={40}
            height={40}
            loading="lazy"
          />
        </div>
      </div>
      <div className="chat-header">
        <time className="text-xs opacity-50 mx-2">
          {message.updateTime}
        </time>
        {message.type === 'assistant' && (
          <span className="text-xs opacity-50 mx-2">
            {message.model || currentModel}
            {modelStatus[message.model || currentModel] === true && ' ✅'}
            {modelStatus[message.model || currentModel] === false && ' ❌'}
          </span>
        )}
      </div>
      <div className="chat-bubble">
        {message.isLoading ? (
          <Loading />
        ) : message.type === 'assistant' ? (
          <div className="space-y-3">
            {/* 思考过程显示（仅DeepSeek R1） */}
            {message.reasoning && (
              <div className="bg-base-200 bg-opacity-50 p-3 rounded-lg border-l-4 border-primary">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-primary">🤔 思考过程</span>
                  <span className="text-xs opacity-60">DeepSeek R1</span>
                </div>
                <div className="text-sm text-base-content opacity-80 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {message.reasoning}
                </div>
              </div>
            )}
            {/* 最终回答 */}
            <Markdown message={message} fontSize={14} defaultShow={true} />
          </div>
        ) : (
          <div>{message.content}</div>
        )}
        {message.isError && (
          <div className="text-error text-sm mt-2">
            ⚠️ Error occurred
          </div>
        )}
      </div>
      <div className="chat-footer opacity-50">{message.statsText}</div>
    </div>
  );
});

// 流式消息组件
const StreamingMessageItem = React.memo(({ 
  streamingMessage, 
  streamingReasoning, 
  isThinking, 
  currentModel, 
  modelStatus 
}: {
  streamingMessage?: string;
  streamingReasoning?: string;
  isThinking?: boolean;
  currentModel: string;
  modelStatus: Record<string, boolean>;
}) => {
  return (
    <div className="chat chat-start">
      <div className="chat-image avatar">
        <div className="w-10 rounded-full">
          <Image
            src="/ai-avatar.svg"
            alt=""
            width={40}
            height={40}
            loading="lazy"
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
                id: Date.now(),
                type: 'assistant',
                content: streamingMessage,
                createTime: '',
                updateTime: '',
                isLoading: false,
                isError: false
              }} fontSize={14} defaultShow={true} />
              <span className="animate-pulse ml-1">▋</span>
              <div className="text-xs opacity-50 mt-1">
                🔄 已输出 {streamingMessage.length} 字符 | 实时更新中...
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export const VirtualizedMessageList: React.FC<VirtualizedMessageListProps> = ({
  messages,
  streamingMessage,
  streamingReasoning,
  isStreaming,
  isThinking,
  currentModel,
  modelStatus,
  containerHeight = 600,
  onScroll
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);

  // 计算虚拟化参数
  const totalHeight = useMemo(() => {
    return messages.length * ITEM_HEIGHT + (streamingMessage || streamingReasoning ? ITEM_HEIGHT : 0);
  }, [messages.length, streamingMessage, streamingReasoning]);

  const startIndex = useMemo(() => {
    const index = Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER_SIZE;
    return Math.max(0, index);
  }, [scrollTop]);

  const endIndex = useMemo(() => {
    const index = Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + BUFFER_SIZE;
    return Math.min(messages.length, index);
  }, [scrollTop, containerHeight, messages.length]);

  const visibleMessages = useMemo(() => {
    return messages.slice(startIndex, endIndex);
  }, [messages, startIndex, endIndex]);

  // 防抖滚动处理
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.target as HTMLDivElement;
    const newScrollTop = target.scrollTop;
    
    // 节流更新
    if (Math.abs(newScrollTop - scrollTop) > 10) {
      setScrollTop(newScrollTop);
    }
    
    // 检查是否在底部
    const isAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 50;
    setIsScrolledToBottom(isAtBottom);
    
    // 传递滚动事件
    if (onScroll) {
      onScroll(event);
    }
  }, [scrollTop, onScroll]);

  // 滚动到底部的优化函数
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      const target = scrollRef.current;
      target.scrollTop = target.scrollHeight;
    }
  }, []);

  // 自动滚动到底部（仅在流式输出时）
  useEffect(() => {
    if (isStreaming && isScrolledToBottom) {
      scrollToBottom();
    }
  }, [streamingMessage, streamingReasoning, isStreaming, isScrolledToBottom, scrollToBottom]);

  // 优化的渲染函数
  const renderMessages = useMemo(() => {
    return visibleMessages.map((message, index) => {
      const actualIndex = startIndex + index;
      const top = actualIndex * ITEM_HEIGHT;
      
      return (
        <MessageItem
          key={message.id}
          message={message}
          index={actualIndex}
          currentModel={currentModel}
          modelStatus={modelStatus}
          style={{
            position: 'absolute',
            top: `${top}px`,
            left: 0,
            right: 0,
            minHeight: `${ITEM_HEIGHT}px`,
          }}
        />
      );
    });
  }, [visibleMessages, startIndex, currentModel, modelStatus]);

  return (
    <div className="relative h-full">
      {/* 思考状态提示 */}
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

      {/* 虚拟滚动容器 */}
      <div
        ref={scrollRef}
        className="h-full overflow-auto py-4 border-b border-solid border-black border-opacity-10"
        onScroll={handleScroll}
        style={{
          height: `${containerHeight}px`,
          position: 'relative',
        }}
      >
        {/* 虚拟滚动容器 */}
        <div
          style={{
            height: `${totalHeight}px`,
            position: 'relative',
          }}
        >
          {/* 渲染可见消息 */}
          {renderMessages}
          
          {/* 流式输出消息 */}
          {(streamingMessage || streamingReasoning) && (
            <div
              style={{
                position: 'absolute',
                top: `${messages.length * ITEM_HEIGHT}px`,
                left: 0,
                right: 0,
                minHeight: `${ITEM_HEIGHT}px`,
              }}
            >
              <StreamingMessageItem
                streamingMessage={streamingMessage}
                streamingReasoning={streamingReasoning}
                isThinking={isThinking}
                currentModel={currentModel}
                modelStatus={modelStatus}
              />
            </div>
          )}
        </div>
      </div>

      {/* 滚动到底部按钮 */}
      {!isScrolledToBottom && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-24 right-6 btn btn-primary btn-sm btn-circle z-50 shadow-lg"
          title="滚动到底部"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      )}
    </div>
  );
}; 