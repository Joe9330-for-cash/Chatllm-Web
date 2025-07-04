export interface SearchConfig {
  enableIntelligentSearch: boolean;  // 是否启用deepseek-v3智能搜索
  intelligentSearchModel: string;    // 智能搜索使用的模型
  fallbackToLocal: boolean;          // 智能搜索失败时是否降级到本地搜索
  keywordExtractionTimeout: number;  // 关键词提取超时时间(ms)
  maxKeywords: number;               // 最大关键词数量
  searchThreshold: number;           // 搜索相关性阈值
  maxResults: number;                // 最大搜索结果数量
}

export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  enableIntelligentSearch: true,
  intelligentSearchModel: 'deepseek-v3',
  fallbackToLocal: true,
  keywordExtractionTimeout: 10000, // 10秒超时
  maxKeywords: 20,
  searchThreshold: 0.3,
  maxResults: 100
};

let globalSearchConfig: SearchConfig = { ...DEFAULT_SEARCH_CONFIG };

export function getSearchConfig(): SearchConfig {
  return globalSearchConfig;
}

export function updateSearchConfig(updates: Partial<SearchConfig>): void {
  globalSearchConfig = { ...globalSearchConfig, ...updates };
  console.log(`[SearchConfig] 配置已更新:`, updates);
}

export function resetSearchConfig(): void {
  globalSearchConfig = { ...DEFAULT_SEARCH_CONFIG };
  console.log(`[SearchConfig] 配置已重置为默认值`);
}

// 环境变量配置覆盖
if (process.env.DISABLE_INTELLIGENT_SEARCH === 'true') {
  globalSearchConfig.enableIntelligentSearch = false;
  console.log(`[SearchConfig] 通过环境变量禁用智能搜索`);
}

if (process.env.SEARCH_TIMEOUT) {
  const timeout = parseInt(process.env.SEARCH_TIMEOUT);
  if (!isNaN(timeout)) {
    globalSearchConfig.keywordExtractionTimeout = timeout;
    console.log(`[SearchConfig] 通过环境变量设置搜索超时: ${timeout}ms`);
  }
} 