# Redis

- 镜像：`redis:8.8.4`
- 容器：`x-redis`
- 端口：宿主机 `6379` → 容器 `6379`
- 数据目录：`redis/data` → `/data`
- 配置：`redis/redis.conf` → `/etc/redis.conf`
- 网络：`net-data`

## 启动参数

compose 以 `redis-server /etc/redis.conf --requirepass "$REDIS_PASSWORD" --maxmemory "$REDIS_MAXMEMORY"` 启动，密码和 `maxmemory` 以环境变量为准；`redis.conf` 中的 `maxmemory 512mb` 是直接启动时的默认值。

- `REDIS_PASSWORD`：生产必须在 `docker/.env` 或 secret 中覆盖。
- `REDIS_MAXMEMORY`：默认 `512m`，应低于容器上限 `REDIS_MEM_LIMIT`（默认 `768m`）。
- `maxmemory-policy=noeviction`：达到上限后拒绝写入；纯缓存场景可改为 `allkeys-lru`，需按业务评估。

## 持久化

- RDB 开启，快照点为 1 小时 1 次修改 / 5 分钟 100 次 / 1 分钟 10000 次，文件为 `/data/dump.rdb`。
- AOF 默认关闭。若已有 RDB 后直接启用 AOF，Redis 会优先加载 AOF 并忽略旧 RDB；应先在线执行 `CONFIG SET appendonly yes`，完成 rewrite 后再持久化配置。
- `stop-writes-on-bgsave-error yes`：BGSAVE 失败时停止写入，避免误判持久化状态。

## 安全与运维

- `protected-mode yes`，并关闭受保护的运行时配置、调试命令和模块加载。
- 容器内 `bind * -::*`（IPv4/IPv6 通配），由 compose 将端口发布到宿主机。
- 建议宿主机确认 `net.core.somaxconn >= 4096`、`vm.overcommit_memory=1`，并关闭透明大页；配置中已设置 `disable-thp yes`。
- 健康检查通过 `redis-cli ping` 返回 `PONG` 判断。