import readline from 'readline';
import chalk from 'chalk';
import { Command, Option } from 'commander';
import { AgentEngine } from '../core/agent.js';
import { BENCHMARK_TEST_CASES } from '../benchmark/cases/index.js';
import type { BenchmarkTestCase } from '../benchmark/cases/index.js';
import { runBenchmarkCase } from '../benchmark/runtime/runner.js';
import { categorizeError } from '../core/types.js';
import { isCommandWhitelisted, DEFAULT_COMMAND_WHITELIST } from '../core/commandWhitelist.js';
import type { BenchmarkAgentConfig } from '../benchmark/types.js';
import type { ContextPruningConfig, ToolComplexityProfile } from '../core/types.js';
import {
  formatProjectSkillList,
  listProjectSkills,
  loadProjectSkill,
  parseSkillReferences,
} from '../core/skills.js';
import type { LoadedProjectSkill } from '../core/skills.js';

const program = new Command();

program
  .name('ollama-agent-cli')
  .description('Interactive CLI agent powered by Ollama and shared Core Agent Engine')
  .argument('[prompt]', 'Optional single-shot prompt to execute')
  .option('-m, --model <name>', 'Ollama model name', 'qwen3.5:9b')
  .option('-t, --temperature <val>', 'Model temperature (0.0 to 1.0)', '0.2')
  .option('-h, --host <url>', 'Ollama host URL', 'http://127.0.0.1:11434')
  .option('--token <token>', 'Optional bearer token (or set OLLAMA_TOKEN)', process.env.OLLAMA_TOKEN)
  .option('-d, --dir <path>', 'Working directory path', process.cwd())
  .option('--workdir-info', 'Include project info, .agent instructions, and skill metadata in model context', false)
  .addOption(new Option('--tool-profile <profile>', 'Tool schema profile').choices(['simple', 'medium', 'advanced']).default('simple'))
  .option('--no-pruning', 'Disable automatic context pruning')
  .option('--no-prune-superseded-reads', 'Keep older read_file results in context')
  .option('--no-invalidate-on-mutation', 'Do not invalidate cached reads after file mutations')
  .option('--no-tool-ttl', 'Disable terminal/web tool-output expiry')
  .option('--terminal-ttl <turns>', 'Terminal output lifetime in conversation turns', '5')
  .option('--web-ttl <turns>', 'Web output lifetime in conversation turns', '5')
  .option('-y, --auto-approve', 'Auto-approve terminal command execution without asking', false)
  .option('-w, --whitelist <cmds...>', 'Whitelisted commands to auto-approve without asking', DEFAULT_COMMAND_WHITELIST.join(','))
  .option('-s, --system <prompt>', 'Custom system prompt')
  .option('-b, --benchmark', 'Run the benchmark suite instead of chat mode')
  .option('-c, --category <name>', 'Filter benchmark to a specific category (use with --benchmark)')
  .option('--test <id-or-number>', 'Run one benchmark scenario by test ID or 1-based number')
  .option('--attempts <count>', 'Reliability attempts per benchmark case (1-10)', '3')
  .option('--parallelism <count>', 'Concurrent benchmark attempts (1-10)', '1')
  .option('--framework <name>', 'Benchmark framework engine (native, pi, opencode)', 'native')
  .option('--mount-host-config', 'Mount host config directory into benchmark sandbox', false)
  .option('-v, --verbose', 'Show live streaming tool calls, thinking steps, and Docker container logs', false)
  .option('--docker-logs', 'Alias to show live Docker container logs during benchmark runs', false)
  .parse(process.argv);

const options = program.opts();
const positionalPrompt = program.args.join(' ');

