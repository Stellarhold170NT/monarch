---
name: vc:spring-boot-4-upgrade
description: This skill should be used when the user asks to "upgrade Spring Boot 3 to 4", "migrate Spring Boot 3.x project to 4.x", "nâng cấp dự án Spring Boot 3.x lên 4.x", or needs a developer-role workflow for Spring Boot 4 migration planning, implementation, and verification.
version: 0.1.0
---

# Spring Boot 4 Upgrade — Developer Role

Use this skill to help a developer migrate an existing Spring Boot 3.x application to Spring Boot 4.x safely. The skill favors incremental upgrades, evidence-backed dependency changes, and verification over broad refactors.

## Core Principles

- Upgrade to the latest Spring Boot 3.5.x line first, then move to 4.x.
- Treat the migration as a compatibility project, not a feature rewrite.
- Read the official Spring Boot 4 migration guide and configuration changelog before changing build files.
- Keep `spring-boot-properties-migrator` and classic test starters temporary only.
- Verify runtime behavior with startup, integration, security, serialization, HTTP client, persistence, and actuator checks.

## Workflow Routing

| User intent | Load |
|---|---|
| Assess whether an app is ready for Boot 4 | `./references/upgrade-checklist.md` |
| Execute an upgrade plan | `./workflows/upgrade-spring-boot-3-to-4.md` then `./references/upgrade-checklist.md` |
| Debug migration failures | `./references/upgrade-checklist.md`, then inspect failing stack traces and changed dependencies |

## Required Intake

Before proposing changes, capture:

1. Current Spring Boot version and target 4.x version.
2. Java version, Maven/Gradle version, Kotlin version if present, and whether native image is used.
3. Web stack: MVC, WebFlux, Servlet container, Undertow/Tomcat/Jetty.
4. Data stack: JPA, JDBC, Flyway/Liquibase, Spring Data modules.
5. Security stack: Spring Security version, OAuth2/resource server/client usage.
6. Test stack: JUnit, Spock, Testcontainers, Spring Boot test starters.
7. Deployment model: jar, container image, buildpack, Kubernetes, fully executable jar script.

## Must Do

- Build an inventory before editing dependencies.
- Remove deprecated Boot 3 APIs and properties before relying on Boot 4 behavior.
- Prefer small commits or checkpoints: build baseline, dependency upgrade, config migration, source migration, test migration.
- Run dependency insight commands after changing BOMs or starters.
- Document every temporary bridge that must be removed before final handoff.

## Must Not Do

- Do not upgrade straight from an old 3.x version to 4.x when 3.5.x baseline work is missing.
- Do not leave the properties migrator, classic test starters, or compatibility-only dependencies in the final state.
- Do not promise Boot 3 and Boot 4 compatibility from the same shared starter artifact unless explicitly designed and tested.
- Do not ignore removed support such as Undertow, Pulsar reactive, Spock integration, or fully executable launch scripts.
- Do not suppress Java/Kotlin type or nullability errors to pass the build.

## Primary Sources

- Spring Boot 4.0 Migration Guide: https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide
- Spring Boot 4.0 Configuration Changelog: https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Configuration-Changelog
- Spring Boot System Requirements: https://docs.spring.io/spring-boot/system-requirements.html
