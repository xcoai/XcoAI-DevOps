# XcoAI-DevOps

Deployment configuration for the XcoAI runtime environment. The repository contains Docker Compose stacks for data middleware, the Termix web terminal, new-api, and the Nginx gateway; other application services are deployed separately.

## Repository layout

```text
docker/
├── docker-compose-data.yml     MySQL, Redis, Elasticsearch
├── docker-compose-termix.yml   Termix and guacd
├── docker-compose-ai.yml       new-api
├── docker-compose-web.yml      Nginx
├── nginx/                      Nginx entry config, fragments, and site templates
├── mysql/                      MySQL config and data
├── redis/                      Redis config and data
├── es/                         Elasticsearch data
├── termix/                     Termix data and notes
└── new-api/                    new-api data and logs
```

The component directories listed above contain their own README with configuration details.

## Prerequisites

- Docker Engine 20.10+ with Docker Compose v2 (`docker compose`)
- A Linux host; ports 80 and 443 must be available for the Nginx stack
- Domains and TLS certificates for the sites configured in `docker/nginx/conf.d/*.conf`
- The data stack is required when an application uses MySQL, Redis, or Elasticsearch; Termix defaults to SQLite and does not need it, while new-api uses MySQL and Redis via `NEWAPI_SQL_DSN` and `NEWAPI_REDIS_CONN_STRING`

## Quick start

```bash
cd docker

# First run: create site configs and edit domains, upstreams, and certificate paths
cp nginx/conf.d/default.conf.sample nginx/conf.d/default.conf
cp nginx/conf.d/termix.conf.sample  nginx/conf.d/termix.conf

# Create the host directories mounted by the Nginx container
mkdir -p nginx/site/xcloud nginx/upload nginx/ssl

# Start the stacks in order
docker compose -f docker-compose-data.yml up -d
docker compose -f docker-compose-termix.yml up -d
docker compose -f docker-compose-ai.yml up -d
docker compose -f docker-compose-web.yml up -d
```

With legacy Compose, replace `docker compose` with `docker-compose`.

Certificates go under `nginx/ssl/<domain>/` as `fullchain.pem`, `privkey.pem`, and `chain.pem`, matching the paths in the site config.

## Stacks

| Compose file | Services | Host ports | Notes |
|---|---|---|---|
| `docker-compose-data.yml` | `x-mysql`, `x-redis`, `x-es` | 6306, 6379, 6200/6201 | MySQL, Redis, Elasticsearch |
| `docker-compose-termix.yml` | `x-termix`, `x-guacd` | 9980, 9922 | SQLite by default; MySQL optional |
| `docker-compose-ai.yml` | `x-new-api` | 9960 | new-api; MySQL and Redis via data stack |
| `docker-compose-web.yml` | `x-nginx` | 80, 443 | Reverse proxy, WAF, rate limiting |

The stacks do not share Docker networks. The Nginx stack uses `host.docker.internal` to reach services running on the host: application backends on `:8080` and Termix on `:9980`. The Termix MySQL option and new-api reach MySQL at `host.docker.internal:6306`; new-api reaches Redis at `host.docker.internal:6379`.

## Configuration

Runtime configuration belongs in `docker/.env`, which is gitignored. Do not commit it. The main variables are:

| Variable | Purpose |
|---|---|
| `MYSQL_ROOT_PASSWORD` | MySQL root password |
| `REDIS_PASSWORD` | Redis password |
| `ELASTIC_PASSWORD` | Elasticsearch `elastic` password |
| `MYSQL_MEM_LIMIT`, `REDIS_MEM_LIMIT`, `ELASTIC_MEM_LIMIT` | Container memory limits |
| `REDIS_MAXMEMORY` | Redis `maxmemory`; keep it below `REDIS_MEM_LIMIT` |
| `JAVA_XMS`, `JAVA_XMX` | Elasticsearch JVM heap; keep it below `ELASTIC_MEM_LIMIT` |
| `LOG_MAX_SIZE`, `LOG_MAX_FILE` | Container log rotation |
| `DOCKER_VOLUME_DIRECTORY` | Base path for bind mounts; defaults to the current directory |
| `TERMIX_DB_DIALECT`, `TERMIX_DB_URL`, `TERMIX_DB_POOL_MAX` | Optional Termix MySQL connection |
| `NEWAPI_SQL_DSN` | Required new-api MySQL connection (Go DSN; credentials are not URL-encoded) |
| `NEWAPI_SESSION_SECRET` | Required persistent session secret for new-api |
| `NEWAPI_REDIS_CONN_STRING` | Required new-api Redis connection (password URL-encoded) |
| `NEWAPI_SESSION_COOKIE_SECURE` | Optional; Secure refresh cookie flag for new-api (default `false`) |
| `NEWAPI_SESSION_COOKIE_TRUSTED_URL` | Exact HTTPS origin of the new-api site; required when cookie secure is `true` |

The fallback passwords in the compose files are for local startup only. Override them in `docker/.env` or an external secret store.

## Documentation

- `docker/Readme.md` — start, stop, and validation commands
- `docker/nginx/Readme.md` — Nginx layout, site templates, WAF, and rate limiting
- `docker/mysql/Readme.md`, `docker/redis/Readme.md`, `docker/es/Readme.md` — data service configuration
- `docker/termix/Readme.md` — SQLite default and optional MySQL setup
- `docker/new-api/Readme.md` — new-api MySQL/Redis setup and data layout
- `CLAUDE.md` — architecture and maintenance guidance

## License

Apache License 2.0. See [LICENSE](LICENSE).