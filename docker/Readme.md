# 部署操作

以下命令均在仓库的 `docker/` 目录执行（示例路径 `/opt/ai/XcoAI-DevOps/docker`，以实际部署路径为准）。四套 stack 相互独立，可单独启停。

## 首次准备

1. 复制 `docker/.env.example` 为 `docker/.env`，按实际环境修改密码、连接串等；变量说明见仓库根目录 README。`.env` 已 gitignore，禁止提交。
2. 复制 nginx 站点模板，并按实际域名、证书路径和上游修改：

   ```bash
   cp nginx/conf.d/default.conf.sample nginx/conf.d/default.conf
   cp nginx/conf.d/termix.conf.sample  nginx/conf.d/termix.conf
   cp nginx/conf.d/router.conf.sample  nginx/conf.d/router.conf
   ```

3. 准备 nginx 挂载目录（均不入库）：

   ```bash
   mkdir -p nginx/site/xcloud nginx/upload nginx/ssl
   # 证书放在 nginx/ssl/<domain>/{fullchain.pem,privkey.pem,chain.pem}
   ```

4. 配置 Nginx 文件日志轮转（`access.log`、`error.log`、`waf.log` 不受 Docker 日志驱动管理）：

   ```bash
   sudo cp nginx/logrotate.sample /etc/logrotate.d/x-nginx
   # 将 <LOG_DIR> 换成实际日志目录；默认是 <仓库>/docker/nginx/logs，
   # 设置 DOCKER_VOLUME_DIRECTORY 时为 <该目录>/nginx/logs
   sudo sed -i 's#<LOG_DIR>#/opt/ai/XcoAI-DevOps/docker/nginx/logs#' /etc/logrotate.d/x-nginx
   sudo logrotate -d /etc/logrotate.d/x-nginx
   ```

   策略为每天或超过 100M 轮转，保留 14 份并压缩；轮转后通过 `docker exec x-nginx nginx -s reopen` 重新打开日志文件。

## 启动与停止

```bash
# data stack：MySQL / Redis / Elasticsearch
docker compose -f docker-compose-data.yml up -d
docker compose -f docker-compose-data.yml down

# Termix：默认 SQLite；启用 MySQL 时先启动 data stack，并按 termix/Readme.md 建库
docker compose -f docker-compose-termix.yml up -d
docker compose -f docker-compose-termix.yml down

# AI：new-api（MySQL 存储 + Redis 缓存）；先启动 data stack，并按 new-api/Readme.md 建库
docker compose -f docker-compose-ai.yml up -d
docker compose -f docker-compose-ai.yml down

# Web：Nginx
docker compose -f docker-compose-web.yml up -d
docker compose -f docker-compose-web.yml down
```

旧版 Compose 将 `docker compose` 替换为 `docker-compose`。

## 验证

```bash
docker compose -f docker-compose-data.yml config
docker compose -f docker-compose-termix.yml config
docker compose -f docker-compose-ai.yml config
docker compose -f docker-compose-web.yml config

docker exec x-nginx nginx -t
docker exec x-nginx nginx -s reload
docker ps
docker logs --tail=100 x-nginx
docker logs --tail=100 x-new-api                         # new-api 启动 / SQL_DSN、Redis 连接错误
```

- Nginx 配置为只读挂载，修改后先执行 `nginx -t`，再执行 `nginx -s reload`，无需重启容器。
- Nginx 通过 `host.docker.internal` 访问宿主机后端 `:8080`、Termix `:9980` 和 new-api `:9960`；该地址由 compose 的 `extra_hosts` 注入。
