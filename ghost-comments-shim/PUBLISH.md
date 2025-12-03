# Publishing to npm

This guide explains how to publish the Ghost Comments Shim to npm.

## Prerequisites

1. **npm account**: Create one at https://www.npmjs.com/signup if you don't have one
2. **npm CLI**: Ensure you're logged in:
   ```bash
   npm login
   ```

3. **Package name availability**: Check if `@ghost-atproto/comments-shim` is available:
   ```bash
   npm search @ghost-atproto/comments-shim
   ```

## Pre-publish Checklist

1. **Update version in package.json**
   ```bash
   # For patch releases (bug fixes)
   npm version patch

   # For minor releases (new features)
   npm version minor

   # For major releases (breaking changes)
   npm version major
   ```

2. **Ensure tests pass**
   ```bash
   npm test
   ```

3. **Build the package**
   ```bash
   npm run build
   ```

4. **Verify package contents**
   ```bash
   npm pack --dry-run
   ```

   This will show what files will be included in the package. Ensure:
   - `dist/` directory is included
   - `.env` is NOT included (verify .npmignore or .gitignore)
   - `node_modules/` is NOT included

5. **Test local installation**
   ```bash
   npm pack
   npm install -g ./ghost-atproto-comments-shim-*.tgz
   ```

## Publishing Steps

### First-time Setup (Organization Package)

If publishing under the `@ghost-atproto` organization:

1. **Create the organization on npm** (if not exists)
   - Go to https://www.npmjs.com/org/create
   - Create organization: `ghost-atproto`

2. **Set access to public** (scoped packages are private by default)
   ```bash
   npm publish --access public
   ```

### Standard Publishing

1. **Clean and rebuild**
   ```bash
   npm run build
   ```

2. **Publish to npm**
   ```bash
   npm publish
   ```

3. **Verify the package**
   ```bash
   npm view @ghost-atproto/comments-shim
   ```

4. **Test installation**
   ```bash
   npm install -g @ghost-atproto/comments-shim
   ```

## Post-publish Steps

1. **Tag the release in git**
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

2. **Create GitHub release**
   - Go to GitHub → Releases → Create new release
   - Use the version tag (e.g., `v0.1.0`)
   - Document changes and new features

3. **Update documentation**
   - Update INSTALL.md with new version number
   - Update main README.md with any new features
   - Update CHANGELOG.md

## Version Guidelines

Follow Semantic Versioning (semver):

- **MAJOR** (1.0.0): Breaking changes
  - Changed API endpoints
  - Changed environment variable names
  - Changed database schema
  - Removed features

- **MINOR** (0.1.0): New features, backwards compatible
  - New optional environment variables
  - New endpoints
  - Performance improvements
  - New features

- **PATCH** (0.0.1): Bug fixes, backwards compatible
  - Security patches
  - Bug fixes
  - Documentation updates
  - Dependency updates

## Package.json Configuration

Ensure these fields are set correctly:

```json
{
  "name": "@ghost-atproto/comments-shim",
  "version": "0.1.0",
  "description": "Lightweight shim service to inject Bluesky comments into Ghost's native comments system",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "ghost-comments-shim": "dist/index.js"
  },
  "files": [
    "dist/**/*",
    "README.md",
    "LICENSE",
    ".env.example"
  ],
  "keywords": [
    "ghost",
    "bluesky",
    "atproto",
    "comments",
    "bridge"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/your-org/ghost-atproto.git",
    "directory": "ghost-comments-shim"
  },
  "bugs": {
    "url": "https://github.com/your-org/ghost-atproto/issues"
  },
  "homepage": "https://github.com/your-org/ghost-atproto#readme"
}
```

## npm Scripts

Useful scripts for package management:

```bash
# Check what will be published
npm pack --dry-run

# Publish with tag (for beta versions)
npm publish --tag beta

# Deprecate a version
npm deprecate @ghost-atproto/comments-shim@0.0.1 "Security vulnerability, please upgrade"

# Unpublish (only within 72 hours, use sparingly)
npm unpublish @ghost-atproto/comments-shim@0.0.1
```

## Beta/Pre-release Versions

For testing before stable release:

1. **Version with pre-release tag**
   ```bash
   npm version 0.1.0-beta.1
   ```

2. **Publish with beta tag**
   ```bash
   npm publish --tag beta
   ```

3. **Install beta version**
   ```bash
   npm install @ghost-atproto/comments-shim@beta
   ```

4. **Promote beta to latest**
   ```bash
   npm dist-tag add @ghost-atproto/comments-shim@0.1.0 latest
   ```

## Troubleshooting

### Error: "You do not have permission to publish"

- Verify you're logged in: `npm whoami`
- Verify you have access to the organization: `npm org ls ghost-atproto`
- Add yourself to the org: `npm org add ghost-atproto <username>`

### Error: "Package name already exists"

- Choose a different package name or namespace
- Or contact the current owner to transfer ownership

### Files missing from package

- Check `.npmignore` or `.gitignore`
- Use `files` field in package.json to explicitly include
- Test with `npm pack --dry-run`

## Security Considerations

1. **Never commit `.npmrc` with auth tokens**
2. **Use npm 2FA** for publishing:
   ```bash
   npm profile enable-2fa auth-and-writes
   ```

3. **Audit dependencies before publishing**
   ```bash
   npm audit
   npm audit fix
   ```

4. **Sign commits and tags**
   ```bash
   git tag -s v0.1.0 -m "Version 0.1.0"
   ```

## Maintenance

### Regular Updates

- Update dependencies monthly: `npm update`
- Check for security vulnerabilities: `npm audit`
- Test with latest Node.js LTS versions
- Update TypeScript and build tools

### Deprecation

If a version needs to be deprecated:

```bash
npm deprecate @ghost-atproto/comments-shim@0.0.1 "Reason for deprecation"
```

## Resources

- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Semantic Versioning](https://semver.org/)
- [npm Organizations](https://docs.npmjs.com/organizations)
