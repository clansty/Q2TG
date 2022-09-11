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
      description = "Q2TG checkin";
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
        PRISMA_MIGRATION_ENGINE_BINARY = "${pkgs.prisma-engines}/bin/migration-engine";
        PRISMA_QUERY_ENGINE_BINARY = "${pkgs.prisma-engines}/bin/query-engine";
        PRISMA_QUERY_ENGINE_LIBRARY = "${pkgs.prisma-engines}/lib/libquery_engine.node";
        PRISMA_INTROSPECTION_ENGINE_BINARY = "${pkgs.prisma-engines}/bin/introspection-engine";
        PRISMA_FMT_BINARY = "${pkgs.prisma-engines}/bin/prisma-fmt";
      };
      serviceConfig = {
        User = "q2tg";
        Group = "q2tg";
        ExecStart = "${cfg.package}/bin/q2tg";
      };
    };
  };
}
