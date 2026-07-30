export interface BenchmarkTestCase {
  id: string;
  name: string;
  category:
    | 'directory_reading'
    | 'file_reading'
    | 'file_creation'
    | 'file_editing'
    | 'code_editing'
    | 'code_search'
    | 'discrimination'
    | 'multi_step_workflow'
    | 'terminal_execution'
    | 'information_retrieval'
    | 'project_context'
    | 'web_search';
  prompt: string;
  expectedTool?: string | null;
  expectedToolSequence?: string[];
  expectedArgSubstrings?: Record<string, string>;
  expectedResponseSubstrings?: string[];
  enableProjectContext?: boolean;
  forbiddenToolCalls?: Array<{
    name: string;
    argument: string;
    substring: string;
  }>;
  expectedFileJson?: {
    relativePath: string;
    values: Record<string, string | number | boolean | null>;
  };
  description: string;
  objective: string;
  requiredOutput: string;
  evaluationCriteria: string;
}

export const BENCHMARK_TEST_CASES: BenchmarkTestCase[] = [
  // --- CATEGORY 1: DIRECTORY LISTING ---
  {
    id: 'test_list_root_directory',
    name: 'Root Directory Listing (.)',
    category: 'directory_reading',
    prompt: 'List all files in the root working directory.',
    expectedTool: 'list_directory',
    expectedArgSubstrings: { relative_path: '.' },
    description: 'Verifies the model invokes `list_directory` targeting root directory relative_path: "." or empty.',
    objective: 'Tests root workspace directory exploration capability.',
    requiredOutput: 'Tool call request: list_directory(relative_path: "."). Expected output: workspace entries.',
    evaluationCriteria: 'PASSES if list_directory is called targeting "." or empty path. FAILS if wrong tool is called.',
  },
  {
    id: 'test_list_sub_dir',
    name: 'Subdirectory Listing (modules folder)',
    category: 'directory_reading',
    prompt: 'List all files inside the modules folder.',
    expectedTool: 'list_directory',
    expectedArgSubstrings: { relative_path: 'modules' },
    description: 'Verifies the model dynamically selects `list_directory` targeting relative_path: "modules".',
    objective: 'Tests if the agent recognizes directory listing intent for non-example subdirectories.',
    requiredOutput: 'Tool call request: list_directory(relative_path: "modules"). Expected output: entries array containing utility.js.',
    evaluationCriteria: 'PASSES if list_directory is called with relative_path containing "modules". FAILS if model hallucinates or fails to call tool.',
  },

  // --- CATEGORY 2: FILE READING ---
  {
    id: 'test_read_profile_file',
    name: 'Root File Reading (user_profile.json)',
    category: 'file_reading',
    prompt: 'Read user_profile.json and tell me what the userId is.',
    expectedTool: 'read_file',
    expectedArgSubstrings: { relative_path: 'user_profile.json' },
    description: 'Verifies the model dynamically selects `read_file` with relative_path: "user_profile.json".',
    objective: 'Tests dynamic file targeting for benchmark-specific JSON files not present in prompt examples.',
    requiredOutput: 'Tool call request: read_file(relative_path: "user_profile.json"). Expected output: file content with userId 9482.',
    evaluationCriteria: 'PASSES if read_file is called with relative_path matching "user_profile.json". FAILS if wrong file or tool is invoked.',
  },
  {
    id: 'test_read_config_file',
    name: 'Nested File Reading (config/app_settings.env)',
    category: 'file_reading',
    prompt: 'Read the app_settings.env file inside the config directory and tell me what DB_HOST is set to.',
    expectedTool: 'read_file',
    expectedArgSubstrings: { relative_path: 'app_settings.env' },
    description: 'Verifies the model dynamically targets nested subdirectory path config/app_settings.env.',
    objective: 'Tests nested subdirectory path resolution without example overlap.',
    requiredOutput: 'Tool call request: read_file(relative_path: "config/app_settings.env"). Expected output: env file text.',
    evaluationCriteria: 'PASSES if read_file is called targeting app_settings.env. FAILS if path formatting is incorrect.',
  },

  // --- CATEGORY 3: FILE CREATION ---
  {
    id: 'test_create_file',
    name: 'Source File Creation (services/logger.ts)',
    category: 'file_creation',
    prompt: 'Create a new file named services/logger.ts containing "export const log = (msg) => console.log(msg);".',
    expectedTool: 'create_file',
    expectedArgSubstrings: { relative_path: 'logger.ts', content: 'console.log' },
    description: 'Verifies model selects `create_file` to generate new workspace files.',
    objective: 'Tests file creation capabilities for new source files.',
    requiredOutput: 'Tool call request: create_file(relative_path: "services/logger.ts", content: "...").',
    evaluationCriteria: 'PASSES if create_file is invoked with valid path and content. FAILS if file creation tool is not called.',
  },
  {
    id: 'test_create_nested_test',
    name: 'Nested Test File Creation (tests/unit/auth.test.ts)',
    category: 'file_creation',
    prompt: 'Create a new test file named tests/unit/auth.test.ts containing "test(\"login\", () => {});".',
    expectedTool: 'create_file',
    expectedArgSubstrings: { relative_path: 'auth.test.ts', content: 'login' },
    description: 'Verifies model creates new nested test directory files cleanly.',
    objective: 'Tests nested subdirectory path creation for new files.',
    requiredOutput: 'Tool call request: create_file(relative_path: "tests/unit/auth.test.ts", content: "...").',
    evaluationCriteria: 'PASSES if create_file is invoked targeting auth.test.ts with valid test code.',
  },

  // --- CATEGORY 4: FILE EDITING & REFACTORING ---
  {
    id: 'test_edit_file_partial',
    name: 'Partial Text Replacement (config/app_settings.env)',
    category: 'file_editing',
    prompt: 'Edit config/app_settings.env to change PORT=9090 to PORT=8080.',
    expectedTool: 'edit_file',
    expectedArgSubstrings: { relative_path: 'app_settings.env', target_text: '9090', replacement_text: '8080' },
    description: 'Verifies the model selects `edit_file` with exact target_text ("9090") and replacement_text ("8080").',
    objective: 'Tests partial string replacement file editing capability.',
    requiredOutput: 'Tool call request: edit_file(relative_path: "config/app_settings.env", target_text: "9090", replacement_text: "8080").',
    evaluationCriteria: 'PASSES if edit_file is called with target_text containing "9090" and replacement_text containing "8080". FAILS if wrong tool or missing arguments.',
  },
  {
    id: 'test_edit_json_value',
    name: 'JSON Value Replacement (user role)',
    category: 'file_editing',
    prompt: 'Edit user_profile.json and change the role value from "admin" to "editor".',
    expectedTool: 'edit_file',
    expectedArgSubstrings: {
      relative_path: 'user_profile.json',
      target_text: 'admin',
      replacement_text: 'editor',
    },
    description: 'Verifies a quoted JSON string value can be replaced without rewriting unrelated fields.',
    objective: 'Tests precise structured-data editing with punctuation and quotes around the target value.',
    requiredOutput: 'Call edit_file for user_profile.json, replacing admin with editor.',
    evaluationCriteria:
      'PASSES if edit_file executes with the correct file and replacement, and editor is present on disk.',
  },
  {
    id: 'test_edit_package_version_after_read',
    name: 'Package Version Edit (Read Current Value First)',
    category: 'file_editing',
    prompt: 'Edit package.json and update its version to 2.0.1.',
    expectedToolSequence: ['read_file', 'edit_file'],
    expectedArgSubstrings: {
      relative_path: 'package.json',
      target_text: '2.0.0',
      replacement_text: '2.0.1',
    },
    description:
      'Reproduces the stale-target failure where the model guessed version 1.0.0 instead of inspecting the current package version.',
    objective:
      'Verifies edit workflows read the current file before constructing exact replacement text.',
    requiredOutput:
      'Call read_file on package.json, then edit_file using current version 2.0.0 as target_text and 2.0.1 as replacement_text.',
    evaluationCriteria:
      'PASSES only if package.json is read before editing and version 2.0.1 is verified on disk.',
  },
  {
    id: 'test_edit_package_metadata',
    name: 'Package Metadata Multi-Field Edit',
    category: 'file_editing',
    prompt:
      'Read package.json, then update its version to "1.1.1", its description to "this is a good app", and its name to "ai-chat". Preserve the rest of the file.',
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
    objective:
      'Tests a multi-edit JSON workflow requiring the agent to preserve unrelated package metadata.',
    requiredOutput:
      'Read the benchmark package.json, perform the required edit_file call(s), and leave valid JSON with name ai-chat, version 1.1.1, and the requested description.',
    evaluationCriteria:
      'PASSES only if read_file occurs before edit_file and all three final JSON properties exactly match on disk.',
  },
  {
    id: 'test_edit_nested_json_boolean',
    name: 'Nested JSON Boolean Replacement (feature flag)',
    category: 'file_editing',
    prompt: 'Edit config/feature_flags.json to enable darkMode by changing its value from false to true.',
    expectedTool: 'edit_file',
    expectedArgSubstrings: {
      relative_path: 'feature_flags.json',
      target_text: 'false',
      replacement_text: 'true',
    },
    description: 'Verifies boolean replacement in a nested JSON fixture.',
    objective: 'Tests editing a non-string scalar while preserving valid surrounding JSON.',
    requiredOutput: 'Call edit_file on config/feature_flags.json and replace false with true.',
    evaluationCriteria:
      'PASSES if edit_file changes the darkMode value and true is verified in the fixture on disk.',
  },
  {
    id: 'test_edit_yaml_endpoint',
    name: 'YAML URL Replacement (service endpoint)',
    category: 'file_editing',
    prompt:
      'Edit config/service.yaml and replace https://staging.internal/v1 with https://api.internal/v2.',
    expectedTool: 'edit_file',
    expectedArgSubstrings: {
      relative_path: 'service.yaml',
      target_text: 'https://staging.internal/v1',
      replacement_text: 'https://api.internal/v2',
    },
    description: 'Verifies exact editing of punctuation-heavy URL text in YAML.',
    objective: 'Tests preservation of slashes, colons, dots, and surrounding YAML indentation.',
    requiredOutput:
      'Call edit_file on config/service.yaml with the complete old and new endpoint URLs.',
    evaluationCriteria:
      'PASSES if edit_file uses the correct URL values and the v2 endpoint is present on disk.',
  },
  {
    id: 'test_edit_multiline_function_body',
    name: 'Multi-Line TypeScript Function Edit (formatter)',
    category: 'code_editing',
    prompt:
      'Read modules/formatter.ts, then edit the complete formatLabel function so it returns `[ready] ${value.trim()}` and no longer lowercases the value.',
    expectedToolSequence: ['read_file', 'edit_file'],
    expectedArgSubstrings: {
      relative_path: 'formatter.ts',
      replacement_text: '[ready]',
    },
    description: 'Verifies inspection followed by replacement of a complete multi-line TypeScript function.',
    objective: 'Tests clean code-block rewriting without leaving the old normalization statement behind.',
    requiredOutput:
      'Call read_file then edit_file on modules/formatter.ts, replacing the full function with an implementation containing [ready].',
    evaluationCriteria:
      'PASSES if the read/edit workflow completes and the replacement containing [ready] is verified on disk.',
  },
  {
    id: 'test_edit_delete_markdown_paragraph',
    name: 'Markdown Paragraph Deletion (deprecated note)',
    category: 'code_editing',
    prompt:
      'Edit docs/release_notes.md and delete the entire paragraph "Deprecated: legacy token fallback remains enabled."',
    expectedTool: 'edit_file',
    expectedArgSubstrings: {
      relative_path: 'release_notes.md',
      target_text: 'Deprecated: legacy token fallback remains enabled.',
      replacement_text: '',
    },
    description: 'Verifies exact paragraph deletion by using an empty replacement string.',
    objective: 'Tests deletion of punctuation-sensitive prose without removing adjacent document sections.',
    requiredOutput:
      'Call edit_file for docs/release_notes.md with the deprecated paragraph as target_text and an empty replacement_text.',
    evaluationCriteria:
      'PASSES if edit_file deletes the deprecated paragraph and it is absent from the fixture on disk.',
  },
  {
    id: 'test_edit_hyphenated_status',
    name: 'Hyphenated Text Replacement (deployment status)',
    category: 'file_editing',
    prompt: 'Edit docs/status.txt and change "pending-review" to "production-ready".',
    expectedTool: 'edit_file',
    expectedArgSubstrings: {
      relative_path: 'status.txt',
      target_text: 'pending-review',
      replacement_text: 'production-ready',
    },
    description: 'Verifies replacement of a hyphenated token in a plain-text status file.',
    objective: 'Tests exact token editing where punctuation is semantically significant.',
    requiredOutput: 'Call edit_file on docs/status.txt, replacing pending-review with production-ready.',
    evaluationCriteria:
      'PASSES if edit_file executes with the correct hyphenated values and the new status is verified on disk.',
  },
  {
    id: 'test_code_line_deletion',
    name: 'Code Line Deletion (config/app_settings.env line removal)',
    category: 'code_editing',
    prompt: 'Edit config/app_settings.env to delete the SECRET_KEY line.',
    expectedTool: 'edit_file',
    expectedArgSubstrings: { relative_path: 'app_settings.env', target_text: 'SECRET_KEY', replacement_text: '' },
    description: 'Verifies deleting lines of code/text by setting replacement_text to an empty string.',
    objective: 'Tests line deletion protocol by replacing target snippet with empty string "".',
    requiredOutput: 'Tool call request: edit_file(relative_path: "config/app_settings.env", target_text: "SECRET_KEY...", replacement_text: "").',
    evaluationCriteria: 'PASSES if tool is invoked with target_text containing "SECRET_KEY" and replacement_text set to "". FAILS if deletion is not executed.',
  },
  {
    id: 'test_code_function_rewrite',
    name: 'Multi-Line Code Rewriting (modules/utility.js function rewrite)',
    category: 'code_editing',
    prompt: 'Inspect modules/utility.js and rewrite the computeHash function so it returns "SHA256_" + input.',
    expectedToolSequence: ['read_file', 'edit_file'],
    expectedArgSubstrings: { relative_path: 'utility.js', replacement_text: 'SHA256_' },
    description: 'Verifies multi-line code function rewriting capabilities in code files.',
    objective: 'Tests multi-line function rewriting in source code files.',
    requiredOutput: 'Tool call request: read_file -> edit_file on modules/utility.js replacing complete function block with "SHA256_".',
    evaluationCriteria: 'PASSES if read_file is followed by edit_file replacing the complete function block cleanly. FAILS if code rewrite is omitted or leaves orphaned lines.',
  },

  // --- CATEGORY 5: CODE & SYMBOL SEARCH ---
  {
    id: 'test_grep_symbol_search',
    name: 'Workspace Symbol Search (grep_search computeHash)',
    category: 'code_search',
    prompt: 'Search the workspace for the word computeHash.',
    expectedTool: 'grep_search',
    expectedArgSubstrings: { query: 'computeHash' },
    description: 'Verifies model selects `grep_search` to locate symbol definitions across workspace files.',
    objective: 'Tests workspace text/code pattern search capabilities.',
    requiredOutput: 'Tool call request: grep_search(query: "computeHash").',
    evaluationCriteria: 'PASSES if grep_search is called with query "computeHash". FAILS if wrong tool is invoked.',
  },
  {
    id: 'test_grep_config_key',
    name: 'Config Key Search (grep_search DB_HOST)',
    category: 'code_search',
    prompt: 'Search the workspace for DB_HOST.',
    expectedTool: 'grep_search',
    expectedArgSubstrings: { query: 'DB_HOST' },
    description: 'Verifies model selects `grep_search` to find environment configuration keys.',
    objective: 'Tests configuration key search across all project files.',
    requiredOutput: 'Tool call request: grep_search(query: "DB_HOST").',
    evaluationCriteria: 'PASSES if grep_search is called with query "DB_HOST".',
  },

  // --- CATEGORY 6: TOOL DISCRIMINATION (NEGATIVE CONTROL) ---
  {
    id: 'test_no_tool_discrimination',
    name: 'Tool Discrimination (General Knowledge Question)',
    category: 'discrimination',
    prompt: 'What is the capital of Japan?',
    expectedTool: null,
    description: 'Verifies the model answers general knowledge questions directly without unnecessary tool invocation.',
    objective: 'Tests tool call discrimination to prevent calling file tools for general questions.',
    requiredOutput: 'Direct text answer "Tokyo" with 0 tool call requests.',
    evaluationCriteria: 'PASSES if zero tools are called and answer is direct. FAILS if file system tools are called unnecessarily.',
  },

  // --- CATEGORY 7: MULTI-STEP AGENTIC WORKFLOWS ---
  {
    id: 'test_workflow_list_read_edit',
    name: '3-Tool Agentic Workflow (List Folder -> Read Config -> Edit Value)',
    category: 'multi_step_workflow',
    prompt: 'List the config folder to find the environment settings file, read app_settings.env, and edit app_settings.env to change DB_HOST from mockdb.internal to db.prod.com.',
    expectedToolSequence: ['list_directory', 'read_file', 'edit_file'],
    expectedArgSubstrings: { relative_path: 'app_settings.env', replacement_text: 'db.prod.com' },
    description: 'Evaluates a complex 3-step agentic tool chain: list_directory -> read_file -> edit_file.',
    objective: 'Tests multi-step reasoning where 3 separate tools are executed sequentially.',
    requiredOutput: 'Sequential tool sequence: 1) list_directory("config"), 2) read_file("config/app_settings.env"), 3) edit_file(replacement_text: "db.prod.com").',
    evaluationCriteria: 'PASSES if list_directory, read_file, and edit_file are invoked sequentially in exact order. FAILS if any step is skipped.',
  },
  {
    id: 'test_workflow_search_read_refactor',
    name: '3-Tool Agentic Workflow (Grep Search -> Read Source -> Refactor Code)',
    category: 'multi_step_workflow',
    prompt: 'Search the workspace for computeHash, read utility.js where it is defined, and edit computeHash to return "SHA256_" + input.',
    expectedToolSequence: ['grep_search', 'read_file', 'edit_file'],
    expectedArgSubstrings: { relative_path: 'utility.js', replacement_text: 'SHA256_' },
    description: 'Evaluates search-driven code refactoring workflow: grep_search -> read_file -> edit_file.',
    objective: 'Tests multi-step agentic workflow using code search to locate files before refactoring.',
    requiredOutput: 'Sequential tool sequence: 1) grep_search("computeHash"), 2) read_file("modules/utility.js"), 3) edit_file(replacement_text: "SHA256_").',
    evaluationCriteria: 'PASSES if grep_search, read_file, and edit_file are executed in sequence. FAILS if any step is omitted.',
  },
  {
    id: 'test_workflow_read_spec_create_impl',
    name: '2-Tool Agentic Workflow (Read Spec -> Create Implementation File)',
    category: 'multi_step_workflow',
    prompt: 'Read user_profile.json to check the user data, then create a new file services/user_service.ts containing "export const userId = 9482;".',
    expectedToolSequence: ['read_file', 'create_file'],
    expectedArgSubstrings: { relative_path: 'user_service.ts', content: '9482' },
    description: 'Evaluates multi-step specification-driven file generation: read_file -> create_file.',
    objective: 'Tests multi-turn reasoning where file inspection informs new file generation.',
    requiredOutput: 'Sequential tool sequence: 1) read_file("user_profile.json"), 2) create_file("services/user_service.ts", content: "9482").',
    evaluationCriteria: 'PASSES if read_file is followed by create_file with valid user service code.',
  },
  {
    id: 'test_project_research_exact_session_prompt',
    name: 'Project Research Regression (Exact Session Prompt)',
    category: 'multi_step_workflow',
    prompt: 'research the current project make a summary about what it is. Use your tools',
    expectedToolSequence: ['list_directory', 'read_file'],
    expectedResponseSubstrings: ['Fixture Agent Studio', 'local-first coding assistant'],
    description:
      'Reproduces the session prompt that previously produced prose plus unexecuted tool-call JSON and then waited for user confirmation.',
    objective:
      'Verifies a project-research request starts tool execution immediately, reads project metadata, and returns a grounded summary in one user turn.',
    requiredOutput:
      'Call list_directory, call read_file for project metadata, and return a summary containing Fixture Agent Studio and local-first coding assistant without waiting for an "ok" reply.',
    evaluationCriteria:
      'PASSES only if list_directory and read_file execute during the original turn and the final response contains both grounded README facts. FAILS if the agent only announces a tool, emits textual tool JSON, or waits for confirmation.',
  },
  {
    id: 'test_project_research_use_your_tools_intent',
    name: 'Project Research Regression (Use Your Tools Intent)',
    category: 'multi_step_workflow',
    prompt:
      'Use your tools to understand this codebase, inspect the project files, and give me a concise summary of what the project does.',
    expectedToolSequence: ['list_directory', 'read_file'],
    expectedResponseSubstrings: ['Fixture Agent Studio', 'local-first coding assistant'],
    description:
      'Checks that broad tool-use and codebase-research language is treated as a workspace workflow rather than a plain-text request.',
    objective:
      'Verifies semantic project-inspection intent triggers directory discovery and metadata reading even without naming a specific file.',
    requiredOutput:
      'Call list_directory, read relevant project metadata, and return a grounded answer containing Fixture Agent Studio and local-first coding assistant.',
    evaluationCriteria:
      'PASSES only if both discovery and reading tools execute and the response contains grounded project identity and purpose facts. FAILS on prose-only planning or an incomplete workflow.',
  },
  {
    id: 'test_project_summary_no_confirmation_pause',
    name: 'Project Research Regression (No Confirmation Pause)',
    category: 'multi_step_workflow',
    prompt:
      'Check the current project and summarize it. Start by listing the workspace, then read README.md. Complete the research now without asking me to confirm the next step.',
    expectedToolSequence: ['list_directory', 'read_file'],
    expectedArgSubstrings: { relative_path: 'README.md' },
    expectedResponseSubstrings: ['Fixture Agent Studio'],
    description:
      'Ensures the agent does not stop after announcing directory inspection and require a follow-up "ok" message.',
    objective:
      'Tests uninterrupted list-directory to read-file continuation and final grounded response generation.',
    requiredOutput:
      'Execute list_directory followed by read_file(relative_path containing README.md), then answer with Fixture Agent Studio in the same turn.',
    evaluationCriteria:
      'PASSES only if both tools run in the requested order and a grounded final answer is produced in the same sendMessage call.',
  },

  // --- CATEGORY 8: TERMINAL EXECUTION (DOCKER SANDBOX ISOLATION) ---
  {
    id: 'test_terminal_ls',
    name: 'Terminal Execution (ls -la inside Docker Sandbox)',
    category: 'terminal_execution',
    prompt: 'Run a terminal command using execute_command to list directory files in long format.',
    expectedTool: 'execute_command',
    expectedArgSubstrings: { command: 'ls' },
    description: 'Verifies execution of bash shell commands inside the isolated Docker container sandbox.',
    objective: 'Tests terminal command invocation capability isolated within Docker sandbox.',
    requiredOutput: 'Tool call request: execute_command(command: "ls -la"). Expected output: directory listing.',
    evaluationCriteria: 'PASSES if execute_command is called with command containing "ls". FAILS if command execution fails.',
  },
  {
    id: 'test_terminal_file_write',
    name: 'Terminal File Creation (echo > container_test.txt in Docker Sandbox)',
    category: 'terminal_execution',
    prompt: 'Use the execute_command tool to run the shell command: echo "Docker Sandbox Execution" > container_test.txt.',
    expectedTool: 'execute_command',
    expectedArgSubstrings: { command: 'echo' },
    description: 'Verifies shell command file creation inside the isolated Docker container sandbox.',
    objective: 'Tests terminal-based file generation capabilities in isolated Docker environment.',
    requiredOutput: 'Tool call request: execute_command(command: "echo ... > container_test.txt").',
    evaluationCriteria: 'PASSES if execute_command is invoked with echo command. FAILS if terminal command is omitted.',
  },
  {
    id: 'test_terminal_env_vars',
    name: 'Terminal Environment Inspection (printenv / env)',
    category: 'terminal_execution',
    prompt: 'Use execute_command to print all environment variables in the shell.',
    expectedTool: 'execute_command',
    expectedArgSubstrings: { command: 'env' },
    description: 'Verifies the model issues an env-inspection command (env or printenv) inside the sandbox.',
    objective: 'Tests environment variable listing via shell command.',
    requiredOutput: 'Tool call request: execute_command(command: "env" or "printenv"). Expected output: list of key=value pairs.',
    evaluationCriteria: 'PASSES if execute_command is called with "env" or "printenv" in the command. FAILS if wrong tool or command.',
  },
  {
    id: 'test_terminal_shell_arithmetic',
    name: 'Terminal Shell Arithmetic (expr / echo $((…)))',
    category: 'terminal_execution',
    prompt: 'Use execute_command to calculate 47 multiplied by 13 using a shell command and return the result.',
    expectedTool: 'execute_command',
    expectedArgSubstrings: { command: '47' },
    description: 'Verifies the model performs in-shell arithmetic (expr, bc, or echo $((...))) inside the Docker sandbox.',
    objective: 'Tests shell arithmetic computation capability.',
    requiredOutput: 'Tool call request: execute_command(command containing "47" and "13"). Expected output: 611.',
    evaluationCriteria: 'PASSES if execute_command is called with a command containing "47" and "13". FAILS if arithmetic is computed outside the tool.',
  },
  {
    id: 'test_terminal_pipe_grep',
    name: 'Terminal Pipe + Grep (cat | grep pattern)',
    category: 'terminal_execution',
    prompt: 'Use execute_command to read server_info.txt and filter lines containing the word "cluster" using grep.',
    expectedTool: 'execute_command',
    expectedArgSubstrings: { command: 'grep' },
    description: 'Verifies the model constructs a piped shell command (cat file | grep keyword) inside the Docker sandbox.',
    objective: 'Tests pipe and grep pattern matching via shell command.',
    requiredOutput: 'Tool call request: execute_command(command with "grep" and "cluster"). Expected output: matching line.',
    evaluationCriteria: 'PASSES if execute_command is called with a command containing "grep" and "cluster". FAILS if no pipe/grep is attempted.',
  },
  {
    id: 'test_terminal_process_list',
    name: 'Terminal Process Listing (ps aux)',
    category: 'terminal_execution',
    prompt: 'Use execute_command to list all running processes in the shell.',
    expectedTool: 'execute_command',
    expectedArgSubstrings: { command: 'ps' },
    description: 'Verifies the model issues a process-listing command (ps aux or ps -e) inside the Docker sandbox.',
    objective: 'Tests process enumeration via shell command.',
    requiredOutput: 'Tool call request: execute_command(command: "ps aux" or "ps -e"). Expected output: process table.',
    evaluationCriteria: 'PASSES if execute_command is called with a command containing "ps". FAILS if tool is not invoked.',
  },
  {
    id: 'test_terminal_count_files',
    name: 'Terminal File Count (ls | wc -l)',
    category: 'terminal_execution',
    prompt: 'Use execute_command to count the total number of files in the current directory using a shell command.',
    expectedTool: 'execute_command',
    expectedArgSubstrings: { command: 'wc' },
    description: 'Verifies the model constructs a file-counting pipeline (ls | wc -l or find | wc -l) inside the sandbox.',
    objective: 'Tests file counting via shell pipeline.',
    requiredOutput: 'Tool call request: execute_command(command containing "wc"). Expected output: a numeric count.',
    evaluationCriteria: 'PASSES if execute_command is called with a command containing "wc". FAILS if file counting is done without the tool.',
  },
  {
    id: 'test_terminal_multi_step',
    name: 'Multi-Step Terminal Workflow (mkdir + echo + cat)',
    category: 'terminal_execution',
    prompt: 'You must use execute_command for every step — do NOT use create_file or edit_file. Step 1: call execute_command with command "mkdir output". Step 2: call execute_command with command "echo benchmark_result > output/result.txt". Step 3: call execute_command with command "cat output/result.txt" to confirm the file content.',
    expectedToolSequence: ['execute_command', 'execute_command', 'execute_command'],
    expectedArgSubstrings: { command: 'mkdir' },
    description: 'Verifies multi-step terminal workflow: directory creation, file write, and file read — all via execute_command in sequence.',
    objective: 'Tests multi-turn shell command chaining (mkdir → echo → cat) inside Docker sandbox.',
    requiredOutput: 'Three sequential execute_command calls: mkdir output, echo "benchmark_result" > output/result.txt, cat output/result.txt.',
    evaluationCriteria: 'PASSES if execute_command is called at least 3 times with mkdir in the first call. FAILS if file tools are used instead.',
  },
  {
    id: 'test_terminal_no_tool_discrimination',
    name: 'Terminal Discrimination (No-Tool: Convert km to miles mentally)',
    category: 'terminal_execution',
    prompt: 'How many miles is 10 kilometres? Answer directly without running any commands.',
    expectedTool: null,
    description: 'Verifies the model does not invoke execute_command for a simple unit conversion question that can be answered directly.',
    objective: 'Tests discrimination to avoid unnecessary terminal tool calls for pure knowledge questions.',
    requiredOutput: 'Direct text answer (≈6.21 miles) with zero tool calls.',
    evaluationCriteria: 'PASSES if zero tools are called and answer is direct. FAILS if execute_command or any tool is invoked.',
  },
  {
    id: 'test_terminal_read_then_run',
    name: 'Multi-Step Terminal Workflow (grep value → echo result)',
    category: 'terminal_execution',
    prompt: 'You must use execute_command for both steps. Step 1: call execute_command with command "grep userId user_profile.json" to extract the userId from the file. Step 2: call execute_command with command "echo User ID is 9482" to print the result. Do NOT use read_file — use only execute_command for both steps.',
    expectedToolSequence: ['execute_command', 'execute_command'],
    description: 'Verifies a two-step terminal pipeline: grep to extract a value from a JSON file, then echo the result — both via execute_command.',
    objective: 'Tests chained shell commands where the output of one informs the next.',
    requiredOutput: 'Two sequential execute_command calls: grep userId user_profile.json, then echo "User ID is 9482".',
    evaluationCriteria: 'PASSES if execute_command is called at least twice. FAILS if only one command is issued or file tools are used.',
  },
  // --- CATEGORY 9: INFORMATION RETRIEVAL ---
  {
    id: 'test_retrieval_short_file',
    name: 'Information Retrieval (Short File)',
    category: 'information_retrieval',
    prompt: 'Read retrieval/short_brief.txt and tell me the launch codename. Answer using the file content.',
    expectedTool: 'read_file',
    expectedArgSubstrings: { relative_path: 'short_brief.txt' },
    expectedResponseSubstrings: ['AURORA-LIME'],
    description: 'Retrieves a precise fact from a short text fixture.',
    objective: 'Tests grounded question answering over a short file.',
    requiredOutput: 'The final answer must contain AURORA-LIME.',
    evaluationCriteria: 'PASSES only if read_file is called for short_brief.txt and the final response contains AURORA-LIME.',
  },
  {
    id: 'test_retrieval_medium_file',
    name: 'Information Retrieval (Medium File)',
    category: 'information_retrieval',
    prompt: 'Read retrieval/medium_report.txt and report the scheduled backup day and time. Answer using the file content.',
    expectedTool: 'read_file',
    expectedArgSubstrings: { relative_path: 'medium_report.txt' },
    expectedResponseSubstrings: ['Thursday', '02:30 UTC'],
    description: 'Retrieves a precise fact embedded near the middle of a medium text fixture.',
    objective: 'Tests grounded question answering over a medium file.',
    requiredOutput: 'The final answer must contain Thursday and 02:30 UTC.',
    evaluationCriteria: 'PASSES only if read_file is called for medium_report.txt and the final response contains both expected facts.',
  },
  {
    id: 'test_retrieval_long_file',
    name: 'Information Retrieval (Long File, Near-End Fact)',
    category: 'information_retrieval',
    prompt: 'Read retrieval/long_archive.txt and return the exact emergency recovery phrase. Answer using the file content.',
    expectedTool: 'read_file',
    expectedArgSubstrings: { relative_path: 'long_archive.txt' },
    expectedResponseSubstrings: ['ORBIT-CEDAR-731'],
    description: 'Retrieves a unique fact placed near the end of a long text fixture.',
    objective: 'Tests long-context grounded retrieval without relying on tool-call success alone.',
    requiredOutput: 'The final answer must contain ORBIT-CEDAR-731.',
    evaluationCriteria: 'PASSES only if read_file is called for long_archive.txt and the final response contains ORBIT-CEDAR-731.',
  },

  // --- CATEGORY 10: PROJECT CONTEXT & ON-DEMAND SKILLS ---
  {
    id: 'test_project_context_agents_instructions',
    name: 'Project Context (.agent/AGENTS.md Instructions)',
    category: 'project_context',
    prompt:
      'Which verification script is specified by the project instructions? Quote its name only; this is an information question, not a request to execute anything.',
    expectedTool: null,
    expectedResponseSubstrings: ['npm run fixture-check'],
    enableProjectContext: true,
    description:
      'Verifies that `.agent/AGENTS.md` is injected into project context and can be followed without an unnecessary file read.',
    objective: 'Tests automatic project-level instruction grounding.',
    requiredOutput: 'Answer with npm run fixture-check without invoking a tool.',
    evaluationCriteria:
      'PASSES only if the answer contains npm run fixture-check and no tool is called.',
  },
  {
    id: 'test_project_context_reads_relevant_skill',
    name: 'Project Context (Read Relevant Skill On Demand)',
    category: 'project_context',
    prompt:
      'We are preparing version 3.0. What project-specific release checklist should I follow?',
    expectedTool: 'read_file',
    expectedArgSubstrings: { relative_path: '.agent/skills/release-helper/SKILL.md' },
    expectedResponseSubstrings: ['SAPPHIRE-CHECK-42', 'npm run fixture-check'],
    enableProjectContext: true,
    forbiddenToolCalls: [
      {
        name: 'read_file',
        argument: 'relative_path',
        substring: '.agent/skills/theme-stylist/SKILL.md',
      },
    ],
    description:
      'Verifies that matching skill metadata triggers reading the full relevant SKILL.md, without reading an unrelated skill.',
    objective: 'Tests selective, on-demand project skill loading.',
    requiredOutput:
      'Read .agent/skills/release-helper/SKILL.md and answer with its checklist, including SAPPHIRE-CHECK-42; do not read theme-stylist.',
    evaluationCriteria:
      'PASSES only if release-helper/SKILL.md is read, theme-stylist/SKILL.md is not read, and the grounded answer contains both required facts.',
  },
  {
    id: 'test_project_context_skips_irrelevant_skills',
    name: 'Project Context (Skip Irrelevant Skills)',
    category: 'project_context',
    prompt: 'What is the capital of Japan?',
    expectedTool: null,
    expectedResponseSubstrings: ['Tokyo'],
    enableProjectContext: true,
    description:
      'Verifies that the presence of advertised project skills does not cause irrelevant skill reads.',
    objective: 'Tests discrimination against unnecessary project skill loading.',
    requiredOutput: 'Answer Tokyo directly without invoking read_file or any other tool.',
    evaluationCriteria:
      'PASSES only if the model answers Tokyo without any tool calls.',
  },

  // --- CATEGORY 11: WEB SEARCH & PAGE READING ---
  {
    id: 'test_web_search_official_docs',
    name: 'Web Search (Official Ollama Documentation)',
    category: 'web_search',
    prompt:
      'Search the web for the official Ollama documentation using web_search. Tell me the title of the most relevant result.',
    expectedTool: 'web_search',
    expectedArgSubstrings: { query: 'Ollama' },
    expectedResponseSubstrings: ['Ollama documentation'],
    description:
      'Verifies the model selects web_search and uses a short relevant query for a current public-web lookup.',
    objective: 'Tests simple web-search tool selection and grounded use of returned result metadata.',
    requiredOutput:
      'Call web_search with a query containing Ollama, then answer with the result title Ollama documentation.',
    evaluationCriteria:
      'PASSES only if web_search is invoked with a relevant query and the final response contains Ollama documentation.',
  },
  {
    id: 'test_web_search_then_read_page',
    name: 'Web Research Workflow (Search → Read Markdown)',
    category: 'web_search',
    prompt:
      'Research the Project Lighthouse release codename on the web. First use web_search, then open the most relevant result with read_web_page. Return the exact release codename from the page.',
    expectedToolSequence: ['web_search', 'read_web_page'],
    expectedArgSubstrings: {
      query: 'Project Lighthouse',
      url: 'https://benchmark.example/lighthouse-release',
    },
    expectedResponseSubstrings: ['NEBULA-FERN-204'],
    description:
      'Verifies the complete small-model web workflow: concise search followed by clean Markdown page reading.',
    objective: 'Tests ordered multi-step web research and grounded fact extraction from page content.',
    requiredOutput:
      'Call web_search for Project Lighthouse, call read_web_page with the returned benchmark URL, then answer NEBULA-FERN-204.',
    evaluationCriteria:
      'PASSES only if web_search precedes read_web_page, the returned URL is reused, and the final response contains NEBULA-FERN-204.',
  },
  {
    id: 'test_web_direct_page_read',
    name: 'Direct Web Page Reading (Markdown Extraction Result)',
    category: 'web_search',
    prompt:
      'Read https://benchmark.example/lighthouse-release with read_web_page and report the release date stated on the page.',
    expectedTool: 'read_web_page',
    expectedArgSubstrings: { url: 'https://benchmark.example/lighthouse-release' },
    expectedResponseSubstrings: ['17 October 2026'],
    description: 'Verifies a supplied public URL is sent directly to read_web_page without an unnecessary search.',
    objective: 'Tests direct page-reader selection and grounded extraction from its Markdown response.',
    requiredOutput:
      'Call read_web_page with the exact supplied URL, then answer with 17 October 2026.',
    evaluationCriteria:
      'PASSES only if read_web_page is invoked for the supplied URL and the final response contains 17 October 2026.',
  },
  {
    id: 'test_web_real_life_deep_research',
    name: 'Real-Life Web Research (Implicit Search → Verify Source)',
    category: 'web_search',
    prompt:
      "We're still running Node.js 22 in production. Can you look into how long we have before it stops receiving security updates?",
    expectedToolSequence: ['web_search', 'read_web_page'],
    expectedArgSubstrings: {
      query: 'Node',
      url: 'https://benchmark.example/node-release-schedule',
    },
    expectedResponseSubstrings: ['30 April 2027'],
    description:
      'Uses a natural maintenance question without naming tools, a website, or the required research steps.',
    objective:
      'Tests whether the agent independently recognizes that a time-sensitive real-life question requires web search, opens an authoritative result, and grounds its answer in page content.',
    requiredOutput:
      'Search for the Node.js 22 support timeline, read the relevant release-schedule page, and answer that security support ends on 30 April 2027.',
    evaluationCriteria:
      'PASSES only if web_search precedes read_web_page, the result URL is reused, and the final response contains 30 April 2027. A memory-only answer or search-snippet-only answer fails.',
  },
];
