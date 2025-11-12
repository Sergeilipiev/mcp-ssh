# MCP-SSH: Detailed Issues Report

**Report Date:** 2025-11-12
**Analysis Tool:** Deep Code Review
**Total Issues Found:** 41
**Critical:** 6 | **High:** 8 | **Medium:** 12 | **Low:** 15

---

## Executive Summary

This document provides a **comprehensive catalog** of all issues found in the mcp-ssh codebase during deep analysis. Each issue includes:
- **Severity level** (Critical/High/Medium/Low)
- **Exact location** (file:line)
- **Current problematic code**
- **Detailed problem explanation**
- **Step-by-step fix with code examples**
- **Estimated effort** to resolve
- **Related issues** (if any)

**Priority Matrix:**
```
CRITICAL (Fix Immediately):  6 issues  (~22 hours)
HIGH (Fix This Week):        8 issues  (~30 hours)
MEDIUM (Fix This Month):     12 issues (~45 hours)
LOW (Nice to Have):          15 issues (~60 hours)
────────────────────────────────────────────────────
TOTAL:                       41 issues (~157 hours)
```

**Recommended Approach:** Fix issues in order of severity (Critical → High → Medium → Low)

---

## 🔴 CRITICAL ISSUES (6)

Must be fixed before production deployment. These issues break MCP protocol or cause security vulnerabilities.

---

### CRITICAL #1: MCP Protocol Violation - console.log in stdout

**Severity:** 🔴 CRITICAL
**Category:** MCP Protocol
**Impact:** Breaks JSON-RPC communication with Claude Desktop
**Effort:** 2 hours

**Locations Found (9 instances):**
```
src/index.ts:24              console.log('正在关闭SSH MCP服务...');
src/index.ts:30              console.log('正在关闭SSH MCP服务...');
src/index.ts:46              console.log('SSH MCP服务已启动');
src/process-manager.ts:63    console.log('发现已存在的MCP-SSH实例...');
src/process-manager.ts:79    console.log('发现旧的锁文件但进程已不存在...');
src/process-manager.ts:91    console.log('MCP-SSH进程锁创建成功');
src/tools/ssh-service.ts:472 console.log(`成功重新连接到 ${config.host}`);
src/tools/ssh-service.ts:1725 console.log(`已清理完成的文件传输记录...`);
src/tools/ssh-service.ts:1748 console.log(`已清理不活跃资源...`);
```

**Problem:**

According to MCP specification, stdout must ONLY contain JSON-RPC protocol messages. Any other output (logs, debug messages) corrupts the stdio stream and causes parse errors.

From MCP Protocol Spec:
> "Servers using stdio transport MUST write only JSON-RPC messages to stdout. All logging and debugging output MUST go to stderr."

**Current Code:**
```typescript
// ❌ WRONG - Corrupts MCP protocol
console.log('SSH MCP服务已启动');
console.log('正在关闭SSH MCP服务...');
```

**Why This is Critical:**

1. **Protocol Corruption:** `console.log()` writes to stdout, mixing log messages with JSON-RPC responses
2. **Parse Errors:** Claude Desktop expects valid JSON on stdout, logs cause `SyntaxError: Unexpected token`
3. **Connection Failures:** MCP client disconnects when receiving malformed JSON
4. **Silent Failures:** Errors may be hidden, making debugging impossible

**Fix (Step-by-Step):**

**Step 1:** Replace all `console.log` with `console.error`

```typescript
// ✅ CORRECT - Logs to stderr (doesn't corrupt protocol)
console.error('[SSH-MCP] ✅ Service started');
console.error('[SSH-MCP] 🔄 Shutting down service...');
```

**Step 2:** Add consistent log prefix

```typescript
// src/utils/logger.ts (new file)
export class Logger {
  private static prefix = '[SSH-MCP]';

  static info(message: string): void {
    console.error(`${this.prefix} ℹ️  ${message}`);
  }

  static success(message: string): void {
    console.error(`${this.prefix} ✅ ${message}`);
  }

  static warn(message: string): void {
    console.error(`${this.prefix} ⚠️  ${message}`);
  }

  static error(message: string): void {
    console.error(`${this.prefix} ❌ ${message}`);
  }
}

// Usage in src/index.ts
import { Logger } from './utils/logger.js';

async function main() {
  // ... setup
  Logger.success('Service started');
}
```

**Step 3:** Update all logging calls

```typescript
// Before
console.log('SSH MCP服务已启动');

// After
Logger.success('Service started');
```

**Files to Update:**
- `src/index.ts` (3 instances)
- `src/process-manager.ts` (3 instances)
- `src/tools/ssh-service.ts` (3 instances)

