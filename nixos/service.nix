{ pkgs, lib, config, ... }:

let
  cfg = config.services.q2tg;
in
{
  config = lib.mkIf cfg.enable {
    users = {
      users.q2tg = {
        isSystemUser = true;
        createHome = true;
        home = "/var/lib/q2tg";
        group = "q2tg";
        description = "Q2TG service";
      };

      groups.q2tg = { };
    };

    systemd.services.q2tg = {
      description = "Q2TG service";
      path = [ cfg.package ];
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];
      environment = {
        DATA_DIR = "/var/lib/q2tg";
        TG_API_ID = toString cfg.tg.api-id;
        TG_API_HASH = cfg.tg.api-hash;
        TG_BOT_TOKEN = cfg.tg.bot-token;
        CRV_API = cfg.crv.api;
        CRV_KEY = cfg.crv.key;
        DATABASE_URL = cfg.database;
        PROXY_IP = toString cfg.proxy.ip;
        PROXY_PORT = toString cfg.proxy.port;
        PRISMA_MIGRATION_ENGINE_BINARY = "${pkgs.prisma-engines}/bin/migration-engine";
        PRISMA_QUERY_ENGINE_BINARY = "${pkgs.prisma-engines}/bin/query-engine";
        PRISMA_QUERY_ENGINE_LIBRARY = "${pkgs.prisma-engines}/lib/libquery_engine.node";
        PRISMA_INTROSPECTION_ENGINE_BINARY = "${pkgs.prisma-engines}/bin/introspection-engine";
        PRISMA_FMT_BINARY = "${pkgs.prisma-engines}/bin/prisma-fmt";
        TGS_TO_GIF = "${cfg.tgs-to-gif-package}/bin/tgs-to-gif";
        FFMPEG_PATH = "${cfg.ffmpeg-package}/bin/ffmpeg";
        FFPROBE_PATH = "${cfg.ffmpeg-package}/bin/ffprobe";
      };
      serviceConfig = {
        User = "q2tg";
        Group = "q2tg";
        Restart = "on-failure";
        ExecStartPre = "${cfg.prisma-package}/bin/prisma db push --accept-data-loss --skip-generate --schema ${cfg.package}/libexec/q2tg/node_modules/.prisma/client/schema.prisma";
        ExecStart = "${cfg.package}/bin/q2tg";
      };
    };
  };
}
