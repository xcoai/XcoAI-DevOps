# XcoAI-DevOps

XcoAI 运行环境的部署配置仓库：包含数据中间件、Termix Web 终端、new-api 和 Nginx 网关的 Docker Compose 配置；其他应用服务不在本仓库内。

## 目录结构

```text
docker/
├── docker-compose-data.yml     MySQL、Redis、Elasticsearch
├── docker-compose-termix.yml   Termix 与 guacd
├── docker-compose-ai.yml       new-api
├── docker-compose-web.yml      Nginx
├── nginx/                      Nginx 入口配置、片段与站点模板
├── mysql/                      MySQL 配置与数据
├── redis/                      Redis 配置与数据
├── es/                         Elasticsearch 数据
├── termix/                     Termix 数据与说明
└── new-api/                    new-api 数据与日志
```

上述组件目录下的 README 记录对应的配置细节。

## 前置条件

- Docker Engine 20.10+，Docker Compose v2（`docker compose`）
- Linux 宿主机；Nginx stack 需要占用 80/443 端口
- 为 `docker/nginx/conf.d/*.conf` 中的站点准备域名和 TLS 证书
- 使用 MySQL / Redis / Elasticsearch 时需要启动 data stack；Termix 默认使用 SQLite，可独立启动；new-api 通过 `NEWAPI_SQL_DSN` 使用 MySQL，并通过 `NEWAPI_REDIS_CONN_STRING` 使用 Redis

## 快速开始

```bash
cd docker

# 首次启动：复制站点模板，并按实际域名、上游和证书路径修改
cp nginx/conf.d/default.conf.sample nginx/conf.d/default.conf
cp nginx/conf.d/termix.conf.sample  nginx/conf.d/termix.conf
cp nginx/conf.d/router.conf.sample  nginx/conf.d/router.conf

# 创建 Nginx 容器挂载的宿主机目录
mkdir -p nginx/site/xcloud nginx/upload nginx/ssl

# 按顺序启动四套 stack
docker compose -f docker-compose-data.yml up -d
docker compose -f docker-compose-termix.yml up -d
docker compose -f docker-compose-ai.yml up -d
docker compose -f docker-compose-web.yml up -d
```

旧版 Compose 将 `docker compose` 替换为 `docker-compose`。

证书按 `nginx/ssl/<domain>/` 放置，文件名为 `fullchain.pem`、`privkey.pem`、`chain.pem`，与站点配置中的路径一致。

## 四套 Stack

| Compose 文件 | 服务 | 宿主机端口 | 说明 |
|---|---|---|---|
| `docker-compose-data.yml` | `x-mysql`、`x-redis`、`x-es` | 6306、6379、6200/6201 | MySQL、Redis、Elasticsearch |
| `docker-compose-termix.yml` | `x-termix`、`x-guacd` | 9980、9922 | 默认 SQLite，MySQL 可选 |
| `docker-compose-ai.yml` | `x-new-api` | 9960 | new-api，通过 data stack 使用 MySQL 和 Redis |
| `docker-compose-web.yml` | `x-nginx` | 80、443 | 反向代理、WAF、限流 |

四套 stack 不共享 Docker 网络。Nginx stack 通过 `host.docker.internal` 访问宿主机上的服务：应用后端 `:8080`，Termix `:9980`，new-api `:9960`；Termix 启用 MySQL 时和 new-api 都访问 `host.docker.internal:6306`，new-api 还访问 Redis `host.docker.internal:6379`。

## 配置

运行参数统一放在 `docker/.env`（已 gitignore），不要提交。主要变量：

| 变量 | 用途 |
|---|---|
| `MYSQL_ROOT_PASSWORD` | MySQL root 密码 |
| `REDIS_PASSWORD` | Redis 密码 |
| `ELASTIC_PASSWORD` | Elasticsearch `elastic` 用户密码 |
| `MYSQL_MEM_LIMIT`、`REDIS_MEM_LIMIT`、`ELASTIC_MEM_LIMIT` | 容器内存上限 |
| `REDIS_MAXMEMORY` | Redis `maxmemory`，应低于 `REDIS_MEM_LIMIT` |
| `JAVA_XMS`、`JAVA_XMX` | Elasticsearch JVM 堆，应低于 `ELASTIC_MEM_LIMIT` |
| `LOG_MAX_SIZE`、`LOG_MAX_FILE` | 容器日志轮转 |
| `DOCKER_VOLUME_DIRECTORY` | 绑定挂载的基础路径，默认为当前目录 |
| `TERMIX_DB_DIALECT`、`TERMIX_DB_URL`、`TERMIX_DB_POOL_MAX` | 可选的 Termix MySQL 连接 |
| `NEWAPI_SQL_DSN` | new-api 的 MySQL 连接（必填，Go DSN，凭据不要 URL 编码） |
| `NEWAPI_SESSION_SECRET` | new-api 的持久化会话密钥（必填） |
| `NEWAPI_REDIS_CONN_STRING` | new-api 的 Redis 连接（必填，密码需 URL 编码） |
| `NEWAPI_SESSION_COOKIE_SECURE` | 可选，new-api 的 Secure refresh cookie 开关（默认 `false`） |
| `NEWAPI_SESSION_COOKIE_TRUSTED_URL` | new-api 站点的精确 HTTPS Origin，`SESSION_COOKIE_SECURE=true` 时必填 |

compose 文件中的密码默认值仅用于本地启动，生产必须在 `docker/.env` 或外部 secret 中覆盖。

## 文档

- `docker/Readme.md` — 启动、停止与验证命令
- `docker/nginx/Readme.md` — Nginx 配置分层、站点模板、WAF 与限流
- `docker/mysql/Readme.md`、`docker/redis/Readme.md`、`docker/es/Readme.md` — 数据服务配置
- `docker/termix/Readme.md` — SQLite 默认模式与可选 MySQL 配置
- `docker/new-api/Readme.md` — new-api 的 MySQL / Redis 配置与数据目录
- `CLAUDE.md` — 架构与维护说明

## 许可证

Apache License 2.0，见 [LICENSE](LICENSE)。