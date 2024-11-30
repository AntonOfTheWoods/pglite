{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    systems.url = "github:nix-systems/default";
    devenv.url = "github:cachix/devenv";
    devenv.inputs.nixpkgs.follows = "nixpkgs";
    nixpkgs-denov1.url = "github:nixos/nixpkgs/dfb72de3dbe62ff47e59894d50934e03f0602072";
  };

  nixConfig = {
    extra-trusted-public-keys = "devenv.cachix.org-1:w1cLUi8dv3hnoSPGAuibQv+f9TZLr6cv/Hm9XgU50cw=";
    extra-substituters = "https://devenv.cachix.org";
  };

  outputs = { self, nixpkgs, devenv, systems, nixpkgs-denov1, ... } @ inputs:
    let
      forEachSystem = nixpkgs.lib.genAttrs (import systems);
    in
    {
      packages = forEachSystem (system: {
        devenv-up = self.devShells.${system}.default.config.procfileScript;
        devenv-test = self.devShells.${system}.default.config.test;
      });

      devShells = forEachSystem
        (system:
          let
            pkgs = nixpkgs.legacyPackages.${system};
          in
          {
            default = devenv.lib.mkShell {
              inherit inputs pkgs;
              modules = [
                {
                  packages = [ pkgs.glibc ];  # required for bun
                  languages.javascript = {
                    package = pkgs.nodejs-slim_22;
                    enable = true;
                    pnpm = {
                      enable = true;
                      # install.enable = true;
                    };
                  };
                  languages.typescript.enable = true;
                  languages.deno = {
                    package = nixpkgs-denov1.legacyPackages.${system}.deno;
                    enable = true;
                  };
                }
              ];
            };
          });
    };
}
