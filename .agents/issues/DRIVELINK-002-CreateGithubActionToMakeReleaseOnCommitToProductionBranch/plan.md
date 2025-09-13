# DRIVELINK-002: GitHub Actions Release Workflow Plan

## Pattern Discovery Results

### Existing Infrastructure
- **Semver Action**: `.github/actions/semver-js/` - Custom semver action for version management
- **Build System**: `scripts/build.js` - Local build orchestrator with version management
- **Release System**: `scripts/release.js` - Local release packaging script
- **Version Source**: `version.txt` - Single source of truth for versioning

### Project Patterns
- **Build Commands**: `npm run build:local` (production), `npm run build:dev` (development)
- **Release Commands**: `npm run release` (full), `npm run release:skip-build` (package only)
- **Version Management**: File-based versioning with semver action integration
- **Artifacts**: ZIP packages, checksums, release notes generation

## Implementation Plan

### Phase 1: Workflow Structure
Create `.github/workflows/release.yml` with:
- Trigger on push to `main` branch
- Node.js environment setup
- Dependency installation

### Phase 2: Version Detection & Validation
- Use existing semver action to get version info
- Validate that version has changed (prevent duplicate releases)
- Extract version metadata (tag, SHA, build date)

### Phase 3: Build & Package
- Execute production build using `npm run build:local`
- Run release packaging using `npm run release:skip-build`
- Generate artifacts (ZIP, checksums, release notes)

### Phase 4: GitHub Release Creation
- Create Git tag with version number
- Create GitHub release with generated artifacts
- Upload ZIP file and checksums
- Use auto-generated release notes

### Phase 5: Safety & Validation
- Only run on version changes
- Validate build success before release
- Handle errors gracefully
- Skip if no manifest.json changes detected

## File Structure
```
.github/
└── workflows/
    └── release.yml          # Main release workflow

.agents/issues/DRIVELINK-002-*/
├── plan.md                  # This file
├── state.json              # Progress tracking
└── issue.md               # Issue definition
```

## Integration Points
- **Existing semver action**: Reuse for version detection
- **Build system**: Use npm run build:local
- **Release system**: Use npm run release:skip-build
- **Version file**: Read from version.txt via semver action

## Success Criteria
- Automatic releases on main branch version changes
- Proper GitHub releases with artifacts
- Integration with existing build/release tools
- No duplicate releases for same version