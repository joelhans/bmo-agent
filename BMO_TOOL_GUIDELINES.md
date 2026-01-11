BMO Tool Creation Guidelines (for _add_tool)

Purpose
- Ensure tools load cleanly with the current CommonJS-based loader
- Prevent recurring errors like "Unexpected token export"
- Provide a consistent interface and robust error handling

Rules
1) Implementation format
- Provide only the async function body for the  field. Do NOT include module wrappers or exports.
- No declare -x COLORTERM="truecolor"
declare -x COMMAND_MODE="unix2003"
declare -x DBX_CONTAINER_IMAGE="fedora:latest"
declare -x EDITOR="nvim"
declare -x GHOSTTY_BIN_DIR="/Applications/Ghostty.app/Contents/MacOS"
declare -x GHOSTTY_RESOURCES_DIR="/Applications/Ghostty.app/Contents/Resources/ghostty"
declare -x GHOSTTY_SHELL_FEATURES="cursor,path,title"
declare -x HOME="/Users/joelhans"
declare -x HOMEBREW_CELLAR="/opt/homebrew/Cellar"
declare -x HOMEBREW_PREFIX="/opt/homebrew"
declare -x HOMEBREW_REPOSITORY="/opt/homebrew"
declare -x INFOPATH="/opt/homebrew/share/info:"
declare -x LANG="en_US"
declare -x LC_ALL="en_US.UTF-8"
declare -x LOGNAME="joelhans"
declare -x MANPATH="/usr/share/man:/usr/local/share/man:/Users/joelhans/.antidote/man:/Applications/Ghostty.app/Contents/Resources/ghostty/../man:"
declare -x NIX_PROFILES="/nix/var/nix/profiles/default /Users/joelhans/.nix-profile"
declare -x NIX_SSL_CERT_FILE="/nix/var/nix/profiles/default/etc/ssl/certs/ca-bundle.crt"
declare -x NVM_DIR="/Users/joelhans/.nvm"
declare -x OLDPWD="/Users/joelhans/dotfiles"
declare -x OPENAI_API_KEY="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"
declare -x PATH="/Users/joelhans/.nix-profile/bin:/nix/var/nix/profiles/default/bin:/usr/local/bin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/local/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/appleinternal/bin:/Users/joelhans/bin:/Users/joelhans/.local/bin:/Users/joelhans/.nix-profile/bin:/nix/var/nix/profiles/default/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/Applications/Ghostty.app/Contents/MacOS:/Users/joelhans/.lmstudio/bin"
declare -x PWD="/Users/joelhans/src/bmo-agent"
declare -x SHELL="/bin/zsh"
declare -x SHLVL="4"
declare -x SSH_AUTH_SOCK="/var/home/joel/.1password/agent.sock"
declare -x STARSHIP_SESSION_KEY="3219134974947283"
declare -x STARSHIP_SHELL="zsh"
declare -x TERM="xterm-ghostty"
declare -x TERMINFO="/Applications/Ghostty.app/Contents/Resources/terminfo"
declare -x TERM_PROGRAM="ghostty"
declare -x TERM_PROGRAM_VERSION="1.2.3"
declare -x TMPDIR="/var/folders/qg/hcsx27m542n4fljkjwb8bp180000gn/T/"
declare -x USER="joelhans"
declare -x XDG_DATA_DIRS="/usr/local/share:/usr/share:/Applications/Ghostty.app/Contents/Resources/ghostty/..:/Users/joelhans/.nix-profile/share:/nix/var/nix/profiles/default/share:/Users/joelhans/.nix-profile/share:/nix/var/nix/profiles/default/share:/Users/joelhans/.nix-profile/share:/nix/var/nix/profiles/default/share"
declare -x XPC_FLAGS="0x0"
declare -x XPC_SERVICE_NAME="0"
declare -x ZELLIJ="0"
declare -x ZELLIJ_PANE_ID="2"
declare -x ZELLIJ_SESSION_NAME="bmo"
declare -x __CFBundleIdentifier="com.mitchellh.ghostty"
declare -x __CF_USER_TEXT_ENCODING="0x1F5:0x0:0x0" or  at the top level. The loader injects the wrapper.
- No ESM import/export. Use injected modules (fs, path, child_process as cp, https, http).
- No top-level await.

