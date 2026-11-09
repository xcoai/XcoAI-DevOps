# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 仓库定位

XcoAI-DevOps 是「AI 运行环境」的**部署配置仓库**：Docker Compose + AI 相关开源中间件、数据中间件和配套部署运维工具等配置，不含应用源码、构建脚本、测试或 CI。

## 常用命令

所有 compose 命令必须在 `docker/` 目录下执行——卷路径 `${DOCKER_VOLUME_DIRECTORY:-.}` 默认相对该目录；需要把数据放到别处时通过软链接配置映射到默认目录对应中间件子目录，比如相对目录为${DOCKER_VOLUME_DIRECTORY:-.}/mysql/data，实际目录为/opt/ai/data/mysql。

```bash
cd docker

# 启动 / 停止（四套 stack 互相独立，可单独启停，建议按以下顺序）
docker compose -f docker-compose-data.yml up -d             # x-mysql :6306 + x-redis :6379 + x-es :6200,6201
# docker compose -f docker-compose-data.yml up -d x-mysql     # 只起单个服务
docker compose -f docker-compose-termix.yml up -d           # x-termix :9980 + x-guacd :9922（默认 SQLite；启用 MySQL 时先启动 data stack）
docker compose -f docker-compose-ai.yml up -d               # x-new-api :9960（MySQL 存储 + Redis 缓存；先启动 data stack）
docker compose -f docker-compose-web.yml up -d              # x-nginx, 80/443
docker compose -f <file>.yml down                           # 停止（旧版命令为 docker-compose ...）
```

**首次启动 nginx 前**必须把站点模板复制为 `.conf`，否则 `include conf.d/*.conf` 匹配不到站点：

```bash
cp docker/nginx/conf.d/default.conf.sample docker/nginx/conf.d/default.conf   # 需编辑修改具体访问域名和反向代理路径等
cp docker/nginx/conf.d/termix.conf.sample  docker/nginx/conf.d/termix.conf    # 需编辑修改具体访问域名和反向代理路径等
cp docker/nginx/conf.d/router.conf.sample  docker/nginx/conf.d/router.conf    # 部署 new-api 时使用
# 可选：需要部署级自定义头/代理参数时，再复制并取消站点内的 include 注释
# cp docker/nginx/conf.d/conf_custom_header.sample docker/nginx/conf.d/conf_custom_header
```

验证（本仓库唯一的自验证手段，无 lint/test/build）：

```bash
docker compose -f docker-compose-data.yml config      # compose 语法与变量插值
docker compose -f docker-compose-termix.yml config
docker compose -f docker-compose-ai.yml config
docker compose -f docker-compose-web.yml config
docker exec x-nginx nginx -t                         # 改 nginx 配置后先测语法
docker exec x-nginx nginx -s reload                  # 配置为只读挂载，刷新配置无需重启
docker exec x-redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping'  # PONG
docker ps && docker logs --tail=100 x-nginx          # 健康状态 / 错误日志（另有 waf.log）
```

## 架构

### 四套独立 stack

| Compose | 容器（宿主机端口 → 容器端口） | 网络 |
|---|---|---|
| `docker-compose-data.yml` | `x-mysql`（6306→3306）、`x-redis`（6379）、`x-es`（6200/6201→9200/9300） | `net-data` |
| `docker-compose-termix.yml` | `x-termix`（9980→8080）、`x-guacd`（9922→4822） | `net-termix` |
| `docker-compose-ai.yml` | `x-new-api`（9960→3000） | `net-ai` |
| `docker-compose-web.yml` | `x-nginx`（80/443） | `net-web` |

