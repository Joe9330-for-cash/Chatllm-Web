#!/usr/bin/env node

/**
 * 为所有现有记忆生成embedding向量
 * 这是启用向量搜索功能的关键步骤
 */

const mysql = require('mysql2/promise');
const OpenAI = require('openai');

// 数据库配置
const DB_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'chatllm_memories'
};

// OpenAI配置
const openai = new OpenAI({
  apiKey: "sk-ckdV60TvXrxPMSqb22D292F176A448828e80A866BaBd2d87",
  baseURL: "https://api.laozhang.ai/v1"
});

// 生成embedding向量
async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
      encoding_format: "float",
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error('生成embedding失败:', error);
    throw error;
  }
}

// 主函数
async function main() {
  let connection;
  
  try {
    console.log('🔄 开始为现有记忆生成embedding向量...');
    
    // 连接数据库
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('✅ 数据库连接成功');
    
    // 获取所有没有embedding的记忆
    const [memories] = await connection.execute(
      'SELECT id, content, category FROM memories WHERE embedding IS NULL'
    );
    
    console.log(`📋 找到 ${memories.length} 条需要生成embedding的记忆`);
    
    if (memories.length === 0) {
      console.log('✅ 所有记忆都已有embedding向量');
      return;
    }
    
    // 为每条记忆生成embedding
    let processedCount = 0;
    const totalCount = memories.length;
    
    for (const memory of memories) {
      try {
        console.log(`🔄 处理记忆 ${processedCount + 1}/${totalCount}: ID=${memory.id}`);
        console.log(`📄 内容: "${memory.content}"`);
        
        // 生成embedding
        const embedding = await generateEmbedding(memory.content);
        
        // 保存到数据库
        await connection.execute(
          'UPDATE memories SET embedding = ? WHERE id = ?',
          [JSON.stringify(embedding), memory.id]
        );
        
        processedCount++;
        console.log(`✅ 完成 ${processedCount}/${totalCount} (${Math.round(processedCount/totalCount*100)}%)`);
        
        // 添加延迟避免API限制
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`❌ 处理记忆 ID=${memory.id} 失败:`, error);
        // 继续处理下一条记忆
      }
    }
    
    console.log('🎉 所有记忆的embedding生成完成！');
    
    // 验证结果
    const [result] = await connection.execute(
      'SELECT COUNT(*) as total, COUNT(embedding) as has_embedding FROM memories'
    );
    
    console.log('📊 最终统计:');
    console.log(`  总记忆数: ${result[0].total}`);
    console.log(`  有embedding的记忆数: ${result[0].has_embedding}`);
    console.log(`  completion rate: ${Math.round(result[0].has_embedding/result[0].total*100)}%`);
    
  } catch (error) {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 运行脚本
main().catch(console.error); 