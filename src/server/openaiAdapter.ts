import { Request, Response } from 'express';
import { AgentEngine } from '../core/agent.js';

export function handleOpenAiModels(agent: AgentEngine, req: Request, res: Response) {
  const currentModel = agent.getConfig().model || 'local-model-chat';
  res.json({
    object: 'list',
    data: [
      {
        id: currentModel,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'local-model-chat',
      },
      {
        id: 'local-model-chat',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'local-model-chat',
      },
    ],
  });
}

export async function handleOpenAiChatCompletions(
  agent: AgentEngine,
  req: Request,
  res: Response
) {
  const { messages, stream, model } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: { message: 'Messages array is required and must not be empty.', type: 'invalid_request_error' },
    });
  }

  // Extract last user prompt
  const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
  const prompt = lastUserMsg?.content || '';

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reqId = `chatcmpl-${Date.now()}`;
    let fullResponse = '';

    try {
      await agent.sendMessage(prompt, {
        onChunk: (chunk: string) => {
          fullResponse += chunk;
          const delta = {
            id: reqId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: model || agent.getConfig().model,
            choices: [
              {
                index: 0,
                delta: { content: chunk },
                finish_reason: null,
              },
            ],
          };
          res.write(`data: ${JSON.stringify(delta)}\n\n`);
        },
      });

      const finalChunk = {
        id: reqId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: model || agent.getConfig().model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      };
      res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: { message: err.message } });
      } else {
        res.end();
      }
    }
  } else {
    // Non-streaming response
    let responseText = '';
    try {
      await agent.sendMessage(prompt, {
        onChunk: (chunk: string) => {
          responseText += chunk;
        },
      });

      res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model || agent.getConfig().model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: responseText,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: { message: err.message, type: 'api_error' } });
    }
  }
}