**stack 之间不共享 Docker 网络**。Nginx 反代走宿主机网关：`docker-compose-web.yml` 用 `extra_hosts: host-gateway` 注入 `host.docker.internal`（需 Docker 20.10+ / Compose v2），站点模板统一写 `http://host.docker.internal:<port>`，不写死 `172.17.0.1`。业务后端约定宿主机 `:8080`，termix 模板代理到 `:9980`，router 模板代理到 new-api `:9960`。因此后端进程跑在宿主机上，而不是容器里，容器间不会用服务名互访。termix 默认使用 SQLite，无需 data stack；启用 MySQL 时通过同一方式访问 `host.docker.internal:6306/termix_data`，需先启动 data stack。new-api 使用 MySQL 和 Redis，分别通过 `host.docker.internal:6306`、`host.docker.internal:6379` 访问，连接串由 `NEWAPI_SQL_DSN` / `NEWAPI_REDIS_CONN_STRING` 注入，同样需先启动 data stack。

### nginx 配置分层（改配置前必读）

`nginx.conf` 在 http 上下文**按固定顺序显式 include 片段**，顺序有依赖；最后由 `include /etc/nginx/conf.d/*.conf` 自动加载站点文件：

1. `conf_map` — `$loggable_status`（访问日志过滤 websocket 与 2xx/3xx）、`$proxy_hdr_connection`、`$cors_origin`（CORS 默认空值，站点 server 用 `if + set` 覆盖）、`$hdr_*` / `$cors_*` / `$proxy_hdr_*`（可被 `conf_custom_header` 覆盖的响应头与代理请求头默认值）、`$download_attachment` / `$download_cache_control`（下载与文件访问缓存头）
2. `conf_limit` — `limit_req_zone` / `limit_conn_zone` 定义、127.0.0.1 与 172.17.0.0/16 白名单
3. `waf_exempt` — 免检 URI map，**必须先于** `waf_maps`
4. `waf_maps` — UA/SQLi/XSS/路径规则 map，汇总出 `$waf_hit`、`$waf_action`、`$waf_loggable`，定义 `waf_main` 日志格式
5. `conf_header` → `conf_proxy_header` → `conf_hide_header` — 响应头、反代参数（含 `client_max_body_size 100m`）
6. `conf.d/*.conf` — 站点 server 块；server 内按需 include `conf_ssl` + `waf_server`（管理类站点如 termix 改用 `waf_server_lite`）；`conf_custom_header` 默认注释，需自定义时再启用

关键规则：

- **无 `.conf` 后缀的文件是片段，只能被显式 include**；只有站点 server 块放 `.conf`，才会被通配加载。新增片段要同步改 `nginx.conf` 的 include 列表。
- 部署级自定义（可选）：`conf_custom_header`（由 `.sample` 复制，已 gitignore，站点默认不 include）在需要时由站点 server 或代理 location 显式 include；内部 include `conf_header` / `conf_hide_header`，用 `set` 覆盖 `$hdr_*` / `$cors_*` / `$proxy_hdr_*` 变量，或追加 `add_header` / `proxy_*` 参数。同名 `add_header` / `proxy_set_header` 是追加不是替换，覆盖必须走变量；location 内自定义 `add_header` 时必须 include 本文件，否则会丢公共响应头。未启用时基础配置可直接通过 `nginx -t` 运行。
- `.sample` 是模板，仓库不保存线上站点配置；`default.conf.sample` 绑定 `www.xxx.net`，`termix.conf.sample` 绑定 `remote.xcoai.net`，`router.conf.sample` 绑定 `router.xcoai.net`。
- WAF 分两段：`waf_maps` 只打标，`waf_server` 在 server 级执行拦截（命中→403、非法方法→405）并把规则命中、非法方法、恶意 Referer 写入 `waf.log`；日志含 `$host`、`$status` 与各规则分项。`$waf_action` 的 `"block"` 改成 `"pass"` 即整站切观察模式；`waf_exempt` 仅豁免 `$query_string` 上的 SQLi/XSS，UA/路径规则仍生效。SQLi/XSS 只匹配未解码的 `$query_string`，路径规则使用 `$uri`（已解码/规范化）。WAF 只覆盖常见特征，不追求规则全覆盖；十六进制编码等未识别形式由应用层参数化查询兜底（文件头注释已说明，改规则前先读）。管理类站点（termix）改用 `waf_server_lite`：仅拦截 UA/Referer/非法方法，URI/SQLi/XSS 规则只记录不拦截，避免文件路径参数（`/etc/passwd`、`../`）被误伤。
- 限流：location 内的 `limit_req` 会**替换**而非叠加 server 级的 zone，只能按路径分档（`req_site` / `req_api` / `req_auth`）。
- 静态内容：`site/`（如 `site/xcloud` 为站点根）、`upload/`（下载类后缀强制 `Content-Disposition: attachment`，其余长缓存）、证书按域名放 `ssl/<domain>/`。这三个目录不入库，由部署机提供。
- `conf_js` + `http.js`（njs）在 `nginx.conf` 中被注释：官方 `nginx:1.31.8` 不带 njs 模块，启用需自定义镜像。

