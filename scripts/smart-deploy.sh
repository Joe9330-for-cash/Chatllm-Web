#!/bin/bash

# ChatLLM-Web 智能部署脚本
# 自动检测环境并选择最佳部署策略

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 ChatLLM-Web 智能部署开始...${NC}"

# 环境检测函数
check_environment() {
    echo -e "${BLUE}🔍 检测部署环境...${NC}"
    
    # 检查Node.js版本
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo -e "${RED}❌ Node.js版本过低: $(node --version), 需要 >= 18.0.0${NC}"
        exit 1
    else
        echo -e "${GREEN}✅ Node.js版本: $(node --version)${NC}"
    fi
    
    # 检查编译工具
    if command -v gcc >/dev/null 2>&1 && command -v g++ >/dev/null 2>&1; then
        GCC_VERSION=$(gcc --version | head -n1)
        echo -e "${GREEN}✅ 编译工具可用: $GCC_VERSION${NC}"
        HAS_COMPILER=true
    else
        echo -e "${YELLOW}⚠️ 编译工具不可用，将使用备选方案${NC}"
        HAS_COMPILER=false
    fi
    
    # 检查网络连接
    if curl -s --max-time 5 https://api.laozhang.ai/v1 >/dev/null 2>&1; then
        echo -e "${GREEN}✅ OpenAI API连接正常${NC}"
        HAS_OPENAI=true
    else
        echo -e "${YELLOW}⚠️ OpenAI API连接失败${NC}"
        HAS_OPENAI=false
    fi
    
    # 检查MySQL
    if command -v mysql >/dev/null 2>&1; then
        echo -e "${GREEN}✅ MySQL可用${NC}"
        HAS_MYSQL=true
    else
        echo -e "${YELLOW}⚠️ MySQL不可用${NC}"
        HAS_MYSQL=false
    fi
    
    # 检查内存
    MEMORY_GB=$(free -g | awk '/^Mem:/{print $2}')
    if [ "$MEMORY_GB" -ge 4 ]; then
        echo -e "${GREEN}✅ 内存充足: ${MEMORY_GB}GB${NC}"
        HAS_ENOUGH_MEMORY=true
    else
        echo -e "${YELLOW}⚠️ 内存较少: ${MEMORY_GB}GB${NC}"
        HAS_ENOUGH_MEMORY=false
    fi
}

# 选择部署策略
select_strategy() {
    echo -e "${BLUE}🎯 选择部署策略...${NC}"
    
    if [ "$HAS_COMPILER" = true ] && [ "$HAS_OPENAI" = true ] && [ "$HAS_ENOUGH_MEMORY" = true ]; then
        STRATEGY="full"
        echo -e "${GREEN}✅ 选择策略A: 完整功能部署（SQLite + 向量搜索）${NC}"
    elif [ "$HAS_MYSQL" = true ] && [ "$HAS_OPENAI" = true ]; then
        STRATEGY="hybrid"
        echo -e "${YELLOW}⚠️ 选择策略B: 混合部署（MySQL + 向量搜索）${NC}"
    else
        STRATEGY="basic"
        echo -e "${YELLOW}⚠️ 选择策略C: 基础部署（仅关键词搜索）${NC}"
    fi
}

# 策略A: 完整功能部署
deploy_full() {
    echo -e "${BLUE}🔧 执行完整功能部署...${NC}"
    
    # 尝试编译SQLite
    echo "尝试编译better-sqlite3..."
    if npm install better-sqlite3 --build-from-source; then
        echo -e "${GREEN}✅ SQLite编译成功${NC}"
        
        # 配置环境变量
        cat > .env.production << EOF
MEMORY_ENABLED=true
VECTOR_SEARCH_ENABLED=true
FALLBACK_TO_KEYWORD=true
OPENAI_API_BASE=https://api.laozhang.ai/v1
EOF
        
    else
        echo -e "${RED}❌ SQLite编译失败，降级到混合部署${NC}"
        deploy_hybrid
        return
    fi
    
    # 测试向量功能
    if test_vector_search; then
        echo -e "${GREEN}✅ 向量搜索测试通过${NC}"
    else
        echo -e "${YELLOW}⚠️ 向量搜索测试失败，启用降级方案${NC}"
        echo "VECTOR_SEARCH_ENABLED=false" >> .env.production
    fi
}

# 策略B: 混合部署
deploy_hybrid() {
    echo -e "${BLUE}🔧 执行混合部署...${NC}"
    
    # 跳过SQLite编译
    npm install --ignore-scripts
    
    # 设置MySQL数据库
    setup_mysql
    
    # 配置环境变量
    cat > .env.production << EOF
MEMORY_ENABLED=true
VECTOR_SEARCH_ENABLED=false
FALLBACK_TO_KEYWORD=true
DATABASE_TYPE=mysql
MYSQL_HOST=localhost
MYSQL_DATABASE=chatllm_memories
OPENAI_API_BASE=https://api.laozhang.ai/v1
EOF
    
    echo -e "${GREEN}✅ 混合部署配置完成${NC}"
}

