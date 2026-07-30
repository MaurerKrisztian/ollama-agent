import readline from 'readline';
import chalk from 'chalk';
import { Command } from 'commander';
import { AgentEngine } from '../core/agent.js';
import { runSingleBenchmarkTest } from '../benchmark/runner.js';
import { BENCHMARK_TEST_CASES, BenchmarkTestCase } from '../benchmark/testCases.js';

const program = new Command();

program
  .name('ollama-agent-cli')
  .description('Interactive CLI agent powered by Ollama and shared Core Agent Engine')
  .argument('[prompt]', 'Optional single-shot prompt to execute')
  .option('-m, --model <name>', 'Ollama model name', 'qwen2.5-coder:7b')
  .option('-t, --temperature <val>', 'Model temperature (0.0 to 1.0)', '0.2')
  .option('-h, --host <url>', 'Ollama host URL', 'http://127.0.0.1:11434')
  .option('--token <token>', 'Optional bearer token (or set OLLAMA_TOKEN)', process.env.OLLAMA_TOKEN)
  .option('-d, --dir <path>', 'Working directory path', process.cwd())
  .option('-y, --auto-approve', 'Auto-approve terminal command execution without asking', false)
  .option('-s, --system <prompt>', 'Custom system prompt')
  .option('-b, --benchmark', 'Run the benchmark suite instead of chat mode')
  .option('-c, --category <name>', 'Filter benchmark to a specific category (use with --benchmark)')
  .parse(process.argv);

const options = program.opts();
const positionalPrompt = program.args.join(' ');

