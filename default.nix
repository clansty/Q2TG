# This is a minimal `default.nix` by yarn-plugin-nixify. You can customize it
# as needed, it will not be overwritten by the plugin.

{ pkgs ? import <nixpkgs> { } }:

(pkgs.callPackage ./yarn-project.nix { } { src = ./.; }).overrideAttrs (attrs: {
  buildPhase = with pkgs; ''
    prisma generate
    yarn build
  '';

  buildInputs = attrs.buildInputs ++ (with pkgs; [
    (vips.override {
      libjxl = libjxl.overrideAttrs (attrs: {
        doCheck = false;
      });
    })
  ]);

  nativeBuildInputs = attrs.buildInputs ++ (with pkgs; [
    python3
    pkg-config
    (callPackage ./nixos/prismaPatched.nix {})
  ]);
})
