# Elasticsearch

- 镜像：`elasticsearch:8.19.23`
- 容器：`x-es`
- 端口：宿主机 `6200` → `9200`（HTTP），`6201` → `9300`（transport）
- 数据目录：`es/data` → `/usr/share/elasticsearch/data`
- 网络：`net-data`

## 首次启动

Elasticsearch 8.x 不允许 root 启动，compose 使用镜像内置 `elasticsearch` 用户（`user: "1000:0"`）。首次启动前授权数据目录：

```bash
chown -R 1000:0 <DOCKER_VOLUME_DIRECTORY>/es/data
```

未设置 `DOCKER_VOLUME_DIRECTORY` 时，数据目录为 `docker/es/data`。

## 配置

- `discovery.type=single-node`。
- x-pack security 启用；`ELASTIC_PASSWORD` 为必填，从 `docker/.env` 读取，未设置时 compose 拒绝启动。
- HTTP 与 transport TLS 均关闭，适用于受控网络；跨不可信网络部署前需另行启用 TLS。
- JVM 堆由 `JAVA_XMS` / `JAVA_XMX` 控制，默认 `512m`；堆应低于容器上限 `ELASTIC_MEM_LIMIT`（默认 `1g`），给堆外内存留余量。
- 健康检查通过 `http://localhost:9200/_cluster/health` 和 `elastic` 用户完成，启动等待 60s。

## 版本

当前固定 8.19.x。升级到 9.x 前需确认数据目录兼容性，并评估对应版本的安全公告。