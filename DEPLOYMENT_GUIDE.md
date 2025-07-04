# 🚀 ChatLLM-Web 腾讯云部署指南

## 📋 部署前准备

### 1. 腾讯云服务器要求
- **CPU**: 2核心以上
- **内存**: 4GB以上
- **存储**: 40GB以上 SSD
- **网络**: 5Mbps以上带宽
- **操作系统**: Ubuntu 20.04+ / CentOS 8+

### 2. 预计用户规模配置建议
- **前期(<10人)**: 2核4GB，40GB存储
- **中期(<100人)**: 4核8GB，80GB存储
- **后期(>100人)**: 8核16GB，160GB存储

### 3. 安全配置
- **API密钥**: 准备你的LLM API密钥
- **服务器密码**: 设置强密码
- **SSH密钥**: 建议使用SSH密钥登录

## 🔧 部署步骤

### 步骤1：连接到服务器
```bash
# 使用SSH连接到你的腾讯云服务器
ssh root@你的服务器IP

# 创建非root用户（推荐）
adduser chatllm
usermod -aG sudo chatllm
su - chatllm
```

### 步骤2：上传项目代码
```bash
# 方法1：使用Git克隆（推荐）
git clone [你的项目仓库地址]
cd ChatLLM-Web

# 方法2：使用SCP上传
# 在本地执行：
scp -r ./ChatLLM-Web chatllm@服务器IP:~/
```

### 步骤3：配置环境变量
```bash
# 复制环境变量模板
cp deployment.env.template .env.local

# 编辑环境变量文件
nano .env.local
```

**重要：在.env.local中填写以下信息：**
```env
# 将 your-api-key-here 替换为你的实际API密钥
OPENAI_API_KEY=sk-your-actual-api-key-here

# 将 your-server-ip 替换为你的服务器IP
NEXTAUTH_URL=http://your-server-ip:3000
NEXT_PUBLIC_APP_URL=http://your-server-ip:3000

# 生成一个随机密钥替换 your-random-secret-key-here
NEXTAUTH_SECRET=your-random-secret-key-here
```

### 步骤4：执行一键部署
```bash
# 赋予执行权限
chmod +x scripts/deploy.sh

# 执行部署脚本
./scripts/deploy.sh
```

### 步骤5：验证部署
```bash
# 检查应用状态
pm2 status

# 检查日志
pm2 logs chatllm-web

# 测试API
curl http://localhost:3000/api/test-models
```

## 🎯 功能测试

### 1. 基础功能测试
- 访问 `http://你的服务器IP`
- 测试聊天功能
- 测试模型切换
- 测试记忆功能

### 2. 用户系统测试
- 测试用户注册
- 测试用户登录
- 测试记忆隔离

### 3. 性能测试
- 多用户并发测试
- 长时间运行稳定性测试
- 内存使用监控

## 📊 监控和维护

### 1. 服务状态监控
```bash
# 查看应用状态
pm2 status

# 查看系统资源使用
htop

# 查看磁盘使用
df -h
```

### 2. 日志管理
```bash
# 查看应用日志
pm2 logs chatllm-web

# 查看Nginx日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 3. 数据库备份
```bash
# 备份数据库
cp -r /var/www/chatllm-web/data /backup/chatllm-$(date +%Y%m%d)

# 设置自动备份
echo "0 2 * * * cp -r /var/www/chatllm-web/data /backup/chatllm-$(date +\\%Y\\%m\\%d)" | crontab -
```

## ⚙️ 常见问题解决

### Q1: 部署失败，Node.js安装出错
```bash
# 清理npm缓存
npm cache clean --force

# 重新安装Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Q2: API调用失败
```bash
# 检查环境变量
cat .env.local | grep API_KEY

# 测试API连接
curl -X POST "https://api.laozhang.ai/v1/chat/completions" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"test"}]}'
```

### Q3: 内存不足
```bash
# 检查内存使用
free -h

# 增加swap空间
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### Q4: 端口冲突
```bash
# 检查端口使用
sudo netstat -tlnp | grep :3000

# 杀死占用端口的进程
sudo kill -9 $(sudo lsof -t -i:3000)
```

## 🔒 安全建议

### 1. 防火墙配置
```bash
# 只开放必要端口
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
```

### 2. 定期更新
```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 更新应用依赖
cd /var/www/chatllm-web
npm update
```

### 3. 密钥管理
- 定期轮换API密钥
- 使用强密码
- 启用SSH密钥认证
- 禁用root用户SSH登录

## 📈 扩展配置

### 1. 域名配置
```bash
# 修改Nginx配置
sudo nano /etc/nginx/sites-available/chatllm-web

# 替换server_name为你的域名
server_name your-domain.com;

# 重启Nginx
sudo systemctl restart nginx
```

### 2. SSL证书配置
```bash
# 使用Let's Encrypt免费SSL证书
sudo certbot --nginx -d your-domain.com
```

### 3. 负载均衡（高级）
```bash
# 启动多个实例
pm2 scale chatllm-web 4

# 配置Nginx负载均衡
sudo nano /etc/nginx/sites-available/chatllm-web
```

## 🎯 部署完成检查清单

- [ ] 服务器环境配置完成
- [ ] 项目代码上传完成
- [ ] 环境变量配置正确
- [ ] 应用成功启动
- [ ] Nginx配置正确
- [ ] 防火墙配置完成
- [ ] 基础功能测试通过
- [ ] 用户系统测试通过
- [ ] 监控和日志正常
- [ ] 数据库备份配置
- [ ] 健康检查脚本运行

## 🆘 技术支持

如果在部署过程中遇到问题，请提供：
1. 错误日志信息
2. 服务器配置信息
3. 部署步骤执行情况
4. 具体错误截图

---

**恭喜！🎉 你的ChatLLM-Web应用已成功部署！**

访问地址：`http://你的服务器IP` 