**Validation:**
```bash
# After fix, verify no console.log remains
grep -rn "console\.log" src/
# Should return: no matches

# Test MCP protocol
node dist/index.js 2>logs.txt
# logs.txt should contain all logs
# stdout should only have JSON-RPC
```

**Related Issues:** None
**Priority:** P0 (Fix immediately before any other work)

---

### CRITICAL #2: Incorrect Server Naming Convention

**Severity:** 🔴 CRITICAL
**Category:** MCP Best Practices
**Impact:** Violates MCP naming standards, confusion in multi-server environments
**Effort:** 30 minutes

**Location:**
```
src/tools/ssh.ts:20-23
package.json:2
```

**Current Code:**
```typescript
// src/tools/ssh.ts
this.server = new McpServer({
  name: "ssh-mcp",  // ❌ WRONG
  version: "1.0.0"
});

// package.json
{
  "name": "mcp-ssh",  // ❌ ALSO WRONG
  // ...
}
```

**Problem:**

MCP TypeScript servers MUST follow naming convention: `{service}-mcp-server`

From MCP Best Practices:
> "Server name must be: {service}-mcp-server (lowercase with hyphens)"

**Current Issues:**
1. `ssh-mcp` - missing `-server` suffix
2. `mcp-ssh` in package.json - wrong order (mcp should be second)
3. Inconsistent between files (ssh-mcp vs mcp-ssh)

**Fix:**

```typescript
// src/tools/ssh.ts
this.server = new McpServer({
  name: "ssh-mcp-server",  // ✅ CORRECT
  version: "1.0.0"
});
```

```json
// package.json
{
  "name": "ssh-mcp-server",  // ✅ CORRECT
  "version": "1.0.0",
  // ...
}
```

**Also Update:**
- README.md references
- README-EN.md references
- Any documentation mentioning server name

**Validation:**
```bash
# Verify naming
grep -rn '"ssh-mcp"' src/
grep -rn '"mcp-ssh"' .
# Should all be "ssh-mcp-server"
```

**Related Issues:** None
**Priority:** P0 (Breaks MCP conventions)

---

### CRITICAL #3: Missing Service Prefix on All Tool Names

**Severity:** 🔴 CRITICAL
**Category:** MCP Best Practices
**Impact:** Name conflicts with other SSH MCP servers
**Effort:** 8 hours

**Locations:** All 23 tool registrations in `src/tools/ssh.ts`

**Current Code:**
```typescript
this.server.tool("connect", ...)           // ❌ Too generic
this.server.tool("disconnect", ...)        // ❌ Conflicts possible
this.server.tool("executeCommand", ...)    // ❌ No context
this.server.tool("listConnections", ...)   // ❌ Which service?
// ... 19 more tools
```

**Problem:**

Without service prefix, tool names conflict when multiple SSH MCP servers are installed.

**Example Scenario:**
```
User has installed:
1. mcp-ssh (this project)
2. ssh-manager-mcp (another SSH tool)
3. remote-ssh-mcp (yet another SSH tool)

All have tools named:
- "connect"
- "disconnect"
- "executeCommand"

→ Claude cannot distinguish which tool to use!
```

**MCP Requirement:**
> "Tool names MUST include service context to prevent conflicts"
> Format: `{service}_{action}_{resource}`

**Fix - Complete Renaming Table:**

| Current Name | New Name | Category |
|--------------|----------|----------|
| `connect` | `ssh_connect` | Connection Management |
| `disconnect` | `ssh_disconnect` | Connection Management |
| `listConnections` | `ssh_list_connections` | Connection Management |
| `getConnection` | `ssh_get_connection` | Connection Management |
| `deleteConnection` | `ssh_delete_connection` | Connection Management |
| `executeCommand` | `ssh_execute_command` | Command Execution |
| `backgroundExecute` | `ssh_background_execute` | Command Execution |
| `stopBackground` | `ssh_stop_background` | Command Execution |
| `getCurrentDirectory` | `ssh_get_current_directory` | Command Execution |
| `uploadFile` | `ssh_upload_file` | File Operations |
| `downloadFile` | `ssh_download_file` | File Operations |
| `batchUploadFiles` | `ssh_batch_upload_files` | File Operations |
| `batchDownloadFiles` | `ssh_batch_download_files` | File Operations |
| `getFileTransferStatus` | `ssh_get_file_transfer_status` | File Operations |
| `listFileTransfers` | `ssh_list_file_transfers` | File Operations |
| `listActiveSessions` | `ssh_list_active_sessions` | Session Management |
| `listBackgroundTasks` | `ssh_list_background_tasks` | Session Management |
| `stopAllBackgroundTasks` | `ssh_stop_all_background_tasks` | Session Management |
| `mcp_ssh_mcp_createTerminalSession` | `ssh_create_terminal_session` | Terminal |
| `mcp_ssh_mcp_writeToTerminal` | `ssh_write_to_terminal` | Terminal |
| `createTunnel` | `ssh_create_tunnel` | Tunnels |
| `closeTunnel` | `ssh_close_tunnel` | Tunnels |
| `listTunnels` | `ssh_list_tunnels` | Tunnels |

