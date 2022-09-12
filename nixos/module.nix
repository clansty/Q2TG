{ pkgs, config, ... }:

with pkgs.lib;
{
  imports = [
    ./service.nix
  ];
  options.services.q2tg = {
    enable = mkEnableOption "Enables Q2TG service";
    package = mkOption {
      type = types.package;
      default = import ../default.nix { inherit pkgs; };
    };
    ffmpeg-package = mkOption {
      type = types.package;
      default = pkgs.ffmpeg;
    };
    tgs-to-gif-package = mkOption {
      type = types.package;
      default =
        let
          clansty-flake = pkgs.fetchFromGitHub {
            owner = "Clansty";
            repo = "flake";
            rev = "d602b0359456457b8d92d1f84e42e7aec3baa9be";
            fetchSubmodules = true;
            sha256 = "na+HvJ7B/rP+qew1b58hTkHzc6BRvOERUHgva7cEY5k=";
          };
        in
        pkgs.callPackage "${clansty-flake}/packages/tgs-to-gif" { };
    };
    tg.api-id = mkOption {
      type = types.int;
    };
    tg.api-hash = mkOption {
      type = types.str;
    };
    tg.bot-token = mkOption {
      type = types.str;
    };
    crv.api = mkOption {
      type = types.str;
    };
    crv.key = mkOption {
      type = types.str;
    };
    database = mkOption {
      type = types.str;
    };
  };
}
