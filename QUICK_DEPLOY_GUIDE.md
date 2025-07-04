# ChatLLM-Web 腾讯云快速部署指南

## 🚀 一键智能部署

### 1. 代码部署
```bash
# 在腾讯云服务器上执行
git clone https://github.com/Joe9330-for-cash/Chatllm-Web.git
cd Chatllm-Web
chmod +x scripts/smart-deploy.sh
./scripts/smart-deploy.sh
```

### 2. 手动部署（如果一键部署失败）

#### Step 1: 环境检查
```bash
node --version  # 需要 >= 18.0.0
gcc --version   # 检查编译器
mysql --version # 检查MySQL
```

#### Step 2: 安装依赖
```bash
# 如果有编译器，尝试完整安装
npm install

# 如果编译失败，跳过native编译
npm install --ignore-scripts
```

#### Step 3: 配置环境变量
```bash
# 创建生产环境配置
cat > .env.production << 'EOF'
OPENAI_API_BASE=https://api.laozhang.ai/v1
OPENAI_API_KEY=你的API密钥

# 如果SQLite失败，启用MySQL
MEMORY_ENABLED=true
VECTOR_SEARCH_ENABLED=false
DATABASE_TYPE=mysql
MYSQL_HOST=localhost
MYSQL_USER=chatllm_user
MYSQL_PASSWORD=chatllm_pass
MYSQL_DATABASE=chatllm_memories
EOF
```

#### Step 4: 数据库设置（如果使用MySQL）
```bash
# 创建MySQL数据库
mysql -u root -p << 'EOF'
CREATE DATABASE chatllm_memories;
CREATE USER 'chatllm_user'@'localhost' IDENTIFIED BY 'chatllm_pass';
GRANT ALL PRIVILEGES ON chatllm_memories.* TO 'chatllm_user'@'localhost';
FLUSH PRIVILEGES;
EOF

# 创建表结构
mysql -u chatllm_user -pchatllm_pass chatllm_memories < scripts/mysql_schema.sql
```

#### Step 5: 构建和启动
```bash
npm run build
npm start
```

## 🔧 常见问题解决

### SQLite编译失败
```bash
# 安装编译工具
yum groupinstall "Development Tools"
# 或
apt-get install build-essential python3

# 重新安装
npm rebuild better-sqlite3
```

### 网络访问问题
```bash
# 测试API连通性
curl -I https://api.laozhang.ai/v1

# 如果失败，检查防火墙或使用其他API端点
```

### MySQL连接失败
```bash
# 检查MySQL服务
systemctl status mysqld
systemctl start mysqld

# 检查用户权限
mysql -u chatllm_user -p -e "SHOW DATABASES;"
```

### 内存不足
```bash
# 调整Node.js内存限制
export NODE_OPTIONS="--max-old-space-size=2048"

# 重新启动服务
pm2 restart all
```

## 📊 部署验证

### 基础功能测试
```bash
# 测试主页
curl http://localhost:3000

# 测试聊天API
curl -X POST http://localhost:3000/api/chat-stream \
  -H "Content-Type: application/json" \
  -d '{"model":"chatgpt-4o-latest","messages":[{"role":"user","content":"hello"}]}'
```

### 记忆功能测试
```bash
# 测试记忆搜索
curl "http://localhost:3000/api/memory/vector-search?userId=default_user&query=test"

# 测试记忆统计
curl "http://localhost:3000/api/memory/stats?userId=default_user"
```

## 🎯 成功指标

### ✅ 必须正常的功能
- [x] 主页可访问
- [x] 聊天功能正常
- [x] 流式输出正常
- [x] 记忆提取正常

### ✅ 可选功能（根据部署策略）
- [ ] 向量搜索（完整部署）
- [ ] MySQL存储（混合部署）
- [ ] 关键词搜索（基础部署）

## 🚀 生产环境优化

### 使用PM2管理进程
```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 配置Nginx反向代理
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 监控和日志
```bash
# 查看应用日志
pm2 logs chatllm-web

# 监控系统资源
pm2 monit

# 设置日志轮转
pm2 install pm2-logrotate
```

## 📞 支持

如果遇到问题，请按以下顺序排查：

1. ✅ 检查环境要求（Node.js >= 18，内存 >= 2GB）
2. ✅ 查看部署日志：`cat deployment.log`
3. ✅ 检查应用日志：`pm2 logs`
4. ✅ 验证数据库连接：`mysql -u chatllm_user -p`
5. ✅ 测试网络连通性：`curl https://api.laozhang.ai/v1`

**部署成功后访问**: `http://你的服务器IP:3000` 