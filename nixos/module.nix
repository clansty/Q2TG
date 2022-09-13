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
      default = pkgs.callPackage "${import ./clansty-flake.nix pkgs}/packages/tgs-to-gif" { };
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
