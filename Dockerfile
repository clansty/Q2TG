# syntax=docker/dockerfile:labs

FROM node:22-alpine AS base
RUN echo "@testing https://dl-cdn.alpinelinux.org/alpine/edge/testing" >> /etc/apk/repositories
RUN --mount=type=cache,target=/var/cache/apk,sharing=locked \
  apk update && apk add \
    font-wqy-zenhei pixman cairo pango giflib libjpeg-turbo libpng librsvg vips ffmpeg \
    gosu@testing rlottie@testing # Currently gosu & rlottie are only packaged in testing repository
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm add -g pnpm@9.13.2
WORKDIR /app

FROM base AS build
RUN --mount=type=cache,target=/var/cache/apk,sharing=locked \
  apk update && apk add \
    python3 build-base \
    pixman-dev cairo-dev pango-dev giflib-dev libjpeg-turbo-dev libpng-dev librsvg-dev vips-dev
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc /app/
COPY patches /app/patches
COPY main/package.json /app/main/
COPY ui/ /app/ui/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store,sharing=locked \
    --mount=type=secret,id=npmrc,target=/root/.npmrc \
    pnpm install --frozen-lockfile
COPY main/tsconfig.json main/build.ts /app/main/
COPY main/prisma /app/main/prisma
COPY main/src /app/main/src
RUN cd main && pnpm exec prisma generate
RUN cd main && pnpm run build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store,sharing=locked \
    --mount=type=secret,id=npmrc,target=/root/.npmrc \
    pnpm deploy --filter=q2tg-main --prod deploy
RUN cd ui && pnpm run build

FROM alpine:edge AS tgs-to-gif-build
RUN echo "https://dl-cdn.alpinelinux.org/alpine/edge/testing" >> /etc/apk/repositories
RUN --mount=type=cache,target=/var/cache/apk,sharing=locked \
  apk update && apk add \
    python3 build-base cmake rlottie-dev zlib-dev

ADD https://github.com/p-ranav/argparse.git#v3.0 /argparse
WORKDIR /argparse/build
RUN cmake -DARGPARSE_BUILD_SAMPLES=off -DARGPARSE_BUILD_TESTS=off .. && make && make install

ADD https://github.com/ed-asriyan/lottie-converter.git#f626548ced4492235b535552e2449be004a3a435 /app
WORKDIR /app
RUN sed -i 's/\${CONAN_LIBS}/z/g' CMakeLists.txt && sed -i 's/include(conanbuildinfo.cmake)//g' CMakeLists.txt && sed -i 's/conan_basic_setup()//g' CMakeLists.txt

RUN cmake CMakeLists.txt && make

FROM base

COPY --from=tgs-to-gif-build /app/tgs_to_gif /usr/local/bin/tgs_to_gif
ENV TGS_TO_GIF=/usr/local/bin/tgs_to_gif

COPY --from=build /app/deploy /app
COPY main/prisma /app/
RUN pnpm exec prisma generate
COPY --from=build /app/ui/dist /app/front
ENV UI_PATH=/app/front

COPY docker-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV DATA_DIR=/app/data
ENV CACHE_DIR=/app/.config/QQ/NapCat/temp

ARG REPO
ARG REF
ARG COMMIT
ENV REPO $REPO
ENV REF $REF
ENV COMMIT $COMMIT

EXPOSE 8080
CMD /app/entrypoint.sh
