# Upgrade Spring Boot 3.x to 4.x Workflow

Follow this workflow when the user wants implementation help for a Spring Boot 4 migration.

## Phase 1 — Baseline and Inventory

1. Read build files: `pom.xml`, `build.gradle`, `build.gradle.kts`, `settings.gradle*`, Maven wrapper, Gradle wrapper.
2. Record current versions: Spring Boot, Spring Framework overrides, Java toolchain, Kotlin, Maven/Gradle, Spring Cloud, Testcontainers, plugins.
3. Identify removed or high-risk usage:
   - Undertow
   - Pulsar reactive
   - fully executable jar launch scripts
   - Spock Boot integration
   - custom Boot internals such as environment post-processors, bootstrap registry, auto-configuration imports
4. Run the existing verification baseline before changes.

## Phase 2 — Land on Latest 3.5.x

1. Upgrade to latest compatible Spring Boot 3.5.x first.
2. Remove deprecations and warnings that Boot 4 will turn into failures.
3. Replace removed or renamed configuration while still on Boot 3.5.x where possible.
4. Commit or checkpoint the clean 3.5.x baseline before moving to 4.x.

## Phase 3 — Upgrade Platform and Dependency Management

1. Set Java to 17+ and verify CI/runtime images match.
2. Verify build tools meet Boot 4 requirements: Maven 3.6.3+ or Gradle 8.14+/9.x.
3. Move dependency management to the Spring Boot 4.x BOM/plugin.
4. Remove explicit versions that fight the Boot BOM unless they are intentionally pinned and verified.
5. Check Spring Cloud compatibility separately; do not assume an older Spring Cloud release supports Boot 4.

## Phase 4 — Migrate Code and Configuration

1. Apply configuration changelog changes deliberately; use `spring-boot-properties-migrator` only to discover missing property migrations.
2. Update package moves and Boot integration types.
3. Address JSpecify/nullability fallout instead of suppressing type checks.
4. Replace removed starters/features with supported alternatives.
5. Update test dependencies to technology-specific `*-test` starters where appropriate.

## Phase 5 — Verification Gates

Run verification in this order:

1. Compile/package.
2. Unit tests.
3. Spring context startup tests for each profile.
4. Integration tests with real database/container dependencies.
5. Security flows: login, token validation, authorization, CSRF/CORS if applicable.
6. HTTP client/server behavior: timeouts, headers, serialization, error responses.
7. Persistence and migrations: schema validation, Flyway/Liquibase, transactional behavior.
8. Actuator/observability endpoints and logging behavior.
9. Container image or deployment smoke test.

## Phase 6 — Cleanup and Handoff

1. Remove temporary migrator dependencies and classic starter bridges.
2. Remove dead compatibility code.
3. Update README, deployment notes, and CI version matrix.
4. Produce a migration report with changed files, dependency moves, removed features, verification evidence, and remaining risks.

## Stop Conditions

Stop and ask for a plan revision when:

- The app depends on Undertow or another removed feature with no approved replacement.
- Spring Cloud or another platform dependency has no Boot 4-compatible release.
- Tests fail in a security, persistence, or serialization path and the root cause is unclear.
- The migration requires behavior changes beyond compatibility work.
