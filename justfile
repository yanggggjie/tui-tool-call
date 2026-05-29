# Local development for ttc (tui-tool-call).
#
#   just link-global   — build and npm link (use `ttc` anywhere)
#   just dev           — tsc --watch; changes apply after save
#   just unlink-global — restore npm registry global install

_default:
    @just --list

# Install dependencies
install:
    npm install

# Build CLI to dist/
build:
    npm run build

# Rebuild on file changes
dev:
    npm run dev

# Build check
check: build

# Remove node_modules, lockfile, dist, and ~/.ttc
clean:
    npm run clean

# Build and link `ttc` globally for local testing
link-global:
    npm install
    npm run build
    -npm uninstall -g tui-tool-call
    npm link
    @echo "Global link ready. Keep \`just dev\` running, then run \`ttc\` from any directory."

# Restore global ttc from npm registry
unlink-global:
    -npm unlink
    npm install -g tui-tool-call
    @echo "Restored global ttc from npm ($(npm view tui-tool-call version))."

# Show which ttc binary is active
which-ttc:
    @which ttc
    @ttc --version

# Check daemon status
daemon-status:
    ttc daemon status

# Quick smoke test: drive examples/ask.py
demo-ask:
    ttc start temp-work python3 examples/ask.py
    ttc done
    ttc type "Alice"
    ttc press enter
    ttc done
    ttc kill
