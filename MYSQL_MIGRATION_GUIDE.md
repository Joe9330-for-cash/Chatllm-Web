# MySQL迁移部署指南

## 概述

本指南将帮助您完成从SQLite到MySQL的数据迁移，确保线上系统的稳定运行。

## 前提条件

### 1. 环境要求
- Node.js 18+
- MySQL 5.7+ 或 MariaDB 10.3+
- npm 包管理器

### 2. 数据备份
在开始迁移之前，**务必备份现有数据**：
```bash
# 备份SQLite数据库
cp data/memories.db data/memories.db.backup
cp data/vector-memories.db data/vector-memories.db.backup
```

## 步骤1：本地MySQL环境准备

### 安装MySQL（Mac）
```bash
# 使用Homebrew安装
brew install mysql

# 启动MySQL服务
brew services start mysql

# 设置MySQL root密码（可选）
mysql_secure_installation
```

### 安装MySQL（Linux）
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install mysql-server

# CentOS/RHEL
sudo yum install mysql-server
```

### 创建数据库和用户
```sql
-- 登录MySQL
mysql -u root -p

-- 创建数据库
CREATE DATABASE chatllm_memories CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建专用用户（推荐）
CREATE USER 'chatllm_user'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON chatllm_memories.* TO 'chatllm_user'@'localhost';
FLUSH PRIVILEGES;
```

## 步骤2：安装依赖包

```bash
# 安装MySQL客户端
npm install mysql2

# 如果使用better-sqlite3遇到问题，可以跳过编译
npm install --ignore-scripts
```

## 步骤3：配置迁移脚本

编辑 `scripts/full-mysql-migration.js`，更新MySQL配置：

```javascript
const config = {
  mysql: {
    host: 'localhost',
    user: 'chatllm_user',        // 或 'root'
    password: 'your_password',    // 设置实际密码
    database: 'chatllm_memories',
    charset: 'utf8mb4'
  }
};
```

## 步骤4：执行数据迁移

### 运行迁移脚本
```bash
# 进入项目目录
cd /path/to/ChatLLM-Web

# 运行迁移脚本
node scripts/full-mysql-migration.js
```

### 预期输出
```
🚀 开始MySQL迁移初始化...
✅ 数据库连接成功
📋 创建MySQL数据库...
✅ 数据库和表结构创建完成
📤 导出SQLite数据...
📊 总记忆数: 283
📊 总向量数: 237
📥 导入数据到MySQL...
✅ 数据导入完成 - 记忆: 283/283, 向量: 237/237
🔍 验证数据完整性...
📊 验证结果:
- 记忆数据: 283/283
- 向量记忆: 237/237
- 向量数据: 237
🧪 测试记忆功能...
✅ 记忆搜索测试通过
✅ 分类统计测试通过
🎉 MySQL迁移完成！数据库已准备就绪。
```

## 步骤5：验证迁移结果

### 运行测试脚本
```bash
node scripts/test-mysql-migration.js
```

### 手动验证
```sql
-- 连接到MySQL
mysql -u chatllm_user -p chatllm_memories

-- 检查数据统计
SELECT COUNT(*) as total FROM memories;
SELECT COUNT(*) as total FROM vector_memories;
SELECT category, COUNT(*) as count FROM memories GROUP BY category;
```

## 步骤6：更新应用配置

### 创建环境配置文件
```bash
# 创建.env.local文件
cat > .env.local << EOF
# MySQL配置
DB_TYPE=mysql
MYSQL_HOST=localhost
MYSQL_USER=chatllm_user
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=chatllm_memories
MYSQL_CHARSET=utf8mb4
EOF
```

### 更新应用代码
需要更新以下文件使用MySQL：

1. `pages/api/memory/stats.ts`
2. `pages/api/memory/search.ts`
3. `pages/api/memory/vector-search.ts`
4. `pages/api/memory/extract.ts`
5. `pages/api/memory/manage.ts`

## 步骤7：本地测试

### 启动应用
```bash
# 确保MySQL服务运行
brew services start mysql  # Mac
# 或 sudo service mysql start  # Linux

