FROM jrottenberg/ffmpeg:4.1-alpine AS ffmpeg

FROM ghcr.io/clansty/tgs-to-gif:latest AS tgs

FROM node:17-alpine AS deps

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/ ./.yarn/

RUN apk add --no-cache alpine-sdk python3 &&\
    yarn install

RUN rm -rf ./.yarn/cache

FROM node:17-alpine AS build

WORKDIR /app

COPY --from=deps /app/ /app/

COPY tsconfig.json ./
COPY src/ ./src/

RUN yarn build

FROM node:17-alpine

WORKDIR /app

COPY --from=ffmpeg / /
COPY --from=tgs / /
COPY --from=deps /app/ /app/
COPY prisma/ ./prisma/
COPY assets/ ./assets/
COPY --from=build /app/build/ /app/build/

CMD [ "yarn", "start" ]
