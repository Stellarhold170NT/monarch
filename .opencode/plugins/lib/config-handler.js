import fs from 'fs';
import path from 'path';

const copyRecursiveSync = (src, dest) => {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
};

const ensureSymlink = (target, link, debugLog) => {
  let exists = false;
  try {
    fs.lstatSync(link);
    exists = true;
  } catch (e) {}

  if (!exists) {
    try {
      const type = process.platform === 'win32' ? 'junction' : 'dir';
      const parentDir = path.dirname(link);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.symlinkSync(target, link, type);
      if (debugLog) debugLog(`Linked symlink/junction: ${link} -> ${target}`);
    } catch (e) {
      if (debugLog) debugLog(`Symlink failed, falling back to copy: ${e.message}`);
      try {
        copyRecursiveSync(target, link);
        if (debugLog) debugLog(`Copied folder: ${link} -> ${target}`);
      } catch (err) {
        if (debugLog) debugLog(`Failed to copy from ${target} to ${link}: ${err.message}`);
      }
    }
  }
};

export const handleConfigPaths = async (config, roleDir, roleJsonPath, superpowersSkillsDir, vSkillsDir, definedRoles, debugLog) => {
  config.skills = config.skills || {};
  config.skills.paths = config.skills.paths || [];

  if (debugLog) {
    debugLog(`handleConfigPaths: start. Initial paths: ${JSON.stringify(config.skills.paths)}`);
    debugLog(`handleConfigPaths: roleJsonPath=${roleJsonPath}`);
    debugLog(`handleConfigPaths: definedRoles=${JSON.stringify(definedRoles)}`);
  }

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
      }
    } catch (e) {
      if (debugLog) debugLog(`handleConfigPaths: Error reading roleJsonPath: ${e.message}`);
    }
  }

  if (debugLog) debugLog(`handleConfigPaths: currentRole resolved to "${currentRole}"`);

  // Check if we should load default superpowers skills
  let loadSharedSkills = true;
  if (currentRole !== 'default') {
    const roleConfigPath = path.join(roleDir, currentRole, 'config.json');
    if (fs.existsSync(roleConfigPath)) {
      try {
        const roleConf = JSON.parse(fs.readFileSync(roleConfigPath, 'utf8'));
        if (roleConf.shared_skill === false) {
          loadSharedSkills = false;
        }
      } catch (e) {
        if (debugLog) debugLog(`handleConfigPaths: Error reading role config: ${e.message}`);
      }
    }
  }

  if (debugLog) debugLog(`handleConfigPaths: loadSharedSkills resolved to ${loadSharedSkills}`);

  // Load superpowers native skills if shared_skill is enabled/default
  if (loadSharedSkills) {
    if (!config.skills.paths.includes(superpowersSkillsDir)) {
      config.skills.paths.push(superpowersSkillsDir);
    }
    // Filter out bootstrap path to avoid duplicates
    config.skills.paths = config.skills.paths.filter(p => {
      const normalized = p.toLowerCase().replace(/\\/g, '/');
      return !normalized.endsWith('/.v-skills/_bootstrap');
    });
  } else {
    // Robustly filter out all variations of superpowers/skills paths (both node_modules and dev clones)
    config.skills.paths = config.skills.paths.filter(p => {
      const normalized = p.toLowerCase().replace(/\\/g, '/');
      return !normalized.endsWith('/superpowers/skills');
    });

    // Setup _bootstrap skills for create-role and writing-skills
    const bootstrapDir = path.join(vSkillsDir, '_bootstrap');
    try {
      if (!fs.existsSync(bootstrapDir)) {
        fs.mkdirSync(bootstrapDir, { recursive: true });
      }
      
      const createRoleTarget = path.join(superpowersSkillsDir, 'create-role');
      const createRoleLink = path.join(bootstrapDir, 'create-role');
      ensureSymlink(createRoleTarget, createRoleLink, debugLog);

      const writingSkillsTarget = path.join(superpowersSkillsDir, 'writing-skills');
      const writingSkillsLink = path.join(bootstrapDir, 'writing-skills');
      ensureSymlink(writingSkillsTarget, writingSkillsLink, debugLog);

      if (!config.skills.paths.includes(bootstrapDir)) {
        config.skills.paths.push(bootstrapDir);
      }
    } catch (e) {
      if (debugLog) debugLog(`Error setting up bootstrap skills: ${e.message}`);
    }
  }

  // Load project-level shared skills from .v-skills/_shared unconditionally if it exists
  const sharedSkillsDir = path.join(vSkillsDir, '_shared');
  if (fs.existsSync(sharedSkillsDir)) {
    if (!config.skills.paths.includes(sharedSkillsDir)) {
      config.skills.paths.push(sharedSkillsDir);
    }
  }

  // Load specific role skills directory if applicable
  if (currentRole !== 'default') {
    const specificRoleDir = path.join(roleDir, currentRole);
    if (fs.existsSync(specificRoleDir)) {
      if (!config.skills.paths.includes(specificRoleDir)) {
        config.skills.paths.push(specificRoleDir);
      }
    }
  }

  if (debugLog) debugLog(`handleConfigPaths: end. Final paths: ${JSON.stringify(config.skills.paths)}`);
};
