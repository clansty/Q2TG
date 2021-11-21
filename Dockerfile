FROM jrottenberg/ffmpeg:4.1-alpine AS ffmpeg

FROM ghcr.io/clansty/tgs-to-gif:latest AS tgs

FROM node:16-alpine
COPY --from=ffmpeg / /
COPY --from=tgs / /

WORKDIR /app

COPY package.json ./
COPY yarn.lock ./
COPY .yarn/ ./.yarn/
COPY .yarnrc.yml ./
RUN apk add --no-cache --virtual .build-deps alpine-sdk python3 &&\
    yarn install &&\
    apk del .build-deps

COPY build/ ./
CMD [ "yarn", "docker-start" ]