### 数据层

- **MySQL 8.4.13**：`mysql/my.cnf` 整体覆盖 `/etc/mysql/my.cnf`，官方镜像的 `conf.d` 扩展点因此失效；`lower_case_table_names=1` 只在全新初始化时生效，已有数据目录不可回退。数据在 `mysql/data/`。
- **Redis 8.8.4**：挂载 `redis/redis.conf` 并以该文件启动；compose 通过 `${REDIS_PASSWORD:?...}` 注入 `--requirepass`，未设置时 compose 拒绝启动，生产必须在 `docker/.env` 或 secret 中配置；`protected-mode yes`；`databases 256`（有效编号 0–255），其中 `12` 固定给 new-api（new-api 仅接受 0–15），其余预留。RDB 持久化到 `/data`，`maxmemory` 由 `REDIS_MAXMEMORY` 注入（默认 512mb）/`noeviction`；`used_memory` 是运行时指标，用 `INFO memory` 监控；容器上限 `REDIS_MEM_LIMIT` 默认 768m，应高于 maxmemory；AOF 默认关闭，避免已有 RDB 切换时丢数据；I/O 多线程默认不启用，按 CPU/压测结果调整。
- **Elasticsearch 8.19.23**：数据卷挂到 `/usr/share/elasticsearch/data`（官方镜像默认数据目录）。因 9.x 存在 CVE-2026-51302 等漏洞，暂使用已修复的 8.19.x；当前数据目录为空，9.x 数据目录无法被 8.x 直接打开。Elasticsearch 8.x 不允许 root 启动，容器使用镜像内置 `elasticsearch` 用户（`user: "1000:0"`）；部署机需预授权数据目录属主：`chown -R 1000:0 <DOCKER_VOLUME_DIRECTORY>/es/data`。JVM 堆由 `JAVA_XMS`/`JAVA_XMX` 注入（默认 512m，应低于 `ELASTIC_MEM_LIMIT`）。
- **Elasticsearch 安全**：`discovery.type=single-node`；`ELASTIC_PASSWORD` 为必填，从 `docker/.env` 读取，未设置时 compose 拒绝启动；x-pack security 已启用，但按要求关闭 HTTP/transport TLS（内网明文 HTTP）。
- **Termix**（`termixssh/termix:26.10.6`，按官网安装文档更新）是 Web 终端前端，`guacd 1.6.0` 提供 RDP/VNC 网关，termix 通过服务名 `x-guacd:4822` 访问 guacd。默认使用 SQLite，无需额外配置即可启动；启用 MySQL 时在 `docker/.env` 设置 `TERMIX_DB_DIALECT=mysql`、`TERMIX_DB_URL=mysql://termix:<url-encoded-password>@host.docker.internal:6306/termix_data?ssl=false`（URL 中密码需 URL 编码；`ssl=false` 显式关闭 TLS）、`TERMIX_DB_POOL_MAX=10`，compose 映射为 `DATABASE_*`，并通过 `extra_hosts: host-gateway` 跨 stack 访问；需先启动 data stack 并预先创建 `termix_data` 库/用户。`/app/data` 卷在两种模式下都保留（密钥、插件、上传文件），MySQL 模式备份需同时覆盖 `termix_data` 库和该目录。

