{
  description = "Flake that configures Q2TG";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };
  outputs = { self, nixpkgs, flake-utils }:
    {
      packages = nixpkgs.lib.mapAttrs
        (system: pkgs: {
          default = import ./default.nix { inherit pkgs; };
        })
        nixpkgs.legacyPackages;
      nixosModules.default = import ./nixos/module.nix;
    } // flake-utils.lib.eachDefaultSystem
      (system:
        let pkgs = nixpkgs.legacyPackages.${system}; in
        {
          devShells.default = import ./shell.nix { inherit pkgs; };
        }
      );
}