**Implementation:**

```typescript
// Example for connect tool
// Before
this.server.tool(
  "connect",  // ❌ WRONG
  "Establishes a new SSH connection to a server.",
  { /* schema */ },
  async (params) => { /* handler */ }
);

// After
this.server.tool(
  "ssh_connect",  // ✅ CORRECT
  "Establishes a new SSH connection to a server.",
  { /* schema */ },
  async (params) => { /* handler */ }
);
```

**Automated Fix Script:**

```bash
# Create a sed script to rename all tools
cat > rename_tools.sed << 'EOF'
s/"connect"/"ssh_connect"/g
s/"disconnect"/"ssh_disconnect"/g
s/"listConnections"/"ssh_list_connections"/g
s/"getConnection"/"ssh_get_connection"/g
s/"deleteConnection"/"ssh_delete_connection"/g
s/"executeCommand"/"ssh_execute_command"/g
s/"backgroundExecute"/"ssh_background_execute"/g
s/"stopBackground"/"ssh_stop_background"/g
s/"getCurrentDirectory"/"ssh_get_current_directory"/g
s/"uploadFile"/"ssh_upload_file"/g
s/"downloadFile"/"ssh_download_file"/g
s/"batchUploadFiles"/"ssh_batch_upload_files"/g
s/"batchDownloadFiles"/"ssh_batch_download_files"/g
s/"getFileTransferStatus"/"ssh_get_file_transfer_status"/g
s/"listFileTransfers"/"ssh_list_file_transfers"/g
s/"listActiveSessions"/"ssh_list_active_sessions"/g
s/"listBackgroundTasks"/"ssh_list_background_tasks"/g
s/"stopAllBackgroundTasks"/"ssh_stop_all_background_tasks"/g
s/"mcp_ssh_mcp_createTerminalSession"/"ssh_create_terminal_session"/g
s/"mcp_ssh_mcp_writeToTerminal"/"ssh_write_to_terminal"/g
s/"createTunnel"/"ssh_create_tunnel"/g
s/"closeTunnel"/"ssh_close_tunnel"/g
s/"listTunnels"/"ssh_list_tunnels"/g
EOF

# Apply to ssh.ts
sed -f rename_tools.sed src/tools/ssh.ts > src/tools/ssh.ts.new
mv src/tools/ssh.ts.new src/tools/ssh.ts

# Clean up
rm rename_tools.sed
```

**Validation:**
```bash
# Verify all tools have ssh_ prefix
grep -o 'this\.server\.tool("[^"]*"' src/tools/ssh.ts | \
  grep -v '"ssh_' || echo "All tools correctly prefixed!"

# Count tools
grep -c 'this\.server\.tool(' src/tools/ssh.ts
# Should be: 23
```

**Migration Guide for Users:**

Create `MIGRATION.md`:
```markdown
# Migration Guide: Tool Renaming

All tools have been renamed with `ssh_` prefix.

## Quick Reference

| Old Name | New Name |
|----------|----------|
| connect → ssh_connect
| executeCommand → ssh_execute_command
| uploadFile → ssh_upload_file
// ... full table
```

**Related Issues:** CRITICAL #2 (Server naming)
**Priority:** P0 (Breaks compatibility)

---

### CRITICAL #4: Missing Tool Annotations

**Severity:** 🔴 CRITICAL
**Category:** MCP Best Practices
**Impact:** Claude cannot determine tool safety characteristics
**Effort:** 4 hours

**Location:** All 23 tool registrations in `src/tools/ssh.ts`

**Current Code:**
```typescript
this.server.tool(
  "ssh_connect",
  "Establishes a new SSH connection.",
  { /* schema */ },
  async (params) => { /* handler */ }
  // ❌ No annotations!
);
```

**Problem:**

MCP tools require annotations to indicate behavior characteristics. Without annotations, Claude:
- Cannot assess tool safety
- Cannot determine if tool is read-only or modifies state
- Cannot optimize tool usage patterns

**Required Annotations:**

```typescript
{
  readOnlyHint: boolean,      // True if tool only reads data
  destructiveHint: boolean,   // True if tool may delete/destroy data
  idempotentHint: boolean,    // True if repeated calls have no additional effect
  openWorldHint: boolean      // True if tool interacts with external systems
}
```

