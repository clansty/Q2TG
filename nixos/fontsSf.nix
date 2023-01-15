{ runCommand, writeTextDir, ... }:
let
  repo = builtins.fetchGit {
    rev = "53ffbe571bb83dbb4835a010b4a49ebb9a32fc55";
    url = "https://github.com/xMuu/arch-kde-fontconfig.git";
    ref = "master";
  };
in
writeTextDir "fonts.conf" ''
  <?xml version="1.0"?>
  <!DOCTYPE fontconfig SYSTEM "fonts.dtd">
  <fontconfig>
    <dir>${repo}</dir>
    <alias>
      <family>sans</family>
      <prefer>
        <family>SF Pro Text</family>
        <family>PingFang SC</family>
        <family>PingFang HK</family>
        <family>PingFang TC</family>
      </prefer>
    </alias>
    <alias>
      <family>sans-serif</family>
      <prefer>
        <family>SF Pro Text</family>
        <family>PingFang SC</family>
        <family>PingFang HK</family>
        <family>PingFang TC</family>
      </prefer>
    </alias>
    <alias>
      <family>monospace</family>
      <prefer>
        <family>SF Mono</family>
        <family>PingFang SC</family>
        <family>PingFang HK</family>
        <family>PingFang TC</family>
      </prefer>
    </alias>
  </fontconfig>
''
