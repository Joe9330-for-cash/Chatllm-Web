# ChatLLM-Web 腾讯云部署检查清单

## 🎯 部署前准备

### 1. 环境兼容性检查
- [ ] 服务器Node.js版本 >= 18.0.0
- [ ] 检查是否有gcc/g++编译器
- [ ] 确认网络可访问 https://api.laozhang.ai
- [ ] 测试SQLite编译兼容性

### 2. 数据库迁移准备
- [ ] 备份本地SQLite数据库
- [ ] 准备MySQL迁移脚本
- [ ] 配置MySQL连接参数

## 🚀 部署策略

### 策略A: 完整SQLite部署（高风险）
```bash
# 1. 尝试服务器端编译
npm install better-sqlite3 --build-from-source

# 2. 如果失败，使用预编译版本
npm install --ignore-scripts
```

### 策略B: MySQL混合部署（推荐）
```bash
# 1. 使用MySQL替代SQLite记忆存储
# 2. 保留向量搜索功能
# 3. 降级到关键词搜索作为备选
```

### 策略C: 纯关键词搜索（兜底）
```bash
# 1. 完全禁用向量搜索
# 2. 仅使用MySQL关键词搜索
# 3. 保证基础记忆功能
```

## ⚠️ 关键配置项

### 环境变量
```bash
# API配置
OPENAI_API_BASE=https://api.laozhang.ai/v1
OPENAI_API_KEY=sk-xxxx

# 数据库配置
MYSQL_HOST=localhost
MYSQL_USER=chatllm_user
MYSQL_PASSWORD=xxxx
MYSQL_DATABASE=chatllm_memories

# 部署配置
MEMORY_ENABLED=true
VECTOR_SEARCH_ENABLED=false  # 如果SQLite失败
FALLBACK_TO_KEYWORD=true
```

### 文件权限
```bash
# 确保数据目录权限
chmod 755 /var/www/chatllm/data
chown -R www-data:www-data /var/www/chatllm/data
```

## 🔧 故障排除

### SQLite编译失败
```bash
# 检查编译器版本
gcc --version
g++ --version

# 安装开发工具
yum groupinstall "Development Tools"
# 或
apt-get install build-essential

# 升级Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
yum install -y nodejs
```

### 网络访问问题
```bash
# 测试API连通性
curl -I https://api.laozhang.ai/v1
curl -I https://api.openai.com/v1

# 配置代理（如需要）
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=http://proxy.example.com:8080
```

### 内存不足
```bash
# 调整Node.js内存限制
export NODE_OPTIONS="--max-old-space-size=2048"

# 监控内存使用
top -p $(pgrep node)
```

## 📊 部署验证

### 功能测试清单
- [ ] 基础聊天功能
- [ ] 记忆提取功能
- [ ] 记忆搜索功能
- [ ] 流式输出功能
- [ ] 向量搜索功能（如启用）

### 性能测试
- [ ] 并发用户测试
- [ ] 记忆搜索延迟
- [ ] 流式响应速度
- [ ] 内存使用监控

## 🎯 成功指标

### 最低要求
- ✅ 聊天功能正常
- ✅ 记忆提取正常
- ✅ 关键词搜索正常

### 理想状态
- ✅ 向量搜索正常
- ✅ 多策略搜索正常
- ✅ 响应时间<3秒
- ✅ 内存使用<2GB 