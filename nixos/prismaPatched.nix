{ runCommand, nodePackages }:

runCommand "patchPrisma" { } ''
  cp -r ${nodePackages.prisma} $out
  chmod +w -R $out
  cd $out
  patch -p1 < ${./prisma.patch}
  substituteInPlace $out/bin/prisma --replace '${nodePackages.prisma}' "$out"
''
