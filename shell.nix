{ pkgs ? import <nixpkgs> {} }:
  pkgs.mkShell {
    buildInputs = with pkgs; [
      yarn
      nodejs-18_x
      libwebp
      python3
      ffmpeg
      (vips.override {
        libjxl = pkgs.libjxl.overrideAttrs(attrs: {
          doCheck = false;
        });
      })
      openssl
    ];
    shellHook = with pkgs; ''
      export PRISMA_MIGRATION_ENGINE_BINARY="${prisma-engines}/bin/migration-engine"
      export PRISMA_QUERY_ENGINE_BINARY="${prisma-engines}/bin/query-engine"
      export PRISMA_QUERY_ENGINE_LIBRARY="${prisma-engines}/lib/libquery_engine.node"
      export PRISMA_INTROSPECTION_ENGINE_BINARY="${prisma-engines}/bin/introspection-engine"
      export PRISMA_FMT_BINARY="${prisma-engines}/bin/prisma-fmt"
    '';
}
