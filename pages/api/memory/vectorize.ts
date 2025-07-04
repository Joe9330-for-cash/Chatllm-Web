import { NextApiRequest, NextApiResponse } from 'next';
import { getEmbeddingService } from '@/lib/memory/embedding-service';
import { getMySQLMemoryDB } from '@/lib/memory/mysql-database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, memoryId, content, category, batchMode = false } = req.body;

    if (!userId || (!batchMode && !memoryId && !content)) {
      return res.status(400).json({ error: 'Missing required fields: userId and (memoryId or content) when not in batch mode' });
    }

    console.log(`[Vectorize API] 开始向量化 - 用户: ${userId}, 批量模式: ${batchMode}`);

    const embeddingService = getEmbeddingService();
    const mysqlDB = getMySQLMemoryDB();

    let processedCount = 0;
    const results = [];

    if (batchMode) {
      // 批量向量化模式：处理用户的所有记忆
      console.log(`[Vectorize API] 🔄 批量向量化模式`);
      
      const userMemories = await mysqlDB.getMemories(userId, 1000);
      console.log(`[Vectorize API] 找到 ${userMemories.length} 条记忆需要处理`);

      for (const memory of userMemories) {
        try {
          // 生成向量
          const embedding = await embeddingService.generateEmbedding(memory.content);
          
          // 存储向量（暂时跳过，因为向量存储功能需要进一步开发）
          console.log(`[Vectorize API] 记忆${memory.id}向量化成功，向量维度: ${embedding.length}`);

          results.push({
            memoryId: memory.id,
            content: memory.content.substring(0, 100) + '...',
            category: memory.category,
            vectorDimensions: embedding.length,
            status: 'success'
          });

          processedCount++;
          
          if (processedCount % 5 === 0) {
            console.log(`[Vectorize API] 已处理 ${processedCount}/${userMemories.length} 条记忆`);
          }

        } catch (error) {
          console.error(`[Vectorize API] 记忆${memory.id}向量化失败:`, error);
          results.push({
            memoryId: memory.id,
            content: memory.content.substring(0, 100) + '...',
            category: memory.category,
            status: 'failed',
            error: error instanceof Error ? error.message : '未知错误'
          });
        }
      }

    } else {
      // 单个记忆向量化模式
      console.log(`[Vectorize API] 🎯 单个记忆向量化模式`);
      
      let targetContent = content;
      let targetCategory = category;
      let targetMemoryId = memoryId;

      // 如果提供了memoryId但没有content，则需要content参数
      if (memoryId && !content) {
        return res.status(400).json({ error: '使用memoryId时必须提供content参数' });
      }

      // 生成向量
      const embedding = await embeddingService.generateEmbedding(targetContent);
      
      // 存储向量（暂时跳过，因为向量存储功能需要进一步开发）
      console.log(`[Vectorize API] 单个记忆向量化成功，向量维度: ${embedding.length}`);

      results.push({
        memoryId: targetMemoryId,
        content: targetContent.substring(0, 100) + '...',
        category: targetCategory,
        vectorDimensions: embedding.length,
        status: 'success'
      });

      processedCount = 1;
    }

    console.log(`[Vectorize API] ✅ 向量化完成: 成功处理 ${processedCount} 条记忆`);

    return res.status(200).json({
      success: true,
      processedCount,
      results,
      mode: batchMode ? 'batch' : 'single',
      summary: {
        totalMemories: results.length,
        successCount: results.filter(r => r.status === 'success').length,
        failedCount: results.filter(r => r.status === 'failed').length,
        avgVectorDimensions: results.length > 0 ? results[0].vectorDimensions : 0
      }
    });

  } catch (error) {
    console.error('[Vectorize API] ❌ 向量化失败:', error);
    return res.status(500).json({ 
      error: '向量化失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
}
