{ self }:
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
      default = self.packages.${pkgs.system}.default;
    };
    ffmpeg-package = mkOption {
      type = types.package;
      default = pkgs.ffmpeg;
    };
    tgs-to-gif-package = mkOption {
      type = types.package;
      default = self.packages.${pkgs.system}.tgs-to-gif;
    };
    prisma-package = mkOption {
      type = types.package;
      default = self.packages.${pkgs.system}.prisma-patched;
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
    proxy.ip = mkOption {
      type = types.nullOr types.str;
      default = null;
    };
    proxy.port = mkOption {
      type = types.nullOr types.int;
      default = null;
    };
  };
}
