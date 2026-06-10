# Spring Boot 3.x to 4.x Upgrade Checklist

Use this checklist as the migration risk register.

## Official References

- Spring Boot 4.0 Migration Guide: https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide
- Spring Boot 4.0 Configuration Changelog: https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Configuration-Changelog
- Spring Boot System Requirements: https://docs.spring.io/spring-boot/system-requirements.html

## Required Baselines

- Spring Boot source baseline should be latest 3.5.x before attempting 4.x.
- Java runtime/toolchain: 17+.
- Maven: 3.6.3+.
- Gradle: 8.14+ or 9.x.
- Kotlin: 2.2+ when Kotlin is used.
- GraalVM native-image: 25+ when native images are used.
- Spring Framework: 7.x through Boot 4 dependency management.
- Servlet/Jakarta stack: Jakarta EE 11 / Servlet 6.1 compatible dependencies.

## Dependency Inventory

Check for:

- Explicit Spring Framework, Spring Security, Spring Data, Reactor, Jackson, Hibernate, Micrometer, Tomcat, Jetty, Netty versions.
- Spring Cloud release train compatibility.
- Third-party starters that may pin Boot 3 internals.
- Internal shared starters that need a separate Boot 4 build.
- Annotation processors and codegen plugins.
- Test-only dependencies that still assume Boot 3 test starter behavior.

## Removed or High-Risk Features

- Undertow support removed.
- Pulsar reactive support removed.
- Fully executable launch scripts removed.
- Spock integration removed.
- Some starters are renamed, split, or replaced by more modular alternatives.
- Boot internals and integration extension points may have package moves.
- JSpecify nullability can surface Java/Kotlin type issues.
- `PropertyMapper` null handling changed.
- Logging charset defaults changed.

## Configuration Review

Use the configuration changelog to inspect:

- HTTP client properties.
- Actuator and observability properties.
- Error handling properties.
- Session properties.
- Jackson-related properties.
- Deprecated keys that were accepted in Boot 3.x but removed or renamed in Boot 4.x.

Allowed temporary bridge:

- `spring-boot-properties-migrator` for discovery only.

Required final state:

- Migrator removed.
- All renamed properties updated in committed config.
- No unexplained startup migration warnings.

## Source Review Hotspots

- Custom auto-configuration.
- `EnvironmentPostProcessor` implementations.
- `BootstrapRegistry` usage.
- Security filter chains and OAuth2 configuration.
- MVC/WebFlux configuration classes.
- JSON serialization customizers.
- Data repositories and transaction configuration.
- Actuator endpoint customizations.
- Native image hints.

## Test Migration

- Prefer technology-specific `*-test` starters for Boot 4.
- Use classic test starters only as a temporary compatibility bridge.
- Replace Spock integration if present.
- Keep test slices meaningful: MVC, WebFlux, Data JPA/JDBC, JSON, security, actuator.

## Verification Evidence

Collect:

- Build command and exit code.
- Test command and exit code.
- App startup logs for each profile.
- Dependency tree or dependency insight output after BOM change.
- Config migration findings and resolution notes.
- Smoke test results for the deployed artifact or container.

## Anti-Patterns to Block

- Skipping the latest 3.5.x baseline.
- Mixing Boot 3 and Boot 4 compatibility in one artifact without explicit design.
- Keeping temporary migrators or classic starter bridges after final verification.
- Suppressing compiler, nullability, or test failures.
- Updating only the Spring Boot version while leaving incompatible plugins, Java images, Spring Cloud, or third-party starters unchanged.