### New API

- **New API**（`calciumion/new-api:v1.0.0-rc.48`）是 AI 网关，独立 `net-ai` stack；容器 `x-new-api`，宿主机 `9960` → 容器 `3000`，数据与日志分别挂载到 `new-api/data`、`new-api/logs`，启动参数为 `--log-dir /app/logs`。
- MySQL 必填：`docker/.env` 的 `NEWAPI_SQL_DSN` 使用 Go DSN（如 `user:password@tcp(host.docker.internal:6306)/dbname?charset=utf8mb4&parseTime=True&loc=Local`），compose 映射为 `SQL_DSN`；凭据不要 URL 编码，需先启动 data stack 并预建库/用户。
- `NEWAPI_SESSION_SECRET` 必填，compose 映射为 `SESSION_SECRET`，使用 `openssl rand -hex 32` 生成固定随机值；未配置时 compose 拒绝启动。
- Redis 必填：`NEWAPI_REDIS_CONN_STRING` 映射为 `REDIS_CONN_STRING`，复用 data stack 的 `x-redis`（`host.docker.internal:6379`），路径固定使用 `/12` 号逻辑库（new-api 专用，编号仅接受 0–15，超出会导致启动失败）；URL 中密码需 URL 编码，修改 `REDIS_PASSWORD` 后需同步更新。
- Nginx 反代：部署 new-api 时复制 `nginx/conf.d/router.conf.sample` 为 `router.conf`；模板绑定 `router.xcoai.net`，代理 `host.docker.internal:9960`，使用 `waf_server`，API 路径使用 `req_api` 限流。
- 会话 Cookie 加固（可选）：`SESSION_COOKIE_SECURE` 由 `NEWAPI_SESSION_COOKIE_SECURE` 注入，默认 `false`；设为 `true` 时必须同时设置 `NEWAPI_SESSION_COOKIE_TRUSTED_URL`（映射 `SESSION_COOKIE_TRUSTED_URL`），值为用户实际访问的精确 HTTPS Origin（如 `https://router.xcoai.net`，多个用逗号分隔，不支持路径/通配符）。new-api 在 `SECURE=true` 但缺少该值时启动即退出（`common/init.go` 调用 `InitSessionCookieSettings` 后 `log.Fatal`）；`SECURE=false` 却设置 trusted URL 也会启动失败。纯 HTTP 直连 `:9960` 时 refresh/logout 会被 OriginGuard 拒绝。

## 约定

- 容器名 `x-` 前缀，网络名 `net-` 前缀，每个 stack 独立 bridge 网络。
- 对外端口刻意错开默认值：MySQL 6306、ES 6200/6201、Termix 9980、New API 9960。
- 卷路径统一 `${DOCKER_VOLUME_DIRECTORY:-.}/<组件>/<子目录>`，配置与数据目录同名放在组件子目录下。
- `.gitignore` 忽略 `.DS_Store`、`data/`、`logs/`、`bak/`、`ssl/`、`site/`、`upload/`、`.workbuddy/`、`docker/.env`、`docker/nginx/conf.d/conf_custom_header`；注意别把私钥或大文件提交进去。
- 配置注释按现有风格用中文，踩坑说明写在文件头（`conf_limit`、`waf_maps` 是范例），改规则时同步更新。
- 数据服务统一使用 `restart: unless-stopped`，并配置 `mem_limit` 与 json-file 日志轮转；内存和日志参数可通过 `docker/.env` 覆盖（`MYSQL_MEM_LIMIT`、`REDIS_MEM_LIMIT`、`REDIS_MAXMEMORY`、`ELASTIC_MEM_LIMIT`、`JAVA_XMS`、`JAVA_XMX`、`LOG_MAX_SIZE`、`LOG_MAX_FILE`），未设置时使用 Compose 默认值。`JAVA_XMS`/`JAVA_XMX` 当前用于 x-es，堆应低于 `ELASTIC_MEM_LIMIT`；`REDIS_MAXMEMORY` 应低于 `REDIS_MEM_LIMIT`。ES 健康检查通过本地 HTTP 和 `elastic` 用户认证。Termix 可选 MySQL 配置通过 `TERMIX_DB_DIALECT`、`TERMIX_DB_URL`、`TERMIX_DB_POOL_MAX` 注入，留空时使用 SQLite。

