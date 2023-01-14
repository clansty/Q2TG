{
  description = "Flake that configures Q2TG";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-22.11";
    flake-utils.url = "github:numtide/flake-utils";
    nix2container.url = "github:nlewo/nix2container";
  };
  outputs = { self, nixpkgs, flake-utils, nix2container }:
    flake-utils.lib.eachDefaultSystem
      (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          flakePkgs = self.packages.${system};
          nix2containerPkgs = nix2container.packages.${system};
        in
        {
          packages = {
            default = import ./default.nix { inherit pkgs; };
            tgs-to-gif = pkgs.callPackage "${import ./nixos/clansty-flake.nix}/packages/tgs-to-gif" { };
            prisma-patched = pkgs.callPackage ./nixos/prismaPatched.nix { };
            fontsSf = pkgs.callPackage ./nixos/fontsSf.nix { };
            docker = import ./docker.nix {
              inherit pkgs flakePkgs;
              nix2container = nix2containerPkgs.nix2container;
            };
          };
          devShells.default = import ./shell.nix { inherit pkgs flakePkgs; };
        }
      );
}
