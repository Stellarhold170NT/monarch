import fs from 'fs';
import path from 'path';
import { autoRegisterCommand } from './register.js';

export const initVCorpRoles = (directory, configDir) => {
  const vSkillsDir = path.join(directory, '.v-skills');
  const roleDir = path.join(vSkillsDir, 'role');
  const roleJsonPath = path.join(vSkillsDir, 'role.json');

  const debugLog = (msg) => {
    // No-op to disable writing to debug.log
  };

  const getDefinedRoles = () => {
    const definedRoles = [];
    if (fs.existsSync(roleDir)) {
      try {
        const files = fs.readdirSync(roleDir);
        for (const f of files) {
          const fullPath = path.join(roleDir, f);
          if (fs.statSync(fullPath).isDirectory()) {
            definedRoles.push(f);
          }
        }
      } catch (e) {}
    }
    return definedRoles;
  };

  // 1. Auto-create folders if missing
  if (!fs.existsSync(vSkillsDir)) {
    try {
      fs.mkdirSync(vSkillsDir, { recursive: true });
    } catch (e) {}
  }
  if (!fs.existsSync(roleDir)) {
    try {
      fs.mkdirSync(roleDir, { recursive: true });
    } catch (e) {}
  }

  // Ensure role.json is default if there are no roles defined
  const roles = getDefinedRoles();
  if (roles.length === 0) {
    try {
      let shouldWriteDefault = true;
      if (fs.existsSync(roleJsonPath)) {
        const content = fs.readFileSync(roleJsonPath, 'utf8').trim();
        const data = JSON.parse(content);
        if (data.role === 'default') {
          shouldWriteDefault = false;
        }
      }
      if (shouldWriteDefault) {
        fs.writeFileSync(roleJsonPath, JSON.stringify({ role: 'default' }, null, 2), 'utf8');
        debugLog(`No roles defined, initialized/reset role.json to default`);
      }
    } catch (e) {
      debugLog(`Error enforcing default role in role.json: ${e.message}`);
    }
  }

  // 2. Auto-register /v-role command
  autoRegisterCommand(directory, configDir, debugLog);

  return {
    vSkillsDir,
    roleDir,
    roleJsonPath,
    debugLog,
    getDefinedRoles
  };
};
