import fs from 'fs';
import path from 'path';

export const handleMessageTransform = async (input, output, {
  roleJsonPath,
  roleDir,
  definedRoles,
  debugLog,
  getBootstrapContent,
  superpowersSkillsDir,
  loopJsonPath
}) => {
  debugLog(`transform called. messages count: ${output.messages.length}`);

  // --- LOOP DETECT & INITIALIZATION ---
  if (loopJsonPath) {
    const userMessages = output.messages.filter(m => m.info.role === 'user');
    if (userMessages.length > 0) {
      const lastUserMsg = userMessages[userMessages.length - 1];
      const hasInstructions = lastUserMsg.parts.some(p => p.type === 'text' && (p.text.includes('VCORP_LOOP_INSTRUCTION') || p.text.includes('[V-AGENT SYSTEM')));

      if (!hasInstructions) {
        let textToCheck = '';
        for (const part of lastUserMsg.parts) {
          if (part.type === 'text' && !part.text.includes('EXTREMELY_IMPORTANT')) {
            textToCheck += ' ' + part.text;
          }
        }
        textToCheck = textToCheck.trim();

        const cleanRegex = /^\s*(?:\/(?:ulw|v-loop)\b|\b(?:ulw|v-loop)\b[:\s-]*)/i;
        const isUlw = /\b(ulw)\b/i.test(textToCheck) || textToCheck.includes('/ulw');
        const isVLoop = /\b(v-loop)\b/i.test(textToCheck) || textToCheck.includes('/v-loop');

        if (isUlw || isVLoop) {
          // Extract current sessionId early so we can detect stale loops
          let sessionId = null;
          if (output.messages && output.messages.length > 0) {
            const firstMsg = output.messages[0];
            sessionId = firstMsg.sessionID || (firstMsg.info && (firstMsg.info.sessionID || firstMsg.info.id));
          }

          let isAlreadyActive = false;
          if (fs.existsSync(loopJsonPath)) {
            try {
              const currentState = JSON.parse(fs.readFileSync(loopJsonPath, 'utf8'));
              if (currentState && currentState.active) {
                // Only consider active if it's from the SAME session.
                // Stale loop.json from a dead session blocks new sessions — reset it.
                if (currentState.sessionId && currentState.sessionId === sessionId) {
                  isAlreadyActive = true;
                } else {
                  debugLog(`Stale loop detected: stored sessionId=${currentState.sessionId}, current sessionId=${sessionId}. Resetting for new session.`);
                }
              }
            } catch (e) { }
          }

          if (!isAlreadyActive) {
            const mode = isUlw ? 'ulw' : 'normal';
            const firstTextPart = lastUserMsg.parts.find(p => p.type === 'text' && !p.text.includes('EXTREMELY_IMPORTANT'));
            let cleanPrompt = textToCheck;

            if (firstTextPart) {
              cleanPrompt = firstTextPart.text.replace(cleanRegex, '').trim();
              if (cleanPrompt) {
                firstTextPart.text = cleanPrompt;
              } else {
                cleanPrompt = firstTextPart.text;
              }
            }

            const initialState = {
              active: true,
              sessionId: sessionId,
              mode: mode,
              iteration: 1,
              maxIterations: 100,
              prompt: cleanPrompt,
              status: 'working',
              messageCountAtStart: 0
            };

            try {
              fs.writeFileSync(loopJsonPath, JSON.stringify(initialState, null, 2), 'utf8');
              debugLog(`Initialized loop state: ${mode} mode for sessionId ${sessionId} with prompt: "${cleanPrompt}"`);

              if (firstTextPart) {
                const instruction = `\n\n<VCORP_LOOP_INSTRUCTION>
[V-AGENT SYSTEM - ULW LOOP 1/100] Bạn đang chạy trong chế độ lặp tự động (${mode === 'ulw' ? 'ULW' : 'Thường'}).
BẮT BUỘC CHO AI: Hãy phân tích yêu cầu và thực hiện các thay đổi cần thiết. 
Khi bạn tin rằng công việc đã HOÀN THÀNH, bạn BẮT BUỘC phải báo cáo kết quả cụ thể và xuất thẻ tín hiệu: <promise>DONE</promise>.
</VCORP_LOOP_INSTRUCTION>`;
                firstTextPart.text = instruction + "\n\n" + firstTextPart.text;
              }
            } catch (e) {
              debugLog(`Error initializing loop.json: ${e.message}`);
            }
          } else {
            debugLog(`Skip loop initialization: loop is already active in loop.json.`);
          }
        }
      }
    }
  }
// ------------------------------------




// Read current role
let currentRole = 'default';
if (fs.existsSync(roleJsonPath)) {
  try {
    const data = JSON.parse(fs.readFileSync(roleJsonPath, 'utf8'));
    const rawRole = data.role || 'default';
    if (rawRole === 'default' || definedRoles.includes(rawRole)) {
      currentRole = rawRole;
    } else {
      fs.writeFileSync(roleJsonPath, JSON.stringify({ role: 'default' }, null, 2), 'utf8');
      currentRole = 'default';
      debugLog(`Invalid role found in role.json, reset to default`);
    }
    debugLog(`read currentRole: ${currentRole}`);
  } catch (e) {
    debugLog(`Error reading currentRole: ${e.message}`);
  }
}

if (definedRoles.length > 0) {
  let matchedRole = null;

  // 1. Check if the user is using the /v-role command in their LATEST user message
  const userMessages = output.messages.filter(m => m.info.role === 'user');
  let lastUserText = '';
  if (userMessages.length > 0) {
    const lastUserMsg = userMessages[userMessages.length - 1];
    for (const part of lastUserMsg.parts) {
      if (part.type === 'text') {
        if (
          part.text.includes('VCORP_ROLE_PROMPT') ||
          part.text.includes('EXTREMELY_IMPORTANT') ||
          part.text.includes('VCORP_ROLE_CONFIRMATION') ||
          part.text.includes('VCORP_ACTIVE_ROLE')
        ) {
          continue;
        }
        lastUserText += ' ' + part.text.toLowerCase();
      } else if (part.type === 'tool' && part.tool === 'question' && part.state && part.state.status === 'completed') {
        lastUserText += ' ' + (part.state.output ? part.state.output.toLowerCase() : '');
      }
    }
  }
  lastUserText = lastUserText.trim();

  const hasVRoleCommand = lastUserText.includes('/v-role') ||
    lastUserText.includes('yêu cầu chuyển đổi hoặc thiết lập lại vai trò phát triển của v-agent');

  let isInvalidCommand = false;
  let cleanText = lastUserText;
  if (hasVRoleCommand) {
    cleanText = lastUserText
      .replace('/v-role', '')
      .replace(/yêu cầu chuyển đổi hoặc thiết lập lại vai trò phát triển của v-agent/gi, '')
      .trim();
  }

  if (hasVRoleCommand) {
    // Check if a valid role is specified as an argument in the cleaned text
    for (const r of definedRoles) {
      const regex = new RegExp(`\\b${r}\\b`);
      if (regex.test(cleanText)) {
        matchedRole = r;
        break;
      }
    }

    if (!matchedRole) {
      if (cleanText.length > 0) {
        isInvalidCommand = true;
      } else {
        // Reset role to default if command has no arguments
        currentRole = 'default';
        try {
          fs.writeFileSync(roleJsonPath, JSON.stringify({ role: 'default' }, null, 2), 'utf8');
          debugLog(`successfully reset role to default via /v-role command`);
        } catch (e) {
          debugLog(`Error resetting role.json: ${e.message}`);
        }
      }
    }
  } else if (currentRole === 'default') {
    // If role is default, identify prompt-response-confirmation boundaries in history
    let lastPromptIndex = -1;
    let lastConfirmIndex = -1;
    for (let i = 0; i < output.messages.length; i++) {
      const msg = output.messages[i];
      if (!msg.parts) continue;
      for (const part of msg.parts) {
        if (part.type === 'text') {
          if (part.text.includes('VCORP_ROLE_PROMPT')) {
            lastPromptIndex = i;
          }
          if (part.text.includes('VCORP_ROLE_CONFIRMATION')) {
            lastConfirmIndex = i;
          }
        }
      }
    }

    let textToCheck = '';
    const isPromptResolved = lastPromptIndex !== -1 && lastConfirmIndex !== -1 && lastConfirmIndex >= lastPromptIndex;
    if (!isPromptResolved) {
      const startIndex = lastPromptIndex !== -1 ? lastPromptIndex : 0;
      for (let i = startIndex; i < output.messages.length; i++) {
        const msg = output.messages[i];
        if (!msg.parts) continue;
        for (const part of msg.parts) {
          if (part.type === 'text') {
            if (
              part.text.includes('VCORP_ROLE_PROMPT') ||
              part.text.includes('EXTREMELY_IMPORTANT') ||
              part.text.includes('VCORP_ROLE_CONFIRMATION') ||
              part.text.includes('VCORP_ACTIVE_ROLE')
            ) {
              continue;
            }
            textToCheck += ' ' + part.text.toLowerCase();
          } else if (part.type === 'tool' && part.tool === 'question' && part.state && part.state.status === 'completed') {
            textToCheck += ' ' + (part.state.output ? part.state.output.toLowerCase() : '');
          }
        }
      }
    }
    textToCheck = textToCheck.trim();

    if (textToCheck) {
      for (const r of definedRoles) {
        const regex = new RegExp(`\\b${r}\\b`);
        if (regex.test(textToCheck)) {
          matchedRole = r;
          break;
        }
      }
    }
    debugLog(`scanned messages, textToCheck: "${textToCheck}", matchedRole: ${matchedRole}, currentRole: ${currentRole}`);
  }

  if (isInvalidCommand) {
    const errorMsg = `\n\n<important-reminder id="VCORP_ROLE_ERROR">
[VCORP SYSTEM] Yêu cầu chuyển sang vai trò không thành công. Lý do: Vai trò được yêu cầu không hợp lệ hoặc chưa được cấu hình (dự án hiện chỉ có cấu hình các vai trò: [ ${definedRoles.join(', ')} ]).
BẮT BUỘC CHO AI: Bạn TUYỆT ĐỐI KHÔNG được gọi bất kỳ công cụ nào (như read, write, edit, glob, skill...) để kiểm tra hay thao tác trong lượt này. Hãy phản hồi trực tiếp, ngắn gọn từ chối yêu cầu chuyển đổi vai trò này và thông báo cho người dùng biết dự án chỉ hỗ trợ các vai trò: [ ${definedRoles.join(', ')} ].
</important-reminder>`;
    if (userMessages.length > 0) {
      const lastUserMsg = userMessages[userMessages.length - 1];
      const ref = lastUserMsg.parts[0];
      lastUserMsg.parts.unshift({ ...ref, type: 'text', text: errorMsg });
    }
  } else if (matchedRole && matchedRole !== currentRole) {
    currentRole = matchedRole;
    try {
      fs.writeFileSync(roleJsonPath, JSON.stringify({ role: matchedRole }, null, 2), 'utf8');
      debugLog(`successfully wrote role ${matchedRole} to role.json`);
    } catch (e) {
      debugLog(`Error writing role.json: ${e.message}`);
    }

    const confirmMsg = `\n\n<important-reminder id="VCORP_ROLE_CONFIRMATION">
[VCORP SYSTEM] Đã xác nhận và chuyển sang vai trò: ${matchedRole.toUpperCase()}.
Tập kỹ năng tương ứng cho vai trò "${matchedRole}" đã được nạp thành công.
LƯU Ý QUAN TRỌNG CHO AI: Việc chuyển đổi vai trò đã được hệ thống tự động thực hiện và lưu vào role.json. Bạn TUYỆT ĐỐI không cần phải chỉnh sửa file, không cần nạp hay tạo skill nào khác cho tác vụ này. Hãy chỉ xác nhận ngắn gọn bằng 1 câu rằng bạn đã nhận diện vai trò ${matchedRole.toUpperCase()} và sẵn sàng hỗ trợ các bước tiếp theo.
</important-reminder>`;
    if (userMessages.length > 0) {
      const lastUserMsg = userMessages[userMessages.length - 1];
      const ref = lastUserMsg.parts[0];
      lastUserMsg.parts.unshift({ ...ref, type: 'text', text: confirmMsg });
    }
  } else if (currentRole === 'default') {
    // If no role matched yet and we are still in default role, inject warning prompt asking agent to ask user for role
    if (userMessages.length > 0) {
      const lastUserMsg = userMessages[userMessages.length - 1];
      if (lastUserMsg && lastUserMsg.parts.length) {
        if (!lastUserMsg.parts.some(p => p.type === 'text' && p.text.includes('VCORP_ROLE_PROMPT'))) {
          const promptMsg = `\n\n<important-reminder id="VCORP_ROLE_PROMPT">
[VCORP SYSTEM] Hệ thống phát hiện dự án chỉ có cấu hình các vai trò (roles) sau: [ ${definedRoles.join(', ')} ].
BẮT BUỘC: Bạn PHẢI dừng mọi phản hồi thông thường và yêu cầu người dùng chọn chính xác một trong các vai trò trên: [ ${definedRoles.join(', ')} ]. Tuyệt đối KHÔNG tự ý đưa ra các vai trò ví dụ khác (như SA, Tester, DevLead, v.v.) không có trong danh sách được phát hiện.
</important-reminder>`;
          const ref = lastUserMsg.parts[0];
          lastUserMsg.parts.unshift({ ...ref, type: 'text', text: promptMsg });
        }
      }
    }
  }
}

// If specific role is active, inject path override instructions (inject into last user message to keep it in active memory)
if (currentRole !== 'default') {
  const userMessages = output.messages.filter(m => m.info.role === 'user');
  if (userMessages.length > 0) {
    const lastUserMsg = userMessages[userMessages.length - 1];
    if (lastUserMsg && lastUserMsg.parts.length) {
      if (!lastUserMsg.parts.some(p => p.type === 'text' && p.text.includes('VCORP_ACTIVE_ROLE'))) {
        let roleSkillContent = '';
        const roleSkillPath = path.join(roleDir, currentRole, 'SKILL.md');
        if (fs.existsSync(roleSkillPath)) {
          try {
            roleSkillContent = fs.readFileSync(roleSkillPath, 'utf8');
            debugLog(`successfully loaded role-specific SKILL.md content from ${roleSkillPath}`);
          } catch (e) {
            debugLog(`Error reading role SKILL.md: ${e.message}`);
          }
        }

        let roleInstruction = `\n\n<VCORP_ACTIVE_ROLE>
[DỰ ÁN V-CORP] Vai trò hiện tại của bạn: ${currentRole.toUpperCase()}.`;

        if (roleSkillContent) {
          roleInstruction += `\n\n[HƯỚNG DẪN BẮT BUỘC CHO VAI TRÒ ${currentRole.toUpperCase()}]\n${roleSkillContent}`;
        }

        roleInstruction += `\n\nMọi kỹ năng mới hoặc chỉnh sửa cho vai trò này BẮT BUỘC phải tuân thủ nghiêm ngặt kỹ năng \`writing-skills\` (YAML description bắt đầu bằng 'Use when...', có đủ Overview, When to Use, Common Mistakes) và được lưu theo cấu trúc:
- Thư mục: .v-skills/role/${currentRole}/${currentRole}-<tên-kỹ-năng>/
- File: .v-skills/role/${currentRole}/${currentRole}-<tên-kỹ-năng>/SKILL.md
Tuyệt đối KHÔNG lưu kỹ năng vào thư mục toàn cục (~/.agents/skills/).
</VCORP_ACTIVE_ROLE>`;

        const ref = lastUserMsg.parts[0];
        lastUserMsg.parts.unshift({ ...ref, type: 'text', text: roleInstruction });
      }
    }
  }
}
};
