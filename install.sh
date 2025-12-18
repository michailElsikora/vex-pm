#!/bin/sh
# Vex Package Manager Installation Script
# Usage: curl -fsSL https://raw.githubusercontent.com/michailElsikora/vex-pm/main/install.sh | sh

set -e

REPO="michailElsikora/vex-pm"
INSTALL_DIR="${VEX_INSTALL:-$HOME/.vex}"
BIN_DIR="$INSTALL_DIR/bin"
PROFILE=""

# Detect shell profile file
detect_profile() {
    SHELL_NAME="$(basename "$SHELL")"
    
    case "$SHELL_NAME" in
        zsh)
            PROFILE="$HOME/.zshrc"
            ;;
        bash)
            if [ -f "$HOME/.bashrc" ]; then
                PROFILE="$HOME/.bashrc"
            elif [ -f "$HOME/.bash_profile" ]; then
                PROFILE="$HOME/.bash_profile"
            else
                PROFILE="$HOME/.profile"
            fi
            ;;
        fish)
            PROFILE="$HOME/.config/fish/config.fish"
            ;;
        *)
            PROFILE="$HOME/.profile"
            ;;
    esac
}

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

# Add PATH to shell profile
add_to_path() {
    detect_profile
    
    SHELL_NAME="$(basename "$SHELL")"
    if [ "$SHELL_NAME" = "fish" ]; then
        PROFILE_LINE="set -gx PATH $BIN_DIR \$PATH"
    else
        PROFILE_LINE="export PATH=\"$BIN_DIR:\$PATH\""
    fi
    
    # Check if already added
    if [ -f "$PROFILE" ] && grep -q "$BIN_DIR" "$PROFILE" 2>/dev/null; then
        echo "PATH already configured in $PROFILE"
        return
    fi
    
    # Create profile directory if needed (for fish)
    mkdir -p "$(dirname "$PROFILE")"
    
    # Add to profile
    echo "" >> "$PROFILE"
    echo "# Vex Package Manager" >> "$PROFILE"
    echo "$PROFILE_LINE" >> "$PROFILE"
    
    echo "Added vex to PATH in $PROFILE"
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
    
    # Add to PATH
    add_to_path
    
    # Export for current session
    export PATH="$BIN_DIR:$PATH"
    
    echo ""
    echo "✓ vex $VERSION installed successfully!"
    echo ""
    echo "Restart your terminal or run:"
    echo "  source $PROFILE"
    echo ""
    echo "Then verify installation:"
    echo "  vex --version"
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
    cp -r node_modules "$INSTALL_DIR/" 2>/dev/null || true
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
    
    # Add to PATH
    add_to_path
    
    # Export for current session
    export PATH="$BIN_DIR:$PATH"
    
    echo ""
    echo "✓ vex installed successfully from source!"
    echo ""
    echo "Restart your terminal or run:"
    echo "  source $PROFILE"
    echo ""
    echo "Then verify installation:"
    echo "  vex --version"
}

install_vex

