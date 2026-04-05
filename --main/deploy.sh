#!/bin/bash

# ============================================
# 量化投研平台 - 阿里云 ECS 部署脚本
# ============================================
# 使用方法：
#   1. 购买阿里云 ECS 学生机（Ubuntu 22.04）
#   2. ssh root@你的服务器IP
#   3. 粘贴以下命令运行：
#      curl -fsSL https://raw.githubusercontent.com/wwishcan/-26.4.4-/quant-platform/deploy.sh | bash
#   或者上传此脚本后运行：bash deploy.sh
# ============================================

set -e

echo "=========================================="
echo "  量化投研平台 - 自动部署脚本"
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 打印函数
print_step() {
    echo -e "${GREEN}[√] $1${NC}"
}

print_warn() {
    echo -e "${YELLOW}[!] $1${NC}"
}

print_error() {
    echo -e "${RED}[×] $1${NC}"
}

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then
    print_error "请使用 root 用户运行此脚本"
    exit 1
fi

# ============================================
# 步骤 1：更新系统
# ============================================
echo ""
echo ">>> 步骤 1/7：更新系统..."
apt update && apt upgrade -y
print_step "系统更新完成"

# ============================================
# 步骤 2：安装 Node.js 20
# ============================================
echo ""
echo ">>> 步骤 2/7：安装 Node.js 20..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
NODE_VERSION=$(node -v)
NPM_VERSION=$(npm -v)
print_step "Node.js 安装完成: $NODE_VERSION"
print_step "npm 版本: $NPM_VERSION"

# ============================================
# 步骤 3：安装 PM2（进程管理）
# ============================================
echo ""
echo ">>> 步骤 3/7：安装 PM2..."
npm install -g pm2
print_step "PM2 安装完成"

# ============================================
# 步骤 4：克隆代码
# ============================================
echo ""
echo ">>> 步骤 4/7：克隆项目代码..."
PROJECT_DIR="/home/quant-platform"

if [ -d "$PROJECT_DIR" ]; then
    print_warn "目录已存在，更新代码..."
    cd "$PROJECT_DIR/--main"
    git pull origin quant-platform
else
    git clone -b quant-platform https://github.com/wwishcan/-26.4.4-.git "$PROJECT_DIR"
    cd "$PROJECT_DIR/--main"
fi
print_step "代码克隆完成"

# ============================================
# 步骤 5：配置环境变量
# ============================================
echo ""
echo ">>> 步骤 5/7：配置环境变量..."

if [ ! -f ".env" ]; then
    cat > .env << 'ENVEOF'
# 数据库配置
DATABASE_URL=mysql://3f3NU75UwxqjW6S.root:GLK1Vr3CiY6UcUTN@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/test
USE_CLOUD_DB=true

# JWT 密钥
JWT_SECRET=quant-platform-secret-2024

# 生产环境
NODE_ENV=production
ENVEOF
    print_step ".env 文件创建成功"
else
    print_warn ".env 文件已存在，跳过创建"
fi

# ============================================
# 步骤 6：安装依赖并构建
# ============================================
echo ""
echo ">>> 步骤 6/7：安装依赖并构建项目..."
echo "这可能需要几分钟，请耐心等待..."

npm install
print_step "依赖安装完成"

npm run build
print_step "项目构建完成"

# ============================================
# 步骤 7：启动服务
# ============================================
echo ""
echo ">>> 步骤 7/7：启动服务..."

# 停止旧进程（如果存在）
pm2 delete quant-platform 2>/dev/null || true

# 启动新进程
pm2 start npm --name "quant-platform" -- run start
pm2 save
pm2 startup | tail -1 | bash 2>/dev/null || true

print_step "服务启动成功"

# ============================================
# 部署完成
# ============================================
echo ""
echo "=========================================="
echo -e "${GREEN}  部署成功！${NC}"
echo "=========================================="
echo ""
echo "访问地址: http://$(curl -s ifconfig.me):3000"
echo ""
echo "常用命令："
echo "  查看日志: pm2 logs quant-platform"
echo "  重启服务: pm2 restart quant-platform"
echo "  停止服务: pm2 stop quant-platform"
echo ""
echo "注意：请在阿里云安全组中开放 3000 端口"
echo "=========================================="
