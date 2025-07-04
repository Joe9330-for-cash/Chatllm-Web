import { NextApiRequest, NextApiResponse } from 'next';
import { getChineseNLPService } from '@/lib/memory/chinese-nlp-service';
import { getMemoryDB } from '@/lib/memory/database';
import { getSearchConfig, updateSearchConfig } from '@/lib/memory/search-config';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { action, query, userId, config } = req.body;

    switch (action) {
      case 'test-keyword-extraction':
        await testKeywordExtraction(req, res);
        break;
      
      case 'test-intelligent-search':
        await testIntelligentSearch(req, res);
        break;
      
      case 'compare-search-methods':
        await compareSearchMethods(req, res);
        break;
      
      case 'update-config':
        await updateSearchConfiguration(req, res);
        break;
      
      case 'get-config':
        res.status(200).json({
          success: true,
          config: getSearchConfig()
        });
        break;
      
      default:
        res.status(400).json({
          success: false,
          error: '未知操作',
          supportedActions: [
            'test-keyword-extraction',
            'test-intelligent-search', 
            'compare-search-methods',
            'update-config',
            'get-config'
          ]
        });
    }

  } catch (error) {
    console.error('[Intelligent Search Test API] 错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
}

async function testKeywordExtraction(req: NextApiRequest, res: NextApiResponse) {
  const { query } = req.body;
  
  if (!query) {
    return res.status(400).json({
      success: false,
      error: '缺少query参数'
    });
  }

  console.log(`[API] 测试关键词提取: "${query}"`);

  try {
    const nlpService = getChineseNLPService();
    const startTime = Date.now();
    
    // 智能提取
    const intelligentKeywords = await nlpService.extractKeywords(query);
    const intelligentTime = Date.now() - startTime;
    
    // 本地提取（用于对比）
    const db = getMemoryDB();
    const localStartTime = Date.now();
    const localKeywords = (db as any).extractKeywords(query); // 访问私有方法用于测试
    const localTime = Date.now() - localStartTime;

    res.status(200).json({
      success: true,
      query,
      results: {
        intelligent: {
          keywords: intelligentKeywords,
          count: intelligentKeywords.length,
          time: intelligentTime
        },
        local: {
          keywords: localKeywords,
          count: localKeywords.length,
          time: localTime
        },
        comparison: {
          speedImprovement: localTime > 0 ? (intelligentTime / localTime).toFixed(2) : 'N/A',
          qualityScore: calculateKeywordQuality(intelligentKeywords, localKeywords)
        }
      }
    });

  } catch (error) {
    console.error('[API] 关键词提取测试失败:', error);
    res.status(500).json({
      success: false,
      error: '关键词提取失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
}

async function testIntelligentSearch(req: NextApiRequest, res: NextApiResponse) {
  const { query, userId = 'default_user' } = req.body;
  
  if (!query) {
    return res.status(400).json({
      success: false,
      error: '缺少query参数'
    });
  }

  console.log(`[API] 测试智能搜索: "${query}"`);

  try {
    const db = getMemoryDB();
    const startTime = Date.now();
    
    // 智能搜索
    const intelligentResults = await db.searchMemoriesAsync(userId, query, 50);
    const intelligentTime = Date.now() - startTime;
    
    // 普通搜索（用于对比）
    const normalStartTime = Date.now();
    const normalResults = db.searchMemories(userId, query, 50);
    const normalTime = Date.now() - normalStartTime;

    res.status(200).json({
      success: true,
      query,
      results: {
        intelligent: {
          memories: intelligentResults.map(m => ({
            id: m.id,
            content: m.content.substring(0, 100) + '...',
            category: m.category,
            importance: m.importance
          })),
          count: intelligentResults.length,
          time: intelligentTime
        },
        normal: {
          memories: normalResults.map(m => ({
            id: m.id,
            content: m.content.substring(0, 100) + '...',
            category: m.category,
            importance: m.importance
          })),
          count: normalResults.length,
          time: normalTime
        },
        comparison: {
          improvedResults: intelligentResults.length - normalResults.length,
          speedRatio: normalTime > 0 ? (intelligentTime / normalTime).toFixed(2) : 'N/A',
          uniqueIntelligent: intelligentResults.filter(ir => 
            !normalResults.some(nr => nr.id === ir.id)
          ).length,
          uniqueNormal: normalResults.filter(nr => 
            !intelligentResults.some(ir => ir.id === nr.id)
          ).length
        }
      }
    });

  } catch (error) {
    console.error('[API] 智能搜索测试失败:', error);
    res.status(500).json({
      success: false,
      error: '智能搜索测试失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
}

async function compareSearchMethods(req: NextApiRequest, res: NextApiResponse) {
  const { queries, userId = 'default_user' } = req.body;
  
  if (!queries || !Array.isArray(queries)) {
    return res.status(400).json({
      success: false,
      error: '缺少queries参数（应为数组）'
    });
  }

  console.log(`[API] 对比搜索方法，测试 ${queries.length} 个查询`);

  const results = [];
  let totalIntelligentTime = 0;
  let totalNormalTime = 0;
  let totalIntelligentResults = 0;
  let totalNormalResults = 0;

  try {
    const db = getMemoryDB();

    for (const query of queries) {
      // 智能搜索
      const intelligentStart = Date.now();
      const intelligentResults = await db.searchMemoriesAsync(userId, query, 20);
      const intelligentTime = Date.now() - intelligentStart;
      
      // 普通搜索
      const normalStart = Date.now();
      const normalResults = db.searchMemories(userId, query, 20);
      const normalTime = Date.now() - normalStart;

      totalIntelligentTime += intelligentTime;
      totalNormalTime += normalTime;
      totalIntelligentResults += intelligentResults.length;
      totalNormalResults += normalResults.length;

      results.push({
        query,
        intelligent: {
          count: intelligentResults.length,
          time: intelligentTime,
          topResult: intelligentResults[0] ? {
            content: intelligentResults[0].content.substring(0, 50) + '...',
            category: intelligentResults[0].category
          } : null
        },
        normal: {
          count: normalResults.length,
          time: normalTime,
          topResult: normalResults[0] ? {
            content: normalResults[0].content.substring(0, 50) + '...',
            category: normalResults[0].category
          } : null
        }
      });
    }

    res.status(200).json({
      success: true,
      totalQueries: queries.length,
      results,
      summary: {
        averageIntelligentTime: totalIntelligentTime / queries.length,
        averageNormalTime: totalNormalTime / queries.length,
        averageIntelligentResults: totalIntelligentResults / queries.length,
        averageNormalResults: totalNormalResults / queries.length,
        overallSpeedRatio: totalNormalTime > 0 ? (totalIntelligentTime / totalNormalTime).toFixed(2) : 'N/A',
        recommendation: getRecommendation(totalIntelligentTime, totalNormalTime, totalIntelligentResults, totalNormalResults)
      }
    });

  } catch (error) {
    console.error('[API] 搜索方法对比失败:', error);
    res.status(500).json({
      success: false,
      error: '搜索方法对比失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
}

async function updateSearchConfiguration(req: NextApiRequest, res: NextApiResponse) {
  const { config } = req.body;
  
  if (!config) {
    return res.status(400).json({
      success: false,
      error: '缺少config参数'
    });
  }

  try {
    updateSearchConfig(config);
    
    res.status(200).json({
      success: true,
      message: '配置更新成功',
      newConfig: getSearchConfig()
    });

  } catch (error) {
    console.error('[API] 配置更新失败:', error);
    res.status(500).json({
      success: false,
      error: '配置更新失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
}

function calculateKeywordQuality(intelligent: string[], local: string[]): string {
  // 简单的质量评分：智能提取的关键词是否更有意义
  const meaningfulWords = ['我', '自己', '介绍', '履历', '工作', '项目', '技能', '电脑', '配置', '宠物'];
  
  const intelligentScore = intelligent.filter(kw => meaningfulWords.includes(kw)).length;
  const localScore = local.filter(kw => meaningfulWords.includes(kw)).length;
  
  if (intelligentScore > localScore) return '智能提取更优';
  if (intelligentScore < localScore) return '本地提取更优';
  return '质量相当';
}

function getRecommendation(intelligentTime: number, normalTime: number, intelligentResults: number, normalResults: number): string {
  const timeRatio = normalTime > 0 ? intelligentTime / normalTime : 1;
  const resultRatio = normalResults > 0 ? intelligentResults / normalResults : 1;
  
  if (timeRatio < 2 && resultRatio > 1.2) {
    return '推荐启用智能搜索：结果更丰富，性能可接受';
  } else if (timeRatio > 5) {
    return '建议谨慎使用智能搜索：性能开销较大';
  } else if (resultRatio > 1.5) {
    return '推荐在重要查询中使用智能搜索：结果显著更好';
  } else {
    return '可根据具体场景选择：两种方法各有优势';
  }
} 