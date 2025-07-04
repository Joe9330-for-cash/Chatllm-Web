# SQLite 稳定版本存档

## 📋 版本信息
- **分支名称**: `sqlite-stable-archive`
- **源版本**: `offline-sqlite-version` (commit: 5eae231)
- **创建时间**: 2025年7月5日
- **版本类型**: SQLite 架构版本
- **状态**: 稳定可用

## 🎯 版本特性

### 📊 核心功能
- ✅ **完整的记忆系统** - 基于 SQLite 数据库
- ✅ **向量搜索** - 支持语义相似性搜索
- ✅ **关键词搜索** - 支持文本关键词匹配
- ✅ **混合搜索** - 结合向量和关键词搜索
- ✅ **流式对话** - 真正的实时流式输出
- ✅ **记忆增强** - 对话时自动调用相关记忆
- ✅ **智能提取** - 自动从对话中提取和分类记忆

### 🔧 技术架构
- **数据库**: SQLite (memories.db, vector-memories.db)
- **向量引擎**: OpenAI Embeddings API
- **搜索引擎**: 混合搜索 (向量 + 关键词)
- **前端**: Next.js + React + TypeScript
- **状态管理**: Zustand

### 📁 关键文件结构
```
lib/memory/
├── database.ts              # SQLite 数据库操作
├── vector-database.ts       # 向量数据库操作
├── manager.ts               # 记忆管理器
├── embedding-service.ts     # 向量化服务
├── extractor.ts             # 记忆提取器
├── llm-extractor.ts         # LLM 增强提取器
├── hybrid-search.ts         # 混合搜索引擎
├── intelligent-manager.ts   # 智能记忆管理
└── category-manager.ts      # 分类管理器

pages/api/
├── chat-stream.ts           # 流式对话API (含记忆增强)
└── memory/
    ├── search.ts            # 记忆搜索API
    ├── vector-search.ts     # 向量搜索API
    ├── extract.ts           # 记忆提取API
    ├── manage.ts            # 记忆管理API
    └── upload.ts            # 记忆上传API
```

## 🚀 部署优势

### 📈 性能表现
- **记忆搜索**: ~500ms (向量搜索)
- **关键词搜索**: ~100ms (SQL全文搜索)
- **流式输出**: 真正实时，无缓冲延迟
- **记忆调用**: 自动智能，无需手动触发

### 🔄 兼容性
- ✅ 支持腾讯云 CVM 部署
- ✅ 支持本地开发环境
- ✅ 支持 Docker 容器化
- ✅ 无外部数据库依赖

## 🛠️ 使用指南

### 安装依赖
```bash
npm install
```

### 环境配置
```env
OPENAI_API_KEY=你的OpenAI API密钥
OPENAI_API_BASE=https://api.openai.com/v1
```

### 启动服务
```bash
npm run dev
```

### 记忆功能使用
1. 自动提取：对话时自动从内容中提取记忆
2. 手动上传：通过记忆面板上传文档
3. 智能搜索：对话时自动搜索相关记忆
4. 上下文增强：记忆内容自动添加到对话上下文

## 📊 数据统计
- **数据库大小**: ~6MB (包含向量数据)
- **记忆容量**: 支持数万条记忆
- **搜索速度**: 毫秒级响应
- **向量维度**: 1536 (OpenAI text-embedding-3-small)

## 🎨 用户体验

### 💡 优化亮点
- 无缓冲流式输出，真正实时对话
- 智能记忆调用，无需手动操作
- 多维度搜索，覆盖更多相关内容
- 个性化回答，基于用户历史记忆

### 🔍 搜索策略
1. **向量搜索** - 语义相似性匹配
2. **关键词搜索** - 精确文本匹配
3. **类别搜索** - 特定场景触发
4. **混合排序** - 多维度相关性评分

## 🏆 版本优势

### 相比 MySQL 版本
- ✅ 更简单的部署 (无需额外数据库)
- ✅ 更快的启动速度
- ✅ 更好的性能表现
- ✅ 更低的维护成本

### 适用场景
- 🎯 个人使用或小团队
- 🎯 快速原型开发
- 🎯 本地环境测试
- 🎯 对话系统研究

## 📞 技术支持

### 联系方式
- GitHub: [ChatLLM-Web](https://github.com/Joe9330-for-cash/Chatllm-Web)
- 分支: `sqlite-stable-archive`

### 问题反馈
如遇到问题，请在 GitHub Issues 中提交，并标明使用的是 SQLite 稳定版本。

---
**创建者**: Junjie Wang  
**创建时间**: 2025年7月5日  
**版本**: SQLite 稳定版 v1.0  
**许可**: MIT License 