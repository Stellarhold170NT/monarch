import fs from 'fs';
import path from 'path';

const activeSessions = new Set();
const recentSyntheticIdleAt = new Map(); // sessionId → timestamp (rapid idle dedup)
const RAPID_IDLE_DEDUP_MS = 500;         // skip real idle within 500ms of synthetic idle (Sisyphus parity)

// ── oh-my-openagent compatible guard constants ──
const SETTLE_MS = 150;                // idleSettleMs: brief wait before acting on idle
const USER_MSG_IN_PROGRESS_MS = 2000; // skip if last user msg created within this window
// ─────────────────────────────────────────────

function hasPendingToolCalls(messages, startIdx) {
  // Check assistant messages for pending/running tool calls → session is busy
  for (let i = messages.length - 1; i >= (startIdx || 0); i--) {
    const msg = messages[i];
    if (msg?.info?.role === 'assistant' && Array.isArray(msg.parts)) {
      for (const part of msg.parts) {
        if (part.type === 'tool' && part.state && (part.state.status === 'pending' || part.state.status === 'running')) {
          return true;
        }
      }
    }
  }
  return false;
}

function latestUserMessageInProgress(messages) {
  // Check if the latest user message was created within USER_MSG_IN_PROGRESS_MS
  // Matches Sisyphus event-handler-activity.ts:124-126 behavior
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg) continue;

    // If we hit an assistant or tool message before a user message, the user's
    // latest input has already been consumed → not in progress (Sisyphus parity)
    if (msg?.info?.role === 'assistant' || msg?.info?.role === 'tool') {
      return false;
    }

    if (msg?.info?.role === 'user') {
      // Sisyphus reads from msg.info.time.created or msg.time.created
      const createdAt = (msg.info?.time?.created) || (msg.time?.created) || msg.created || msg.timestamp || (msg.info?.created) || (msg.info?.timestamp);
      if (createdAt && Date.now() - new Date(createdAt).getTime() < USER_MSG_IN_PROGRESS_MS) {
        return true;
      }
      return false; // Found the latest user msg, it's older than the window
    }
  }
  return false;
}

function collectAssistantText(message) {
  if (!message || !Array.isArray(message.parts)) return "";
  let text = "";
  for (const part of message.parts) {
    if (part.type === "text" || part.type === "tool_result") {
      text += (text ? "\n" : "") + (part.text || "");
    }
  }
  return text;
}

