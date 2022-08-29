{ pkgs ? import <nixpkgs> {} }:
  pkgs.mkShell {
    buildInputs = with pkgs; [
      yarn
      nodejs-18_x
      libwebp
      python3
      ffmpeg
      vips
    ];
}
