export interface PerformanceMetric {
  timestamp: number;
  operation: string;
  duration: number;
  memoryCount: number;
  success: boolean;
  details?: any;
}

export interface PerformanceReport {
  averageSearchTime: number;
  averageExtractionTime: number;
  averageIndexTime: number;
  totalOperations: number;
  successRate: number;
  bottlenecks: string[];
  recommendations: string[];
}

export class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private readonly maxMetricsPerOperation = 100;
  private readonly alertThresholds = {
    searchTime: 1000,      // 搜索超过1秒报警
    extractionTime: 10000, // 提取超过10秒报警
    indexTime: 5000,       // 索引超过5秒报警
    successRate: 0.8       // 成功率低于80%报警
  };

  constructor() {
    console.log('[Performance Monitor] 🚀 性能监控系统已启动');
  }

  /**
   * 记录性能指标
   */
  recordMetric(
    operation: string, 
    duration: number, 
    memoryCount: number, 
    success: boolean = true, 
    details?: any
  ): void {
    const metric: PerformanceMetric = {
      timestamp: Date.now(),
      operation,
      duration,
      memoryCount,
      success,
      details
    };

    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }

    const operationMetrics = this.metrics.get(operation)!;
    operationMetrics.push(metric);

    // 保持最近的N条记录
    if (operationMetrics.length > this.maxMetricsPerOperation) {
      operationMetrics.shift();
    }

    // 检查是否触发报警
    this.checkAlerts(operation, metric);

    console.log(`[Performance Monitor] 📊 ${operation}: ${duration}ms, 记忆数: ${memoryCount}, 成功: ${success}`);
  }

  /**
   * 创建性能上下文（用于自动记录）
   */
  createContext(operation: string, memoryCount: number = 0): PerformanceContext {
    return new PerformanceContext(this, operation, memoryCount);
  }

  /**
   * 获取性能报告
   */
  getPerformanceReport(): PerformanceReport {
    const report: PerformanceReport = {
      averageSearchTime: this.getAverageTime('search'),
      averageExtractionTime: this.getAverageTime('extraction'),
      averageIndexTime: this.getAverageTime('index'),
      totalOperations: this.getTotalOperations(),
      successRate: this.getSuccessRate(),
      bottlenecks: this.identifyBottlenecks(),
      recommendations: this.generateRecommendations()
    };

    console.log('[Performance Monitor] 📈 性能报告生成:', report);
    return report;
  }

  /**
   * 获取详细的性能统计
   */
  getDetailedStats(): any {
    const stats: any = {};
    
    this.metrics.forEach((metrics, operation) => {
      const successfulMetrics = metrics.filter(m => m.success);
      const failedMetrics = metrics.filter(m => !m.success);
      
      if (metrics.length > 0) {
        stats[operation] = {
          totalCount: metrics.length,
          successCount: successfulMetrics.length,
          failureCount: failedMetrics.length,
          successRate: successfulMetrics.length / metrics.length,
          averageDuration: successfulMetrics.reduce((sum, m) => sum + m.duration, 0) / successfulMetrics.length,
          minDuration: Math.min(...successfulMetrics.map(m => m.duration)),
          maxDuration: Math.max(...successfulMetrics.map(m => m.duration)),
          averageMemoryCount: successfulMetrics.reduce((sum, m) => sum + m.memoryCount, 0) / successfulMetrics.length,
          recentMetrics: metrics.slice(-10), // 最近10次操作
          trending: this.calculateTrend(successfulMetrics)
        };
      }
    });

    return stats;
  }

  /**
   * 获取操作的平均时间
   */
  private getAverageTime(operation: string): number {
    const metrics = this.metrics.get(operation);
    if (!metrics || metrics.length === 0) return 0;
    
    const successfulMetrics = metrics.filter(m => m.success);
    if (successfulMetrics.length === 0) return 0;
    
    return successfulMetrics.reduce((sum, m) => sum + m.duration, 0) / successfulMetrics.length;
  }

  /**
   * 获取总操作数
   */
  private getTotalOperations(): number {
    let total = 0;
    this.metrics.forEach(metrics => {
      total += metrics.length;
    });
    return total;
  }

  /**
   * 获取成功率
   */
  private getSuccessRate(): number {
    let totalOperations = 0;
    let successfulOperations = 0;
    
    this.metrics.forEach(metrics => {
      totalOperations += metrics.length;
      successfulOperations += metrics.filter(m => m.success).length;
    });
    
    return totalOperations > 0 ? successfulOperations / totalOperations : 1;
  }

  /**
   * 获取平均响应时间
   */
  private getAverageResponseTime(): number {
    let totalDuration = 0;
    let totalOps = 0;

    this.metrics.forEach(operations => {
      operations.forEach(op => {
        totalDuration += op.duration;
        totalOps++;
      });
    });

    return totalOps > 0 ? Math.round(totalDuration / totalOps) : 0;
  }

  /**
   * 识别性能瓶颈
   */
  private identifyBottlenecks(): string[] {
    const bottlenecks: string[] = [];
    
    this.metrics.forEach((metrics, operation) => {
      const successfulMetrics = metrics.filter(m => m.success);
      if (successfulMetrics.length === 0) return;
      
      const avgDuration = successfulMetrics.reduce((sum, m) => sum + m.duration, 0) / successfulMetrics.length;
      const maxDuration = Math.max(...successfulMetrics.map(m => m.duration));
      
      // 检查平均时间是否过长
      if (operation.includes('search') && avgDuration > this.alertThresholds.searchTime) {
        bottlenecks.push(`搜索操作平均耗时过长: ${avgDuration.toFixed(0)}ms`);
      }
      
      if (operation.includes('extraction') && avgDuration > this.alertThresholds.extractionTime) {
        bottlenecks.push(`记忆提取操作平均耗时过长: ${avgDuration.toFixed(0)}ms`);
      }
      
      if (operation.includes('index') && avgDuration > this.alertThresholds.indexTime) {
        bottlenecks.push(`索引操作平均耗时过长: ${avgDuration.toFixed(0)}ms`);
      }
      
      // 检查峰值时间
      if (maxDuration > avgDuration * 3) {
        bottlenecks.push(`${operation} 操作存在异常峰值: ${maxDuration.toFixed(0)}ms`);
      }
    });
    
    // 检查成功率
    if (this.getSuccessRate() < this.alertThresholds.successRate) {
      bottlenecks.push(`整体成功率过低: ${(this.getSuccessRate() * 100).toFixed(1)}%`);
    }
    
    return bottlenecks;
  }

  /**
   * 生成优化建议
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    const bottlenecks = this.identifyBottlenecks();
    
    if (bottlenecks.some(b => b.includes('搜索操作'))) {
      recommendations.push('建议优化搜索算法，考虑使用更高效的索引策略');
      recommendations.push('考虑增加搜索缓存，减少重复查询');
    }
    
    if (bottlenecks.some(b => b.includes('记忆提取'))) {
      recommendations.push('建议减少LLM调用频率，使用更智能的提取策略');
      recommendations.push('考虑实现提取结果缓存，避免重复提取');
    }
    
    if (bottlenecks.some(b => b.includes('索引操作'))) {
      recommendations.push('建议优化索引算法，考虑异步索引更新');
      recommendations.push('考虑分批处理索引更新，减少单次处理量');
    }
    
    if (bottlenecks.some(b => b.includes('成功率'))) {
      recommendations.push('建议增加错误处理机制，提高系统稳定性');
      recommendations.push('考虑实现操作重试机制，处理临时性错误');
    }
    
    if (bottlenecks.some(b => b.includes('峰值'))) {
      recommendations.push('建议实现请求队列，平滑处理高峰期请求');
      recommendations.push('考虑增加系统资源监控，及时发现资源瓶颈');
    }
    
    // 默认建议
    if (recommendations.length === 0) {
      recommendations.push('系统性能良好，建议继续监控关键指标');
      recommendations.push('考虑定期优化数据库查询和索引');
    }
    
    return recommendations;
  }

  /**
   * 计算性能趋势
   */
  private calculateTrend(metrics: PerformanceMetric[]): 'improving' | 'degrading' | 'stable' {
    if (metrics.length < 10) return 'stable';
    
    const recentMetrics = metrics.slice(-10);
    const olderMetrics = metrics.slice(-20, -10);
    
    if (olderMetrics.length === 0) return 'stable';
    
    const recentAvg = recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length;
    const olderAvg = olderMetrics.reduce((sum, m) => sum + m.duration, 0) / olderMetrics.length;
    
    const changePercent = (recentAvg - olderAvg) / olderAvg;
    
    if (changePercent > 0.1) return 'degrading';
    if (changePercent < -0.1) return 'improving';
    return 'stable';
  }

  /**
   * 检查报警条件
   */
  private checkAlerts(operation: string, metric: PerformanceMetric): void {
    let alertMessage: string | null = null;
    
    if (operation.includes('search') && metric.duration > this.alertThresholds.searchTime) {
      alertMessage = `搜索操作耗时过长: ${metric.duration}ms`;
    } else if (operation.includes('extraction') && metric.duration > this.alertThresholds.extractionTime) {
      alertMessage = `记忆提取操作耗时过长: ${metric.duration}ms`;
    } else if (operation.includes('index') && metric.duration > this.alertThresholds.indexTime) {
      alertMessage = `索引操作耗时过长: ${metric.duration}ms`;
    } else if (!metric.success) {
      alertMessage = `操作失败: ${operation}`;
    }
    
    if (alertMessage) {
      console.warn(`[Performance Monitor] 🚨 性能报警: ${alertMessage}`);
    }
  }

  /**
   * 重置监控数据
   */
  resetMetrics(): void {
    this.metrics.clear();
    console.log('[Performance Monitor] 🔄 监控数据已重置');
  }

  /**
   * 导出性能数据
   */
  exportMetrics(): any {
    const exportData: any = {};
    
    this.metrics.forEach((metrics, operation) => {
      exportData[operation] = metrics;
    });
    
    return {
      timestamp: Date.now(),
      data: exportData,
      summary: this.getPerformanceReport()
    };
  }

  /**
   * 生成阈值优化报告
   */
  generateThresholdOptimizationReport(): {
    summary: any;
    searchPerformance: any;
    recommendations: string[];
  } {
    const summary = {
      totalOperations: this.getTotalOperations(),
      successRate: this.getSuccessRate(),
      avgResponseTime: this.getAverageResponseTime(),
      optimizationImpact: this.calculateOptimizationImpact()
    };

    const searchPerformance = this.analyzeSearchPerformance();
    const recommendations = this.generateThresholdRecommendations();

    return {
      summary,
      searchPerformance,
      recommendations
    };
  }

  /**
   * 计算优化影响
   */
  private calculateOptimizationImpact(): any {
    const searchMetrics = this.metrics.get('vector-search') || [];
    const recentMetrics = searchMetrics.filter(m => 
      Date.now() - m.timestamp < 24 * 60 * 60 * 1000 // 最近24小时
    );

    if (recentMetrics.length === 0) {
      return { message: '需要更多数据来分析优化影响' };
    }

    const avgDuration = recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length;
    const successfulSearches = recentMetrics.filter(m => m.success).length;
    const successRate = successfulSearches / recentMetrics.length;

    return {
      avgSearchTime: Math.round(avgDuration),
      searchSuccessRate: Math.round(successRate * 100),
      totalSearches: recentMetrics.length,
      impact: avgDuration < 1000 && successRate > 0.8 ? 'positive' : 'needs_improvement'
    };
  }

  /**
   * 分析搜索性能
   */
  private analyzeSearchPerformance(): any {
    const searchOperations = ['vector-search', 'keyword-search', 'smart-search', 'enhanced-search'];
    const performance: any = {};

    searchOperations.forEach(operation => {
      const metrics = this.metrics.get(operation) || [];
      const recentMetrics = metrics.filter(m => 
        Date.now() - m.timestamp < 60 * 60 * 1000 // 最近1小时
      );

      if (recentMetrics.length > 0) {
        const avgDuration = recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length;
        const successRate = recentMetrics.filter(m => m.success).length / recentMetrics.length;
        const maxDuration = Math.max(...recentMetrics.map(m => m.duration));

        performance[operation] = {
          count: recentMetrics.length,
          avgDuration: Math.round(avgDuration),
          maxDuration: Math.round(maxDuration),
          successRate: Math.round(successRate * 100),
          status: avgDuration < 1000 && successRate > 0.9 ? 'excellent' :
                  avgDuration < 2000 && successRate > 0.8 ? 'good' :
                  avgDuration < 5000 && successRate > 0.7 ? 'acceptable' : 'needs_improvement'
        };
      }
    });

    return performance;
  }

  /**
   * 生成阈值优化建议
   */
  private generateThresholdRecommendations(): string[] {
    const recommendations: string[] = [];
    const searchPerformance = this.analyzeSearchPerformance();

    // 基于向量搜索性能的建议
    const vectorSearch = searchPerformance['vector-search'];
    if (vectorSearch) {
      if (vectorSearch.successRate < 70) {
        recommendations.push('向量搜索成功率偏低，建议进一步降低阈值至0.25');
      } else if (vectorSearch.successRate > 95 && vectorSearch.avgDuration > 2000) {
        recommendations.push('向量搜索准确性良好但速度较慢，可考虑适当提高阈值至0.35');
      }

      if (vectorSearch.avgDuration > 3000) {
        recommendations.push('向量搜索耗时过长，建议优化embedding生成或数据库查询');
      }
    }

    // 基于智能搜索性能的建议
    const smartSearch = searchPerformance['smart-search'];
    if (smartSearch) {
      if (smartSearch.successRate > 90 && smartSearch.avgDuration < 1000) {
        recommendations.push('智能搜索性能优秀，阈值优化效果显著');
      } else if (smartSearch.avgDuration > 5000) {
        recommendations.push('智能搜索耗时过长，建议启用更多缓存策略');
      }
    }

    // 通用建议
    const optimizationImpact = this.calculateOptimizationImpact();
    if (optimizationImpact.impact === 'positive') {
      recommendations.push('阈值优化效果良好，系统性能有明显提升');
    } else {
      recommendations.push('建议继续监控和调整阈值设置');
    }

    // 默认建议
    if (recommendations.length === 0) {
      recommendations.push('需要更多性能数据来生成具体建议');
      recommendations.push('建议继续使用当前阈值设置并监控效果');
    }

    return recommendations;
  }
}

