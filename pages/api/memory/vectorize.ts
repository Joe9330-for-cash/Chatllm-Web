import { NextApiRequest, NextApiResponse } from 'next';
import { getMemoryManager } from '@/lib/memory/manager';
import { getVectorDatabase } from '@/lib/memory/vector-database';
import { getEmbeddingService } from '@/lib/memory/embedding-service';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { userId, action = 'stats' } = req.query;

    if (!userId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: userId' 
      });
    }

    console.log(`[Vectorize API] 用户: ${userId}, 操作: ${action}`);

    const memoryManager = getMemoryManager();
    const vectorDB = getVectorDatabase();
    const embeddingService = getEmbeddingService();

    switch (action) {
      case 'stats':
        // 获取向量化统计信息
        const regularMemories = memoryManager.getUserCoreMemories(userId as string);
        const vectorStats = await vectorDB.getUserMemoryStats(userId as string);
        
        return res.status(200).json({
          success: true,
          message: '向量化系统状态正常',
          userStats: {
            totalRegularMemories: regularMemories.length,
            totalVectorMemories: vectorStats.totalMemories,
            vectorizedMemories: vectorStats.vectorizedMemories,
            pendingVectorization: regularMemories.length - vectorStats.vectorizedMemories,
            vectorizationRate: vectorStats.totalMemories > 0 
              ? `${((vectorStats.vectorizedMemories / vectorStats.totalMemories) * 100).toFixed(1)}%`
              : '0%',
            categories: vectorStats.categories,
            avgVectorDimensions: vectorStats.avgVectorDimensions
          },
          systemStatus: 'ready',
          embeddingModel: embeddingService.getModelInfo()
        });

      case 'migrate':
        // 将现有记忆迁移到向量数据库
        const memories = memoryManager.getUserCoreMemories(userId as string);
        const migrationResults = [];
        
        console.log(`[Vectorize API] 开始迁移 ${memories.length} 条记忆到向量数据库`);
        
        for (const memory of memories) {
          try {
            // 生成向量
            const vector = await embeddingService.generateEmbedding(memory.content);
            
            // 存储到向量数据库
            const vectorId = await vectorDB.storeMemoryVector(
              userId as string,
              memory.content,
              vector,
              memory.category,
              {
                originalId: memory.id,
                tags: memory.tags,
                importance: memory.importance,
                source: memory.source || 'migrated'
              }
            );

            migrationResults.push({
              originalId: memory.id,
              vectorId,
              content: memory.content.substring(0, 50) + '...',
              vectorDimensions: vector.length,
              success: true
            });

          } catch (error) {
            console.error(`[Vectorize API] 迁移记忆失败 ID: ${memory.id}`, error);
            migrationResults.push({
              originalId: memory.id,
              content: memory.content.substring(0, 50) + '...',
              success: false,
              error: error instanceof Error ? error.message : '未知错误'
            });
          }
        }

        const successCount = migrationResults.filter(r => r.success).length;
        
        return res.status(200).json({
          success: true,
          message: `迁移完成：${successCount}/${memories.length} 条记忆成功向量化`,
          migrationResults,
          summary: {
            total: memories.length,
            successful: successCount,
            failed: memories.length - successCount,
            successRate: `${((successCount / memories.length) * 100).toFixed(1)}%`
          }
        });

      case 'test':
        // 测试向量化系统
        const testMemories = memoryManager.getUserCoreMemories(userId as string);
        
        if (testMemories.length === 0) {
          return res.status(200).json({
            success: true,
            message: '用户暂无记忆数据，无法进行测试',
            testResults: []
          });
        }

        const testMemory = testMemories[0];
        
        try {
          // 测试向量生成
          const testVector = await embeddingService.generateEmbedding(testMemory.content);
          
          // 测试API连接
          const connectionTest = await embeddingService.testConnection();
          
          return res.status(200).json({
            success: true,
            message: '向量化系统测试成功',
            testResults: {
              memoryId: testMemory.id,
              content: testMemory.content.substring(0, 100),
              vectorDimensions: testVector.length,
              connectionTest,
              systemReady: true,
              embeddingModel: embeddingService.getModelInfo()
            }
          });

        } catch (error) {
          return res.status(500).json({
            success: false,
            message: '向量化系统测试失败',
            error: error instanceof Error ? error.message : '未知错误'
          });
        }

      case 'search-test':
        // 测试向量搜索
        const { query = '测试查询' } = req.query;
        
        try {
          const queryVector = await embeddingService.generateEmbedding(query as string);
          const searchResults = await vectorDB.searchSimilarMemories(
            userId as string,
            queryVector,
            5,
            0.3
          );

          return res.status(200).json({
            success: true,
            message: '向量搜索测试完成',
            searchResults: {
              query: query as string,
              resultsCount: searchResults.length,
              results: searchResults.map(result => ({
                id: result.memory.id,
                content: result.memory.content.substring(0, 100),
                similarity: result.similarity.toFixed(4),
                distance: result.distance.toFixed(4),
                category: result.memory.category
              }))
            }
          });

        } catch (error) {
          return res.status(500).json({
            success: false,
            message: '向量搜索测试失败',
            error: error instanceof Error ? error.message : '未知错误'
          });
        }

      case 'clear':
        // 清空向量数据库（仅用于测试）
        try {
          const db = vectorDB.getDatabase();
          db.exec('DELETE FROM memory_vectors');
          db.exec('DELETE FROM vector_memories');
          
          return res.status(200).json({
            success: true,
            message: '向量数据库已清空'
          });

        } catch (error) {
          return res.status(500).json({
            success: false,
            message: '清空向量数据库失败',
            error: error instanceof Error ? error.message : '未知错误'
          });
        }

      default:
        return res.status(400).json({
          error: `Unknown action: ${action}. Supported actions: stats, migrate, test, search-test, clear`
        });
    }

  } catch (error) {
    console.error('[Vectorize API] 操作失败:', error);
    res.status(500).json({
      success: false,
      error: '向量化操作失败',
      details: error instanceof Error ? error.message : '未知错误',
    });
  }
}
