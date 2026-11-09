# MySQL

- 镜像：`mysql:8.4.13`
- 容器：`x-mysql`
- 端口：宿主机 `6306` → 容器 `3306`
- 数据目录：`mysql/data` → `/var/lib/mysql`
- 配置：`mysql/my.cnf` → `/etc/mysql/my.cnf`
- 网络：`net-data`

## 配置要点

- 字符集 `utf8mb4`，排序规则 `utf8mb4_0900_ai_ci`。
- 启用严格 `sql_mode`；`max_allowed_packet=64m`，`max_connections=200`。
- `innodb_buffer_pool_size=512m`，需按宿主机内存和容器上限 `MYSQL_MEM_LIMIT` 调整。
- 慢查询日志写入 `mysql/data/mysqld-slow.log`，阈值 `long_query_time=6`。
- `lower_case_table_names=1` 仅在全新初始化时生效；已有数据目录不能直接修改该值。
- `my.cnf` 整体覆盖 `/etc/mysql/my.cnf`，因此官方镜像的 `conf.d` 扩展点不生效；新增配置直接修改本文件。

## 初始化与密码

- 首次使用空数据目录启动时，`MYSQL_DATABASE=xcoai_data` 会创建初始库。
- root 密码由 `MYSQL_ROOT_PASSWORD` 注入，未设置时 compose 拒绝启动；必须在 `docker/.env` 或 secret 中配置。
- 其他应用需要独立库/用户时，按对应应用 README 初始化，不要复用 root。

## 健康检查与日志

- 健康检查使用容器内 `mysql` 客户端校验 root 连接：启动等待 30s，每 20s 检查一次，超时 10s，失败 4 次后标记不健康。
- 容器日志使用 json-file 轮转，由 `LOG_MAX_SIZE` / `LOG_MAX_FILE` 控制。