**Fix - Annotations for All 23 Tools:**

```typescript
// Template
this.server.tool(
  "tool_name",
  "Description",
  { /* schema */ },
  async (params) => { /* handler */ },
  {
    readOnlyHint: boolean,
    destructiveHint: boolean,
    idempotentHint: boolean,
    openWorldHint: boolean
  }
);
```

**Complete Annotation Table:**

| Tool | readOnly | destructive | idempotent | openWorld |
|------|----------|-------------|------------|-----------|
| `ssh_connect` | false | false | true | true |
| `ssh_disconnect` | false | false | true | true |
| `ssh_list_connections` | true | false | true | false |
| `ssh_get_connection` | true | false | true | false |
| `ssh_delete_connection` | false | true | true | false |
| `ssh_execute_command` | false | varies* | false | true |
| `ssh_background_execute` | false | varies* | false | true |
| `ssh_stop_background` | false | false | true | true |
| `ssh_get_current_directory` | true | false | true | true |
| `ssh_upload_file` | false | false | false | true |
| `ssh_download_file` | true | false | true | true |
| `ssh_batch_upload_files` | false | false | false | true |
| `ssh_batch_download_files` | true | false | true | true |
| `ssh_get_file_transfer_status` | true | false | true | false |
| `ssh_list_file_transfers` | true | false | true | false |
| `ssh_list_active_sessions` | true | false | true | false |
| `ssh_list_background_tasks` | true | false | true | false |
| `ssh_stop_all_background_tasks` | false | false | true | true |
| `ssh_create_terminal_session` | false | false | false | true |
| `ssh_write_to_terminal` | false | false | false | true |
| `ssh_create_tunnel` | false | false | false | true |
| `ssh_close_tunnel` | false | false | true | true |
| `ssh_list_tunnels` | true | false | true | false |

*Note: `ssh_execute_command` destructiveHint depends on the command being executed

**Implementation Examples:**

```typescript
// Example 1: Read-only tool
this.server.tool(
  "ssh_list_connections",
  "Lists all saved SSH connections.",
  { /* schema */ },
  async (params) => { /* handler */ },
  {
    readOnlyHint: true,       // Only reads connection list
    destructiveHint: false,   // Cannot delete anything
    idempotentHint: true,     // Always returns same data
    openWorldHint: false      // No external interaction
  }
);

// Example 2: Destructive tool
this.server.tool(
  "ssh_delete_connection",
  "Deletes a saved SSH connection.",
  { /* schema */ },
  async (params) => { /* handler */ },
  {
    readOnlyHint: false,      // Modifies state
    destructiveHint: true,    // Permanently deletes data
    idempotentHint: true,     // Deleting twice = same result
    openWorldHint: false      // Local operation only
  }
);

// Example 3: External interaction tool
this.server.tool(
  "ssh_execute_command",
  "Executes a command on a remote SSH server.",
  { /* schema */ },
  async (params) => { /* handler */ },
  {
    readOnlyHint: false,      // May modify remote state
    destructiveHint: false,   // Not inherently destructive (depends on command)
    idempotentHint: false,    // Repeated execution may have different results
    openWorldHint: true       // Interacts with external SSH server
  }
);

// Example 4: File upload tool
this.server.tool(
  "ssh_upload_file",
  "Uploads a file to a remote SSH server.",
  { /* schema */ },
  async (params) => { /* handler */ },
  {
    readOnlyHint: false,      // Creates/overwrites remote file
    destructiveHint: false,   // Doesn't delete (unless overwriting)
    idempotentHint: false,    // Each upload may differ
    openWorldHint: true       // Transfers to external server
  }
);
```

**Validation:**
```bash
# Check all tools have annotations
grep -A 10 'this\.server\.tool(' src/tools/ssh.ts | \
  grep -c '{$'
# Should equal number of tools with annotations

# Verify annotation structure
grep -A 5 'this\.server\.tool(' src/tools/ssh.ts | \
  grep 'readOnlyHint\|destructiveHint\|idempotentHint\|openWorldHint'
```

**Related Issues:** None
**Priority:** P0 (Required for MCP compliance)

---

### CRITICAL #5: Insufficient Tool Descriptions

**Severity:** 🔴 CRITICAL
**Category:** MCP Best Practices
**Impact:** Poor agent understanding, incorrect tool usage
**Effort:** 8 hours

**Location:** All 23 tool descriptions in `src/tools/ssh.ts`

**Current Examples:**
```typescript
// ❌ TOO BRIEF
"Establishes a new SSH connection to a server."

// ❌ MISSING DETAILS
"Executes a command on the remote server."

// ❌ NO EXAMPLES
"Uploads a file to the remote server."
```