2) Parameters and definition
- Always provide a complete parameter schema (type: object, properties, required).
- Describe each parameter clearly.

3) Execution
- Use the  object provided by the loader (already parsed).
- Return JSON strings only:  on success;  on error.
- Always wrap logic in try/catch and surface concise error messages.

4) Code style and structure
- Do not declare nested functions inside the implementation body unless necessary; keep it flat and simple.
- Avoid re-requiring modules or dynamic imports.
- Prefer clear variable names and concise logic.

5) Testing
- After creating a tool with , immediately call .
- Validate with a simple call to ensure the tool loads and returns JSON correctly.

Example implementation body
try {
  const { param1 } = args;
  // logic here using fs, path, cp, https, http
  return JSON.stringify({ success: true, result: ok });
} catch (error) {
  return JSON.stringify({ success: false, error: error.message });
}

Common mistakes to avoid
- Using declare -x COLORTERM="truecolor"
declare -x COMMAND_MODE="unix2003"
declare -x DBX_CONTAINER_IMAGE="fedora:latest"
declare -x EDITOR="nvim"
declare -x GHOSTTY_BIN_DIR="/Applications/Ghostty.app/Contents/MacOS"
declare -x GHOSTTY_RESOURCES_DIR="/Applications/Ghostty.app/Contents/Resources/ghostty"
declare -x GHOSTTY_SHELL_FEATURES="cursor,path,title"
declare -x HOME="/Users/joelhans"
declare -x HOMEBREW_CELLAR="/opt/homebrew/Cellar"
declare -x HOMEBREW_PREFIX="/opt/homebrew"
declare -x HOMEBREW_REPOSITORY="/opt/homebrew"
declare -x INFOPATH="/opt/homebrew/share/info:"
declare -x LANG="en_US"
declare -x LC_ALL="en_US.UTF-8"
declare -x LOGNAME="joelhans"
declare -x MANPATH="/usr/share/man:/usr/local/share/man:/Users/joelhans/.antidote/man:/Applications/Ghostty.app/Contents/Resources/ghostty/../man:"
declare -x NIX_PROFILES="/nix/var/nix/profiles/default /Users/joelhans/.nix-profile"
declare -x NIX_SSL_CERT_FILE="/nix/var/nix/profiles/default/etc/ssl/certs/ca-bundle.crt"
declare -x NVM_DIR="/Users/joelhans/.nvm"
declare -x OLDPWD="/Users/joelhans/dotfiles"
declare -x OPENAI_API_KEY="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"
declare -x PATH="/Users/joelhans/.nix-profile/bin:/nix/var/nix/profiles/default/bin:/usr/local/bin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/local/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/appleinternal/bin:/Users/joelhans/bin:/Users/joelhans/.local/bin:/Users/joelhans/.nix-profile/bin:/nix/var/nix/profiles/default/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/Applications/Ghostty.app/Contents/MacOS:/Users/joelhans/.lmstudio/bin"
declare -x PWD="/Users/joelhans/src/bmo-agent"
declare -x SHELL="/bin/zsh"
declare -x SHLVL="4"
declare -x SSH_AUTH_SOCK="/var/home/joel/.1password/agent.sock"
declare -x STARSHIP_SESSION_KEY="3219134974947283"
declare -x STARSHIP_SHELL="zsh"
declare -x TERM="xterm-ghostty"
declare -x TERMINFO="/Applications/Ghostty.app/Contents/Resources/terminfo"
declare -x TERM_PROGRAM="ghostty"
declare -x TERM_PROGRAM_VERSION="1.2.3"
declare -x TMPDIR="/var/folders/qg/hcsx27m542n4fljkjwb8bp180000gn/T/"
declare -x USER="joelhans"
declare -x XDG_DATA_DIRS="/usr/local/share:/usr/share:/Applications/Ghostty.app/Contents/Resources/ghostty/..:/Users/joelhans/.nix-profile/share:/nix/var/nix/profiles/default/share:/Users/joelhans/.nix-profile/share:/nix/var/nix/profiles/default/share:/Users/joelhans/.nix-profile/share:/nix/var/nix/profiles/default/share"
declare -x XPC_FLAGS="0x0"
declare -x XPC_SERVICE_NAME="0"
declare -x ZELLIJ="0"
declare -x ZELLIJ_PANE_ID="2"
declare -x ZELLIJ_SESSION_NAME="bmo"
declare -x __CFBundleIdentifier="com.mitchellh.ghostty"
declare -x __CF_USER_TEXT_ENCODING="0x1F5:0x0:0x0" /  in the implementation string.
- Returning raw objects instead of JSON strings.
- Missing try/catch.
- Requiring modules inside the function body.

