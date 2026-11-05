# New API

## 服务与端口

- 镜像：`calciumion/new-api:v1.0.0-rc.48`
- 容器：`x-new-api`
- 端口：宿主机 `9960` → 容器 `3000`
- 数据目录：`new-api/data` → `/data`
- 日志目录：`new-api/logs` → `/app/logs`
- 网络：`net-ai`
- 依赖：data stack 的 `x-mysql`（主数据）和 `x-redis`（缓存）

## 环境变量

在 `docker/.env` 配置以下变量：

```dotenv
# 必填：Go MySQL DSN，不是 mysql:// URL，凭据不要 URL 编码
NEWAPI_SQL_DSN=user:password@tcp(host.docker.internal:6306)/database?charset=utf8mb4&parseTime=True&loc=Local

# 必填：持久化会话密钥，使用 openssl rand -hex 32 生成
NEWAPI_SESSION_SECRET=<generated-secret>

# 必填：复用 data stack 的 x-redis；密码需 URL 编码
NEWAPI_REDIS_CONN_STRING=redis://:<url-encoded-password>@host.docker.internal:6379/0

# 可选（生产经 Nginx HTTPS 部署时建议启用）：两者需同时设置
NEWAPI_SESSION_COOKIE_SECURE=true
NEWAPI_SESSION_COOKIE_TRUSTED_URL=https://api.example.com
```

- `NEWAPI_SQL_DSN`：指向 `x-mysql` 的宿主机端口 `6306`；Go DSN 凭据部分不要做 URL 编码，`#` 等特殊字符按原样填写，必要时给 `.env` 中的值加单引号。
- `NEWAPI_SESSION_SECRET`：固定随机值，未设置时 compose 会拒绝启动；用于保持重启后的登录态。
- `NEWAPI_REDIS_CONN_STRING`：指向 `x-redis` 的宿主机端口 `6379`；URL 中的密码必须 URL 编码（如 `#` → `%23`、`@` → `%40`、`:` → `%3A`、`/` → `%2F`），未设置时 compose 会拒绝启动。
- `NEWAPI_SESSION_COOKIE_SECURE`：映射为 `SESSION_COOKIE_SECURE`，默认 `false`；经 Nginx HTTPS 部署时设为 `true`，refresh cookie 仅通过 HTTPS 发送。
- `NEWAPI_SESSION_COOKIE_TRUSTED_URL`：映射为 `SESSION_COOKIE_TRUSTED_URL`，默认空；`SESSION_COOKIE_SECURE=true` 时必填，否则 new-api 启动即退出。值为浏览器实际访问的精确 HTTPS Origin（只写 `scheme://host[:port]`，不支持路径和通配符，多个域名用逗号分隔），必须与 Nginx 站点域名一致。
- 两个变量必须同时启用：只设 `NEWAPI_SESSION_COOKIE_TRUSTED_URL` 而 `SESSION_COOKIE_SECURE=false` 时，new-api 同样会启动失败（`SESSION_COOKIE_TRUSTED_URL requires SESSION_COOKIE_SECURE=true`）。

## MySQL 初始化

在 `x-mysql` 中创建库和用户（库名、用户名和密码替换为实际值）：

```sql
CREATE DATABASE IF NOT EXISTS `<database>` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS '<user>'@'%' IDENTIFIED BY '<password>';
GRANT ALL PRIVILEGES ON `<database>`.* TO '<user>'@'%';
FLUSH PRIVILEGES;
```

数据库名、用户名和密码需与 `NEWAPI_SQL_DSN` 中的一致。

## Redis

- 使用 data stack 的 `x-redis`，不额外启动 Redis 容器。
- Redis 仅用于缓存与共享限流，不承载主数据；主数据备份以 MySQL 为准。
- 修改 `REDIS_PASSWORD` 后，需要同步更新 `NEWAPI_REDIS_CONN_STRING` 中 URL 编码后的密码。

## 启动

先启动 data stack，再启动 AI stack：

```bash
docker compose -f docker-compose-data.yml up -d
docker compose -f docker-compose-ai.yml up -d
```

## 数据与备份

- 主数据在 MySQL；`new-api/data` 仍用于应用文件，备份时与数据库一并覆盖。
- `new-api/logs` 为容器内 `/app/logs` 的持久化日志目录，可按需清理。