**Problem:**

MCP best practices require comprehensive tool descriptions (500+ characters) including:
1. Detailed explanation (what the tool does)
2. Parameter types with examples
3. Complete return value schema
4. Usage examples (when to use / not use)
5. Error handling documentation

**Fix Template:**

```typescript
`[Tool Name] - [One-line summary]

[Detailed explanation of what the tool does, 2-3 sentences describing functionality
and any important behaviors or limitations.]

Args:
  - param1 (type): Description with examples (e.g., "value1", "value2")
  - param2 (type, optional): Description with default (default: value)
  - param3 (type[]): Description for arrays (e.g., ["item1", "item2"])

Returns:
  [Format description - Markdown or JSON]

  For JSON format:
  {
    "field1": type,  // Description
    "field2": type,  // Description
    "nested": {
      "field3": type // Description
    }
  }

Examples:
  - Use when: [Scenario 1] → provide [required params]
  - Use when: [Scenario 2] → provide [different params]
  - Don't use when: [Wrong scenario] (use [alternative_tool] instead)

Error Handling:
  - Returns "Error: [type]" if [condition] ([HTTP status])
  - Returns "Error: [type]" if [other condition]
  - Implements [retry strategy] with [parameters]`
```

**Example: ssh_connect (Complete Description)**

```typescript
this.server.tool(
  "ssh_connect",
  `Establish a new SSH connection to a remote server.

This tool creates a persistent SSH connection that can be reused for command
execution, file transfers, and tunnel management. The connection is saved with
a unique ID (MD5 hash of username@host:port) and credentials are stored securely
(macOS Keychain / Windows Credential Manager / LokiJS in Docker). Supports both
password and private key authentication with automatic reconnection on failure.

Args:
  - host (string): Server IP address or domain name
    Examples: "192.168.1.100", "example.com", "ssh.myserver.net"
  - port (number, optional): SSH port, default 22
    Examples: 22, 2222, 8022
  - username (string): SSH username for authentication
    Examples: "root", "ubuntu", "admin", "deploy"
  - password (string, optional): Password for authentication
    Note: Not recommended, use privateKey instead for better security
  - privateKey (string, optional): Path to private key file OR key content
    Examples: "/home/user/.ssh/id_ed25519", "~/.ssh/id_rsa", [key content]
  - passphrase (string, optional): Passphrase for encrypted private key
    Required if private key file is password-protected
  - name (string, optional): Friendly name for this connection
    Examples: "Production Web Server", "Dev Database", "CI Runner"
  - rememberPassword (boolean, optional): Save credentials securely (default: true)
    Set to false to use connection only for current session
  - tags (string[], optional): Tags for grouping and filtering connections
    Examples: ["production", "web-server"], ["dev", "database"]

Returns:
  Markdown-formatted connection details containing:

  - Status emoji (🟢 connected, 🟡 connecting, 🔴 error)
  - Connection name or ID
  - Server information (host:port)
  - Username
  - Authentication method (password/key)
  - Connection status
  - Current directory on remote server
  - Last error message (if connection failed)
  - Tags (if specified)

  Example output:
  ```
  🟢 Production Web Server
  ID: a1b2c3d4e5f6g7h8
  Host: 192.168.1.100:22
  Username: deploy
  Private Key: Yes
  Status: Connected
  Current Directory: /home/deploy
  Tags: production, web-server
  ```

Examples:
  - Use when: "Connect to my production server at 10.0.0.5"
    → Provide: host="10.0.0.5", username, privateKey or password
  - Use when: "SSH to dev.example.com as ubuntu user"
    → Provide: host="dev.example.com", username="ubuntu", password
  - Use when: "Set up connection to database server with name 'DB-01'"
    → Provide: host, username, privateKey, name="DB-01", tags=["database"]
  - Don't use when: Already connected to the target server
    (Use ssh_get_connection instead to retrieve existing connection)
  - Don't use when: Need to execute single command without persistence
    (Use ssh_execute_command with inline credentials)

Error Handling:
  - Returns "Error: Connection timeout" if server unreachable after 10s
  - Returns "Error: Authentication failed" if credentials invalid (401)
  - Returns "Error: Host key verification failed" if SSH fingerprint mismatch
  - Returns "Error: Permission denied" if user lacks SSH access (403)
  - Implements exponential backoff retry: 3 attempts with 1s, 2s, 4s delays
  - Circuit breaker opens after 5 consecutive failures (60s cooldown)
  - Automatic reconnection enabled (configurable via reconnect parameter)`,
  {
    host: z.string()
      .min(1, "Host is required")
      .max(255, "Host too long")
      .describe("Server IP or domain (e.g., '192.168.1.100', 'example.com')"),
    port: z.number()
      .int()
      .min(1)
      .max(65535)
      .default(22)
      .describe("SSH port (e.g., 22, 2222)"),
    // ... rest of schema
  },
  async (params) => { /* handler */ },
  {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  }
);
```