Notes
- The loader is CommonJS-based; ESM syntax (e.g., declare -x COLORTERM="truecolor"
declare -x COMMAND_MODE="unix2003"
declare -x DBX_CONTAINER_IMAGE="fedora:latest"
declare -x EDITOR="nvim"
declare -x GHOSTTY_BIN_DIR="/Applications/Ghostty.app/Contents/MacOS"
declare -x GHOSTTY_RESOURCES_DIR="/Applications/Ghostty.app/Contents/Resources/ghostty"
declare -x GHOSTTY_SHELL_FEATURES="cursor,path,title"
declare -x HOME="/Users/joelhans"
declare -x HOMEBREW_CELLAR="/opt/homebrew/Cellar"
declare -x HOMEBREW_PREFIX="/opt/homebrew"
declare -x HOMEBREW_REPOSITORY="/opt/homebrew"
declare -x INFOPATH="/opt/homebrew/share/info:"
declare -x LANG="en_US"
declare -x LC_ALL="en_US.UTF-8"
declare -x LOGNAME="joelhans"
declare -x MANPATH="/usr/share/man:/usr/local/share/man:/Users/joelhans/.antidote/man:/Applications/Ghostty.app/Contents/Resources/ghostty/../man:"
declare -x NIX_PROFILES="/nix/var/nix/profiles/default /Users/joelhans/.nix-profile"
declare -x NIX_SSL_CERT_FILE="/nix/var/nix/profiles/default/etc/ssl/certs/ca-bundle.crt"
declare -x NVM_DIR="/Users/joelhans/.nvm"
declare -x OLDPWD="/Users/joelhans/dotfiles"
declare -x OPENAI_API_KEY="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"
declare -x PATH="/Users/joelhans/.nix-profile/bin:/nix/var/nix/profiles/default/bin:/usr/local/bin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/local/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/appleinternal/bin:/Users/joelhans/bin:/Users/joelhans/.local/bin:/Users/joelhans/.nix-profile/bin:/nix/var/nix/profiles/default/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/Applications/Ghostty.app/Contents/MacOS:/Users/joelhans/.lmstudio/bin"
declare -x PWD="/Users/joelhans/src/bmo-agent"
declare -x SHELL="/bin/zsh"
declare -x SHLVL="4"
declare -x SSH_AUTH_SOCK="/var/home/joel/.1password/agent.sock"
declare -x STARSHIP_SESSION_KEY="3219134974947283"
declare -x STARSHIP_SHELL="zsh"
declare -x TERM="xterm-ghostty"
declare -x TERMINFO="/Applications/Ghostty.app/Contents/Resources/terminfo"
declare -x TERM_PROGRAM="ghostty"
declare -x TERM_PROGRAM_VERSION="1.2.3"
declare -x TMPDIR="/var/folders/qg/hcsx27m542n4fljkjwb8bp180000gn/T/"
declare -x USER="joelhans"
declare -x XDG_DATA_DIRS="/usr/local/share:/usr/share:/Applications/Ghostty.app/Contents/Resources/ghostty/..:/Users/joelhans/.nix-profile/share:/nix/var/nix/profiles/default/share:/Users/joelhans/.nix-profile/share:/nix/var/nix/profiles/default/share:/Users/joelhans/.nix-profile/share:/nix/var/nix/profiles/default/share"
declare -x XPC_FLAGS="0x0"
declare -x XPC_SERVICE_NAME="0"
declare -x ZELLIJ="0"
declare -x ZELLIJ_PANE_ID="2"
declare -x ZELLIJ_SESSION_NAME="bmo"
declare -x __CFBundleIdentifier="com.mitchellh.ghostty"
declare -x __CF_USER_TEXT_ENCODING="0x1F5:0x0:0x0") will fail to parse.
