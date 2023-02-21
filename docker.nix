{ pkgs, flakePkgs, nix2container, ... }:
nix2container.buildImage {
  name = "q2tg";
  maxLayers = 8;
  # optimizations
  layers = with pkgs;[
    (nix2container.buildLayer {
      copyToRoot = pkgs.buildEnv {
        name = "root";
        paths = [ pkgs.bash pkgs.coreutils ];
        pathsToLink = [ "/bin" ];
      };
    })
    (nix2container.buildLayer { deps = [ nodejs ]; })
    # deps of sharp
    (nix2container.buildLayer {
      deps = [
        (vips.override {
          libjxl = libjxl.overrideAttrs (attrs: {
            doCheck = false;
          });
        }).dev
      ];
    })
    # deps of node-canvas
    (nix2container.buildLayer { deps = [ pixman cairo.dev pango.dev giflib libjpeg.dev libpng.dev librsvg.dev ]; })
    (nix2container.buildLayer { deps = [ ffmpeg ]; })
    (nix2container.buildLayer { deps = with flakePkgs;[ prisma-patched prisma-engines tgs-to-gif ]; })
    (nix2container.buildLayer { deps = with flakePkgs;[ fontsSf ]; })
  ];
  config = {
    Cmd = [
      (
        pkgs.writeScript "start" ''
          #!${pkgs.bash}/bin/bash
          mkdir -p /tmp /root/.cache
          ${flakePkgs.prisma-patched}/bin/prisma db push --accept-data-loss --skip-generate --schema ${flakePkgs.default}/libexec/q2tg/node_modules/.prisma/client/schema.prisma
          ${flakePkgs.default}/bin/q2tg
        ''
      )
    ];
    Env = [
      "DATA_DIR=/app/data"
      "PRISMA_MIGRATION_ENGINE_BINARY=${pkgs.prisma-engines}/bin/migration-engine"
      "PRISMA_QUERY_ENGINE_BINARY=${pkgs.prisma-engines}/bin/query-engine"
      "PRISMA_QUERY_ENGINE_LIBRARY=${pkgs.prisma-engines}/lib/libquery_engine.node"
      "PRISMA_INTROSPECTION_ENGINE_BINARY=${pkgs.prisma-engines}/bin/introspection-engine"
      "PRISMA_FMT_BINARY=${pkgs.prisma-engines}/bin/prisma-fmt"
      "TGS_TO_GIF=${flakePkgs.tgs-to-gif}/bin/tgs-to-gif"
      "FFMPEG_PATH=${pkgs.ffmpeg}/bin/ffmpeg"
      "FFPROBE_PATH=${pkgs.ffmpeg}/bin/ffprobe"
      "FONTCONFIG_PATH=${flakePkgs.fontsSf}"
    ];
    Volumes = {
      "/app/data" = { };
    };
  };
}