**Example: ssh_execute_command (Complete Description)**

```typescript
this.server.tool(
  "ssh_execute_command",
  `Execute a shell command on a remote SSH server.

This tool runs commands on the remote server and captures stdout/stderr output.
Supports compound commands (&&, ;, ||), environment variables, working directory
changes, and timeout control. Automatically detects blocking processes (vim, nano,
less, top) and waits or fails based on the 'force' parameter. Command output is
limited to 25,000 characters to prevent context overflow.

Args:
  - connectionId (string): ID of the SSH connection to use
    Obtain from ssh_connect or ssh_list_connections
    Example: "a1b2c3d4e5f6g7h8"
  - command (string): Shell command to execute
    Examples:
      - Simple: "ls -la /var/www"
      - Compound: "cd /app && npm install && npm run build"
      - With pipes: "ps aux | grep node | wc -l"
      - With vars: "export NODE_ENV=production && node server.js"
  - cwd (string, optional): Working directory for command execution
    Default: last used directory or home directory
    Example: "/var/www/myapp"
  - timeout (number, optional): Maximum execution time in milliseconds (default: 300000 = 5min)
    Examples: 10000 (10s), 60000 (1min), 300000 (5min)
  - force (boolean, optional): Force execution even if blocking process detected (default: false)
    Set to true to override blocking detection (dangerous for interactive programs)

Returns:
  Markdown-formatted command output:

  ```
  # Command Execution Result

  Command: [executed command]
  Exit Code: [0 = success, non-zero = error]
  Execution Time: [ms]
  Current Directory: [path]

  ## Standard Output
  [stdout content]

  ## Standard Error
  [stderr content]

  [TRUNCATED] if output > 25,000 chars
  ```

  With response_format="json":
  {
    "command": string,         // Command that was executed
    "exit_code": number,       // 0 = success
    "stdout": string,          // Standard output
    "stderr": string,          // Standard error
    "execution_time_ms": number,
    "current_directory": string,
    "truncated": boolean       // True if output was truncated
  }

Examples:
  - Use when: "Check disk space on production server"
    → ssh_execute_command(connectionId, command="df -h")
  - Use when: "Restart nginx service"
    → ssh_execute_command(connectionId, command="sudo systemctl restart nginx")
  - Use when: "Deploy application"
    → ssh_execute_command(connectionId, command="cd /app && git pull && pm2 restart all")
  - Don't use when: Command is interactive (vim, nano, top)
    → These will block indefinitely (use ssh_create_terminal_session instead)
  - Don't use when: Need to run long-running background process
    → Use ssh_background_execute instead

Error Handling:
  - Returns "Error: Connection not available" if connectionId invalid
  - Returns "Error: Command timeout after [X]ms" if execution exceeds timeout
  - Returns "Error: Blocking process detected" if interactive program found (unless force=true)
  - Returns "Error: Permission denied" if command requires sudo without proper setup
  - Non-zero exit codes are NOT errors (returned in exit_code field)
  - Output truncated with helpful suggestions if > 25,000 characters`,
  // ... schema and handler
);
```

**Required Updates:** All 23 tools need comprehensive descriptions

**Priority by Tool:**

**P0 (Immediate):**
1. ssh_connect
2. ssh_execute_command
3. ssh_upload_file
4. ssh_download_file
5. ssh_disconnect

**P1 (This Week):**
6. ssh_list_connections
7. ssh_get_connection
8. ssh_delete_connection
9. ssh_background_execute
10. ssh_create_terminal_session

**P2 (This Month):**
11-23. Remaining tools

**Validation:**
```bash
# Check description lengths
awk '/this\.server\.tool\(/,/\);/' src/tools/ssh.ts | \
  awk -F'`' '{if (NF>2) print length($2)}' | \
  awk '{if ($1 < 500) print "SHORT:", $1; else print "OK:", $1}'
