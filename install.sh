#!/bin/sh
# Vex Package Manager Installation Script
# Usage: curl -fsSL https://raw.githubusercontent.com/michailElsikora/vex-pm/main/install.sh | sh

set -e

REPO="michailElsikora/vex-pm"
INSTALL_DIR="${VEX_INSTALL:-$HOME/.vex}"
BIN_DIR="$INSTALL_DIR/bin"

# Detect OS and architecture
detect_platform() {
    OS="$(uname -s)"
    ARCH="$(uname -m)"

    case "$OS" in
        Linux*)     OS="linux" ;;
        Darwin*)    OS="darwin" ;;
        *)          echo "Unsupported OS: $OS"; exit 1 ;;
    esac

    case "$ARCH" in
        x86_64)     ARCH="x64" ;;
        aarch64)    ARCH="arm64" ;;
        arm64)      ARCH="arm64" ;;
        *)          echo "Unsupported architecture: $ARCH"; exit 1 ;;
    esac

    PLATFORM="${OS}-${ARCH}"
}

# Get latest release version
get_latest_version() {
    curl -s "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/'
}

# Download and install
install_vex() {
    detect_platform
    
    VERSION=$(get_latest_version)
    if [ -z "$VERSION" ]; then
        echo "Could not determine latest version. Installing from source..."
        install_from_source
        return
    fi

    DOWNLOAD_URL="https://github.com/$REPO/releases/download/$VERSION/vex-$PLATFORM"
    
    echo "Installing vex $VERSION for $PLATFORM..."
    
    # Create directories
    mkdir -p "$BIN_DIR"
    
    # Download binary
    if command -v curl > /dev/null; then
        curl -fsSL "$DOWNLOAD_URL" -o "$BIN_DIR/vex"
    elif command -v wget > /dev/null; then
        wget -q "$DOWNLOAD_URL" -O "$BIN_DIR/vex"
    else
        echo "Error: curl or wget is required"
        exit 1
    fi
    
    # Make executable
    chmod +x "$BIN_DIR/vex"
    
    echo ""
    echo "vex installed successfully to $BIN_DIR/vex"
    echo ""
    echo "Add to your shell profile:"
    echo "  export PATH=\"$BIN_DIR:\$PATH\""
    echo ""
    echo "Then restart your terminal or run:"
    echo "  source ~/.bashrc  # or ~/.zshrc"
}

# Install from source if no releases available
install_from_source() {
    echo "Installing vex from source..."
    
    if ! command -v node > /dev/null; then
        echo "Error: Node.js is required to build from source"
        exit 1
    fi
    
    if ! command -v git > /dev/null; then
        echo "Error: git is required to build from source"
        exit 1
    fi
    
    TEMP_DIR=$(mktemp -d)
    cd "$TEMP_DIR"
    
    git clone --depth 1 "https://github.com/$REPO.git" vex
    cd vex
    
    npm install
    npm run build
    
    mkdir -p "$BIN_DIR"
    cp -r dist "$INSTALL_DIR/"
    cp -r node_modules "$INSTALL_DIR/"
    cp package.json "$INSTALL_DIR/"
    
    # Create wrapper script
    cat > "$BIN_DIR/vex" << 'EOF'
#!/bin/sh
node "$HOME/.vex/dist/bin.js" "$@"
EOF
    
    chmod +x "$BIN_DIR/vex"
    
    # Cleanup
    cd /
    rm -rf "$TEMP_DIR"
    
    echo ""
    echo "vex installed successfully to $BIN_DIR/vex"
    echo ""
    echo "Add to your shell profile:"
    echo "  export PATH=\"$BIN_DIR:\$PATH\""
}

install_vex