## 项目级声明（对应全局 CLAUDE.md 第 7 节）

- **验证命令**：见「常用命令」末尾；无 lint / 类型检查 / 单元测试 / 构建。
- **技术栈**：Docker Compose（非 k8s）+ Nginx（WAF/限流/反代）+ MySQL / Redis / Elasticsearch + Termix / guacd + new-api；无应用代码。
- **性能预算**：不适用（无应用接口）。基础设施侧现值：`client_max_body_size 100m`，代理 connect 360s / send 240s / read 240s，见 `conf_proxy_header`；示例站点 443 启用 HTTP/2，`nginx.conf` 启用 gzip。

## 已知风险（发现即可，未经用户确认不要顺手改）

- `docker-compose-data.yml` 的 MySQL root 密码通过 `${MYSQL_ROOT_PASSWORD:?...}` 读取，未设置时 compose 拒绝启动；必须在 `docker/.env`（已 gitignore）或 secret 中配置，禁止提交 `.env`。
- Redis 认证：`docker-compose-data.yml` 通过 `${REDIS_PASSWORD:?...}` 注入 `--requirepass`，未设置时 compose 拒绝启动；必须在 `docker/.env`（已 gitignore）或 secret 中配置。
- Termix 默认 SQLite；启用 MySQL 时需在 `docker/.env` 配置 `TERMIX_DB_DIALECT`/`TERMIX_DB_URL`/`TERMIX_DB_POOL_MAX`，并预先在 MySQL 创建 `termix_data` 库/用户。`TERMIX_DB_URL` 含密码（需 URL 编码）并使用 `ssl=false` 明文连接；仅限内网，跨不可信网络须启用 TLS。`.env` 已 gitignore，禁止提交或输出。
- New API 使用 `NEWAPI_SQL_DSN`（含密码，Go DSN）、`NEWAPI_SESSION_SECRET`、`NEWAPI_REDIS_CONN_STRING`（含密码，需 URL 编码），以及可选的 `NEWAPI_SESSION_COOKIE_SECURE` / `NEWAPI_SESSION_COOKIE_TRUSTED_URL`；`.env` 已 gitignore，禁止提交或输出。MySQL DSN 与 Redis URL 均为明文连接，仅限内网，跨不可信网络须启用 TLS。
- 跨域默认拒绝：`conf_map` 只声明 `$cors_origin` 为空，不在共享文件中写死域名。需跨域的站点要在自己 `.conf` 的 server 内用 `if ($http_origin ~* "^https://...$") { set $cors_origin $http_origin; }` 配置白名单；未配置时不下发 `Access-Control-Allow-Origin`。
- `conf_xss-sql` 旧规则已移除，由 `waf_maps` / `waf_server` / `waf_server_lite` / `waf_exempt` 取代；`bak/` 下是历史备份，已被 gitignore。

## docs/claude 目录说明

`docs/claude/CLAUDE.md` 是用户**全局配置**（企业研发规范 v3.3.0）的源副本，用于复制到 `~/.claude/CLAUDE.md`；`docs/claude/commands/`、`docs/claude/skills/` 用于复制到目标项目的 `.claude/`。它们不是本仓库的运行时配置，本项目的规范以本文件为准。