async function startCli() {
  const agent = new AgentEngine({
    model: options.model,
    ollamaHost: options.host,
    ollamaToken: options.token,
    workingDir: options.dir,
    systemPrompt: options.system,
  });

  let autoApprove = options.autoApprove === true;

  const promptConfirmation = (cmd: string): Promise<'accept' | 'reject' | 'all'> => {
    return new Promise((resolve) => {
      const rlConfirm = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      console.log(chalk.bold.yellow(`\n⚠️  Terminal Execution Confirmation Required:`));
      console.log(chalk.cyan(`Command: `) + chalk.bold.white(cmd));
      rlConfirm.question(chalk.bold.yellow('Confirm execution? ([y] Accept / [n] Reject / [a] Accept All for session) > '), (ans) => {
        rlConfirm.close();
        const lower = ans.trim().toLowerCase();
        if (lower === 'a' || lower === 'all') {
          resolve('all');
        } else if (lower === 'y' || lower === 'yes' || lower === '') {
          resolve('accept');
        } else {
          resolve('reject');
        }
      });
    });
  };

  // Wrap executeCommand on ToolExecutor for CLI safety confirmation
  const executor = agent.getToolExecutor();
  const originalExecuteCommand = executor.executeCommand.bind(executor);
  executor.executeCommand = async (command: string) => {
    if (!autoApprove) {
      const choice = await promptConfirmation(command);
      if (choice === 'reject') {
        console.log(chalk.red(`❌ Terminal command execution rejected by user.`));
        return {
          command,
          stdout: '',
          stderr: 'Execution cancelled by user.',
          exitCode: 1,
          error: 'Terminal command execution rejected by user.',
        };
      }
      if (choice === 'all') {
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
    const validCategories = [
      'directory_reading', 'file_reading', 'file_creation', 'file_editing',
      'code_editing', 'code_search', 'discrimination', 'multi_step_workflow', 'terminal_execution',
    ];

    if (category && !validCategories.includes(category)) {
      console.log(chalk.red(`\n❌ Unknown category: "${category}"\n`));
      console.log(chalk.bold('Available categories:'));
      validCategories.forEach((c) => console.log(`  ${chalk.cyan(c)}`))
      process.exit(1);
    }

    const filteredTests = category
      ? BENCHMARK_TEST_CASES.filter((t: BenchmarkTestCase) => t.category === category)
      : BENCHMARK_TEST_CASES;

    console.log(chalk.bold.cyan(`\n🧪 Benchmark Suite${category ? ` — Category: ${chalk.yellow(category)}` : ''}`));
    console.log(chalk.dim(`Model: ${options.model} | Tests: ${filteredTests.length}\n`));

    let pass = 0;
    let fail = 0;

    for (let i = 0; i < filteredTests.length; i++) {
      const test = filteredTests[i];
      process.stdout.write(chalk.dim(`[${i + 1}/${filteredTests.length}] ${test.name} ... `));
      try {
        const result = await runSingleBenchmarkTest(test.id, options.model, options.host, options.token);
        if (result.passed) {
          pass++;
          console.log(chalk.green(`PASS`) + chalk.dim(` (${result.durationMs}ms)`));
        } else {
          fail++;
          console.log(chalk.red(`FAIL`) + chalk.dim(` — ${result.reason}`));
        }
      } catch (err: any) {
        fail++;
        console.log(chalk.red(`ERROR — ${err.message}`));
      }
    }

    console.log(chalk.bold(`\n📊 Results: ${chalk.green(`${pass} passed`)} / ${chalk.red(`${fail} failed`)} / ${filteredTests.length} total`));
    const pct = Math.round((pass / filteredTests.length) * 100);
    console.log(chalk.bold(`Accuracy: ${pct >= 80 ? chalk.green(pct + '%') : pct >= 50 ? chalk.yellow(pct + '%') : chalk.red(pct + '%')}\n`));
    process.exit(fail > 0 ? 1 : 0);
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
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    // Command handling
    if (input.startsWith('/')) {
      const [cmd, ...args] = input.split(' ');
      const argString = args.join(' ');

      switch (cmd.toLowerCase()) {
        case '/help':
          console.log(chalk.bold('\nAvailable Slash Commands:'));
          console.log('  /models                    - List available Ollama models');
          console.log('  /model <name>              - Switch active model');
          console.log('  /dir [path]                - View or set working directory');
          console.log('  /sys [prompt]              - View or update custom system prompt');
          console.log('  /context                   - Show converted text context & stats');
          console.log('  /json                      - Output raw context JSON');
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
            'code_editing', 'code_search', 'discrimination', 'multi_step_workflow', 'terminal_execution',
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
          let bPass = 0;
          let bFail = 0;
          for (let bi = 0; bi < testsToRun.length; bi++) {
            const bt = testsToRun[bi];
            process.stdout.write(chalk.dim(`  [${bi + 1}/${testsToRun.length}] ${bt.name} ... `));
            try {
              const res = await runSingleBenchmarkTest(bt.id, currentModel, currentHost, options.token);
              if (res.passed) {
                bPass++;
                console.log(chalk.green('PASS') + chalk.dim(` (${res.durationMs}ms)`));
              } else {
                bFail++;
                console.log(chalk.red('FAIL') + chalk.dim(` — ${res.reason}`));
              }
            } catch (err: any) {
              bFail++;
              console.log(chalk.red(`ERROR — ${err.message}`));
            }
          }
          const bPct = Math.round((bPass / testsToRun.length) * 100);
          console.log(chalk.bold(`\n  📊 ${chalk.green(`${bPass} passed`)} / ${chalk.red(`${bFail} failed`)} — Accuracy: ${
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
        onChunk: (chunk) => {
          process.stdout.write(chunk);
        },
        onToolStart: (name, toolArgs) => {
          console.log(chalk.yellow(`\n🔧 [Tool Call] ${name}(${JSON.stringify(toolArgs)})`));
        },
        onToolEnd: (name, result) => {
          console.log(chalk.dim(`✓ [Tool Result] ${name}: ${JSON.stringify(result).substring(0, 120)}...`));
          process.stdout.write(chalk.bold.magenta('Agent > '));
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