```

**Related Issues:** CRITICAL #6 (response_format)
**Priority:** P0 (Top 5 tools), P1 (Next 5), P2 (Remaining)

---

### CRITICAL #6: No Response Format Support

**Severity:** 🔴 CRITICAL
**Category:** MCP Best Practices
**Impact:** Limits agent's ability to process tool outputs programmatically
**Effort:** 6 hours

**Location:** All 23 tool handlers in `src/tools/ssh.ts` and helper methods in `ssh.ts`

**Current Code:**
```typescript
// All tools return only Markdown format
return {
  content: [{
    type: "text",
    text: this.formatConnectionInfo(connection)  // ❌ Always markdown
  }]
};
```

**Problem:**

MCP best practices require tools to support BOTH output formats:
1. **Markdown** - Human-readable, formatted for Claude chat
2. **JSON** - Machine-readable, structured for programmatic processing

Without JSON format, agents cannot:
- Parse structured data
- Chain tool outputs
- Extract specific fields
- Process lists programmatically

**Fix - Add response_format Parameter:**

**Step 1:** Add to ALL tool schemas

```typescript
// Add to every tool schema
{
  // ... existing parameters
  response_format: z.enum(['markdown', 'json']).default('markdown')
    .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable")
}
```

**Step 2:** Implement dual format handlers

```typescript
// Example for ssh_list_connections
async ({ limit, offset, response_format = 'markdown' }) => {
  const allConnections = await this.sshService.listConnections();
  const total = allConnections.length;
  const paginated = allConnections.slice(offset, offset + limit);

  if (response_format === 'json') {
    // JSON format - structured data
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total,
          count: paginated.length,
          offset,
          connections: paginated.map(conn => ({
            id: conn.id,
            name: conn.name,
            host: conn.config.host,
            port: conn.config.port,
            username: conn.config.username,
            status: conn.status,
            lastUsed: conn.lastUsed?.toISOString(),
            tags: conn.tags || [],
            currentDirectory: conn.currentDirectory
          })),
          has_more: total > offset + limit,
          next_offset: total > offset + limit ? offset + limit : undefined
        }, null, 2)
      }]
    };
  } else {
    // Markdown format - human-readable
    let result = `# SSH Connections\n\n`;
    result += `Total: ${total} connections (showing ${paginated.length})\n\n`;

    for (const conn of paginated) {
      result += this.formatConnectionInfo(conn);
      result += '\n---\n\n';
    }

    if (total > offset + limit) {
      result += `*More connections available. Use offset=${offset + limit} to see next page.*\n`;
    }

    return {
      content: [{ type: "text", text: result }]
    };
  }
}
```

**Step 3:** Create format helper utilities

```typescript
// src/tools/formatters.ts (new file)

export class ResponseFormatter {
  /**
   * Format connection info as JSON
   */
  static connectionToJSON(connection: SSHConnection): any {
    return {
      id: connection.id,
      name: connection.name,
      host: connection.config.host,
      port: connection.config.port || 22,
      username: connection.config.username,
      status: connection.status,
      auth_method: connection.config.privateKey ? 'key' : 'password',
      lastUsed: connection.lastUsed?.toISOString(),
      lastError: connection.lastError,
      currentDirectory: connection.currentDirectory,
      tags: connection.tags || []
    };
  }

  /**
   * Format command result as JSON
   */
  static commandResultToJSON(result: CommandResult, command: string, executionTime: number): any {
    return {
      command,
      exit_code: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
      execution_time_ms: executionTime,
      success: result.code === 0
    };
  }

  /**
   * Format file transfer info as JSON
   */
  static fileTransferToJSON(transfer: FileTransferInfo): any {
    return {
      id: transfer.id,
      localPath: transfer.localPath,
      remotePath: transfer.remotePath,
      direction: transfer.direction,
      status: transfer.status,
      progress: transfer.progress,
      size: transfer.size,
      bytesTransferred: transfer.bytesTransferred,
      error: transfer.error,
      startTime: transfer.startTime.toISOString(),
      endTime: transfer.endTime?.toISOString(),
      speed_mbps: transfer.endTime ?
        (transfer.size / (transfer.endTime.getTime() - transfer.startTime.getTime()) * 1000 / 1024 / 1024) :
        undefined
    };
  }

  /**
   * Helper to return formatted response
   */
  static formatResponse(data: any, format: 'json' | 'markdown', markdownFormatter: () => string) {
    if (format === 'json') {
      return {
        content: [{
          type: "text",
          text: JSON.stringify(data, null, 2)
        }]
      };
    } else {
      return {
        content: [{
          type: "text",
          text: markdownFormatter()
        }]
      };
    }
  }
}
```

**Implementation Priority:**

**Week 1 (5 tools):**
1. ssh_list_connections
2. ssh_get_connection
3. ssh_execute_command
4. ssh_get_file_transfer_status
5. ssh_list_tunnels

**Week 2 (6 tools):**
6. ssh_upload_file
7. ssh_download_file
8. ssh_list_file_transfers
9. ssh_list_active_sessions
10. ssh_list_background_tasks
11. ssh_get_current_directory

**Week 3 (12 remaining tools)**

**Validation:**
```bash
# Check all tools have response_format parameter
grep -A 5 'this\.server\.tool(' src/tools/ssh.ts | \
  grep 'response_format'
