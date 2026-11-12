# Nginx

- 镜像：`nginx:1.31.8`
- 容器：`x-nginx`
- 端口：宿主机 `80` / `443`
- 网络：`net-web`
- 挂载：
  - `nginx/nginx.conf` → `/etc/nginx/nginx.conf`（只读）
  - `nginx/conf.d/` → `/etc/nginx/conf.d/`（只读）
  - `nginx/ssl/` → `/etc/nginx/ssl/`（只读）
  - `nginx/site/` → `/usr/share/nginx/site/`（只读）
  - `nginx/upload/` → `/usr/share/nginx/upload/`（只读）
  - `nginx/logs/` → `/var/log/nginx/`

Nginx 通过 `host.docker.internal` 访问宿主机上的后端 `:8080`、Termix `:9980` 和 new-api `:9960`；该地址由 compose 的 `extra_hosts` 注入。

## 配置分层

`nginx.conf` 在 http 上下文按固定顺序 include：

1. `conf_map`：日志过滤、CORS、响应头/代理头默认变量
2. `conf_limit`：限流 zone、连接数 zone、本机白名单
3. `waf_exempt`：WAF 免检 URI（必须先于 `waf_maps`）
4. `waf_maps`：UA/SQLi/XSS/路径规则，汇总 `$waf_hit` / `$waf_action`
5. `conf_header` → `conf_proxy_header` → `conf_hide_header`
6. `conf.d/*.conf`：站点 server 块

无 `.conf` 后缀的文件是片段，只能被显式 include；新增片段要同步修改 `nginx.conf` 的 include 列表。`conf_js` 与 `http.js` 作为 njs 存档保留，官方 `nginx:1.31.8` 不带 njs 模块，未来需要时再启用并改用自定义镜像。

## 站点模板

仓库只保存模板，不保存线上站点配置：

```bash
cp nginx/conf.d/default.conf.sample nginx/conf.d/default.conf
cp nginx/conf.d/termix.conf.sample  nginx/conf.d/termix.conf
cp nginx/conf.d/router.conf.sample  nginx/conf.d/router.conf
```

- `default.conf.sample`：示例站点，绑定 `www.xxx.net`，静态根为 `site/xcloud`，API 反代宿主机 `:8080`。
- `termix.conf.sample`：绑定 `remote.xcoai.net`，反代 Termix `:9980`，使用 `waf_server_lite`。
- `router.conf.sample`：部署 new-api 时使用，绑定 `router.xcoai.net`，反代 new-api `:9960`，使用 `waf_server`；API 路径使用 `req_api` 限流。
- 修改域名、证书路径、证书目录和上游后再启动。
- `conf_custom_header.sample` 为可选的部署级自定义层；需要覆盖默认响应头/代理头时复制为 `conf_custom_header`，并取消站点内的 include 注释。

## WAF 与限流

- `waf_server`：站点级拦截，命中规则返回 403，非法方法返回 405，命中信息写入 `waf.log`。
- `waf_server_lite`：仅拦截 UA/Referer/非法方法；URI/SQLi/XSS 规则只记录，供 Termix 这类携带文件路径参数的站点使用。
- `$waf_action` 的 `block` 改为 `pass` 可将整站切换为观察模式。
- 限流 zone 为 `req_site`、`req_api`、`req_auth`；location 内的 `limit_req` 会替换 server 级 zone，不能叠加。
- CORS 默认不放开；需要跨域的站点在自身 server 块中通过 `if + set $cors_origin` 配置白名单。

## 验证

```bash
docker exec x-nginx nginx -t
docker exec x-nginx nginx -s reload
```

`conf.d` 为只读挂载，修改配置后无需重启容器，reload 即可生效。`site/`、`upload/`、`ssl/` 由部署机提供，均不入库。

## 日志与轮转

- 访问日志 `/var/log/nginx/access.log`、错误日志 `error.log` 与 WAF 日志 `waf.log` 都写入宿主机 `nginx/logs/`（bind mount）。
- 这三个文件不受 Docker json-file 的 `LOG_MAX_SIZE` / `LOG_MAX_FILE` 管理，必须在宿主机配置 logrotate，否则会持续增长。
- 使用仓库模板安装（`<LOG_DIR>` 替换为实际日志目录，默认是 `<仓库>/docker/nginx/logs`；设置 `DOCKER_VOLUME_DIRECTORY` 时为 `<该目录>/nginx/logs`）：

  ```bash
  sudo cp nginx/logrotate.sample /etc/logrotate.d/x-nginx
  sudo sed -i 's#<LOG_DIR>#/opt/ai/XcoAI-DevOps/docker/nginx/logs#' /etc/logrotate.d/x-nginx
  sudo logrotate -d /etc/logrotate.d/x-nginx    # 预演，确认匹配文件
  sudo logrotate -f /etc/logrotate.d/x-nginx    # 立即轮转一次
  ```

- 模板策略：每天或单文件超过 100M 时轮转，保留 14 份并压缩；`postrotate` 执行 `docker exec x-nginx nginx -s reopen`，让容器内进程重新打开新文件。
- 容器 stdout/stderr（启动信息、Docker 自身错误）仍由 compose 的 json-file 轮转配置管理。