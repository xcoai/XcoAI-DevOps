cd /opt/ai/XcoAI-DevOps/docker
docker-compose -f docker-compose-termix.yml up -d
# docker-compose -f docker-compose-termix.yml down

docker-compose -f docker-compose-web.yml up -d
# docker-compose -f docker-compose-web.yml down