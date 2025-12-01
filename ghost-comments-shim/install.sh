#!/bin/bash

# Ghost Comments Shim Installation Script
# This script helps Ghost operators install and configure the Bluesky comments shim

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
INSTALL_DIR="/opt/ghost-comments-shim"
SERVICE_USER="ghost"
NODE_VERSION_MIN="18"

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════╗"
echo "║     Ghost Bluesky Comments Shim Installer             ║"
echo "║     Version 0.1.0                                     ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Function to print status messages
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Function to check Node.js version
check_node() {
    print_status "Checking Node.js installation..."

    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        echo "Please install Node.js 18+ from https://nodejs.org/"
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt "$NODE_VERSION_MIN" ]; then
        print_error "Node.js version $NODE_VERSION found, but version $NODE_VERSION_MIN+ is required"
        exit 1
    fi

    print_success "Node.js $(node -v) is installed"
}

# Function to check npm
check_npm() {
    print_status "Checking npm installation..."

    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi

    print_success "npm $(npm -v) is installed"
}

# Function to check if Ghost user exists
check_ghost_user() {
    print_status "Checking for Ghost user..."

    if ! id "$SERVICE_USER" &>/dev/null; then
        print_warning "User '$SERVICE_USER' not found"
        read -p "Enter the user that should run the shim (default: ghost): " INPUT_USER
        SERVICE_USER=${INPUT_USER:-ghost}

        if ! id "$SERVICE_USER" &>/dev/null; then
            print_error "User '$SERVICE_USER' does not exist"
            read -p "Create user '$SERVICE_USER'? (y/n): " CREATE_USER
            if [ "$CREATE_USER" = "y" ]; then
                useradd -r -s /bin/false "$SERVICE_USER"
                print_success "Created user '$SERVICE_USER'"
            else
                exit 1
            fi
        fi
    else
        print_success "User '$SERVICE_USER' exists"
    fi
}

# Function to prompt for installation directory
prompt_install_dir() {
    read -p "Installation directory (default: $INSTALL_DIR): " INPUT_DIR
    INSTALL_DIR=${INPUT_DIR:-$INSTALL_DIR}

    if [ -d "$INSTALL_DIR" ]; then
        print_warning "Directory $INSTALL_DIR already exists"
        read -p "Remove and reinstall? (y/n): " REINSTALL
        if [ "$REINSTALL" = "y" ]; then
            rm -rf "$INSTALL_DIR"
            print_status "Removed existing installation"
        else
            print_error "Installation aborted"
            exit 1
        fi
    fi
}

# Function to install the package
install_package() {
    print_status "Creating installation directory..."
    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"

    print_status "Installing @ghost-atproto/comments-shim from npm..."
    npm install @ghost-atproto/comments-shim --production

    if [ $? -eq 0 ]; then
        print_success "Package installed successfully"
    else
        print_error "Failed to install package"
        exit 1
    fi
}

# Function to configure environment
configure_env() {
    print_status "Configuring environment variables..."

    # Copy example env file
    cp node_modules/@ghost-atproto/comments-shim/.env.example .env

    echo ""
    echo -e "${YELLOW}Please provide the following configuration:${NC}"
    echo ""

    # Ghost Database Type
    echo "Ghost Database Type:"
    echo "  1) MySQL"
    echo "  2) SQLite"
    read -p "Select database type (1 or 2): " DB_TYPE_CHOICE

    if [ "$DB_TYPE_CHOICE" = "2" ]; then
        GHOST_DB_TYPE="sqlite"
        read -p "Path to Ghost SQLite database (e.g., /var/www/ghost/content/data/ghost.db): " GHOST_DB_PATH
        GHOST_DB_CONNECTION="$GHOST_DB_PATH"
    else
        GHOST_DB_TYPE="mysql"
        read -p "MySQL host (default: localhost): " MYSQL_HOST
        MYSQL_HOST=${MYSQL_HOST:-localhost}

        read -p "MySQL port (default: 3306): " MYSQL_PORT
        MYSQL_PORT=${MYSQL_PORT:-3306}

        read -p "MySQL database name (default: ghost_production): " MYSQL_DB
        MYSQL_DB=${MYSQL_DB:-ghost_production}

        read -p "MySQL username (default: ghost): " MYSQL_USER
        MYSQL_USER=${MYSQL_USER:-ghost}

        read -sp "MySQL password: " MYSQL_PASS
        echo ""

        GHOST_DB_CONNECTION="mysql://${MYSQL_USER}:${MYSQL_PASS}@${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DB}"
    fi

    # Generate shared secret
    print_status "Generating shared secret..."
    SHARED_SECRET=$(openssl rand -base64 32)

    # Bluesky Member ID
    echo ""
    print_warning "You must create a Bluesky member in Ghost Admin first!"
    echo "Instructions:"
    echo "  1. Go to Ghost Admin → Members → New Member"
    echo "  2. Email: comments@bsky.atproto.invalid"
    echo "  3. Name: Bluesky"
    echo "  4. Save and copy the member ID from the URL"
    echo ""
    read -p "Bluesky Member ID (24-char hex): " BLUESKY_MEMBER_ID

    # Validate member ID format
    if ! [[ "$BLUESKY_MEMBER_ID" =~ ^[a-f0-9]{24}$ ]]; then
        print_warning "Member ID format may be incorrect (should be 24-char hex)"
        read -p "Continue anyway? (y/n): " CONTINUE
        if [ "$CONTINUE" != "y" ]; then
            exit 1
        fi
    fi

    # Port
    read -p "Port for shim to listen on (default: 3001): " SHIM_PORT
    SHIM_PORT=${SHIM_PORT:-3001}

    # Write .env file
    cat > .env << EOF
# Ghost Database Configuration
GHOST_DB_TYPE=$GHOST_DB_TYPE
GHOST_DB_CONNECTION=$GHOST_DB_CONNECTION

# Security
BRIDGE_SHARED_SECRET=$SHARED_SECRET

# Bluesky Configuration
BLUESKY_MEMBER_ID=$BLUESKY_MEMBER_ID

# Server Configuration
PORT=$SHIM_PORT
NODE_ENV=production
EOF

    # Set secure permissions
    chmod 600 .env
    chown "$SERVICE_USER:$SERVICE_USER" .env

    print_success "Environment configured"

    # Display the shared secret for bridge configuration
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}IMPORTANT: Save this shared secret for bridge configuration!${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
    echo ""
    echo "SHIM_SHARED_SECRET=$SHARED_SECRET"
    echo ""
    echo "Add this to your bridge backend's .env file:"
    echo "  SHIM_URL=http://localhost:$SHIM_PORT"
    echo "  SHIM_SHARED_SECRET=$SHARED_SECRET"
    echo ""
    read -p "Press Enter to continue..."
}

