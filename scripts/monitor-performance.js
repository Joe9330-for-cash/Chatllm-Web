#!/usr/bin/env node

// ChatLLM-Web 性能监控脚本
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class PerformanceMonitor {
  constructor() {
    this.isMonitoring = false;
    this.alertThresholds = {
      cpu: 80,           // CPU使用率阈值 (%)
      memory: 1024,      // 内存使用阈值 (MB)
      processes: 5,      // Node.js进程数量阈值
      workers: 3,        // Jest Worker进程数量阈值
    };
    this.alertCooldown = 30000; // 30秒警告冷却时间
    this.lastAlert = 0;
  }

  // 获取Node.js相关进程信息
  async getNodeProcesses() {
    return new Promise((resolve, reject) => {
      exec('ps aux | grep -E "(node|next)" | grep -v grep', (error, stdout, stderr) => {
        if (error && error.code !== 1) {
          reject(error);
          return;
        }
        
        const processes = stdout.split('\n')
          .filter(line => line.trim())
          .map(line => {
            const parts = line.trim().split(/\s+/);
            return {
              pid: parts[1],
              cpu: parseFloat(parts[2]),
              memory: parseFloat(parts[3]),
              command: parts.slice(10).join(' ')
            };
          });

        resolve(processes);
      });
    });
  }

  // 检查Jest Worker进程
  async checkJestWorkers() {
    return new Promise((resolve) => {
      exec('ps aux | grep "jest-worker" | grep -v grep', (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve([]);
          return;
        }
        
        const workers = stdout.split('\n')
          .filter(line => line.trim())
          .map(line => {
            const parts = line.trim().split(/\s+/);
            return {
              pid: parts[1],
              cpu: parseFloat(parts[2]),
              memory: parseFloat(parts[3])
            };
          });

        resolve(workers);
      });
    });
  }

  // 获取系统资源使用情况
  async getSystemStats() {
    const processes = await this.getNodeProcesses();
    const workers = await this.checkJestWorkers();
    
    const totalCpu = processes.reduce((sum, p) => sum + p.cpu, 0);
    const totalMemory = processes.reduce((sum, p) => sum + (p.memory * 16), 0); // 估算内存MB
    
    return {
      nodeProcesses: processes.length,
      jestWorkers: workers.length,
      totalCpuUsage: totalCpu,
      totalMemoryMB: Math.round(totalMemory),
      processes,
      workers
    };
  }

  // 发出警告
  async sendAlert(type, message, stats) {
    const now = Date.now();
    if (now - this.lastAlert < this.alertCooldown) {
      return; // 在冷却时间内，跳过警告
    }

    console.log('🚨 [性能警告] ' + type);
    console.log('📊 ' + message);
    console.log('📈 当前状态:');
    console.log(`   - Node.js进程: ${stats.nodeProcesses}`);
    console.log(`   - Jest Workers: ${stats.jestWorkers}`);
    console.log(`   - 总CPU使用率: ${stats.totalCpuUsage.toFixed(1)}%`);
    console.log(`   - 总内存使用: ${stats.totalMemoryMB}MB`);
    
    if (stats.jestWorkers > 0) {
      console.log('🔥 检测到Jest Worker进程，可能导致CPU过载！');
      console.log('💡 建议执行: pkill -f "jest-worker"');
    }
    
    console.log('-'.repeat(50));
    
    this.lastAlert = now;
  }

  // 自动清理异常进程
  async autoCleanup(stats) {
    if (stats.jestWorkers > this.alertThresholds.workers) {
      console.log('🔧 [自动清理] 检测到过多Jest Worker进程，正在清理...');
      
      return new Promise((resolve) => {
        exec('pkill -f "jest-worker"', (error) => {
          if (error) {
            console.log('⚠️  清理失败:', error.message);
          } else {
            console.log('✅ Jest Worker进程已清理');
          }
          resolve();
        });
      });
    }
  }

  // 检查性能并发出警告
  async checkPerformance() {
    try {
      const stats = await this.getSystemStats();
      
      // 检查各种阈值
      if (stats.totalCpuUsage > this.alertThresholds.cpu) {
        await this.sendAlert(
          'CPU使用率过高',
          `CPU使用率达到 ${stats.totalCpuUsage.toFixed(1)}%，超过阈值 ${this.alertThresholds.cpu}%`,
          stats
        );
      }
      
      if (stats.totalMemoryMB > this.alertThresholds.memory) {
        await this.sendAlert(
          '内存使用过高',
          `内存使用达到 ${stats.totalMemoryMB}MB，超过阈值 ${this.alertThresholds.memory}MB`,
          stats
        );
      }
      
      if (stats.nodeProcesses > this.alertThresholds.processes) {
        await this.sendAlert(
          'Node.js进程过多',
          `检测到 ${stats.nodeProcesses} 个Node.js进程，可能存在内存泄漏`,
          stats
        );
      }

      if (stats.jestWorkers > this.alertThresholds.workers) {
        await this.sendAlert(
          'Jest Worker进程异常',
          `检测到 ${stats.jestWorkers} 个Jest Worker进程，可能导致CPU过载`,
          stats
        );
        
        // 自动清理
        await this.autoCleanup(stats);
      }

      // 正常状态的简要报告
      if (stats.totalCpuUsage <= this.alertThresholds.cpu && 
          stats.jestWorkers === 0 && 
          stats.nodeProcesses <= this.alertThresholds.processes) {
        console.log(`✅ [${new Date().toLocaleTimeString()}] 系统状态正常 - CPU: ${stats.totalCpuUsage.toFixed(1)}%, 内存: ${stats.totalMemoryMB}MB, 进程: ${stats.nodeProcesses}`);
      }

    } catch (error) {
      console.error('❌ 性能检查失败:', error.message);
    }
  }

  // 开始监控
  start(interval = 10000) {
    if (this.isMonitoring) {
      console.log('⚠️  监控已在运行中');
      return;
    }

    console.log('🚀 启动ChatLLM-Web性能监控');
    console.log(`📊 监控间隔: ${interval/1000}秒`);
    console.log(`🎯 警告阈值: CPU ${this.alertThresholds.cpu}%, 内存 ${this.alertThresholds.memory}MB`);
    console.log('-'.repeat(50));

    this.isMonitoring = true;
    this.monitorInterval = setInterval(async () => {
      await this.checkPerformance();
    }, interval);

    // 立即执行一次检查
    this.checkPerformance();
  }

  // 停止监控
  stop() {
    if (!this.isMonitoring) {
      console.log('⚠️  监控未在运行');
      return;
    }

    clearInterval(this.monitorInterval);
    this.isMonitoring = false;
    console.log('🛑 性能监控已停止');
  }
}

// 命令行使用
if (require.main === module) {
  const monitor = new PerformanceMonitor();
  
  const args = process.argv.slice(2);
  const interval = args[0] ? parseInt(args[0]) * 1000 : 10000;
  
  // 启动监控
  monitor.start(interval);
  
  // 优雅退出
  process.on('SIGINT', () => {
    console.log('\n🔄 收到退出信号，正在停止监控...');
    monitor.stop();
    process.exit(0);
  });
}

module.exports = PerformanceMonitor; 