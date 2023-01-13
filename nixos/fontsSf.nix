{ runCommand, ... }:
let
  repo = builtins.fetchGit {
    rev = "53ffbe571bb83dbb4835a010b4a49ebb9a32fc55";
    url = "https://github.com/xMuu/arch-kde-fontconfig.git";
    ref = "master";
  };
in
runCommand "fonts" { } ''
  mkdir -p $out
  cp ${repo}/SF-Pro/SF-Pro-Text-Regular.otf $out/SFPro.otf
  cp ${repo}/SF-Pro/SF-Pro-Text-RegularItalic.otf $out/SFProItalic.otf
  cp ${repo}/SF-Pro/SF-Pro-Text-Semibold.otf $out/SFProBold.otf
  cp ${repo}/SF-Pro/SF-Pro-Text-SemiboldItalic.otf $out/SFProBoldItalic.otf
  cp ${repo}/SF-Mono/SF-Mono-Regular.otf $out/SFMono.otf
  cp ${repo}/SF-Mono/SF-Mono-RegularItalic.otf $out/SFMonoItalic.otf
  cp ${repo}/SF-Mono/SF-Mono-Semibold.otf $out/SFMonoBold.otf
  cp ${repo}/SF-Mono/SF-Mono-SemiboldItalic.otf $out/SFMonoBoldItalic.otf
''
