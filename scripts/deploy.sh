#!/bin/bash

# ChatLLM-Web 一键部署脚本
# 适用于腾讯云 CVM 服务器部署

set -e

echo "🚀 开始部署 ChatLLM-Web..."
echo "=================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否为root用户
if [[ $EUID -eq 0 ]]; then
   echo -e "${RED}⚠️  请不要使用root用户运行此脚本！${NC}"
   echo "请创建普通用户后再运行此脚本"
   exit 1
fi

# 检查系统
if ! command -v apt-get &> /dev/null; then
    echo -e "${RED}❌ 此脚本仅支持Ubuntu/Debian系统${NC}"
    exit 1
fi

# 检查必要的环境变量
if [ ! -f ".env.local" ]; then
    echo -e "${YELLOW}⚠️  未找到.env.local文件${NC}"
    echo "请先配置环境变量："
    echo "1. cp deployment.env.template .env.local"
    echo "2. 编辑.env.local文件，填写你的API密钥"
    exit 1
fi

# 更新系统
echo -e "${GREEN}📦 更新系统软件包...${NC}"
sudo apt update && sudo apt upgrade -y

# 安装Node.js
if ! command -v node &> /dev/null; then
    echo -e "${GREEN}📦 安装Node.js 18...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# 安装其他必要软件
echo -e "${GREEN}📦 安装必要软件...${NC}"
sudo apt install -y git nginx certbot python3-certbot-nginx sqlite3

# 安装PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${GREEN}📦 安装PM2进程管理器...${NC}"
    sudo npm install -g pm2
fi

# 创建项目目录
PROJECT_DIR="/var/www/chatllm-web"
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${GREEN}📁 创建项目目录...${NC}"
    sudo mkdir -p $PROJECT_DIR
    sudo chown $USER:$USER $PROJECT_DIR
fi

# 复制项目文件
echo -e "${GREEN}📋 复制项目文件...${NC}"
rsync -av --exclude=node_modules --exclude=.git --exclude=.next ./ $PROJECT_DIR/

# 进入项目目录
cd $PROJECT_DIR

# 安装依赖
echo -e "${GREEN}📦 安装项目依赖...${NC}"
npm install

# 构建项目
echo -e "${GREEN}🔨 构建项目...${NC}"
npm run build

# 创建数据目录
echo -e "${GREEN}📁 创建数据目录...${NC}"
mkdir -p data
chmod 755 data

# 配置PM2
echo -e "${GREEN}⚙️  配置PM2...${NC}"
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'chatllm-web',
    script: 'npm',
    args: 'start',
    cwd: '/var/www/chatllm-web',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    log_file: '/var/log/pm2/chatllm-web.log',
    error_file: '/var/log/pm2/chatllm-web-error.log',
    out_file: '/var/log/pm2/chatllm-web-out.log',
    max_memory_restart: '1G',
    restart_delay: 4000,
    watch: false
  }]
}
EOF

# 启动PM2
echo -e "${GREEN}🚀 启动应用...${NC}"
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# 配置Nginx
echo -e "${GREEN}⚙️  配置Nginx...${NC}"
SERVER_IP=$(curl -s https://api.ipify.org)
sudo tee /etc/nginx/sites-available/chatllm-web << EOF
server {
    listen 80;
    server_name $SERVER_IP;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 静态文件优化
    location /_next/static/ {
        alias /var/www/chatllm-web/.next/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 处理大文件上传
    client_max_body_size 50M;
}
EOF

# 启用Nginx配置
sudo ln -sf /etc/nginx/sites-available/chatllm-web /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx

# 配置防火墙
echo -e "${GREEN}🔒 配置防火墙...${NC}"
sudo ufw --force enable
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443

# 创建健康检查脚本
echo -e "${GREEN}🏥 创建健康检查脚本...${NC}"
cat > health-check.sh << 'EOF'
#!/bin/bash
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/test-models)
if [ $response -ne 200 ]; then
    echo "$(date): Service down, restarting..."
    pm2 restart chatllm-web
fi
EOF

chmod +x health-check.sh

# 添加定时任务
echo -e "${GREEN}⏰ 配置定时任务...${NC}"
(crontab -l 2>/dev/null; echo "*/5 * * * * /var/www/chatllm-web/health-check.sh >> /var/log/health-check.log") | crontab -

echo ""
echo "=================================="
echo -e "${GREEN}🎉 部署完成！${NC}"
echo ""
echo "服务器访问地址: http://$SERVER_IP"
echo ""
echo "常用命令："
echo "  查看应用状态: pm2 status"
echo "  查看日志: pm2 logs chatllm-web"
echo "  重启应用: pm2 restart chatllm-web"
echo "  停止应用: pm2 stop chatllm-web"
echo ""
echo "注意事项："
echo "1. 请确保已正确配置.env.local文件中的API密钥"
echo "2. 如需要域名访问，请修改Nginx配置"
echo "3. 建议定期备份data目录"
echo ""
echo -e "${GREEN}✅ 部署完成，请访问上述地址测试应用！${NC}" 