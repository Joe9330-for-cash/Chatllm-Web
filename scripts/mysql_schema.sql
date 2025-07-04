-- ChatLLM-Web MySQL数据库表结构
-- 用于记忆系统的数据存储

-- 创建记忆表
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
  -- 向量数据支持（可选）
  vector_id INT NULL,
  embedding_vector JSON NULL,
  -- 元数据
  source VARCHAR(50) DEFAULT 'chat',
  conversationId INT NULL,
  extractedFrom TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创建索引以优化查询性能
CREATE INDEX IF NOT EXISTS idx_user_category ON memories(userId, category);
CREATE INDEX IF NOT EXISTS idx_importance ON memories(importance);
CREATE INDEX IF NOT EXISTS idx_timestamp ON memories(timestamp);
CREATE INDEX IF NOT EXISTS idx_last_accessed ON memories(lastAccessed);

-- 全文搜索索引（用于关键词搜索）
CREATE FULLTEXT INDEX IF NOT EXISTS idx_content_fulltext ON memories(content);
CREATE FULLTEXT INDEX IF NOT EXISTS idx_tags_fulltext ON memories(tags);

-- 创建用户统计视图
CREATE OR REPLACE VIEW user_memory_stats AS
SELECT 
    userId,
    COUNT(*) as total_memories,
    COUNT(DISTINCT category) as total_categories,
    AVG(importance) as avg_importance,
    MAX(timestamp) as last_memory_time,
    SUM(accessCount) as total_access_count
FROM memories 
GROUP BY userId;

-- 创建分类统计视图
CREATE OR REPLACE VIEW category_stats AS
SELECT 
    category,
    COUNT(*) as memory_count,
    AVG(importance) as avg_importance,
    COUNT(DISTINCT userId) as user_count
FROM memories 
GROUP BY category 
ORDER BY memory_count DESC;

-- 插入一些示例数据（仅用于测试）
INSERT IGNORE INTO memories (userId, content, category, importance, tags) VALUES
('test_user', '这是一个测试记忆', 'test', 5, '["测试", "示例"]'),
('test_user', '用户喜欢编程', 'preferences', 8, '["编程", "兴趣"]'),
('test_user', '身高175cm', 'personal_info', 7, '["身高", "个人信息"]');

-- 显示表结构信息
SELECT 
    'Table created successfully' as status,
    COUNT(*) as sample_records
FROM memories; 