interface BatchUpdateOptions {
  delay?: number;
  maxWait?: number;
}

interface LazyLoadOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

interface PerformanceMetrics {
  fps: number;
  memoryUsage: number;
  domNodes: number;
  renderTime: number;
  scrollPerformance: number;
}

class DOMOptimizer {
  private static instance: DOMOptimizer;
  private frameId: number | null = null;
  private batchedUpdates: Map<string, { callback: Function; timestamp: number }> = new Map();
  private observers: Map<string, IntersectionObserver> = new Map();
  private performanceMetrics: PerformanceMetrics = {
    fps: 0,
    memoryUsage: 0,
    domNodes: 0,
    renderTime: 0,
    scrollPerformance: 0
  };

  private constructor() {
    this.initPerformanceMonitoring();
  }

  static getInstance(): DOMOptimizer {
    if (!DOMOptimizer.instance) {
      DOMOptimizer.instance = new DOMOptimizer();
    }
    return DOMOptimizer.instance;
  }

  /**
   * 防抖函数
   */
  debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
    immediate: boolean = false
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;
    
    return (...args: Parameters<T>) => {
      const callNow = immediate && !timeout;
      
      if (timeout) {
        clearTimeout(timeout);
      }
      
      timeout = setTimeout(() => {
        timeout = null;
        if (!immediate) {
          func.apply(this, args);
        }
      }, wait);
      
      if (callNow) {
        func.apply(this, args);
      }
    };
  }

  /**
   * 节流函数
   */
  throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle: boolean = false;
    
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * 批量DOM更新
   */
  batchUpdate(key: string, callback: Function, options: BatchUpdateOptions = {}) {
    const { delay = 16, maxWait = 100 } = options;
    const now = Date.now();
    const existing = this.batchedUpdates.get(key);
    
    // 如果已经等待太久，立即执行
    if (existing && now - existing.timestamp > maxWait) {
      this.flushBatchedUpdate(key);
    }
    
    // 更新或添加批处理
    this.batchedUpdates.set(key, { callback, timestamp: now });
    
    // 延迟执行
    setTimeout(() => {
      this.flushBatchedUpdate(key);
    }, delay);
  }

  /**
   * 立即执行批处理更新
   */
  private flushBatchedUpdate(key: string) {
    const update = this.batchedUpdates.get(key);
    if (update) {
      this.batchedUpdates.delete(key);
      requestAnimationFrame(() => {
        try {
          update.callback();
        } catch (error) {
          console.error(`[DOM Optimizer] 批量更新执行失败:`, error);
        }
      });
    }
  }

  /**
   * 优化的滚动处理
   */
  optimizeScroll(
    element: HTMLElement,
    callback: (event: Event) => void,
    options: { passive?: boolean; throttle?: number } = {}
  ) {
    const { passive = true, throttle = 16 } = options;
    
    const throttledCallback = this.throttle(callback, throttle);
    
    element.addEventListener('scroll', throttledCallback, { passive });
    
    // 返回清理函数
    return () => {
      element.removeEventListener('scroll', throttledCallback);
    };
  }

  /**
   * 懒加载实现
   */
  lazyLoad(
    elements: NodeListOf<Element> | Element[],
    callback: (element: Element) => void,
    options: LazyLoadOptions = {}
  ) {
    const { threshold = 0.1, rootMargin = '50px', triggerOnce = true } = options;
    
    const observerId = `lazy-${Date.now()}`;
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          try {
            callback(entry.target);
            
            if (triggerOnce) {
              observer.unobserve(entry.target);
            }
          } catch (error) {
            console.error(`[DOM Optimizer] 懒加载回调执行失败:`, error);
          }
        }
      });
    }, {
      threshold,
      rootMargin
    });

    // 观察所有元素
    const elementArray = Array.from(elements);
    elementArray.forEach(el => observer.observe(el));
    
    // 保存观察者引用
    this.observers.set(observerId, observer);
    
    // 返回清理函数
    return () => {
      this.observers.delete(observerId);
      observer.disconnect();
    };
  }

  /**
   * 虚拟滚动优化
   */
  createVirtualScroll(
    container: HTMLElement,
    items: any[],
    renderItem: (item: any, index: number) => HTMLElement,
    itemHeight: number,
    bufferSize: number = 3
  ) {
    const containerHeight = container.clientHeight;
    const visibleCount = Math.ceil(containerHeight / itemHeight) + bufferSize * 2;
    
    let scrollTop = 0;
    let startIndex = 0;
    let endIndex = Math.min(visibleCount, items.length);
    
    const updateVisibleItems = this.throttle(() => {
      const newStartIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize);
      const newEndIndex = Math.min(newStartIndex + visibleCount, items.length);
      
      if (newStartIndex !== startIndex || newEndIndex !== endIndex) {
        startIndex = newStartIndex;
        endIndex = newEndIndex;
        render();
      }
    }, 16);
    
    const render = () => {
      this.batchUpdate('virtualScroll', () => {
        // 清空容器
        container.innerHTML = '';
        
        // 创建容器
        const scrollContainer = document.createElement('div');
        scrollContainer.style.height = `${items.length * itemHeight}px`;
        scrollContainer.style.position = 'relative';
        
        // 渲染可见项
        for (let i = startIndex; i < endIndex; i++) {
          const item = items[i];
          const element = renderItem(item, i);
          element.style.position = 'absolute';
          element.style.top = `${i * itemHeight}px`;
          element.style.height = `${itemHeight}px`;
          scrollContainer.appendChild(element);
        }
        
        container.appendChild(scrollContainer);
      });
    };
    
    // 绑定滚动事件
    const cleanupScroll = this.optimizeScroll(container, (event) => {
      scrollTop = (event.target as HTMLElement).scrollTop;
      updateVisibleItems();
    });
    
    // 初始渲染
    render();
    
    return {
      update: (newItems: any[]) => {
        items.splice(0, items.length, ...newItems);
        endIndex = Math.min(visibleCount, items.length);
        render();
      },
      scrollToIndex: (index: number) => {
        container.scrollTop = index * itemHeight;
      },
      destroy: cleanupScroll
    };
  }

  /**
   * 图片懒加载
   */
  lazyLoadImages(selector: string = 'img[data-src]') {
    const images = document.querySelectorAll(selector);
    
    return this.lazyLoad(images, (img) => {
      const imgElement = img as HTMLImageElement;
      const src = imgElement.dataset.src;
      
      if (src) {
        imgElement.src = src;
        imgElement.removeAttribute('data-src');
        imgElement.classList.add('loaded');
      }
    });
  }

  /**
   * 初始化性能监控
   */
  private initPerformanceMonitoring() {
    if (typeof window === 'undefined') return;
    
    let lastFrameTime = performance.now();
    let frames = 0;
    
    const measurePerformance = () => {
      const now = performance.now();
      frames++;
      
      // 每秒更新一次FPS
      if (now - lastFrameTime >= 1000) {
        this.performanceMetrics.fps = Math.round((frames * 1000) / (now - lastFrameTime));
        frames = 0;
        lastFrameTime = now;
        
        // 更新其他指标
        this.updatePerformanceMetrics();
      }
      
      requestAnimationFrame(measurePerformance);
    };
    
    requestAnimationFrame(measurePerformance);
  }

  /**
   * 更新性能指标
   */
  private updatePerformanceMetrics() {
    try {
      // 内存使用
      if ('memory' in performance) {
        this.performanceMetrics.memoryUsage = Math.round(
          (performance as any).memory.usedJSHeapSize / (1024 * 1024)
        );
      }
      
      // DOM节点数量
      this.performanceMetrics.domNodes = document.querySelectorAll('*').length;
      
      // 渲染时间（通过Navigation Timing API）
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigation) {
        this.performanceMetrics.renderTime = Math.round(
          navigation.domContentLoadedEventEnd - navigation.fetchStart
        );
      }
      
    } catch (error) {
      console.error('[DOM Optimizer] 性能指标更新失败:', error);
    }
  }

  /**
   * 获取性能指标
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * 优化事件监听器
   */
  addOptimizedListener(
    element: HTMLElement,
    event: string,
    handler: EventListener,
    options: {
      passive?: boolean;
      throttle?: number;
      debounce?: number;
    } = {}
  ) {
    const { passive = true, throttle, debounce } = options;
    
    let optimizedHandler = handler;
    
    if (throttle) {
      optimizedHandler = this.throttle(handler, throttle);
    } else if (debounce) {
      optimizedHandler = this.debounce(handler, debounce);
    }
    
    element.addEventListener(event, optimizedHandler, { passive });
    
    return () => {
      element.removeEventListener(event, optimizedHandler);
    };
  }

  /**
   * 清理所有资源
   */
  cleanup() {
    // 清理批处理更新
    this.batchedUpdates.clear();
    
    // 清理观察者
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();
    
    // 取消动画帧
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  /**
   * 检测设备性能
   */
  detectDevicePerformance(): 'high' | 'medium' | 'low' {
    const memory = (navigator as any).deviceMemory || 4;
    const cores = navigator.hardwareConcurrency || 4;
    const connection = (navigator as any).connection;
    
    let score = 0;
    
    // 内存评分
    if (memory >= 8) score += 3;
    else if (memory >= 4) score += 2;
    else score += 1;
    
    // CPU评分
    if (cores >= 8) score += 3;
    else if (cores >= 4) score += 2;
    else score += 1;
    
    // 网络评分
    if (connection) {
      if (connection.effectiveType === '4g') score += 2;
      else if (connection.effectiveType === '3g') score += 1;
    } else {
      score += 2; // 默认中等
    }
    
    if (score >= 7) return 'high';
    if (score >= 5) return 'medium';
    return 'low';
  }

  /**
   * 根据设备性能调整配置
   */
  getOptimalConfig() {
    const performance = this.detectDevicePerformance();
    
    const configs = {
      high: {
        batchDelay: 8,
        throttleInterval: 8,
        debounceDelay: 100,
        virtualScrollBuffer: 5,
        enableAnimations: true,
        enableTransitions: true,
      },
      medium: {
        batchDelay: 16,
        throttleInterval: 16,
        debounceDelay: 150,
        virtualScrollBuffer: 3,
        enableAnimations: true,
        enableTransitions: false,
      },
      low: {
        batchDelay: 32,
        throttleInterval: 32,
        debounceDelay: 200,
        virtualScrollBuffer: 2,
        enableAnimations: false,
        enableTransitions: false,
      }
    };
    
    return configs[performance];
  }
}

export default DOMOptimizer; 