# 部署操作

以下命令均在仓库的 `docker/` 目录执行（示例路径 `/opt/ai/XcoAI-DevOps/docker`，以实际部署路径为准）。三套 stack 相互独立，可单独启停。

## 首次准备

1. 创建 `docker/.env`（已 gitignore），覆盖密码等运行参数；变量说明见仓库根目录 README。
2. 复制 nginx 站点模板，并按实际域名、证书路径和上游修改：

   ```bash
   cp nginx/conf.d/default.conf.sample nginx/conf.d/default.conf
   cp nginx/conf.d/termix.conf.sample  nginx/conf.d/termix.conf
   ```

3. 准备 nginx 挂载目录（均不入库）：

   ```bash
   mkdir -p nginx/site/xcloud nginx/upload nginx/ssl
   # 证书放在 nginx/ssl/<domain>/{fullchain.pem,privkey.pem,chain.pem}
   ```

## 启动与停止

```bash
# data stack：MySQL / Redis / Elasticsearch
docker compose -f docker-compose-data.yml up -d
docker compose -f docker-compose-data.yml down

# Termix：默认 SQLite；启用 MySQL 时先启动 data stack，并按 termix/Readme.md 建库
docker compose -f docker-compose-termix.yml up -d
docker compose -f docker-compose-termix.yml down

# Web：Nginx
docker compose -f docker-compose-web.yml up -d
docker compose -f docker-compose-web.yml down
```

旧版 Compose 将 `docker compose` 替换为 `docker-compose`。

## 验证

```bash
docker compose -f docker-compose-data.yml config
docker compose -f docker-compose-termix.yml config
docker compose -f docker-compose-web.yml config

docker exec x-nginx nginx -t
docker exec x-nginx nginx -s reload
docker ps
docker logs --tail=100 x-nginx
```

- Nginx 配置为只读挂载，修改后先执行 `nginx -t`，再执行 `nginx -s reload`，无需重启容器。
- Nginx 通过 `host.docker.internal` 访问宿主机后端 `:8080` 和 Termix `:9980`；该地址由 compose 的 `extra_hosts` 注入。