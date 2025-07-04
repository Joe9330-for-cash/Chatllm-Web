export type Message = {
  content: string;
  type: 'assistant' | 'system' | 'user' | 'init';
  createTime: string;
  id: number;
  isStreaming?: boolean;
  isError?: boolean;
  isInit?: boolean;
  isLoading?: boolean;
  updateTime?: string;
  statsText?: string;
  reasoning?: string; // 新增：思考过程（DeepSeek R1专用）
  model?: string; // 新增：该消息使用的模型
  responseTime?: number; // 新增：响应时间(毫秒)
  tokens?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    reasoning_tokens?: number; // 新增：思考token数量
    generated_tokens?: number; // 新增：实际生成的token数量
    completion_tokens_details?: {
      reasoning_tokens?: number;
      audio_tokens?: number;
      accepted_prediction_tokens?: number;
      rejected_prediction_tokens?: number;
    };
  }; // 新增：token使用统计
  thinkingTime?: number; // 新增：思考时间(毫秒)
};

export type ChatConversation = {
  id: number;
  messages: Message[];
  createTime: string;
  updateTime: string;
  title: string;
  model?: string;
};

export type UpdateBotMsg = (msg: Partial<Message>) => void;

export type UpdateInitMsg = (msg: Partial<Message>) => void;

export type InitInfo = {
  showModal: boolean;
  initMsg: Message[];
};

export type SupportedModel = 
  | 'chatgpt-4o-latest'
  | 'deepseek-r1' 
  | 'gemini-2.5-pro'
  | 'claude-3-7-sonnet-latest';

export interface ChatApiResponse {
  success: boolean;
  model: string;
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    generated_tokens?: number;
    reasoning_tokens?: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
      audio_tokens?: number;
      accepted_prediction_tokens?: number;
      rejected_prediction_tokens?: number;
    };
  };
  error?: string;
}
