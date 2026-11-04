# Termix

默认使用 SQLite，无需额外配置，直接启动 termix stack 即可：

```bash
cd docker
docker compose -f docker-compose-termix.yml up -d
```

## 可选：MySQL

1. 在 `docker/.env` 配置：

   ```dotenv
   TERMIX_DB_DIALECT=mysql
   TERMIX_DB_URL=mysql://termix:<url-encoded-password>@host.docker.internal:6306/termix_data?ssl=false
   TERMIX_DB_POOL_MAX=10
   ```

   - `TERMIX_DB_URL` 中的密码必须 URL 编码（如 `#` → `%23`、`@` → `%40`、`:` → `%3A`、`/` → `%2F`）；SQL 中使用原始密码，两者解码后必须一致。
   - `ssl=false` 显式关闭 TLS，适用于未配置证书的内网 MySQL；Termix 未设置 `DATABASE_SSL` 时默认也不启用 TLS。
   - 不要添加 `allowPublicKeyRetrieval=true`：它是 MySQL JDBC 驱动的参数，Termix 使用的 mysql2 不支持（会被忽略并打印警告）。mysql2 在非加密连接下使用 `caching_sha2_password` 时会自动向服务端请求 RSA 公钥，无需该参数。
   - 如需启用 TLS：在 `docker-compose-termix.yml` 的 `environment` 中增加 `DATABASE_SSL: "require"`（自签证书用 `no-verify`），并移除 URL 中的 `ssl=false`。

2. 在 `x-mysql` 中创建库和用户（`<password>` 使用原始密码，与 URL 中编码后的密码解码后一致）：

   ```sql
   CREATE DATABASE IF NOT EXISTS `termix_data` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   CREATE USER IF NOT EXISTS 'termix'@'%' IDENTIFIED BY '<password>';
   GRANT ALL PRIVILEGES ON `termix_data`.* TO 'termix'@'%';
   FLUSH PRIVILEGES;
   ```

3. 先启动 data stack，再启动 termix：

   ```bash
   docker compose -f docker-compose-data.yml up -d
   docker compose -f docker-compose-termix.yml up -d
   ```

4. MySQL 模式下 `/app/data` 仍需保留，用于密钥、插件和上传文件；备份需同时覆盖 `termix_data` 库和该目录。
