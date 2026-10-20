{
  description = "AGS Desktop Shell";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

    ags = {
      url = "github:aylur/ags";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    claude-code-nix = {
      url = "github:sadjow/claude-code-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      ags,
      utils,
      claude-code-nix,
      ...
    }:
    utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ claude-code-nix.overlays.default ];
          config = {
            allowUnfree = true;
          };
        };
        pname = "mshell-dev";
        entry = "app.tsx";

        # Astal libraries used at runtime
        astalPackages = with ags.packages.${system}; [
          io
          astal4 # gtk4
          battery
          bluetooth
          cava
          network
          mpris
          notifd
          wireplumber
          hyprland
          tray
          apps
          powerprofiles
        ];

        extraPackages =
          astalPackages
          ++ (with pkgs; [
            libgtop
            lm_sensors
            glib
            bluez
            bluez-tools
            glib-networking
            libadwaita
          ]);
      in
      {
        packages.default = pkgs.stdenv.mkDerivation {
          name = pname;
          src = ./.;

          nativeBuildInputs = with pkgs; [
            wrapGAppsHook3
            gobject-introspection
            ags.packages.${system}.default
          ];

          buildInputs = extraPackages ++ [ pkgs.gjs ];

          installPhase = ''
            runHook preInstall

            mkdir -p $out/bin
            mkdir -p $out/share
            cp -r * $out/share
            ags bundle ${entry} $out/bin/${pname} -d "SRC='$out/share'"

            runHook postInstall
          '';

          preFixup = ''
            gappsWrapperArgs+=(
              --prefix GIO_EXTRA_MODULES : "${pkgs.glib-networking}/lib/gio/modules"
            )
          '';
        };

        devShells.default = pkgs.mkShell {
          name = "${pname} dev";

          packages = with pkgs; [
            (ags.packages.${system}.default.override {
              inherit extraPackages;
            })
            inotify-tools
            nodejs
            claude-code
          ];

          shellHook = ''
            # glib-networking modules for TLS
            export GIO_EXTRA_MODULES="${pkgs.glib-networking}/lib/gio/modules"

            AGS_JS="${ags.packages.${system}.ags}/share/ags/js"

            # Symlink ags package for TypeScript LSP
            if ! test -L ./node_modules/ags; then
              echo ""
              echo "💡 Initialising ags types... (required for TypeScript server)"
              mkdir -p node_modules
              ln -sf "$AGS_JS" ./node_modules/ags
              echo "💡 Done."
              echo ""
            fi

            # Symlink gnim (bundled with ags)
            if ! test -L ./node_modules/gnim; then
              ln -sf "$AGS_JS/node_modules/gnim" ./node_modules/gnim
            fi

            # Generate GIR type stubs for Astal
            if ! test -d ./@girs; then
              echo ""
              echo "💡 Generating GIR types for Astal..."
              ags types -d . || echo "⚠️  Run 'npm run types' if you need @girs stubs"
              echo "💡 Done."
              echo ""
            fi

            # Install npm dev dependencies if missing
            if ! test -f ./node_modules/.package-lock.json; then
              echo ""
              echo "💡 Installing npm dev dependencies..."
              npm install --verbose
              echo "💡 Done."
              echo ""
            fi
          '';
        };
      }
    );
}
