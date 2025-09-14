# DRIVELINK-005: Update Plugin to Use Data from SimpleToken

## Issue Overview
**Goal**: Integrate DriveLink plugin with SimpleToken CLI for seamless token management
**Scope**: Update plugin settings, authentication flow, and token storage integration
**Constraints**: Maintain backward compatibility with existing manual token entry, ensure security standards
**Success Criteria**: Plugin automatically uses SimpleToken-generated credentials with seamless user experience

## Project Pattern Analysis

### Existing Architecture
- **Token Management**: `src/auth/token-manager.ts` - handles OAuth flow and token storage
- **Settings UI**: `src/settings.ts` - configures OAuth credentials and connection status
- **OAuth Flow**: `src/auth/oauth.ts` - handles Google OAuth 2.0 flow
- **Plugin Storage**: Uses Obsidian's plugin data storage (encrypted)

### SimpleToken CLI Integration Points
- **Credential Storage**: `~/.drivelink/credentials.json` (obfuscated)
- **Token Storage**: `~/.drivelink/tokens.json` (obfuscated)
- **Data Format**: JSON with access_token, refresh_token, expires_in, etc.
- **CLI Tool**: `scripts/simple-token.js` with credential manager

### Code Patterns Identified
- **Error Handling**: Try-catch with user-friendly error messages
- **Settings Structure**: Obsidian Setting components with validation
- **Async Operations**: Promise-based with proper error propagation
- **Storage**: Secure plugin data storage with JSON serialization
- **UI Updates**: Dynamic settings refresh on state changes

## Implementation Plan

### Phase 1: SimpleToken Bridge Module
**File**: `src/auth/simple-token-bridge.ts`
**Purpose**: Interface between plugin and SimpleToken CLI storage
**Dependencies**: Node.js fs, path, os modules
**Priority**: 1

**Features**:
- Detect SimpleToken CLI installation and storage
- Read SimpleToken credentials and tokens
- Validate token expiry and refresh needs
- Convert SimpleToken format to plugin format
- Handle cross-platform file system access

### Phase 2: Enhanced Token Manager
**File**: `src/auth/token-manager.ts` (enhancement)
**Purpose**: Extend existing TokenManager with SimpleToken integration
**Dependencies**: SimpleTokenBridge
**Priority**: 2

**Features**:
- Auto-detect SimpleToken credentials on initialization
- Fallback hierarchy: SimpleToken → Manual → OAuth flow
- Seamless token refresh using SimpleToken stored refresh tokens
- Maintain backward compatibility with existing token storage

### Phase 3: Settings UI Enhancement
**File**: `src/settings.ts` (enhancement)
**Purpose**: Add SimpleToken integration UI and status
**Dependencies**: Enhanced TokenManager
**Priority**: 3

**Features**:
- SimpleToken CLI detection and status display
- One-click SimpleToken credential import
- Automatic setup wizard for new users
- Debug information for troubleshooting
- Settings migration from manual to SimpleToken

### Phase 4: CLI Integration Utilities
**File**: `src/utils/cli-integration.ts`
**Purpose**: Utilities for CLI tool integration and validation
**Dependencies**: Node.js child_process
**Priority**: 4

**Features**:
- Detect SimpleToken CLI installation
- Execute CLI commands from plugin (optional)
- Validate CLI tool version compatibility
- Cross-platform compatibility helpers

## File Creation Order

1. **`src/auth/simple-token-bridge.ts`** - Core integration logic
2. **`src/utils/cli-integration.ts`** - CLI detection utilities
3. **`src/auth/token-manager.ts`** - Enhance existing token manager
4. **`src/settings.ts`** - Enhance existing settings UI

## Integration Strategy

### Data Flow
```
SimpleToken CLI (~/.drivelink/) → SimpleTokenBridge → TokenManager → DriveLink Plugin
```

### Fallback Hierarchy
1. **Primary**: SimpleToken CLI generated tokens (auto-detected)
2. **Secondary**: Manually entered OAuth credentials (existing)
3. **Tertiary**: Direct OAuth flow (existing)

### Security Considerations
- Validate SimpleToken storage permissions
- Ensure secure cross-process data access
- Maintain plugin data encryption standards
- Handle token refresh securely

### Backward Compatibility
- Existing manual token entry continues to work
- Existing stored tokens remain valid
- Settings migration is optional and non-destructive
- No breaking changes to existing APIs

## Success Metrics
- [ ] SimpleToken credentials auto-detected on plugin load
- [ ] Seamless token refresh without user intervention
- [ ] Settings UI shows SimpleToken integration status
- [ ] Zero-configuration setup for users with SimpleToken CLI
- [ ] Existing manual setup continues to work unchanged
- [ ] Cross-platform compatibility (Windows, macOS, Linux)

## Files to Create/Modify

### New Files
1. `src/auth/simple-token-bridge.ts` - SimpleToken CLI integration
2. `src/utils/cli-integration.ts` - CLI detection and utilities

### Modified Files
1. `src/auth/token-manager.ts` - Add SimpleToken integration
2. `src/settings.ts` - Add SimpleToken UI components

### Test Files (Future)
1. `src/auth/__tests__/simple-token-bridge.test.ts`
2. `src/auth/__tests__/token-manager.test.ts` (enhanced)
3. `src/utils/__tests__/cli-integration.test.ts`

## Implementation Approach

### Development Strategy
- **Incremental Integration**: Add SimpleToken support without disrupting existing functionality
- **Feature Flags**: Enable/disable SimpleToken integration during development
- **Graceful Degradation**: Fall back to manual setup if SimpleToken unavailable
- **User Experience**: Seamless and transparent integration

### Testing Strategy
- **Unit Tests**: Each module tested independently
- **Integration Tests**: End-to-end SimpleToken → Plugin flow
- **Cross-platform Tests**: Windows/macOS/Linux compatibility
- **Regression Tests**: Ensure existing functionality unchanged