# Function to test database connection
test_database() {
    print_status "Testing database connection..."

    if [ "$GHOST_DB_TYPE" = "mysql" ]; then
        # Extract connection details for testing
        # This is a simple test, actual connection is done by the app
        print_warning "Please verify MySQL connection manually or start the service to test"
    else
        if [ -f "$GHOST_DB_CONNECTION" ]; then
            print_success "SQLite database file exists"
        else
            print_error "SQLite database file not found: $GHOST_DB_CONNECTION"
        fi
    fi
}

# Function to create systemd service
create_service() {
    print_status "Creating systemd service..."

    cat > /etc/systemd/system/ghost-comments-shim.service << EOF
[Unit]
Description=Ghost Bluesky Comments Shim
Documentation=https://github.com/your-org/ghost-atproto
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which node) $INSTALL_DIR/node_modules/@ghost-atproto/comments-shim/dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ghost-comments-shim

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$INSTALL_DIR

# Environment
Environment=NODE_ENV=production
EnvironmentFile=$INSTALL_DIR/.env

[Install]
WantedBy=multi-user.target
EOF

    print_success "Systemd service created"
}

# Function to start and enable service
start_service() {
    print_status "Enabling and starting service..."

    systemctl daemon-reload
    systemctl enable ghost-comments-shim
    systemctl start ghost-comments-shim

    sleep 2

    if systemctl is-active --quiet ghost-comments-shim; then
        print_success "Service is running"

        # Test health endpoint
        print_status "Testing health endpoint..."
        if curl -sf "http://localhost:$SHIM_PORT/health" > /dev/null; then
            print_success "Health check passed"
        else
            print_warning "Health check failed - check logs with: journalctl -u ghost-comments-shim -f"
        fi
    else
        print_error "Service failed to start"
        print_status "Check logs with: journalctl -u ghost-comments-shim -n 50"
        exit 1
    fi
}

# Function to set permissions
set_permissions() {
    print_status "Setting permissions..."
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
    chmod -R 750 "$INSTALL_DIR"
    print_success "Permissions set"
}

# Function to display completion message
display_completion() {
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║     Installation Complete!                            ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Service Status:"
    echo "  - Service: ghost-comments-shim"
    echo "  - Status: $(systemctl is-active ghost-comments-shim)"
    echo "  - Port: $SHIM_PORT"
    echo ""
    echo "Useful Commands:"
    echo "  - Check status:  systemctl status ghost-comments-shim"
    echo "  - View logs:     journalctl -u ghost-comments-shim -f"
    echo "  - Restart:       systemctl restart ghost-comments-shim"
    echo "  - Stop:          systemctl stop ghost-comments-shim"
    echo ""
    echo "Next Steps:"
    echo "  1. Configure your bridge backend with the shared secret shown above"
    echo "  2. Test the integration by creating a post and replying on Bluesky"
    echo "  3. Check $INSTALL_DIR/INSTALL.md for detailed documentation"
    echo ""
}

# Main installation flow
main() {
    check_root
    check_node
    check_npm
    check_ghost_user
    prompt_install_dir
    install_package
    configure_env
    test_database
    set_permissions
    create_service
    start_service
    display_completion
}

# Run main function
main
