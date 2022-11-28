{
  description = "Flake that configures Q2TG";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/b225d54ffcfe905e45d60292db259dbee04324f9";
    flake-utils.url = "github:numtide/flake-utils";
  };
  outputs = { self, nixpkgs, flake-utils }:
    {
      packages = nixpkgs.lib.mapAttrs
        (system: pkgs: {
          default = import ./default.nix { inherit pkgs; };
          tgs-to-gif = pkgs.callPackage "${import ./nixos/clansty-flake.nix}/packages/tgs-to-gif" { };
          prisma-patched = pkgs.callPackage ./nixos/prismaPatched.nix { };
        })
        nixpkgs.legacyPackages;
      nixosModules.default = import ./nixos/module.nix { inherit self; };
    } // flake-utils.lib.eachDefaultSystem
      (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          flakePkgs = self.packages.${system};
        in
        {
          devShells.default = import ./shell.nix { inherit pkgs flakePkgs; };
        }
      );
}
