#!/usr/bin/env bash

MONGO_CONTAINER_NAME=eventstore-mongo-test-$RANDOM

set -euo pipefail

docker build -q -t $MONGO_CONTAINER_NAME ./docker/mongo/

docker run --rm -d \
  --name $MONGO_CONTAINER_NAME \
  --hostname $MONGO_CONTAINER_NAME \
  $MONGO_CONTAINER_NAME

trap "docker kill $MONGO_CONTAINER_NAME || exit 0" EXIT

docker run --rm \
  -v $(pwd)/../../:/app \
  -w /app/packages/eventstore-mongo \
  -e "MONGO_URL=mongodb://$MONGO_CONTAINER_NAME:27017/eventstore?replicaSet=rs0&writeConcern=majority" \
  --link $MONGO_CONTAINER_NAME \
  node:16-alpine \
  ./docker/wait-for-it.sh -t 30 $MONGO_CONTAINER_NAME:27017 -- \
  npm run test:integration:jest