/**
 * 性能上下文 - 用于自动记录操作性能
 */
export class PerformanceContext {
  private startTime: number;
  private monitor: PerformanceMonitor;
  private operation: string;
  private memoryCount: number;

  constructor(monitor: PerformanceMonitor, operation: string, memoryCount: number = 0) {
    this.monitor = monitor;
    this.operation = operation;
    this.memoryCount = memoryCount;
    this.startTime = Date.now();
  }

  /**
   * 更新记忆数量
   */
  updateMemoryCount(count: number): void {
    this.memoryCount = count;
  }

  /**
   * 结束并记录性能
   */
  end(success: boolean = true, details?: any): void {
    const duration = Date.now() - this.startTime;
    this.monitor.recordMetric(this.operation, duration, this.memoryCount, success, details);
  }
}

// 单例实例
let performanceMonitor: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!performanceMonitor) {
    performanceMonitor = new PerformanceMonitor();
  }
  return performanceMonitor;
}

/**
 * 性能监控装饰器
 */
export function monitor(operation: string) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function(...args: any[]) {
      const perfMonitor = getPerformanceMonitor();
      const context = perfMonitor.createContext(`${target.constructor.name}.${propertyKey}`, 0);
      
      try {
        const result = await originalMethod.apply(this, args);
        
        // 尝试从结果中获取记忆数量
        let memoryCount = 0;
        if (result && typeof result === 'object') {
          if (Array.isArray(result)) {
            memoryCount = result.length;
          } else if (result.results && Array.isArray(result.results)) {
            memoryCount = result.results.length;
          } else if (typeof result.length === 'number') {
            memoryCount = result.length;
          }
        }
        
        context.updateMemoryCount(memoryCount);
        context.end(true);
        return result;
      } catch (error) {
        context.end(false, { error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    };
    
    return descriptor;
  };
} 