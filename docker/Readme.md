# 运行目录
cd /opt/ai/XcoAI-DevOps/docker

# 启动数据服务（data stack）
docker-compose -f docker-compose-data.yml up -d
# 关停数据服务
docker-compose -f docker-compose-data.yml down

# 启动Termix服务
# Termix 默认使用 SQLite，直接启动即可；启用 MySQL 时先在 docker/.env 配置 TERMIX_DB_* 并启动 data stack
docker-compose -f docker-compose-termix.yml up -d
# 关停Termix服务
docker-compose -f docker-compose-termix.yml down

# 启动Web服务
docker-compose -f docker-compose-web.yml up -d
# 关停Web服务
docker-compose -f docker-compose-web.yml down