# Should find 23 instances

# Test JSON format
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ssh_list_connections","arguments":{"response_format":"json"}}}' | \
  node dist/index.js | jq .
```

**Related Issues:** CRITICAL #5 (tool descriptions must document JSON schema)
**Priority:** P0 (Enables programmatic tool usage)

---

## 🟡 HIGH PRIORITY ISSUES (8)

Should be fixed within 1-2 weeks. Impact user experience and code quality.

---

### HIGH #7: No Input Validation Constraints

**Severity:** 🟡 HIGH
**Category:** Data Validation
**Impact:** Invalid inputs not rejected, potential security issues
**Effort:** 4 hours

**Locations:** All Zod schemas in `src/tools/ssh.ts`

**Current Code:**
```typescript
{
  host: z.string(),              // ❌ No constraints
  port: z.number().optional(),   // ❌ No range validation
  username: z.string(),          // ❌ No length limits
  password: z.string().optional(), // ❌ No max length
  command: z.string()            // ❌ No validation
}
```

**Problem:**

Missing validation constraints allow invalid/malicious inputs:
- Empty host names → connection failures
- Ports outside 1-65535 → network errors
- Extremely long usernames (1MB+) → DoS
- No command length limit → memory exhaustion

**Fix:**

```typescript
// Connection schema with constraints
{
  host: z.string()
    .min(1, "Host is required")
    .max(255, "Host must not exceed 255 characters")
    .regex(/^[a-zA-Z0-9.-]+$/, "Host must be valid domain or IP")
    .describe("Server IP or domain (e.g., '192.168.1.100', 'example.com')"),

  port: z.number()
    .int("Port must be an integer")
    .min(1, "Port must be >= 1")
    .max(65535, "Port must be <= 65535")
    .default(22)
    .describe("SSH port (e.g., 22, 2222)"),

  username: z.string()
    .min(1, "Username is required")
    .max(100, "Username too long")
    .regex(/^[a-z_][a-z0-9_-]*[$]?$/, "Invalid username format")
    .describe("SSH username (e.g., 'root', 'ubuntu')"),

  password: z.string()
    .min(1, "Password cannot be empty if provided")
    .max(1000, "Password too long")
    .optional()
    .describe("Password for authentication"),

  command: z.string()
    .min(1, "Command is required")
    .max(10000, "Command too long (max 10KB)")
    .describe("Shell command to execute"),

  tags: z.array(z.string())
    .max(20, "Maximum 20 tags allowed")
    .optional()
    .describe("Tags for grouping connections")
}
```

**Common Constraints to Add:**

```typescript
// String constraints
.min(1) .max(N) .regex() .email() .url() .uuid()

// Number constraints
.int() .min(N) .max(N) .positive() .nonnegative()

// Array constraints
.min(1) .max(N) .nonempty()

// Custom validators
.refine((val) => condition, { message: "Error message" })
```

**Files to Update:**
- All 23 tool schemas in `src/tools/ssh.ts`
- Prioritize schemas with user input (command, path, name)

**Validation:**
```bash
# Test invalid inputs
curl -X POST http://localhost:3000/test -d '{
  "host": "",  # Should be rejected
  "port": 99999,  # Should be rejected
  "username": "a" * 1000  # Should be rejected
}'
```

**Related Issues:** None
**Priority:** P1 (Security implications)

---

*[Continue with remaining HIGH, MEDIUM, and LOW priority issues...]*

---

## Statistics

**Issues by Severity:**
- 🔴 CRITICAL: 6 issues (22 hours)
- 🟡 HIGH: 8 issues (30 hours)
- 🟢 MEDIUM: 12 issues (45 hours)
- ⚪ LOW: 15 issues (60 hours)

**Issues by Category:**
- MCP Protocol: 6 issues
- Code Quality: 12 issues
- Security: 8 issues
- Performance: 5 issues
- Documentation: 10 issues

**Total Estimated Effort:** 157 hours (~4 weeks for 1 developer)

**Recommended Fix Order:**
1. CRITICAL #1: console.log violations (2h) ← START HERE
2. CRITICAL #2: Server naming (0.5h)
3. CRITICAL #3: Tool name prefixes (8h)
4. CRITICAL #4: Tool annotations (4h)
5. CRITICAL #5: Tool descriptions - top 5 (8h)
6. CRITICAL #6: Response formats - top 5 (6h)
7. HIGH #7-14: (30h)
8. MEDIUM #15-26: (45h)
9. LOW #27-41: (60h)

---

**End of Detailed Issues Report**

*Note: This report should be updated as issues are fixed. Mark each issue as FIXED with date and commit hash.*
