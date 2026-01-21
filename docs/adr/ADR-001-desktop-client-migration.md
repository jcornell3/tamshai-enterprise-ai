# ADR-001: Desktop Client Migration (Electron → React Native → Flutter)

<!--
JSON-LD metadata for machine readability
-->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "name": "ADR-001: Desktop Client Migration",
  "headline": "Desktop Client Migration from Electron to React Native to Flutter",
  "description": "Documents the journey of desktop/mobile client development through three technology pivots due to OAuth authentication issues",
  "datePublished": "2026-01-21",
  "dateModified": "2026-01-21",
  "keywords": ["electron", "react-native", "flutter", "dart", "oauth", "desktop", "migration", "pivot"],
  "learningResourceType": "failure-analysis",
  "articleSection": "Architecture Decision Record",
  "isPartOf": {
    "@type": "CreativeWork",
    "name": "Tamshai Project Journey"
  },
  "about": [
    { "@type": "SoftwareApplication", "name": "Electron" },
    { "@type": "SoftwareApplication", "name": "React Native" },
    { "@type": "SoftwareApplication", "name": "Flutter" }
  ],
  "author": {
    "@type": "Organization",
    "name": "Tamshai Corp"
  }
}
</script>

## Status

**Accepted** (January 2026)

## Context

The Tamshai Enterprise AI system required a desktop client application for Windows (and potentially macOS/Linux) that could:

1. Authenticate users via Keycloak OIDC/PKCE flow
2. Provide a native-feeling chat interface for AI interactions
3. Handle SSE streaming responses from the MCP Gateway
4. Support secure token storage

Three different technologies were evaluated and attempted before finding a stable solution.

## Decision Journey

### Attempt 1: Electron (October 2025)

**Choice**: Electron was initially selected for its mature ecosystem and web technology familiarity.

**Outcome**: **Abandoned**

**Failure Reason**: OAuth authentication issues prevented successful implementation. The OAuth flow could not be reliably completed within the Electron environment.

**Lessons Learned**:
- Electron's webview handling of OAuth redirects was problematic
- The complexity of managing OAuth state in a hybrid web/native environment was underestimated

### Attempt 2: React Native (November 2025)

**Choice**: React Native was selected as an alternative, offering native compilation while maintaining JavaScript/TypeScript familiarity.

**Outcome**: **Abandoned**

**Failure Reason**: Null pointer references in the OAuth library when building with Visual Studio 2022. The underlying React Native OAuth libraries had unresolved bugs that made OAuth flows unreliable on Windows.

**Specific Issues**:
- Null pointer exceptions during OAuth token exchange
- VS2022 build toolchain compatibility issues with native modules
- Library maintainers had not addressed Windows-specific OAuth bugs

**Lessons Learned**:
- React Native's Windows support was less mature than anticipated
- OAuth library ecosystem for React Native Windows was fragile
- Build toolchain compatibility (VS2022) introduced unexpected failures

### Attempt 3: Flutter/Dart (December 2025)

**Choice**: Flutter was selected for its native compilation, single codebase approach, and reportedly stable Windows support.

**Outcome**: **Success**

**Why It Worked**:
- Flutter's `flutter_appauth` package provided stable OAuth/OIDC support
- Native compilation eliminated JavaScript bridge issues
- Single Dart codebase simplified maintenance
- Mature Windows platform support
- Smaller bundle size (~25MB vs React Native's 80MB+)

## Consequences

### Positive

- Stable OAuth authentication on Windows
- Single codebase for desktop (Windows, macOS, Linux) and mobile (iOS, Android)
- Excellent performance with native compilation
- Active Flutter community and Google support
- Smaller application bundle size

### Negative

- Team needed to learn Dart (new language)
- Fewer third-party packages compared to React Native ecosystem
- Two months of development time lost on failed approaches
- Some Flutter packages less mature than React Native equivalents

### Neutral

- Different state management patterns (Provider/Riverpod vs Redux)
- Different testing frameworks and tooling
- Build pipeline changes required

## Timeline

```
Oct 2025          Nov 2025              Dec 2025           Jan 2026
    │                 │                     │                  │
 Electron         React Native          Flutter/Dart       Production
 (abandoned)      (abandoned)           (adopted)          (Windows v1.4)
    │                 │                     │                  │
    └── OAuth         └── Null pointer     └── Success!       └── Stable
        issues            refs in OAuth
                          lib (VS2022)
```

## References

- `.specify/specs/009-flutter-unified/` - Flutter implementation specifications
- `docs/development/REACT_NATIVE_TO_FLUTTER_MIGRATION.md` - Migration documentation
- `clients/unified_flutter/` - Final Flutter implementation
- `CLAUDE.md` - Flutter development commands and setup

## Related Decisions

- ADR-003: Nginx to Caddy Migration (also driven by authentication complexity)

---

*This ADR is part of the Tamshai Project Journey - documenting not just what we built, but what didn't work and why.*
