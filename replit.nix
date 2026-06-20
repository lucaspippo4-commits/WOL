# Entorno Nix para Replit. Node 22 incluye node:sqlite (base persistente en disco).
{ pkgs }: {
  deps = [
    pkgs.nodejs_22
  ];
}
