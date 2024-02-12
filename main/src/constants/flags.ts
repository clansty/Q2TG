enum flags {
  DISABLE_Q2TG = 1,
  DISABLE_TG2Q = 1 << 1,
  DISABLE_JOIN_NOTICE = 1 << 2,
  DISABLE_POKE = 1 << 3,
  NO_DELETE_MESSAGE = 1 << 4,
  NO_AUTO_CREATE_PM = 1 << 5,
  COLOR_EMOJI_PREFIX = 1 << 6,
  RICH_HEADER = 1 << 7,
  NO_QUOTE_PIN = 1 << 8,
  NO_FORWARD_OTHER_BOT = 1 << 9,
}

export default flags;
