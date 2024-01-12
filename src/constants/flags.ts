enum flags {
  DISABLE_Q2TG = 1,
  DISABLE_TG2Q = 1 << 1,
  DISABLE_JOIN_NOTICE = 1 << 2,
  DISABLE_POKE = 1 << 3,
  NO_DELETE_MESSAGE = 1 << 4,
}

export default flags;
