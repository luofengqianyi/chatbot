 #!/bin/bash
# ============================================
# AI Chatbot - 一键部署脚本（在 Linux 服务器上执行）
# ============================================
# 用法：
#   1. 把项目上传到服务器
#   2. 编辑同级目录的 .env.production（填入你的 API Key 和域名）
#   3. 把 .env.production 重命名为 .env
#   4. 运行：bash deploy/setup.sh
# ============================================

set -e

cd "$(dirname "$0")/.."
SCRIPT_DIR="$(pwd)"

echo "=============================="
echo " AI Chatbot 部署脚本"
echo "=============================="

# 1. 检查 .env 文件
if [ ! -f .env ]; then
    echo "[错误] 找不到 .env 文件！"
    echo "请先创建 .env（可参考 .env.production）"
    exit 1
fi

# 2. 加载环境变量
export $(grep -v '^\s*#' .env | xargs)

if [ -z "$DOMAIN" ]; then
    echo "[错误] .env 中未设置 DOMAIN"
    exit 1
fi

if [ -z "$DASHSCOPE_API_KEY" ] || [ "$DASHSCOPE_API_KEY" = "sk-你的key" ]; then
    echo "[错误] 请修改 .env 中的 DASHSCOPE_API_KEY"
    exit 1
fi

echo "域名: $DOMAIN"
echo ""

# 3. 替换 nginx.conf 中的占位域名
sed -i "s/DOMAIN/$DOMAIN/g" deploy/nginx.conf

# 4. 创建 nginx ssl 目录占位（首次 certbot 会填充）
mkdir -p deploy/ssl deploy/certbot-www

# 5. 先启动 nginx（HTTP 模式，让 certbot 验证域名）
echo "[1/3] 启动 HTTP 服务，等待 certbot 验证..."
docker compose up -d nginx
sleep 3

# 6. 申请 SSL 证书
echo "[2/3] 申请 SSL 证书..."
docker compose run --rm certbot

# 7. 重启 nginx（此时 HTTPS 已生效）
echo "[3/3] 重启服务，开启 HTTPS..."
docker compose up -d

echo ""
echo "=============================="
echo " 部署完成！"
echo " 访问: https://$DOMAIN"
echo "=============================="
