import fs from 'fs';
import path from 'path';

export const autoRegisterCommand = (directory, configDir, debugLog) => {
  const vRoleContent = `---
description: Chuyển đổi vai trò V-Agent (vd: /v-role vauthz-checker)
---

/v-role — Chuyển đổi vai trò làm việc của V-Agent
`;

  const ulwContent = `---
description: Kích hoạt chế độ tự động lặp kiểm định (Ultrawork Loop)
---

Chạy tác vụ phát triển trong vòng lặp tự động sửa lỗi và kiểm định nghiêm ngặt.
`;

  const vLoopContent = `---
description: Kích hoạt chế độ tự động lặp thông thường
---

Chạy tác vụ trong vòng lặp tự sửa lỗi thông thường.
`;

  const registerSingle = (filename, content) => {
    // Register locally
    const localCommandsDir = path.join(directory, '.opencode', 'commands');
    const localCommandFilePath = path.join(localCommandsDir, filename);
    if (!fs.existsSync(localCommandFilePath)) {
      try {
        fs.mkdirSync(localCommandsDir, { recursive: true });
        fs.writeFileSync(localCommandFilePath, content, 'utf8');
        debugLog(`successfully registered local /${filename.replace('.md', '')} command at ${localCommandFilePath}`);
      } catch (e) {
        debugLog(`Error registering local command ${filename}: ${e.message}`);
      }
    }

    // Register globally
    if (configDir) {
      const globalCommandsDir = path.join(configDir, 'commands');
      const globalCommandFilePath = path.join(globalCommandsDir, filename);
      if (!fs.existsSync(globalCommandFilePath)) {
        try {
          fs.mkdirSync(globalCommandsDir, { recursive: true });
          fs.writeFileSync(globalCommandFilePath, content, 'utf8');
          debugLog(`successfully registered global /${filename.replace('.md', '')} command at ${globalCommandFilePath}`);
        } catch (e) {
          debugLog(`Error registering global command ${filename}: ${e.message}`);
        }
      }
    }
  };

  registerSingle('v-role.md', vRoleContent);
  registerSingle('ulw.md', ulwContent);
  registerSingle('v-loop.md', vLoopContent);
};

