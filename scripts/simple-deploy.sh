#!/bin/bash

# ChatLLM-Web 简化部署脚本 - 新手友好版本
# 专注于功能实现，忽略复杂的安全配置

set -e

echo "🚀 开始简化部署 ChatLLM-Web..."
echo "=================================="

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查系统类型
if command -v yum &> /dev/null; then
    PKG_MANAGER="yum"
    INSTALL_CMD="yum install -y"
elif command -v dnf &> /dev/null; then
    PKG_MANAGER="dnf"
    INSTALL_CMD="dnf install -y"
elif command -v apt-get &> /dev/null; then
    PKG_MANAGER="apt"
    INSTALL_CMD="apt-get install -y"
else
    echo "❌ 不支持的系统类型"
    exit 1
fi

echo -e "${GREEN}📦 检测到包管理器: $PKG_MANAGER${NC}"

# 更新系统
echo -e "${GREEN}📦 更新系统软件包...${NC}"
if [ "$PKG_MANAGER" = "yum" ] || [ "$PKG_MANAGER" = "dnf" ]; then
    sudo $PKG_MANAGER update -y
    # 安装 EPEL 仓库（用于安装更多软件包）
    sudo $PKG_MANAGER install -y epel-release
else
    sudo apt-get update && sudo apt-get upgrade -y
fi

# 安装Node.js
if ! command -v node &> /dev/null; then
    echo -e "${GREEN}📦 安装Node.js 18...${NC}"
    if [ "$PKG_MANAGER" = "yum" ] || [ "$PKG_MANAGER" = "dnf" ]; then
        # CentOS/RHEL/TencentOS
        curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
        sudo $INSTALL_CMD nodejs
    else
        # Ubuntu/Debian
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo $INSTALL_CMD nodejs
    fi
fi

# 安装其他必要软件
echo -e "${GREEN}📦 安装必要软件...${NC}"
if [ "$PKG_MANAGER" = "yum" ] || [ "$PKG_MANAGER" = "dnf" ]; then
    sudo $INSTALL_CMD git nginx sqlite curl wget rsync
else
    sudo $INSTALL_CMD git nginx sqlite3 curl wget rsync
fi

# 安装PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${GREEN}📦 安装PM2进程管理器...${NC}"
    sudo npm install -g pm2
fi

# 创建项目目录
PROJECT_DIR="/var/www/chatllm-web"
echo -e "${GREEN}📁 创建项目目录: $PROJECT_DIR${NC}"
sudo mkdir -p $PROJECT_DIR
sudo chown $USER:$USER $PROJECT_DIR

# 复制项目文件到服务器
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

# 配置PM2（简化版本）
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

# 配置Nginx（简化版本）
echo -e "${GREEN}⚙️  配置Nginx...${NC}"
SERVER_IP=$(curl -s https://api.ipify.org || echo "your-server-ip")

# 创建Nginx配置
sudo tee /etc/nginx/conf.d/chatllm-web.conf << EOF
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

    location /_next/static/ {
        alias /var/www/chatllm-web/.next/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    client_max_body_size 50M;
}
EOF

# 启动并启用Nginx
echo -e "${GREEN}🌐 启动Nginx...${NC}"
sudo systemctl enable nginx
sudo systemctl start nginx
sudo systemctl reload nginx

# 配置防火墙（如果存在）
if command -v firewall-cmd &> /dev/null; then
    echo -e "${GREEN}🔒 配置防火墙（firewalld）...${NC}"
    sudo systemctl enable firewalld
    sudo systemctl start firewalld
    sudo firewall-cmd --permanent --add-service=ssh
    sudo firewall-cmd --permanent --add-service=http
    sudo firewall-cmd --permanent --add-service=https
    sudo firewall-cmd --reload
elif command -v ufw &> /dev/null; then
    echo -e "${GREEN}🔒 配置防火墙（ufw）...${NC}"
    sudo ufw --force enable
    sudo ufw allow ssh
    sudo ufw allow 80
    sudo ufw allow 443
fi

# 创建简单的健康检查脚本
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

echo ""
echo "=================================="
echo -e "${GREEN}🎉 简化部署完成！${NC}"
echo ""
echo "服务器访问地址: http://$SERVER_IP"
echo ""
echo "快速测试命令："
echo "  测试API: curl http://localhost:3000/api/test-models"
echo "  查看状态: pm2 status"
echo "  查看日志: pm2 logs chatllm-web"
echo ""
echo "注意："
echo "1. 此版本为快速部署版本，API密钥已内置在代码中"
echo "2. 功能测试无误后，建议后续优化安全配置"
echo "3. 可通过浏览器访问上述地址进行测试"
echo ""
echo -e "${GREEN}✅ 部署完成，开始测试你的应用吧！${NC}" 