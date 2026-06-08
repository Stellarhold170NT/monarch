import fs from 'fs';
import path from 'path';

const activeSessions = new Set();

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

    // Find the last assistant message
    let lastAssistantMsg = null;
    for (let i = messages.length - 1; i >= 0; i--) {
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
          try {
            fs.writeFileSync(loopJsonPath, JSON.stringify(state, null, 2), 'utf8');
          } catch (e) { }

          const verificationPrompt = `[V-AGENT SYSTEM - ULW VERIFICATION LƯỢT ${state.iteration}/${maxIterations}]
Bạn đã báo DONE. BẮT BUỘC BÂY GIỜ:
- Hãy tạm ngưng vai trò lập trình viên thông thường. Chuyển sang tư duy của một kiểm định viên (QA/Oracle) độc lập và hoài nghi.
- Rà soát lại toàn bộ mã nguồn vừa chỉnh sửa, kiểm tra kỹ xem có lỗi logic hay trường hợp biên nào bị bỏ sót không bằng cách đọc kỹ yêu cầu của người dùng lại một lần nữa.
- Nếu mọi thứ ĐÃ CHÍNH XÁC tuyệt đối, hãy xuất thẻ tín hiệu: <promise>VERIFIED</promise>.
- Nếu phát hiện lỗi hoặc điểm chưa hoàn thiện, hãy trực tiếp sửa lỗi (hoặc liệt kê và sửa) rồi xuất thẻ: <promise>DONE</promise> khi sẵn sàng kiểm tra lại.

Nhiệm vụ gốc:
${state.prompt}`;

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

          try {
            fs.writeFileSync(loopJsonPath, JSON.stringify(state, null, 2), 'utf8');
          } catch (e) { }

          const verificationPrompt = `[V-AGENT SYSTEM - ULW VERIFICATION LƯỢT ${state.iteration}/${maxIterations}]
Bạn tiếp tục báo DONE sau khi chỉnh sửa. BẮT BUỘC BÂY GIỜ:
- Tiếp tục đánh giá khách quan mã nguồn ở vai trò kiểm định viên (QA/Oracle).
- Nếu đã chính xác hoàn toàn và không còn lỗi nào khác, xuất thẻ tín hiệu: <promise>VERIFIED</promise>.
- If you find any other issue, please fix it directly and output: <promise>DONE</promise> when ready.

Nhiệm vụ gốc:
${state.prompt}`;

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

    try {
      fs.writeFileSync(loopJsonPath, JSON.stringify(state, null, 2), 'utf8');
    } catch (e) { }

    const continuationPrompt = `[V-AGENT SYSTEM - ULW LOOP LƯỢT ${state.iteration}/${maxIterations}]
Tiếp tục thực hiện nhiệm vụ. Khi hoàn thành, bắt buộc xuất thẻ tín hiệu: <promise>DONE</promise>.

Nhiệm vụ gốc:
${state.prompt}`;

    try {
      await sendPromptAsync(continuationPrompt);
    } catch (e) {
      log(`Failed to send continuation prompt: ${e.message}`);
    }
  } finally {
    activeSessions.delete(sessionId);
  }
};