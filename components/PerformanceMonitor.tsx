import React, { useState, useEffect, useRef, useCallback } from 'react';
import DOMOptimizer from '../lib/dom-optimizer';
import ModelRouter from '../lib/model-router';

interface PerformanceData {
  fps: number;
  memoryUsage: number;
  domNodes: number;
  renderTime: number;
  scrollPerformance: number;
  devicePerformance: 'high' | 'medium' | 'low';
  modelRouterStats?: any;
}

interface PerformanceMonitorProps {
  isVisible: boolean;
  onToggle: () => void;
  enableAlerts?: boolean;
  updateInterval?: number;
}

const PERFORMANCE_THRESHOLDS = {
  fps: { warning: 30, critical: 15 },
  memory: { warning: 100, critical: 200 }, // MB
  domNodes: { warning: 1000, critical: 2000 },
};

export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  isVisible,
  onToggle,
  enableAlerts = true,
  updateInterval = 1000
}) => {
  const [performanceData, setPerformanceData] = useState<PerformanceData>({
    fps: 0,
    memoryUsage: 0,
    domNodes: 0,
    renderTime: 0,
    scrollPerformance: 0,
    devicePerformance: 'medium'
  });
  
  const [alerts, setAlerts] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const domOptimizer = useRef<DOMOptimizer | null>(null);
  const modelRouter = useRef<ModelRouter | null>(null);

  // 初始化优化器
  useEffect(() => {
    domOptimizer.current = DOMOptimizer.getInstance();
    modelRouter.current = ModelRouter.getInstance();
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // 更新性能数据
  const updatePerformanceData = useCallback(() => {
    if (!domOptimizer.current || !modelRouter.current) return;

    const metrics = domOptimizer.current.getPerformanceMetrics();
    const devicePerf = domOptimizer.current.detectDevicePerformance();
    const routerStats = modelRouter.current.getStats();

    const newData: PerformanceData = {
      ...metrics,
      devicePerformance: devicePerf,
      modelRouterStats: routerStats
    };

    setPerformanceData(newData);

    // 检查性能警告
    if (enableAlerts) {
      checkPerformanceAlerts(newData);
    }
  }, [enableAlerts]);

  // 检查性能警告
  const checkPerformanceAlerts = useCallback((data: PerformanceData) => {
    const newAlerts: string[] = [];

    if (data.fps < PERFORMANCE_THRESHOLDS.fps.critical) {
      newAlerts.push(`🚨 严重：FPS过低 (${data.fps})`);
    } else if (data.fps < PERFORMANCE_THRESHOLDS.fps.warning) {
      newAlerts.push(`⚠️ 警告：FPS偏低 (${data.fps})`);
    }

    if (data.memoryUsage > PERFORMANCE_THRESHOLDS.memory.critical) {
      newAlerts.push(`🚨 严重：内存使用过高 (${data.memoryUsage}MB)`);
    } else if (data.memoryUsage > PERFORMANCE_THRESHOLDS.memory.warning) {
      newAlerts.push(`⚠️ 警告：内存使用偏高 (${data.memoryUsage}MB)`);
    }

    if (data.domNodes > PERFORMANCE_THRESHOLDS.domNodes.critical) {
      newAlerts.push(`🚨 严重：DOM节点过多 (${data.domNodes})`);
    } else if (data.domNodes > PERFORMANCE_THRESHOLDS.domNodes.warning) {
      newAlerts.push(`⚠️ 警告：DOM节点较多 (${data.domNodes})`);
    }

    setAlerts(newAlerts);
  }, []);

  // 启动性能监控
  useEffect(() => {
    if (isVisible) {
      updatePerformanceData(); // 立即更新一次
      
      intervalRef.current = setInterval(updatePerformanceData, updateInterval);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isVisible, updateInterval, updatePerformanceData]);

  // 获取性能等级颜色
  const getPerformanceColor = (value: number, thresholds: { warning: number; critical: number }, isHigherBetter: boolean = true) => {
    if (isHigherBetter) {
      if (value < thresholds.critical) return 'text-error';
      if (value < thresholds.warning) return 'text-warning';
      return 'text-success';
    } else {
      if (value > thresholds.critical) return 'text-error';
      if (value > thresholds.warning) return 'text-warning';
      return 'text-success';
    }
  };

  // 获取优化建议
  const getOptimizationSuggestions = () => {
    const suggestions: string[] = [];

    if (performanceData.fps < 30) {
      suggestions.push('启用虚拟滚动减少DOM操作');
      suggestions.push('减少动画和过渡效果');
    }

    if (performanceData.memoryUsage > 100) {
      suggestions.push('清理未使用的组件和事件监听器');
      suggestions.push('使用React.memo优化组件重渲染');
    }

    if (performanceData.domNodes > 1000) {
      suggestions.push('使用懒加载减少DOM节点数量');
      suggestions.push('合并相似的DOM元素');
    }

    if (performanceData.devicePerformance === 'low') {
      suggestions.push('降低渲染质量适应低性能设备');
      suggestions.push('增加防抖和节流延迟');
    }

    return suggestions;
  };

  // 应用优化建议
  const applyOptimization = (type: 'memory' | 'dom' | 'performance') => {
    if (!domOptimizer.current) return;

    const config = domOptimizer.current.getOptimalConfig();
    
    switch (type) {
      case 'memory':
        // 触发垃圾回收（如果可用）
        if ('gc' in window && typeof (window as any).gc === 'function') {
          (window as any).gc();
        }
        break;
      
      case 'dom':
        // 启用图片懒加载
        domOptimizer.current.lazyLoadImages();
        break;
      
      case 'performance':
        // 根据设备性能调整配置
        console.log('[Performance Monitor] 应用性能优化配置:', config);
        break;
    }
  };

  if (!isVisible) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-4 right-4 btn btn-primary btn-sm z-50"
        title="显示性能监控"
      >
        📊
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* 警告弹窗 */}
      {alerts.length > 0 && (
        <div className="alert alert-warning shadow-lg mb-2 min-w-max">
          <div>
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <h3 className="font-bold">性能警告</h3>
              <div className="text-xs">
                {alerts.map((alert, i) => (
                  <div key={i}>{alert}</div>
                ))}
              </div>
            </div>
          </div>
          <button 
            className="btn btn-ghost btn-xs"
            onClick={() => setAlerts([])}
          >
            ✕
          </button>
        </div>
      )}

      {/* 主监控面板 */}
      <div className="card bg-base-100 shadow-xl max-w-sm">
        <div className="card-body p-4">
          <div className="flex justify-between items-center">
            <h2 className="card-title text-sm">性能监控</h2>
            <div className="flex gap-1">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="btn btn-ghost btn-xs"
                title={isExpanded ? "收起" : "展开"}
              >
                {isExpanded ? '⬆️' : '⬇️'}
              </button>
              <button
                onClick={onToggle}
                className="btn btn-ghost btn-xs"
                title="隐藏监控"
              >
                ✕
              </button>
            </div>
          </div>

          {/* 基础性能指标 */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="stat p-2">
              <div className="stat-title text-xs">FPS</div>
              <div className={`stat-value text-sm ${getPerformanceColor(performanceData.fps, PERFORMANCE_THRESHOLDS.fps)}`}>
                {performanceData.fps}
              </div>
            </div>
            <div className="stat p-2">
              <div className="stat-title text-xs">内存</div>
              <div className={`stat-value text-sm ${getPerformanceColor(performanceData.memoryUsage, PERFORMANCE_THRESHOLDS.memory, false)}`}>
                {performanceData.memoryUsage}MB
              </div>
            </div>
            <div className="stat p-2">
              <div className="stat-title text-xs">DOM节点</div>
              <div className={`stat-value text-sm ${getPerformanceColor(performanceData.domNodes, PERFORMANCE_THRESHOLDS.domNodes, false)}`}>
                {performanceData.domNodes}
              </div>
            </div>
            <div className="stat p-2">
              <div className="stat-title text-xs">设备性能</div>
              <div className={`stat-value text-sm ${
                performanceData.devicePerformance === 'high' ? 'text-success' :
                performanceData.devicePerformance === 'medium' ? 'text-warning' : 'text-error'
              }`}>
                {performanceData.devicePerformance === 'high' ? '高' :
                 performanceData.devicePerformance === 'medium' ? '中' : '低'}
              </div>
            </div>
          </div>

          {/* 扩展信息 */}
          {isExpanded && (
            <div className="mt-4 space-y-3">
              {/* 模型路由统计 */}
              {performanceData.modelRouterStats && (
                <div className="border rounded p-2">
                  <h3 className="text-xs font-bold mb-1">智能路由统计</h3>
                  <div className="text-xs space-y-1">
                    <div>缓存大小: {performanceData.modelRouterStats.cacheSize}</div>
                                         <div className="text-xs opacity-70">
                       模型分布: {Object.entries(Object.fromEntries(performanceData.modelRouterStats.modelDistribution)).map(([model, count]) => 
                         `${model}(${count})`
                       ).join(', ')}
                     </div>
                  </div>
                </div>
              )}

              {/* 优化建议 */}
              <div className="border rounded p-2">
                <h3 className="text-xs font-bold mb-1">优化建议</h3>
                <div className="space-y-1">
                  {getOptimizationSuggestions().slice(0, 3).map((suggestion, i) => (
                    <div key={i} className="text-xs opacity-70">• {suggestion}</div>
                  ))}
                </div>
              </div>

              {/* 快速优化按钮 */}
              <div className="flex gap-1">
                <button
                  onClick={() => applyOptimization('memory')}
                  className="btn btn-xs btn-outline"
                  title="清理内存"
                >
                  🧹 内存
                </button>
                <button
                  onClick={() => applyOptimization('dom')}
                  className="btn btn-xs btn-outline"
                  title="DOM优化"
                >
                  🔧 DOM
                </button>
                <button
                  onClick={() => applyOptimization('performance')}
                  className="btn btn-xs btn-outline"
                  title="性能调优"
                >
                  ⚡ 性能
                </button>
              </div>

              {/* 详细信息切换 */}
              <div className="collapse collapse-arrow border rounded">
                <input type="checkbox" />
                <div className="collapse-title text-xs font-medium p-2">
                  详细性能数据
                </div>
                <div className="collapse-content text-xs p-2">
                  <div className="space-y-1 opacity-70">
                    <div>渲染时间: {performanceData.renderTime}ms</div>
                    <div>滚动性能: {performanceData.scrollPerformance}</div>
                    <div>更新频率: {updateInterval}ms</div>
                    <div>警告阈值: FPS&lt;{PERFORMANCE_THRESHOLDS.fps.warning}, 内存&gt;{PERFORMANCE_THRESHOLDS.memory.warning}MB</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 