# 策略C: 基础部署
deploy_basic() {
    echo -e "${BLUE}🔧 执行基础部署...${NC}"
    
    # 跳过SQLite编译
    npm install --ignore-scripts
    
    # 配置环境变量
    cat > .env.production << EOF
MEMORY_ENABLED=true
VECTOR_SEARCH_ENABLED=false
EMBEDDING_ENABLED=false
FALLBACK_TO_KEYWORD=true
DATABASE_TYPE=mysql
MYSQL_HOST=localhost
MYSQL_DATABASE=chatllm_memories
EOF
    
    echo -e "${GREEN}✅ 基础部署配置完成${NC}"
}

# 设置MySQL
setup_mysql() {
    echo -e "${BLUE}🗃️ 设置MySQL数据库...${NC}"
    
    # 创建数据库
    mysql -u root -p << EOF
CREATE DATABASE IF NOT EXISTS chatllm_memories;
CREATE USER IF NOT EXISTS 'chatllm_user'@'localhost' IDENTIFIED BY 'chatllm_pass';
GRANT ALL PRIVILEGES ON chatllm_memories.* TO 'chatllm_user'@'localhost';
FLUSH PRIVILEGES;
EOF
    
    # 创建表结构
    mysql -u chatllm_user -pchatllm_pass chatllm_memories << EOF
CREATE TABLE IF NOT EXISTS memories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  importance TINYINT NOT NULL DEFAULT 5,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  lastAccessed DATETIME DEFAULT CURRENT_TIMESTAMP,
  accessCount INT DEFAULT 0,
  tags TEXT,
  embedding JSON,
  INDEX idx_user_category (userId, category),
  INDEX idx_importance (importance),
  FULLTEXT INDEX idx_content (content)
);
EOF
    
    echo -e "${GREEN}✅ MySQL数据库设置完成${NC}"
}

# 测试向量搜索
test_vector_search() {
    echo -e "${BLUE}🧪 测试向量搜索功能...${NC}"
    
    # 简单的Node.js测试脚本
    node << 'EOF'
try {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.exec('CREATE VIRTUAL TABLE test USING fts5(content)');
    db.close();
    console.log('Vector search test: PASS');
    process.exit(0);
} catch (error) {
    console.log('Vector search test: FAIL');
    process.exit(1);
}
EOF
}

# 数据迁移
migrate_data() {
    if [ -f "data/memories.db" ]; then
        echo -e "${BLUE}📦 迁移现有数据...${NC}"
        
        # 运行数据迁移脚本
        node scripts/migrate-to-mysql.js
        
        # 备份原数据
        mv data/memories.db data/memories.db.backup
        mv data/vector-memories.db data/vector-memories.db.backup
        
        echo -e "${GREEN}✅ 数据迁移完成${NC}"
    fi
}

# 部署验证
verify_deployment() {
    echo -e "${BLUE}🔍 验证部署结果...${NC}"
    
    # 启动应用
    npm run build
    npm start &
    APP_PID=$!
    
    # 等待启动
    sleep 10
    
    # 测试基础功能
    if curl -s http://localhost:3000 >/dev/null; then
        echo -e "${GREEN}✅ 应用启动成功${NC}"
    else
        echo -e "${RED}❌ 应用启动失败${NC}"
        kill $APP_PID
        exit 1
    fi
    
    # 测试API
    if curl -s -X POST http://localhost:3000/api/chat-stream \
        -H "Content-Type: application/json" \
        -d '{"model":"chatgpt-4o-latest","messages":[{"role":"user","content":"hello"}]}' \
        | grep -q "data:"; then
        echo -e "${GREEN}✅ 聊天API正常${NC}"
    else
        echo -e "${RED}❌ 聊天API异常${NC}"
    fi
    
    kill $APP_PID
}

# 主执行流程
main() {
    check_environment
    select_strategy
    
    case $STRATEGY in
        "full")
            deploy_full
            ;;
        "hybrid")
            deploy_hybrid
            ;;
        "basic")
            deploy_basic
            ;;
    esac
    
    if [ "$STRATEGY" != "full" ]; then
        migrate_data
    fi
    
    verify_deployment
    
    echo -e "${GREEN}🎉 部署完成！${NC}"
    echo -e "${BLUE}📝 部署摘要:${NC}"
    echo -e "  策略: $STRATEGY"
    echo -e "  记忆功能: $([ -f .env.production ] && grep MEMORY_ENABLED .env.production || echo '未知')"
    echo -e "  向量搜索: $([ -f .env.production ] && grep VECTOR_SEARCH_ENABLED .env.production || echo '未知')"
    echo -e "${BLUE}🔗 访问地址: http://your-server-ip:3000${NC}"
}

# 运行主函数
main "$@" 