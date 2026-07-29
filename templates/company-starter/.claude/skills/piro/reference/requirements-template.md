# requirements.md template (as Kiro actually uses it)

The structure below is fixed. Headings stay in English. See [ears.md](ears.md) for how to write EARS.

## Structure

```markdown
# Requirements Document

## Introduction

[The background, purpose and scope of the feature, in 1-3 paragraphs of prose. Write why you're building it and what it solves]

## Glossary

- **<entity name>**: <definition. Define here every proper noun used as the subject of THE in EARS>
- **<entity name>**: <definition>

## Requirements

### Requirement 1: <title of the requirement>

**User Story:** As a <role>, I want <feature>, so that <benefit>.

#### Acceptance Criteria

1. <EARS statement>
2. <EARS statement>

### Requirement 2: <title of the requirement>

(and so on, in the same shape)
```

## Conventions

- The pair of Requirement number (N) and acceptance criterion number (M), N.M, is the reference key from tasks.md.
  Don't leave gaps or duplicates
- The User Story is one line and must contain all three elements "As a / I want / so that" (the body may be in
  your own language, but keep those three keywords in English)
- Don't use a proper noun as the subject of an EARS statement unless it's in the Glossary
- Rough number of requirements: 3-6 for a small feature, 6-12 for a medium one. 2-7 acceptance criteria per Requirement
- Raise non-functional requirements relevant to the feature (performance, logging, error handling) as Requirements too
- Always write abnormal cases as IF ... THEN Unwanted behavior, either within the same Requirement as the normal case
  or as a separate Requirement (Error Handling)
