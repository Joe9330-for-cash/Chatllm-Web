# Useless 文件夹

此文件夹包含从原ChatLLM-Web项目中移除的文件，这些文件在新的多用户LLM平台中暂时不需要，但保留以备后续功能扩展时使用。

## 📁 已移入的文件

### WebLLM 相关文件
- `web-worker/` - WebLLM Worker实现代码
- `web-llm.ts` - WebLLM接口封装 (原位置: `hooks/web-llm.ts`)
- `web-llm.ts` - WebLLM类型定义 (原位置: `types/web-llm.ts`)
- `lib/` - WebLLM运行时库 (原位置: `public/lib/`)

### PWA 相关文件
- `manifest.json` - PWA配置文件 (原位置: `public/manifest.json`)
- `next.config.js.backup` - 原始的Next.js配置备份

### 资源文件
- `vicuna.jpeg` - Vicuna模型头像 (原位置: `public/vicuna.jpeg`)

## 🔄 移除原因

1. **WebLLM相关**: 新平台采用API调用模式，不需要在浏览器端运行大模型
2. **PWA功能**: 暂时不需要PWA功能，专注于Web端体验
3. **特定资源**: Vicuna头像等特定于原项目的资源

## 📌 注意事项

- 这些文件可能在未来的功能扩展中有用
- 如需恢复任何功能，可以从此文件夹中获取原始代码
- 移动前已备份了相关配置文件 