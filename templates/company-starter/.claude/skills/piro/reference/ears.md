# EARS format reference (as Kiro actually uses it)

EARS (Easy Approach to Requirements Syntax) is a constrained syntax for writing acceptance criteria.
Kiro's requirements.md writes acceptance criteria in this format.

## The patterns

| # | Pattern | Form | When to use it |
|---|---|---|---|
| 1 | Ubiquitous (always) | THE <entity> SHALL <behaviour> | Properties and constraints that always hold |
| 2 | Event-driven | WHEN <event>, THE <entity> SHALL <behaviour> | Responses to a trigger |
| 3 | Unwanted behavior | IF <undesirable condition>, THEN THE <entity> SHALL <behaviour> | Errors and abnormal cases |
| 4 | State-driven | WHILE <state>, THE <entity> SHALL <behaviour> | Behaviour for as long as a state persists |
| 5 | Optional feature | WHERE <feature is enabled>, THE <entity> SHALL <behaviour> | Dependent on configuration or an option |
| 6 | Iteration | FOR EACH <target>, THE <entity> SHALL <behaviour> | Repetition per target |
| 7 | Regression prevention | WHEN <condition>, THE <entity> SHALL CONTINUE TO <existing behaviour> | A guarantee that existing behaviour isn't broken |

## Formatting conventions

- Keywords (WHEN / IF / THEN / WHILE / WHERE / FOR EACH / THE / SHALL / SHALL CONTINUE TO) stay in
  **English capitals**. Translating them is forbidden (it breaks Kiro's parser and agent compatibility)
- Use a proper noun defined in the Glossary for <entity> (e.g. THE CLI_Parser SHALL ...).
  Only use "THE system" when there is no entity at an appropriate granularity
- One sentence = one verifiable item. Don't cram several checks into one sentence with "and" or "or"
- Each acceptance criterion is a numbered list item (1. 2. 3.). That number becomes the M in
  `_Requirements: N.M_` in tasks.md

## Examples

1. THE export function SHALL write the output file in UTF-8
2. WHEN the user specifies the `--csv` flag, THE CLI_Parser SHALL switch the output format to CSV
3. IF the output directory does not exist, THEN THE export function SHALL display an error message and exit with code 1
4. WHILE an export is running, THE progress display SHALL show the number of rows processed
5. WHERE the compression option is enabled, THE export function SHALL gzip-compress the output
6. FOR EACH input file, THE export function SHALL produce one output file
7. WHEN the existing `--json` flag is specified, THE CLI_Parser SHALL CONTINUE TO output in JSON format

## Bad examples and how to fix them

- ✗ "The system should be fast" -> ✓ "THE search function SHALL return results within 1 second" (make it verifiable)
- ✗ "WHEN saving, validate the input and abort on an error" -> split into two sentences, Event-driven and Unwanted behavior
- ✗ Writing the keywords in your own language -> keep them in English: "IF <condition>, THEN THE <entity> SHALL <behaviour>"
