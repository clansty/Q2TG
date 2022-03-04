FROM jrottenberg/ffmpeg:4.1-alpine AS ffmpeg

FROM ghcr.io/clansty/tgs-to-gif:latest AS tgs

FROM node:17-alpine
COPY --from=ffmpeg / /
COPY --from=tgs / /

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/ ./.yarn/
COPY prisma/ ./prisma/

RUN apk add --no-cache --virtual .build-deps alpine-sdk python3 &&\
    yarn install &&\
    apk del .build-deps

COPY build/ ./build/
CMD [ "yarn", "start" ]