export const handleSessionIdle = async (client, directory, sessionId, loopJsonPath) => {
  const getLogFilePath = (dir) => {
    const containerLogDir = '/logs/agent';
    try {
      if (fs.existsSync(containerLogDir) && fs.statSync(containerLogDir).isDirectory()) {
        return path.join(containerLogDir, 'v-agent-debug.log');
      }
    } catch (e) { }
    return path.join(dir, 'v-agent-debug.log');
  };
  const logFile = getLogFilePath(directory);
  const log = (msg) => {
    try {
      fs.appendFileSync(logFile, `[LOOP-HANDLER] ${msg}\n`, 'utf8');
    } catch (e) { }
  };

  if (activeSessions.has(sessionId)) {
    log(`handleSessionIdle skipped for sessionId ${sessionId}: already processing`);
    return;
  }
  activeSessions.add(sessionId);

  try {
    log(`handleSessionIdle started. sessionId: ${sessionId}`);

    if (!fs.existsSync(loopJsonPath)) {
      log(`loopJsonPath does not exist: ${loopJsonPath}`);
      return;
    }

    let state;
    try {
      state = JSON.parse(fs.readFileSync(loopJsonPath, 'utf8'));
      log(`Read loop state: ${JSON.stringify(state)}`);
    } catch (e) {
      log(`Failed to read/parse loop state: ${e.message}`);
      return;
    }

    if (!state || !state.active) {
      log(`State is not active.`);
      return;
    }

    if (state.sessionId && state.sessionId !== sessionId) {
      log(`Skipped: Event sessionId ${sessionId} does not match loop initiator sessionId ${state.sessionId}`);
      return;
    }

    // 1. Fetch current session messages to inspect the latest turn
    let messages = [];
    try {
      log(`Fetching messages for sessionId: ${sessionId}`);
      // Try both object path and string path compatibility
      let response;
      try {
        log(`Trying client.session.messages with path: { id: sessionId }`);
        response = await client.session.messages({ path: { id: sessionId } });
        log(`messages response (object path) success`);
      } catch (e1) {
        log(`messages response (object path) failed: ${e1.message}. Trying string path.`);
        response = await client.session.messages({ path: sessionId });
        log(`messages response (string path) success`);
      }

      if (Array.isArray(response)) {
        messages = response;
      } else if (response && typeof response === 'object' && 'data' in response && Array.isArray(response.data)) {
        messages = response.data;
      }
      log(`Fetched ${messages.length} messages`);
    } catch (e) {
      log(`Failed to fetch session messages: ${e.message}`);
      return;
    }

    // Find the last assistant message within scope (only check messages since last continuation)
    const startIdx = typeof state.messageCountAtStart === 'number' ? state.messageCountAtStart : 0;
    let lastAssistantMsg = null;
    for (let i = messages.length - 1; i >= startIdx; i--) {
      if (messages[i]?.info?.role === 'assistant') {
        lastAssistantMsg = messages[i];
        break;
      }
    }

    const assistantText = collectAssistantText(lastAssistantMsg);
    log(`Last assistant msg text sample: "${assistantText.slice(0, 100)}..."`);
    const hasDone = /<promise>\s*DONE\s*<\/promise>/i.test(assistantText);
    const hasVerified = /<promise>\s*VERIFIED\s*<\/promise>/i.test(assistantText);
    log(`hasDone: ${hasDone}, hasVerified: ${hasVerified}`);

    const maxIterations = state.maxIterations || 30;

    const sendPromptAsync = async (promptText) => {
      log(`Sending promptAsync with body parts length 1...`);
      try {
        log(`Trying promptAsync with path: { id: sessionId }`);
        await client.session.promptAsync({
          path: { id: sessionId },
          body: {
            parts: [{ type: "text", text: promptText }]
          },
          query: { directory }
        });
        log(`promptAsync (object path) success`);
      } catch (e1) {
        log(`promptAsync (object path) failed: ${e1.message}. Trying string path.`);
        try {
          await client.session.promptAsync({
            path: sessionId,
            body: {
              parts: [{ type: "text", text: promptText }]
            },
            query: { directory }
          });
          log(`promptAsync (string path) success`);
        } catch (e2) {
          log(`promptAsync (string path) failed: ${e2.message}`);
          throw e2;
        }
      }
    };

    // Case A: VERIFIED found -> Successful completion
    if (hasVerified) {
      state.active = false;
      state.status = 'done';
      try {
        fs.writeFileSync(loopJsonPath, JSON.stringify(state, null, 2), 'utf8');
        if (client.tui?.showToast) {
          await client.tui.showToast({
            body: {
              title: "V-AGENT LOOP COMPLETE!",
              message: `Nhiệm vụ đã hoàn thành và được kiểm định thành công sau ${state.iteration} lượt!`,
              variant: "success",
              duration: 5000
            }
          });
        }
      } catch (e) { }
      if (process.env.V_AGENT_EXIT_ON_VERIFIED === 'true') {
        log(`Loop verified successfully. Exiting process (V_AGENT_EXIT_ON_VERIFIED is enabled).`);
        setTimeout(() => {
          process.exit(0);
        }, 500);
      } else {
        log(`Loop verified successfully. Keeping process alive (V_AGENT_EXIT_ON_VERIFIED is not enabled).`);
      }
      return;
    }

    // Case B: DONE found -> Check mode
    if (hasDone) {
      if (state.mode === 'ulw') {
        if (state.status === 'working') {
          // First time reporting done in ULW -> Transition to verifying phase
          state.status = 'verifying';
          state.iteration += 1;
          state.messageCountAtStart = messages.length;
          try {
            fs.writeFileSync(loopJsonPath, JSON.stringify(state, null, 2), 'utf8');
          } catch (e) { }

          const taskLabel = state.prompt;
          const verificationPrompt = `[V-AGENT SYSTEM - ULW VERIFICATION LƯỢT ${state.iteration}/${maxIterations}]
You reported DONE. REQUIRED NOW:
- DO NOT self-verify. Call **Igris** (subagent_type="igris") to review the work.
- Wait for Igris response. Do not conclude yourself.
- Igris says VERIFIED → output: <promise>VERIFIED</promise>.
- Igris finds issues → fix them → output: <promise>DONE</promise> for next verification round.

Task: ${taskLabel}`;

          try {
            await sendPromptAsync(verificationPrompt);
          } catch (e) {
            log(`Failed to send verification prompt: ${e.message}`);
          }
          return;
        } else if (state.status === 'verifying') {
          // Already in verifying phase, but reported DONE again (meaning they found bugs, fixed them, and re-submitted DONE)
          state.iteration += 1;
          if (state.iteration > maxIterations) {
            state.active = false;
            state.status = 'timeout';
            try {
              fs.writeFileSync(loopJsonPath, JSON.stringify(state, null, 2), 'utf8');
            } catch (e) { }
            return;
          }

          state.messageCountAtStart = messages.length;
          try {
            fs.writeFileSync(loopJsonPath, JSON.stringify(state, null, 2), 'utf8');
          } catch (e) { }

          const taskLabel = state.prompt;
          const verificationPrompt = `[V-AGENT SYSTEM - ULW VERIFICATION LƯỢT ${state.iteration}/${maxIterations}]
You reported DONE again after fixing. REQUIRED NOW:
- DO NOT self-verify. Call **Igris** (subagent_type="igris") to re-review.
- Wait for Igris response. Do not conclude yourself.
- Igris says VERIFIED → output: <promise>VERIFIED</promise>.
- Igris finds issues → fix → output: <promise>DONE</promise>.

Task: ${taskLabel}`;

          try {
            await sendPromptAsync(verificationPrompt);
          } catch (e) {
            log(`Failed to send verification prompt: ${e.message}`);
          }
          return;
        }
      } else {
        // Normal mode -> DONE means immediate finish
        state.active = false;
        state.status = 'done';
        try {
          fs.writeFileSync(loopJsonPath, JSON.stringify(state, null, 2), 'utf8');
          if (client.tui?.showToast) {
            await client.tui.showToast({
              body: {
                title: "V-AGENT LOOP COMPLETE!",
                message: `Nhiệm vụ đã hoàn thành sau ${state.iteration} lượt!`,
                variant: "success",
                duration: 5000
              }
            });
          }
        } catch (e) { }
        return;
      }
    }

    // ── Guard checks (oh-my-openagent compatible) ──
    // Before sending continuation, verify session is truly idle (not busy with tool calls)
    await new Promise(r => setTimeout(r, SETTLE_MS));

    // 1. Rapid idle dedup — skip if a synthetic idle was handled within 500ms (Sisyphus parity)
    const lastSynthetic = recentSyntheticIdleAt.get(sessionId);
    if (lastSynthetic && Date.now() - lastSynthetic < RAPID_IDLE_DEDUP_MS) {
      log(`Guard: rapid idle dedup (${Date.now() - lastSynthetic}ms since last synthetic) -> skip`);
      return;
    }

    // 2. Re-read state in case it changed during settle
    try {
      if (fs.existsSync(loopJsonPath)) {
        const freshState = JSON.parse(fs.readFileSync(loopJsonPath, 'utf8'));
        if (!freshState.active || freshState.status === 'done') {
          log(`State changed during settle -> skip continuation`);
          return;
        }
      }
    } catch (e) { }

    // 3. Authoritative session.status() check (Sisyphus primary mechanism)
    try {
      let sessionBusy = false;
      if (typeof client.session.status === 'function') {
        const statusResp = await client.session.status({ path: { id: sessionId }, query: { directory } });
        const statusType = statusResp?.[sessionId]?.type || statusResp?.type;
        if (['busy', 'running', 'retry'].includes(statusType)) {
          sessionBusy = true;
        }
      } else if (typeof client.session.get === 'function') {
        const sessionInfo = await client.session.get({ path: { sessionID: sessionId }, query: { directory } });
        if (sessionInfo?.status && ['busy', 'running', 'retry'].includes(sessionInfo.status)) {
          sessionBusy = true;
        }
      }
      if (sessionBusy) {
        log(`Guard: session.status reports busy -> skip continuation`);
        state.messageCountAtStart = messages.length;
        try { fs.writeFileSync(loopJsonPath, JSON.stringify(state, null, 2), 'utf8'); } catch (e) { }
        return;
      }
    } catch (e) {
      log(`Guard: session.status check failed (non-critical): ${e.message}`);
    }

    // 4. Check if latest user message is still in progress (created within 2s window)
    if (latestUserMessageInProgress(messages)) {
      log(`Guard: latest user message in progress (within ${USER_MSG_IN_PROGRESS_MS}ms) -> skip continuation`);
      state.messageCountAtStart = messages.length;
      try { fs.writeFileSync(loopJsonPath, JSON.stringify(state, null, 2), 'utf8'); } catch (e) { }
      return;
    }

    // 5. Check for pending/running tool calls → session is busy (secondary heuristic)
    if (hasPendingToolCalls(messages, startIdx)) {
      log(`Guard: pending/running tool calls detected -> session is busy, skip continuation`);
      state.messageCountAtStart = messages.length;
      try { fs.writeFileSync(loopJsonPath, JSON.stringify(state, null, 2), 'utf8'); } catch (e) { }
      return;
    }
    // ─────────────────────────────────────────────

    // Case C: No special tags found -> Agent is still working but idle
    state.iteration += 1;
    if (state.iteration > maxIterations) {
      state.active = false;
      state.status = 'timeout';
      try {
        fs.writeFileSync(loopJsonPath, JSON.stringify(state, null, 2), 'utf8');
        if (client.tui?.showToast) {
          await client.tui.showToast({
            body: {
              title: "V-AGENT LOOP STOPPED",
              message: `Vòng lặp tự động dừng do vượt quá số lượt tối đa (${maxIterations})`,
              variant: "warning",
              duration: 5000
            }
          });
        }
      } catch (e) { }
      return;
    }

    state.messageCountAtStart = messages.length;
    try {
      fs.writeFileSync(loopJsonPath, JSON.stringify(state, null, 2), 'utf8');
    } catch (e) { }

    // System directive: simple continuation WITHOUT full spec to avoid Phase 0 verb pollution.
    // Agent already has the full spec in conversation history.
    const taskLabel = state.prompt;
    const continuationPrompt = `[V-AGENT SYSTEM - ULW LOOP LƯỢT ${state.iteration}/${maxIterations}]
Continue working until the task is fully complete. When done, output: <promise>DONE</promise>.

Task: ${taskLabel}`;

    try {
      await sendPromptAsync(continuationPrompt);
    } catch (e) {
      log(`Failed to send continuation prompt: ${e.message}`);
    }
  } finally {
    activeSessions.delete(sessionId);
  }
};