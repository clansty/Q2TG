FROM jrottenberg/ffmpeg:4.1-alpine AS ffmpeg

FROM ghcr.io/clansty/tgs-to-gif:latest AS tgs

FROM node:17-alpine AS build

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/ ./.yarn/

RUN apk add --no-cache --virtual .build-deps alpine-sdk python3 &&\
    yarn install &&\
    apk del .build-deps

FROM node:17-alpine

COPY --from=ffmpeg / /
COPY --from=tgs / /
COPY --from=build /app/ /app/

COPY prisma/ ./prisma/
COPY build/ ./build/

CMD [ "yarn", "start" ]