# 启动应用
npm run dev
```

### 功能测试
1. 访问 `http://localhost:3000`
2. 测试聊天功能
3. 查看记忆面板
4. 测试记忆搜索
5. 验证记忆提取功能

## 步骤8：云服务器部署

### 服务器MySQL配置
```bash
# 连接到服务器
ssh -i chatllm20250703.pem lighthouse@43.135.17.55

# 安装MySQL/MariaDB
sudo yum install mariadb-server mariadb

# 启动服务
sudo systemctl start mariadb
sudo systemctl enable mariadb

# 配置MySQL
sudo mysql_secure_installation
```

### 创建云端数据库
```sql
-- 在服务器上创建数据库
sudo mysql -u root -p

CREATE DATABASE chatllm_memories CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'chatllm_user'@'localhost' IDENTIFIED BY 'secure_password';
GRANT ALL PRIVILEGES ON chatllm_memories.* TO 'chatllm_user'@'localhost';
FLUSH PRIVILEGES;
```

### 数据同步
```bash
# 方法1：重新运行迁移脚本
node scripts/full-mysql-migration.js

# 方法2：MySQL数据导出导入
# 在本地导出
mysqldump -u chatllm_user -p chatllm_memories > chatllm_backup.sql

# 上传到服务器
scp -i chatllm20250703.pem chatllm_backup.sql lighthouse@43.135.17.55:~/

# 在服务器导入
mysql -u chatllm_user -p chatllm_memories < chatllm_backup.sql
```

### 更新服务器配置
```bash
# 更新项目代码
cd /var/www/ChatLLM-Web
git pull origin main

# 安装依赖
npm install

# 创建环境配置
cat > .env.production << EOF
DB_TYPE=mysql
MYSQL_HOST=localhost
MYSQL_USER=chatllm_user
MYSQL_PASSWORD=secure_password
MYSQL_DATABASE=chatllm_memories
MYSQL_CHARSET=utf8mb4
EOF

# 重新构建
npm run build

# 重启应用
pm2 restart all
```

## 步骤9：监控和维护

### 性能监控
```bash
# 监控MySQL性能
node scripts/monitor-performance.js

# 查看进程状态
pm2 status
pm2 logs

# 检查系统资源
top
df -h
```

### 定期维护
```sql
-- 优化表结构
OPTIMIZE TABLE memories;
OPTIMIZE TABLE vector_memories;
OPTIMIZE TABLE memory_vectors;

-- 分析表统计
ANALYZE TABLE memories;
ANALYZE TABLE vector_memories;
ANALYZE TABLE memory_vectors;
```

## 故障排除

### 常见问题

1. **MySQL连接失败**
   ```bash
   # 检查MySQL服务状态
   systemctl status mysql
   
   # 检查端口
   netstat -tlnp | grep 3306
   ```

2. **字符编码问题**
   ```sql
   -- 检查字符集
   SHOW VARIABLES LIKE 'character_set%';
   
   -- 修改字符集
   ALTER DATABASE chatllm_memories CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

3. **性能问题**
   ```sql
   -- 检查慢查询
   SHOW VARIABLES LIKE 'slow_query%';
   
   -- 添加索引
   CREATE INDEX idx_memories_content ON memories(content(100));
   ```

### 回滚计划
如果迁移失败，可以回滚到SQLite：

```bash
# 恢复SQLite数据库
cp data/memories.db.backup data/memories.db
cp data/vector-memories.db.backup data/vector-memories.db

# 更新环境配置
echo "DB_TYPE=sqlite" > .env.local

# 重启应用
pm2 restart all
```

## 总结

完成MySQL迁移后，您应该：

1. ✅ 创建了 `offline-sqlite-version` 分支作为备份
2. ✅ 成功迁移了283条记忆和237条向量数据
3. ✅ 验证了MySQL数据库的完整性和性能
4. ✅ 更新了应用配置使用MySQL
5. ✅ 部署到云服务器并测试功能

**重要提醒：**
- 始终保持SQLite数据库备份
- 定期监控MySQL性能
- 建立数据库备份策略
- 记录所有配置更改

如有任何问题，请检查日志文件：
- `mysql-migration-report.json`
- `mysql-test-report.json`
- PM2 日志：`pm2 logs` 