async function startCli() {
  const parseTtl = (value: string, optionName: string): number => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      program.error(`${optionName} must be a non-negative integer.`);
    }
    return parsed;
  };
  const pruningConfig: ContextPruningConfig = {
    enabled: options.pruning !== false,
    pruneSupersededReads: options.pruneSupersededReads !== false,
    invalidateOnMutation: options.invalidateOnMutation !== false,
    enableToolTTL: options.toolTtl !== false,
    terminalOutputTTLTurns: parseTtl(options.terminalTtl, '--terminal-ttl'),
    webOutputTTLTurns: parseTtl(options.webTtl, '--web-ttl'),
  };
  const benchmarkAttempts = Number(options.attempts);
  if (!Number.isInteger(benchmarkAttempts) || benchmarkAttempts < 1 || benchmarkAttempts > 10) {
    program.error('--attempts must be an integer between 1 and 10.');
  }
  if (options.benchmark && benchmarkAttempts === 10) {
    console.warn(chalk.yellow('Warning: 10 attempts is the maximum and can take significant time and compute for every selected case.'));
  }
  const benchmarkParallelism = Number(options.parallelism);
  if (!Number.isInteger(benchmarkParallelism) || benchmarkParallelism < 1 || benchmarkParallelism > 10) {
    program.error('--parallelism must be an integer between 1 and 10.');
  }
  const agent = new AgentEngine({
    model: options.model,
    ollamaHost: options.host,
    ollamaToken: options.token,
    workingDir: options.dir,
    systemPrompt: options.system,
    showWorkingDirInfo: options.workdirInfo,
    temperature: Number(options.temperature),
    complexityProfile: options.toolProfile as ToolComplexityProfile,
    pruningConfig,
  });

  const getBenchmarkAgentConfig = (): BenchmarkAgentConfig => {
    const config = agent.getConfig();
    return {
      temperature: config.temperature,
      systemPrompt: config.systemPrompt,
      showWorkingDirInfo: config.showWorkingDirInfo,
      contextWindow: config.contextWindow,
      maxLoops: config.maxLoops,
      enableThinking: config.enableThinking,
      complexityProfile: config.complexityProfile,
      pruningConfig: agent.getContextManager().getPruningConfig(),
      framework: options.framework,
      mountHostConfig: options.mountHostConfig === true,
    };
  };

  let autoApprove = options.autoApprove === true;

  const promptConfirmation = (cmd: string): Promise<{ action: 'accept' | 'reject' | 'all'; reason?: string }> => {
    return new Promise((resolve) => {
      const rlConfirm = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      console.log(chalk.bold.yellow(`\n⚠️  Terminal Execution Confirmation Required:`));
      console.log(chalk.cyan(`Command: `) + chalk.bold.white(cmd));
      rlConfirm.question(chalk.bold.yellow('Confirm execution? ([y] Accept / [n] Reject / [r] Reject with message / [a] Accept All for session) > '), (ans) => {
        const lower = ans.trim().toLowerCase();
        if (lower === 'a' || lower === 'all') {
          rlConfirm.close();
          resolve({ action: 'all' });
        } else if (lower === 'y' || lower === 'yes' || lower === '') {
          rlConfirm.close();
          resolve({ action: 'accept' });
        } else if (lower === 'r' || lower === 'reason') {
          rlConfirm.question(chalk.bold.yellow('Rejection message / feedback for model > '), (reasonMsg) => {
            rlConfirm.close();
            resolve({ action: 'reject', reason: reasonMsg.trim() });
          });
        } else {
          rlConfirm.close();
          resolve({ action: 'reject' });
        }
      });
    });
  };

  const allowedCommands: string[] = Array.isArray(options.whitelist)
    ? options.whitelist.flatMap((w: string) => w.split(','))
    : typeof options.whitelist === 'string'
    ? options.whitelist.split(',')
    : DEFAULT_COMMAND_WHITELIST;

  // Wrap executeCommand on ToolExecutor for CLI safety confirmation
  const executor = agent.getToolExecutor();
  const originalExecuteCommand = executor.executeCommand.bind(executor);
  executor.executeCommand = async (command: string) => {
    if (!autoApprove && !isCommandWhitelisted(command, allowedCommands)) {
      const result = await promptConfirmation(command);
      if (result.action === 'reject') {
        const errText = result.reason ? `Execution rejected by user: "${result.reason}"` : 'Execution cancelled by user.';
        console.log(chalk.red(`❌ ${errText}`));
        return {
          command,
          stdout: '',
          stderr: errText,
          exitCode: 1,
          error: errText,
        };
      }
      if (result.action === 'all') {
        autoApprove = true;
        console.log(chalk.green(`✓ Auto-approval enabled for session.`));
      }
    }
    return originalExecuteCommand(command);
  };

  console.log(chalk.bold.cyan('\n🤖 Ollama Agent CLI'));
  console.log(chalk.dim(`Ollama Host: ${agent.getConfig().ollamaHost}`));
  console.log(chalk.dim(`Active Model: ${agent.getConfig().model}`));
  console.log(chalk.dim(`Working Dir: ${agent.getConfig().workingDir}`));
  console.log(chalk.dim(`Tool Profile: ${agent.getConfig().complexityProfile}`));
  console.log(chalk.dim(`Context Pruning: ${agent.getContextManager().getPruningConfig().enabled ? 'ENABLED' : 'DISABLED'}`));
  console.log(chalk.dim(`Auto-Approve Terminal: ${autoApprove ? 'ENABLED (-y)' : 'DISABLED (Confirmation Prompt Active)'}`));
  console.log(chalk.dim('Type /help for slash commands, or type your message to chat.\n'));

  // Test Ollama connection & populate model list if possible
  try {
    const models = await agent.getAvailableModels();
    if (models.length === 0) {
      console.log(chalk.yellow('⚠️ Warning: No models found on Ollama server. Ensure Ollama is running and models are pulled.'));
    } else {
      console.log(chalk.green(`✓ Found ${models.length} installed Ollama model(s): ${models.map((m) => m.name).join(', ')}`));
    }
  } catch (err: any) {
    console.log(chalk.red(`⚠️ Ollama Connection Notice: ${err.message}`));
  }

  // Benchmark mode
  if (options.benchmark) {
    const category = options.category as string | undefined;
    const testSelector = options.test as string | undefined;
    const validCategories = [
      'directory_reading', 'file_reading', 'file_creation', 'file_editing',
      'code_editing', 'code_search', 'discrimination', 'multi_step_workflow', 'terminal_execution', 'information_retrieval',
      'project_context', 'web_search', 'real_web_search', 'ast_lsp_navigation',
    ];

    if (category && !validCategories.includes(category)) {
      console.log(chalk.red(`\n❌ Unknown category: "${category}"\n`));
      console.log(chalk.bold('Available categories:'));
      validCategories.forEach((c) => console.log(`  ${chalk.cyan(c)}`))
      process.exit(1);
    }

    let filteredTests = category
      ? BENCHMARK_TEST_CASES.filter((t: BenchmarkTestCase) => t.category === category)
      : BENCHMARK_TEST_CASES;

    if (testSelector) {
      if (/^\d+$/.test(testSelector)) {
        const scenarioNumber = Number(testSelector);
        const selected = filteredTests[scenarioNumber - 1];
        if (!selected) {
          console.log(chalk.red(
            `\n❌ Scenario number ${scenarioNumber} is outside the available range 1-${filteredTests.length}` +
            `${category ? ` for category "${category}"` : ''}.\n`
          ));
          process.exit(1);
        }
        filteredTests = [selected];
      } else {
        const selected = filteredTests.find((test) => test.id === testSelector);
        if (!selected) {
          console.log(chalk.red(
            `\n❌ Benchmark test ID "${testSelector}" was not found` +
            `${category ? ` in category "${category}"` : ''}.\n`
          ));
          process.exit(1);
        }
        filteredTests = [selected];
      }
    }

    console.log(chalk.bold.cyan(
      `\n🧪 Benchmark Suite${category ? ` — Category: ${chalk.yellow(category)}` : ''}` +
      `${testSelector ? ` — Single scenario: ${chalk.yellow(filteredTests[0].id)}` : ''}`
    ));
    console.log(chalk.dim(`Model: ${options.model} | Tests: ${filteredTests.length}\n`));

    let successfulAttempts = 0;
    let totalAttempts = 0;

    const showLogs = Boolean(options.verbose || options.dockerLogs);
    const stepHandler = showLogs ? (step: any) => {
      if (step.type === 'step_start') {
        console.log(`\n  ${chalk.yellow.bold(`📌 [Step ${step.stepIndex}/${step.totalSteps}]`)} ${chalk.bold.yellow(`"${step.prompt}"`)}`);
      } else if (step.type === 'step_evaluation') {
        const mark = step.passed ? chalk.green.bold(`  ✅ [Step ${step.stepIndex}/${step.totalSteps} PASSED]`) : chalk.red.bold(`  ❌ [Step ${step.stepIndex}/${step.totalSteps} FAILED]`);
        console.log(`${mark} ${chalk.dim(step.reason)}`);
      } else if (step.type === 'tool_start') {
        const argsStr = step.args ? chalk.gray(JSON.stringify(step.args)) : '';
        console.log(`  ${chalk.yellow('🛠️  [Tool Start]')} ${chalk.bold.white(step.name)} ${argsStr}`);
      } else if (step.type === 'tool_end') {
        console.log(`  ${chalk.green('✓  [Tool Done] ')} ${chalk.dim(step.name)}`);
      } else if (step.type === 'assistant_message' && step.text?.trim()) {
        console.log(`  ${chalk.cyan('💬 [Model]     ')} ${chalk.dim(step.text.trim().slice(0, 150))}`);
      } else if (step.type === 'thinking' && step.text?.trim()) {
        console.log(`  ${chalk.magenta('🧠 [Thinking]  ')} ${chalk.dim(step.text.trim().slice(0, 120))}...`);
      } else if (step.type === 'docker_stderr' && step.text?.trim()) {
        console.log(`  ${chalk.gray('🐳 [Container] ')} ${chalk.gray(step.text.trim())}`);
      }
    } : undefined;

    for (let i = 0; i < filteredTests.length; i++) {
      const test = filteredTests[i];
      console.log('\n' + chalk.cyan.bold('─'.repeat(70)));
      console.log(`${chalk.bgCyan.black.bold(` TEST ${i + 1}/${filteredTests.length} `)} ${chalk.bold.white(test.name)} ${chalk.gray(`(${test.id})`)}`);
      console.log(chalk.cyan.bold('─'.repeat(70)));

      if (test.description && test.description !== test.prompt) {
        console.log(`  ${chalk.gray('ℹ️  Description:')} ${chalk.dim(test.description)}`);
      }
      if (test.prompt) {
        console.log(`  ${chalk.yellow('📝 Prompt:')}       ${chalk.bold.yellow(`"${test.prompt}"`)}`);
      }
      if (test.requiredOutput) {
        console.log(`  ${chalk.blue('🎯 Target:')}       ${chalk.cyan(test.requiredOutput)}`);
      }
      console.log();

      try {
        const result = await runBenchmarkCase(test, options.model, options.host, options.token, undefined, getBenchmarkAgentConfig(), benchmarkAttempts, undefined, benchmarkParallelism, stepHandler);
        successfulAttempts += result.successfulAttempts;
        totalAttempts += result.attemptCount;

        const isSuccess = result.successRatePercentage === 100;
        const statusTag = isSuccess
          ? chalk.bgGreen.black.bold(' ✅ RELIABLE ')
          : chalk.bgRed.white.bold(' ❌ FAILED ');

        console.log(`\n  ${statusTag} ${isSuccess ? chalk.bold.green(`${result.successRatePercentage}% Success`) : chalk.bold.red(`${result.successRatePercentage}% Success`)} ${chalk.gray(`(${result.successfulAttempts}/${result.attemptCount} attempts · ${Math.round(result.durationMs)}ms wall time)`)}`);

        const multiStepList = (result.verificationDetails as any)?.details?.multiStepDetails;
        if (Array.isArray(multiStepList) && multiStepList.length > 0) {
          console.log(`\n  ${chalk.bold.yellow('📋 Multi-Step Workflow Breakdown:')}`);
          for (const s of multiStepList) {
            const icon = s.passed ? chalk.green('  ✅') : chalk.red('  ❌');
            const label = s.stepId ? `Step ${s.stepIndex} (${s.stepId})` : `Step ${s.stepIndex}`;
            const statusText = s.passed ? chalk.green.bold('PASSED') : chalk.red.bold('FAILED');
            console.log(`${icon} ${chalk.bold(label)} [${statusText}]: "${chalk.dim(s.prompt)}"`);
            console.log(`     ${chalk.gray(`Outcome: ${s.reason}`)}`);
          }
        }

        if (result.responseContent?.trim()) {
          console.log(`\n  ${chalk.bold.cyan('💬 Final Model Answer:')}`);
          const lines = result.responseContent.trim().split('\n');
          lines.forEach((line) => console.log(`    ${chalk.cyan(line)}`));
        }

        if (result.reason) {
          console.log(`\n  ${chalk.bold(isSuccess ? chalk.green('📋 Overall Verdict:') : chalk.red('📋 Overall Verdict:'))}`);
          console.log(`    ${isSuccess ? chalk.green(result.reason) : chalk.red(result.reason)}`);
        }

        if (!isSuccess && Array.isArray(result.executionTrace) && result.executionTrace.length > 0) {
          console.log(`\n  ${chalk.bold.red('🔍 Execution Trace & Model Thinking:')}`);
          for (const event of result.executionTrace) {
            if (event.thinking?.trim()) {
              console.log(`    ${chalk.magenta('🧠 Thinking:')} ${chalk.dim(event.thinking.trim())}`);
            }
            if (event.type === 'tool_start') {
              console.log(`    ${chalk.yellow('🛠️  Tool Call:')} ${chalk.bold.white(event.name)} ${chalk.gray(JSON.stringify(event.args || {}))}`);
            }
            if (event.type === 'tool_end') {
              const snippet = typeof event.result === 'string' ? event.result.slice(0, 160) : JSON.stringify(event.result || {}).slice(0, 160);
              console.log(`    ${chalk.gray('    ↳ Result:')} ${chalk.dim(snippet)}`);
            }
          }
        }
      } catch (err: any) {
        totalAttempts += benchmarkAttempts;
        console.log(`\n  ${chalk.bgRed.white.bold(' 💥 ERROR ')} ${chalk.red(err.message)}`);
      }
    }

    const failedAttempts = totalAttempts - successfulAttempts;
    const pct = totalAttempts ? Math.round((successfulAttempts / totalAttempts) * 100) : 0;
    console.log(chalk.bold(`\n📊 Reliability: ${chalk.green(`${successfulAttempts} successful`)} / ${chalk.red(`${failedAttempts} failed`)} / ${totalAttempts} attempts`));
    console.log(chalk.bold(`Success rate: ${pct >= 80 ? chalk.green(pct + '%') : pct >= 50 ? chalk.yellow(pct + '%') : chalk.red(pct + '%')}\n`));
    process.exit(failedAttempts > 0 ? 1 : 0);
  }

  // Single-shot execution if positional prompt is passed
  if (positionalPrompt && positionalPrompt.trim()) {
    console.log(chalk.bold.blue(`\nUser > ${positionalPrompt}`));
    console.log(chalk.yellow('Agent > Thinking...'));
    try {
      const response = await agent.sendMessage(positionalPrompt, {
        onChunk: (chunk) => process.stdout.write(chunk),
        onToolStart: (name, args) => {
          console.log(chalk.bold.magenta(`\n⚡ Tool Request: ${name}(${JSON.stringify(args)})`));
        },
        onToolEnd: (name, result) => {
          const resStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          console.log(chalk.green(`✓ Tool Output (${name}):\n${resStr.length > 500 ? resStr.substring(0, 500) + '...' : resStr}`));
        },
      });
      console.log(chalk.bold.green('\n✓ Agent Execution Complete.\n'));
    } catch (err: any) {
      console.log(chalk.red(`\n❌ Error: ${err.message}\n`));
    }
    process.exit(0);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.bold.blue('\nUser > '),
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const originalInput = line.trim();
    let input = originalInput;
    let selectedSkills: LoadedProjectSkill[] = [];
    if (!input) {
      rl.prompt();
      return;
    }

    if (/^\/skills\s*$/i.test(input)) {
      console.log(`\n${formatProjectSkillList(await listProjectSkills(agent.getConfig().workingDir))}`);
      rl.prompt();
      return;
    }
    const skillReferences = parseSkillReferences(input);
    if (skillReferences.names.length > 0) {
      if (!skillReferences.request) {
        console.log(chalk.red('Add a request before or after the @skill:<name> reference.'));
        rl.prompt();
        return;
      }
      const loadedSkills = await Promise.all(
        skillReferences.names.map((name) => loadProjectSkill(agent.getConfig().workingDir, name))
      );
      const missingSkillIndex = loadedSkills.findIndex((skill) => skill === null);
      if (missingSkillIndex >= 0) {
        console.log(chalk.red(`Skill "${skillReferences.names[missingSkillIndex]}" was not found. Use /skills to list available skills.`));
        rl.prompt();
        return;
      }
      selectedSkills = loadedSkills.filter((skill): skill is LoadedProjectSkill => skill !== null);
      input = skillReferences.request;
      console.log(chalk.dim(`Using skills: ${selectedSkills.map((skill) => skill.name).join(', ')}`));
    }

    // Command handling
    if (input.startsWith('/') && selectedSkills.length === 0) {
      const [cmd, ...args] = input.split(' ');
      const argString = args.join(' ');

      switch (cmd.toLowerCase()) {
        case '/help':
          console.log(chalk.bold('\nAvailable Slash Commands:'));
          console.log('  /models                    - List available Ollama models');
          console.log('  /model <name>              - Switch active model');
          console.log('  /dir [path]                - View or set working directory');
          console.log('  /sys [prompt]              - View or update custom system prompt');
          console.log('  /workdir-info [on|off]     - View or toggle working directory context');
          console.log('  /tool-profile [profile]    - View or set simple, medium, or advanced tool schemas');
          console.log('  /pruning [setting] [value] - View or update context-pruning settings');
          console.log('  /context                   - Show converted text context & stats');
          console.log('  /json                      - Output raw context JSON');
          console.log('  /skills                    - List available skills');
          console.log('  @skill:<name> <request>    - Reference a skill in any prompt');
          console.log('  /clear                     - Reset current chat context');
          console.log('  /benchmark [category]      - Run benchmark suite (optional category filter)');
          console.log('  /exit                      - Exit CLI application');
          console.log(chalk.dim('\n  Benchmark categories: directory_reading, file_reading, file_creation,'));
          console.log(chalk.dim('    file_editing, code_editing, code_search, discrimination, multi_step_workflow, terminal_execution'));
          break;

        case '/models':
          try {
            const list = await agent.getAvailableModels();
            console.log(chalk.bold('\nInstalled Ollama Models:'));
            list.forEach((m) => {
              const active = m.name === agent.getConfig().model ? chalk.green(' (active)') : '';
              console.log(` - ${m.name}${active}`);
            });
          } catch (err: any) {
            console.log(chalk.red(`Failed to fetch models: ${err.message}`));
          }
          break;

        case '/model':
          if (!argString) {
            console.log(chalk.yellow(`Current model: ${agent.getConfig().model}`));
          } else {
            agent.updateConfig({ model: argString });
            console.log(chalk.green(`✓ Switched active model to: ${argString}`));
          }
          break;

        case '/dir':
          if (!argString) {
            console.log(chalk.yellow(`Current working directory: ${agent.getConfig().workingDir}`));
          } else {
            const res = agent.getToolExecutor().setWorkingDir(argString);
            if (res.success) {
              agent.updateConfig({ workingDir: res.path });
              console.log(chalk.green(`✓ Working directory updated to: ${res.path}`));
            } else {
              console.log(chalk.red(`Error: ${res.error}`));
            }
          }
          break;

        case '/sys':
          if (!argString) {
            console.log(chalk.yellow(`System Prompt:\n${agent.getConfig().systemPrompt}`));
          } else {
            agent.updateConfig({ systemPrompt: argString });
            console.log(chalk.green(`✓ System prompt updated.`));
          }
          break;

        case '/workdir-info': {
          const value = argString.trim().toLowerCase();
          if (!value) {
            console.log(chalk.yellow(`Working directory context: ${agent.getConfig().showWorkingDirInfo ? 'on' : 'off'}`));
          } else if (value === 'on' || value === 'off') {
            agent.updateConfig({ showWorkingDirInfo: value === 'on' });
            console.log(chalk.green(`✓ Working directory context ${value}.`));
          } else {
            console.log(chalk.red('Usage: /workdir-info [on|off]'));
          }
          break;
        }

        case '/tool-profile': {
          const profile = argString.trim().toLowerCase();
          if (!profile) {
            console.log(chalk.yellow(`Tool schema profile: ${agent.getConfig().complexityProfile}`));
          } else if (profile === 'simple' || profile === 'medium' || profile === 'advanced') {
            agent.updateConfig({ complexityProfile: profile });
            console.log(chalk.green(`✓ Tool schema profile set to ${profile}.`));
          } else {
            console.log(chalk.red('Usage: /tool-profile [simple|medium|advanced]'));
          }
          break;
        }

        case '/pruning': {
          const [setting = '', rawValue = ''] = args.map((value) => value.trim().toLowerCase());
          const current = agent.getContextManager().getPruningConfig();
          if (!setting) {
            console.log(chalk.yellow('Context pruning configuration:'));
            console.log(JSON.stringify(current, null, 2));
            break;
          }

          if ((setting === 'on' || setting === 'off') && !rawValue) {
            agent.updateConfig({ pruningConfig: { ...current, enabled: setting === 'on' } });
            console.log(chalk.green(`✓ Context pruning ${setting}.`));
            break;
          }

          const booleanSettings: Record<string, keyof Pick<ContextPruningConfig, 'pruneSupersededReads' | 'invalidateOnMutation' | 'enableToolTTL'>> = {
            superseded: 'pruneSupersededReads',
            mutation: 'invalidateOnMutation',
            ttl: 'enableToolTTL',
          };
          const booleanKey = booleanSettings[setting];
          if (booleanKey && (rawValue === 'on' || rawValue === 'off')) {
            agent.updateConfig({ pruningConfig: { ...current, [booleanKey]: rawValue === 'on' } });
            console.log(chalk.green(`✓ Pruning setting ${setting} set to ${rawValue}.`));
            break;
          }

          const ttlSettings: Record<string, 'terminalOutputTTLTurns' | 'webOutputTTLTurns'> = {
            'terminal-ttl': 'terminalOutputTTLTurns',
            'web-ttl': 'webOutputTTLTurns',
          };
          const ttlKey = ttlSettings[setting];
          const ttlValue = Number(rawValue);
          if (ttlKey && Number.isInteger(ttlValue) && ttlValue >= 0) {
            agent.updateConfig({ pruningConfig: { ...current, [ttlKey]: ttlValue } });
            console.log(chalk.green(`✓ ${setting} set to ${ttlValue} turns.`));
            break;
          }

          console.log(chalk.red('Usage: /pruning [on|off|superseded on|off|mutation on|off|ttl on|off|terminal-ttl N|web-ttl N]'));
          break;
        }

        case '/context':
          const info = agent.getContextManager().getContextInfo();
          console.log(chalk.bold.magenta('\n=== CONVERSATION CONTEXT ==='));
          console.log(chalk.dim(`Messages: ${info.totalMessages} | Chars: ${info.charCount} | Est. Tokens: ${info.estimatedTokens}`));
          console.log(chalk.gray(info.formattedText));
          break;

        case '/json':
          const json = agent.getContextManager().getRawJson();
          console.log(chalk.bold.magenta('\n=== RAW CONTEXT JSON ==='));
          console.log(json);
          break;

        case '/clear':
          agent.resetChat();
          console.log(chalk.green('✓ Chat context cleared.'));
          break;

        case '/benchmark': {
          const catFilter = argString.trim() || undefined;
          const validCats = [
            'directory_reading', 'file_reading', 'file_creation', 'file_editing',
            'code_editing', 'code_search', 'discrimination', 'multi_step_workflow', 'terminal_execution', 'information_retrieval',
            'project_context', 'web_search', 'real_web_search', 'ast_lsp_navigation',
          ];
          if (catFilter && !validCats.includes(catFilter)) {
            console.log(chalk.red(`\n❌ Unknown category: "${catFilter}"\n`));
            console.log(chalk.bold('Available categories:'));
            validCats.forEach((c) => console.log(`  ${chalk.cyan(c)}`));
            break;
          }
          const testsToRun = catFilter
            ? BENCHMARK_TEST_CASES.filter((t: BenchmarkTestCase) => t.category === catFilter)
            : BENCHMARK_TEST_CASES;
          const currentModel = agent.getConfig().model;
          const currentHost = agent.getConfig().ollamaHost;
          console.log(chalk.bold.cyan(`\n🧪 Benchmark${catFilter ? ` — ${chalk.yellow(catFilter)}` : ''} | Model: ${currentModel} | Tests: ${testsToRun.length}`));
          let bSuccessfulAttempts = 0;
          let bTotalAttempts = 0;
          for (let bi = 0; bi < testsToRun.length; bi++) {
            const bt = testsToRun[bi];
            process.stdout.write(chalk.dim(`  [${bi + 1}/${testsToRun.length}] ${bt.name} ... `));
            try {
              const res = await runBenchmarkCase(bt, currentModel, currentHost, options.token, undefined, getBenchmarkAgentConfig(), benchmarkAttempts, undefined, benchmarkParallelism);
              bSuccessfulAttempts += res.successfulAttempts;
              bTotalAttempts += res.attemptCount;
              const label = res.successRatePercentage === 100 ? chalk.green('RELIABLE') : chalk.yellow(`${res.successRatePercentage}%`);
              console.log(label + chalk.dim(` — ${res.successfulAttempts}/${res.attemptCount} attempts, ${Math.round(res.durationMs)}ms average comparison time`));
            } catch (err: any) {
              bTotalAttempts += benchmarkAttempts;
              console.log(chalk.red(`ERROR — ${err.message}`));
            }
          }
          const bFailedAttempts = bTotalAttempts - bSuccessfulAttempts;
          const bPct = bTotalAttempts ? Math.round((bSuccessfulAttempts / bTotalAttempts) * 100) : 0;
          console.log(chalk.bold(`\n  📊 ${chalk.green(`${bSuccessfulAttempts} successful`)} / ${chalk.red(`${bFailedAttempts} failed`)} attempts — Success rate: ${
            bPct >= 80 ? chalk.green(bPct + '%') : bPct >= 50 ? chalk.yellow(bPct + '%') : chalk.red(bPct + '%')
          }\n`));
          break;
        }

        case '/exit':
          console.log(chalk.cyan('Goodbye!'));
          process.exit(0);

        default:
          console.log(chalk.red(`Unknown command "${cmd}". Type /help for options.`));
          break;
      }

      rl.prompt();
      return;
    }

    // Process user input message
    process.stdout.write(chalk.bold.magenta('\nAgent > '));

    try {
      await agent.sendMessage(input, {
        userDisplayContent: selectedSkills.length > 0 ? originalInput : undefined,
        selectedSkills: selectedSkills.length > 0 ? selectedSkills : undefined,
        onChunk: (chunk) => {
          process.stdout.write(chunk);
        },
        onToolStart: (name, toolArgs) => {
          console.log(chalk.yellow(`\n🔧 [Tool Call] ${name}(${JSON.stringify(toolArgs)})`));
        },
        onToolEnd: (name, result) => {
          const isErr = !!(result?.error || result?.failed || result?.success === false || (result?.exitCode !== undefined && result.exitCode !== 0));
          const icon = isErr ? '✗' : '✓';
          const colorFn = isErr ? chalk.red : chalk.dim;
          let summary = '';
          if (isErr) {
            const { code, reason } = categorizeError(result?.error || result?.reason, result);
            summary = ` [${code}: ${reason}]`;
          }
          console.log(colorFn(`${icon} [Tool Result] ${name}${summary}: ${JSON.stringify(result).substring(0, 100)}...`));
          process.stdout.write(chalk.bold.magenta('Agent > '));
        },
        onMaxLoopsReached: (limit) => {
          console.log(chalk.bold.yellow(`\n⚠️  [Max Loops Reached] Reached maximum limit of ${limit} tool call iterations. You can increase maxLoops in config or set it to 0 for unlimited.`));
        },
      });
      console.log('\n');
    } catch (err: any) {
      console.log(chalk.red(`\nError: ${err.message}`));
    }

    rl.prompt();
  });
}

startCli();
