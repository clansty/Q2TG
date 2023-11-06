# syntax=docker/dockerfile:labs

FROM node:18-slim AS base
RUN rm -f /etc/apt/apt.conf.d/docker-clean; echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  apt update && apt-get --no-install-recommends install -y \
    fonts-wqy-microhei \
    libpixman-1-0 libcairo2 libpango1.0-0 libgif7 libjpeg62-turbo libpng16-16 librsvg2-2 libvips42 ffmpeg librlottie0-1
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS build-env
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  apt update && apt-get --no-install-recommends install -y \
    python3 build-essential pkg-config \
    libpixman-1-dev libcairo2-dev libpango1.0-dev libgif-dev libjpeg62-turbo-dev libpng-dev librsvg2-dev libvips-dev
COPY package.json pnpm-lock.yaml /app/

FROM build-env AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM build-env AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY src tsconfig.json /app/
COPY prisma /app/
RUN pnpm exec prisma generate
RUN pnpm run build

FROM debian:bookworm-slim AS tgs-to-gif-build
ADD https://github.com/conan-io/conan/releases/download/1.61.0/conan-ubuntu-64.deb /tmp/conan.deb
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  apt update && apt-get --no-install-recommends install -y \
    python3 build-essential pkg-config cmake librlottie-dev zlib1g-dev /tmp/conan.deb

ADD https://github.com/ed-asriyan/lottie-converter.git#f626548ced4492235b535552e2449be004a3a435 /app
WORKDIR /app
RUN sed -i 's@zlib/1.2.11@@g' conanfile.txt
RUN conan install .
RUN sed -i 's/\${CONAN_LIBS}/z/g' CMakeLists.txt
RUN cmake CMakeLists.txt && make

FROM base
COPY assets /app/

COPY --from=tgs-to-gif-build /app/bin/tgs_to_gif /usr/local/bin/tgs_to_gif
ENV TGS_TO_GIF=/usr/local/bin/tgs_to_gif

COPY package.json pnpm-lock.yaml /app/
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY prisma /app/
RUN pnpm exec prisma generate
COPY --from=build /app/build /app/build

ENV DATA_DIR=/app/data
CMD pnpm start
