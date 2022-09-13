{ pkgs ? import <nixpkgs> { } }:
pkgs.mkShell {
  buildInputs = with pkgs; [
    yarn
    nodejs-18_x
    python3
    ffmpeg
    (callPackage ./nixos/prismaPatched.nix { })
    pkg-config
    (vips.override {
      libjxl = pkgs.libjxl.overrideAttrs (attrs: {
        doCheck = false;
      });
    })
  ];

  TGS_TO_GIF =
    let package = pkgs.callPackage "${import ./nixos/clansty-flake.nix pkgs}/packages/tgs-to-gif" { };
    in "${package}/bin/tgs-to-gif";
  PRISMA_MIGRATION_ENGINE_BINARY = "${pkgs.prisma-engines}/bin/migration-engine";
  PRISMA_QUERY_ENGINE_BINARY = "${pkgs.prisma-engines}/bin/query-engine";
  PRISMA_QUERY_ENGINE_LIBRARY = "${pkgs.prisma-engines}/lib/libquery_engine.node";
  PRISMA_INTROSPECTION_ENGINE_BINARY = "${pkgs.prisma-engines}/bin/introspection-engine";
  PRISMA_FMT_BINARY = "${pkgs.prisma-engines}/bin/prisma-fmt";
}
