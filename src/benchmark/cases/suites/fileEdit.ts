import { defineBenchmarkCases } from '../types.js';

export const FILE_EDIT_BENCHMARK_CASES = defineBenchmarkCases([
  // --- CATEGORY 1: SIMPLE TEXT REPLACEMENT ---
  {
    id: 'test_file_edit_simple_text',
    name: 'File Edit (Simple Text Replacement)',
    category: 'file_editing',
    prompt: 'Edit the file config/app_settings.env and change PORT=9090 to PORT=8080.',
    expectedTool: 'edit_file',
    expectedArgSubstrings: {
      relative_path: 'app_settings.env',
      target_text: 'PORT=9090',
      replacement_text: 'PORT=8080',
    },
    expectedFileState: [
      {
        relativePath: 'config/app_settings.env',
        mustExist: true,
        containsSubstrings: ['PORT=8080'],
        excludesSubstrings: ['PORT=9090'],
      },
    ],
    description:
      'Verifies the model selects edit_file with exact target_text and replacement_text for a simple key-value pair change.',
    objective: 'Tests basic file editing with exact string matching.',
    requiredOutput:
      'Call edit_file(relative_path: "config/app_settings.env", target_text: "PORT=9090", replacement_text: "PORT=8080").',
    evaluationCriteria:
      'PASSES if config/app_settings.env contains PORT=8080 and no longer contains PORT=9090.',
  },

  // --- CATEGORY 2: JSON VALUE EDITING ---
  {
    id: 'test_file_edit_json_string_value',
    name: 'File Edit (JSON String Value)',
    category: 'file_editing',
    prompt: 'Edit user_profile.json and change the role value from "admin" to "editor".',
    expectedTool: 'edit_file',
    expectedArgSubstrings: {
      relative_path: 'user_profile.json',
      target_text: '"admin"',
      replacement_text: '"editor"',
    },
    expectedFileJson: {
      relativePath: 'user_profile.json',
      values: {
        role: 'editor',
        userId: 9482,
      },
    },
    description:
      'Verifies a quoted JSON string value can be replaced without rewriting unrelated fields.',
    objective: 'Tests precise structured-data editing with punctuation and quotes around the target value.',
    requiredOutput:
      'Call edit_file for user_profile.json, replacing "admin" with "editor".',
    evaluationCriteria:
      'PASSES if user_profile.json has role "editor" and userId 9482 verified on disk.',
  },

  {
    id: 'test_file_edit_json_number_value',
    name: 'File Edit (JSON Number Value)',
    category: 'file_editing',
    prompt: 'Edit package.json and update its version from "1.0.0" to "2.0.0".',
    expectedTool: 'edit_file',
    expectedArgSubstrings: {
      relative_path: 'package.json',
      target_text: '"1.0.0"',
      replacement_text: '"2.0.0"',
    },
    expectedFileJson: {
      relativePath: 'package.json',
      values: {
        version: '2.0.0',
      },
    },
    description:
      'Verifies the model can edit a JSON string value that looks like a number.',
    objective: 'Tests editing numeric-looking string values in JSON.',
    requiredOutput:
      'Call edit_file for package.json, replacing "1.0.0" with "2.0.0".',
    evaluationCriteria:
      'PASSES if package.json has version "2.0.0" verified on disk.',
  },

  {
    id: 'test_file_edit_json_boolean_value',
    name: 'File Edit (JSON Boolean Value)',
    category: 'file_editing',
    prompt: 'Edit config/feature_flags.json to enable darkMode by changing its value from false to true.',
    expectedTool: 'edit_file',
    expectedArgSubstrings: {
      relative_path: 'feature_flags.json',
      target_text: 'false',
      replacement_text: 'true',
    },
    expectedFileJson: {
      relativePath: 'config/feature_flags.json',
      values: {
        darkMode: true,
      },
    },
    description: 'Verifies boolean replacement in a nested JSON fixture.',
    objective: 'Tests editing a non-string scalar while preserving valid surrounding JSON.',
    requiredOutput:
      'Call edit_file on config/feature_flags.json and replace false with true.',
    evaluationCriteria:
      'PASSES if config/feature_flags.json has darkMode set to true on disk.',
  },

  // --- CATEGORY 3: YAML EDITING ---
  {
    id: 'test_file_edit_yaml_url',
    name: 'File Edit (YAML URL Replacement)',
    category: 'file_editing',
    prompt: 'Edit config/service.yaml and replace https://staging.internal/v1 with https://api.internal/v2.',
    expectedTool: 'edit_file',
    expectedArgSubstrings: {
      relative_path: 'service.yaml',
      target_text: 'https://staging.internal/v1',
      replacement_text: 'https://api.internal/v2',
    },
    expectedFileState: [
      {
        relativePath: 'config/service.yaml',
        mustExist: true,
        containsSubstrings: ['https://api.internal/v2'],
        excludesSubstrings: ['https://staging.internal/v1'],
      },
    ],
    description: 'Verifies exact editing of punctuation-heavy URL text in YAML.',
    objective: 'Tests preservation of slashes, colons, dots, and surrounding YAML indentation.',
    requiredOutput:
      'Call edit_file on config/service.yaml with the complete old and new endpoint URLs.',
    evaluationCriteria:
      'PASSES if config/service.yaml has the v2 endpoint and no longer contains the staging URL.',
  },

  // --- CATEGORY 4: MARKDOWN EDITING ---
  {
    id: 'test_file_edit_markdown_paragraph_deletion',
    name: 'File Edit (Markdown Paragraph Deletion)',
    category: 'file_editing',
    prompt: 'Edit docs/release_notes.md and delete the entire paragraph "Deprecated: legacy token fallback remains enabled."',
    expectedTool: 'edit_file',
    expectedArgSubstrings: {
      relative_path: 'release_notes.md',
      target_text: 'Deprecated: legacy token fallback remains enabled.',
      replacement_text: '',
    },
    expectedFileState: [
      {
        relativePath: 'docs/release_notes.md',
        containsSubstrings: ['Stable authentication flow.', 'Metrics export is available.'],
        excludesSubstrings: ['Deprecated: legacy token fallback remains enabled.'],
      },
    ],
    description: 'Verifies exact paragraph deletion by using an empty replacement string.',
    objective: 'Tests deletion of punctuation-sensitive prose without removing adjacent document sections.',
    requiredOutput:
      'Call edit_file for docs/release_notes.md with the deprecated paragraph as target_text and an empty replacement_text.',
    evaluationCriteria:
      'PASSES if edit_file deletes the deprecated paragraph and it is absent from the fixture on disk.',
  },

  {
    id: 'test_file_edit_markdown_heading_change',
    name: 'File Edit (Markdown Heading Change)',
    category: 'file_editing',
    prompt: 'Edit docs/status.txt and change "pending-review" to "production-ready".',
    expectedTool: 'edit_file',
    expectedArgSubstrings: {
      relative_path: 'status.txt',
      target_text: 'pending-review',
      replacement_text: 'production-ready',
    },
    expectedFileState: [
      {
        relativePath: 'docs/status.txt',
        containsSubstrings: ['production-ready', 'Owner: platform-team.'],
        excludesSubstrings: ['pending-review'],
      },
    ],
    description: 'Verifies replacement of a hyphenated token in a plain-text status file.',
    objective: 'Tests exact token editing where punctuation is semantically significant.',
    requiredOutput:
      'Call edit_file on docs/status.txt, replacing pending-review with production-ready.',
    evaluationCriteria:
      'PASSES if edit_file executes with the correct hyphenated values and the new status is verified on disk.',
  },

  // --- CATEGORY 5: CODE EDITING ---
  {
    id: 'test_file_edit_code_line_deletion',
    name: 'File Edit (Code Line Deletion)',
    category: 'code_editing',
    prompt: 'Edit config/app_settings.env to delete the SECRET_KEY line.',
    expectedTool: 'edit_file',
    expectedArgSubstrings: {
      relative_path: 'app_settings.env',
      target_text: 'SECRET_KEY',
      replacement_text: '',
    },
    expectedFileState: [
      {
        relativePath: 'config/app_settings.env',
        containsSubstrings: ['PORT=9090', 'DB_HOST=mockdb.internal'],
        excludesSubstrings: ['SECRET_KEY'],
      },
    ],
    description: 'Verifies deleting lines of code/text by setting replacement_text to an empty string.',
    objective: 'Tests line deletion protocol by replacing target snippet with empty string "".',
    requiredOutput:
      'Tool call request: edit_file(relative_path: "config/app_settings.env", target_text: "SECRET_KEY...", replacement_text: "").',
    evaluationCriteria:
      'PASSES if tool is invoked with target_text containing "SECRET_KEY" and replacement_text set to "". FAILS if deletion is not executed.',
  },

  {
    id: 'test_file_edit_code_function_rewrite',
    name: 'File Edit (Code Function Rewrite)',
    category: 'code_editing',
    prompt: 'Inspect modules/utility.js and rewrite the computeHash function so it returns "SHA256_" + input.',
    expectedToolSequence: ['read_file', 'edit_file'],
    expectedArgSubstrings: {
      relative_path: 'utility.js',
      replacement_text: 'SHA256_',
    },
    expectedFileState: [
      {
        relativePath: 'modules/utility.js',
        containsSubstrings: ['return "SHA256_" + input'],
        excludesSubstrings: ['hash_'],
      },
    ],
    description: 'Verifies multi-line code function rewriting capabilities in code files.',
    objective: 'Tests multi-line function rewriting in source code files.',
    requiredOutput:
      'Tool call request: read_file -> edit_file on modules/utility.js replacing complete function block with "SHA256_" + input.',
    evaluationCriteria:
      'PASSES if read_file is followed by edit_file replacing the complete function block cleanly. FAILS if code rewrite is omitted or leaves orphaned lines.',
  },

  {
    id: 'test_file_edit_code_multiline_function',
    name: 'File Edit (Multi-Line TypeScript Function Edit)',
    category: 'code_editing',
    prompt: 'Read modules/formatter.ts, then edit the complete formatLabel function so it returns "[ready] ${value.trim()}" and no longer lowercases the value.',
    expectedToolSequence: ['read_file', 'edit_file'],
    expectedArgSubstrings: {
      relative_path: 'formatter.ts',
      replacement_text: '[ready]',
    },
    expectedFileState: [
      {
        relativePath: 'modules/formatter.ts',
        containsSubstrings: ['[ready]', 'value.trim()'],
        excludesSubstrings: ['toLowerCase'],
      },
    ],
    description: 'Verifies inspection followed by replacement of a complete multi-line TypeScript function.',
    objective: 'Tests clean code-block rewriting without leaving the old normalization statement behind.',
    requiredOutput:
      'Call read_file then edit_file on modules/formatter.ts, replacing the full function with an implementation containing [ready].',
    evaluationCriteria:
      'PASSES if the read/edit workflow completes and the replacement containing [ready] is verified on disk.',
  },

  // --- CATEGORY 6: MULTI-FIELD JSON EDITING ---
  {
    id: 'test_file_edit_json_multi_field',
    name: 'File Edit (Multi-Field JSON Update)',
    category: 'file_editing',
    prompt: 'Read package.json, then update its version to "1.1.1", its description to "this is a good app", and its name to "ai-chat". Preserve the rest of the file.',
    expectedToolSequence: ['read_file', 'edit_file'],
    expectedFileJson: {
      relativePath: 'package.json',
      values: {
        name: 'ai-chat',
        version: '1.1.1',
        description: 'this is a good app',
      },
    },
    description:
      'Verifies that the agent can inspect package.json and complete three distinct metadata edits without changing the real project file.',
    objective: 'Tests a multi-edit JSON workflow requiring the agent to preserve unrelated package metadata.',
    requiredOutput:
      'Read the benchmark package.json, perform the required edit_file call(s), and leave valid JSON with name ai-chat, version 1.1.1, and the requested description.',
    evaluationCriteria:
      'PASSES only if read_file occurs before edit_file and all three final JSON properties exactly match on disk.',
  },

  // --- CATEGORY 7: ENVIRONMENT FILE EDITING ---
  {
    id: 'test_file_edit_env_host_change',
    name: 'File Edit (Environment Variable Host Change)',
    category: 'file_editing',
    prompt: 'Edit config/app_settings.env to change DB_HOST from mockdb.internal to db.prod.com.',
    expectedTool: 'edit_file',
    expectedArgSubstrings: {
      relative_path: 'app_settings.env',
      target_text: 'DB_HOST=mockdb.internal',
      replacement_text: 'DB_HOST=db.prod.com',
    },
    expectedFileState: [
      {
        relativePath: 'config/app_settings.env',
        containsSubstrings: ['DB_HOST=db.prod.com', 'PORT=9090'],
        excludesSubstrings: ['DB_HOST=mockdb.internal'],
      },
    ],
    description: 'Verifies the model can edit environment variable values in a key=value format file.',
    objective: 'Tests editing configuration files with standard env var syntax.',
    requiredOutput:
      'Call edit_file on config/app_settings.env, replacing DB_HOST=mockdb.internal with DB_HOST=db.prod.com.',
    evaluationCriteria:
      'PASSES if config/app_settings.env has DB_HOST=db.prod.com and no longer contains mockdb.internal.',
  },

  // --- CATEGORY 8: COMPLEX URL/PATH EDITING ---
  {
    id: 'test_file_edit_complex_url',
    name: 'File Edit (Complex URL Path Replacement)',
    category: 'file_editing',
    prompt: 'Edit config/service.yaml and replace the entire line containing "https://staging.internal/v1/users" with "https://api.internal/v2/users".',
    expectedTool: 'edit_file',
    expectedArgSubstrings: {
      relative_path: 'service.yaml',
      target_text: 'https://staging.internal/v1/users',
      replacement_text: 'https://api.internal/v2/users',
    },
    expectedFileState: [
      {
        relativePath: 'config/service.yaml',
        mustExist: true,
        containsSubstrings: ['https://api.internal/v2/users'],
        excludesSubstrings: ['staging.internal'],
      },
    ],
    description: 'Verifies editing a complex URL path with multiple segments.',
    objective: 'Tests precision editing of deeply nested URL paths in configuration files.',
    requiredOutput:
      'Call edit_file on config/service.yaml with the exact old and new full URLs.',
    evaluationCriteria:
      'PASSES if config/service.yaml has the v2 users endpoint and no longer contains staging.internal.',
  },

  // --- CATEGORY 9: EDIT WITH READ-FIRST WORKFLOW ---
  {
    id: 'test_file_edit_read_first_workflow',
    name: 'File Edit (Read-First Workflow)',
    category: 'file_editing',
    prompt: 'Read config/feature_flags.json to find the current value of darkMode, then edit it to true.',
    expectedToolSequence: ['read_file', 'edit_file'],
    expectedArgSubstrings: {
      relative_path: 'feature_flags.json',
      replacement_text: 'true',
    },
    expectedFileJson: {
      relativePath: 'config/feature_flags.json',
      values: {
        darkMode: true,
      },
    },
    description:
      'Verifies the model reads a file before editing it to ensure it targets the correct value.',
    objective: 'Tests the read-first pattern for safe file editing.',
    requiredOutput:
      'Call read_file on config/feature_flags.json, then call edit_file with target_text "false" and replacement_text "true".',
    evaluationCriteria:
      'PASSES only if read_file is called before edit_file and darkMode is true on disk.',
  },

  // --- CATEGORY 10: FILE EDIT DISCRIMINATION (NEGATIVE CONTROL) ---
  {
    id: 'test_file_edit_no_tool_discrimination',
    name: 'File Edit Discrimination (General Knowledge)',
    category: 'discrimination',
    prompt: 'What is the capital of Japan?',
    expectedTool: null,
    expectedResponseSubstrings: ['Tokyo'],
    description:
      'Verifies the model does not invoke edit_file or any file tool for a general knowledge question.',
    objective: 'Tests tool call discrimination to prevent calling file tools for general questions.',
    requiredOutput: 'Direct text answer "Tokyo" with 0 tool call requests.',
    evaluationCriteria:
      'PASSES if zero tools are called and answer is direct. FAILS if any file system tool is called unnecessarily.',
  },

  // --- CATEGORY 11: MULTI-STEP WORKFLOW WITH FILE EDIT ---
  {
    id: 'test_file_edit_multi_step_workflow',
    name: 'Multi-Step Workflow (List -> Read -> Edit)',
    category: 'multi_step_workflow',
    prompt: 'List the config folder to find the environment settings file, read app_settings.env, and edit app_settings.env to change DB_HOST from mockdb.internal to db.prod.com.',
    expectedToolSequence: ['list_directory', 'read_file', 'edit_file'],
    expectedArgSubstrings: {
      relative_path: 'app_settings.env',
      replacement_text: 'db.prod.com',
    },
    expectedFileState: [
      {
        relativePath: 'config/app_settings.env',
        containsSubstrings: ['DB_HOST=db.prod.com', 'PORT=9090'],
        excludesSubstrings: ['DB_HOST=mockdb.internal'],
      },
    ],
    description:
      'Evaluates a complex 3-step agentic tool chain: list_directory -> read_file -> edit_file.',
    objective: 'Tests multi-step reasoning where 3 separate tools are executed sequentially.',
    requiredOutput:
      'Sequential tool sequence: 1) list_directory("config"), 2) read_file("config/app_settings.env"), 3) edit_file(replacement_text: "db.prod.com").',
    evaluationCriteria:
      'PASSES if list_directory, read_file, and edit_file are invoked sequentially in exact order. FAILS if any step is skipped.',
  },

  // --- CATEGORY 12: SEARCH-DRIVEN FILE EDIT ---
  {
    id: 'test_file_edit_search_driven',
    name: 'Search-Driven File Edit (Grep -> Read -> Edit)',
    category: 'multi_step_workflow',
    prompt: 'Search the workspace for computeHash, read utility.js where it is defined, and edit computeHash to return "SHA256_" + input.',
    expectedToolSequence: ['grep_search', 'read_file', 'edit_file'],
    expectedArgSubstrings: {
      relative_path: 'utility.js',
      replacement_text: 'SHA256_',
    },
    expectedFileState: [
      {
        relativePath: 'modules/utility.js',
        containsSubstrings: ['return "SHA256_" + input'],
        excludesSubstrings: ['hash_'],
      },
    ],
    description:
      'Evaluates search-driven code refactoring workflow: grep_search -> read_file -> edit_file.',
    objective: 'Tests multi-step agentic workflow using code search to locate files before refactoring.',
    requiredOutput:
      'Sequential tool sequence: 1) grep_search("computeHash"), 2) read_file("modules/utility.js"), 3) edit_file(replacement_text: "SHA256_").',
    evaluationCriteria:
      'PASSES if grep_search, read_file, and edit_file are executed in sequence. FAILS if any step is omitted.',
  },

  // --- CATEGORY 13: MULTI-TURN FILE EDIT (EDIT -> VALIDATE -> EDIT -> VALIDATE) ---
  {
    id: 'test_file_edit_multi_turn',
    name: 'Multi-Turn File Edit (Edit -> Validate -> Edit -> Validate)',
    category: 'multi_turn_workflow',
    prompt: 'Turn 1: Edit config/app_settings.env to change PORT from 9090 to 8080. After making the edit, verify the file contains "PORT=8080" and no longer contains "PORT=9090". Turn 2: Now edit the same file to change DB_HOST from mockdb.internal to db.prod.com. Verify the final file contains both "PORT=8080" and "DB_HOST=db.prod.com", and no longer contains "DB_HOST=mockdb.internal".',
    expectedToolSequence: ['edit_file', 'read_file', 'edit_file', 'read_file'],
    expectedArgSubstrings: {
      relative_path: 'app_settings.env',
    },
    verificationScript: 'test -f config/app_settings.env && grep -q "PORT=8080" config/app_settings.env && grep -q "DB_HOST=db.prod.com" config/app_settings.env && ! grep -q "PORT=9090" config/app_settings.env && ! grep -q "DB_HOST=mockdb.internal" config/app_settings.env',
    description:
      'Evaluates a multi-turn file editing workflow where the model makes an initial edit, validates it, then makes a second edit on top of the first.',
    objective: 'Tests the model\'s ability to perform sequential edits with intermediate validation, ensuring each step is correct before proceeding.',
    requiredOutput:
      'Sequential tool sequence: 1) edit_file to change PORT=9090 -> PORT=8080, 2) read_file to verify the first edit, 3) edit_file to change DB_HOST=mockdb.internal -> DB_HOST=db.prod.com, 4) read_file to verify the final state.',
    evaluationCriteria:
      'PASSES if both edits are applied correctly and the final file contains PORT=8080 and DB_HOST=db.prod.com while excluding PORT=9090 and DB_HOST=mockdb.internal. FAILS if either edit is missing or incorrect.',
  },
]);
