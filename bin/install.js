#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Resolve source (the template location where this script lives)
const sourceDir = path.resolve(__dirname, '..');
// Resolve target (the current working directory where the user executes the command)
const targetDir = process.cwd();

console.log('🚀 Iniciando inyección de SaaS Factory V4 + Gentle-AI...');
console.log(`Origen: ${sourceDir}`);
console.log(`Destino: ${targetDir}\n`);

if (sourceDir === targetDir) {
  console.error('❌ Error: No puedes ejecutar el instalador dentro del mismo repositorio de plantilla.');
  console.log('Para crear un proyecto nuevo, simplemente clona este repositorio en otra carpeta:');
  console.log('   git clone <este-repo-url> mi-nueva-app\n');
  process.exit(1);
}

// Files and folders to copy
const assetsToCopy = [
  '.claude',
  'gentle-ai',
  '.env.local.example',
  'CLAUDE.md',
  'GEMINI.md'
];

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// 1. Copy assets
assetsToCopy.forEach((asset) => {
  const srcPath = path.join(sourceDir, asset);
  const destPath = path.join(targetDir, asset);
  
  if (fs.existsSync(srcPath)) {
    console.log(`📦 Copiando ${asset} a destino...`);
    copyRecursiveSync(srcPath, destPath);
  }
});

// 2. Merge dependencies into target package.json
const targetPackageJsonPath = path.join(targetDir, 'package.json');
if (fs.existsSync(targetPackageJsonPath)) {
  console.log('📝 Sincronizando dependencias en package.json...');
  try {
    const targetPkg = JSON.parse(fs.readFileSync(targetPackageJsonPath, 'utf8'));
    
    // Ensure dependencies object exists
    if (!targetPkg.dependencies) targetPkg.dependencies = {};
    
    // Add Appwrite dependencies
    let modified = false;
    if (!targetPkg.dependencies['appwrite']) {
      targetPkg.dependencies['appwrite'] = '^16.0.0';
      modified = true;
    }
    if (!targetPkg.dependencies['node-appwrite']) {
      targetPkg.dependencies['node-appwrite'] = '^14.0.0';
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(targetPackageJsonPath, JSON.stringify(targetPkg, null, 2) + '\n', 'utf8');
      console.log('✅ Dependencias (appwrite, node-appwrite) añadidas con éxito.');
    } else {
      console.log('ℹ️ Las dependencias ya estaban configuradas.');
    }
  } catch (err) {
    console.error('⚠️ Error al leer o modificar package.json del destino:', err.message);
  }
} else {
  console.log('ℹ️ No se detectó package.json en el destino. Omitiendo combinación de dependencias.');
}

// 3. Generate .env.local if not exists
const targetEnvPath = path.join(targetDir, '.env.local');
const sourceEnvExamplePath = path.join(sourceDir, '.env.local.example');
if (!fs.existsSync(targetEnvPath) && fs.existsSync(sourceEnvExamplePath)) {
  console.log('🔑 Creando archivo .env.local a partir del ejemplo...');
  fs.copyFileSync(sourceEnvExamplePath, targetEnvPath);
}

// 4. Generate Registry in target
console.log('🔍 Generando registro local de habilidades (.atl/skill-registry.md)...');
try {
  const sources = ['.claude/skills', 'gentle-ai/skills'];
  
  function parseFrontmatter(source) {
    if (!source.startsWith('---\n') && !source.startsWith('---\r\n')) {
      return { name: '', description: '' };
    }
    const endIdx = source.indexOf('\n---', 4);
    if (endIdx === -1) {
      return { name: '', description: '' };
    }
    const fm = source.substring(4, endIdx);
    const lines = fm.split('\n');
    let name = '';
    let description = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      if (value.startsWith('"') || value.startsWith("'")) {
        value = value.substring(1, value.length - 1);
      }
      if (key === 'name') {
        name = value;
      } else if (key === 'description') {
        description = value;
      }
    }
    return { name, description };
  }

  function findSkillFiles(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(findSkillFiles(filePath));
      } else if (file === 'SKILL.md') {
        results.push(filePath);
      }
    });
    return results;
  }

  function markdownCell(val) {
    if (!val) return '—';
    return val.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
  }

  const entries = [];
  sources.forEach((src) => {
    const dirPath = path.join(targetDir, src);
    const files = findSkillFiles(dirPath);
    files.forEach((file) => {
      const content = fs.readFileSync(file, 'utf8');
      const { name, description } = parseFrontmatter(content);
      const relativePath = path.relative(targetDir, file).replace(/\\/g, '/');
      const skillName = name || path.basename(path.dirname(file));
      entries.push({
        name: skillName,
        description: description || 'No description available.',
        path: relativePath,
        scope: 'project'
      });
    });
  });

  const deduped = {};
  entries.forEach((e) => {
    deduped[e.name] = e;
  });
  const sorted = Object.values(deduped).sort((a, b) => a.name.localeCompare(b.name));

  const today = new Date().toISOString().split('T')[0];
  const projectName = path.basename(targetDir);

  const lines = [
    `# Skill Registry — ${projectName}`,
    '',
    '<!-- Auto-generated by gentle-ai skill-registry refresh. Run \`gentle-ai skill-registry refresh --force\` to regenerate. -->',
    '',
    `Last updated: ${today}`,
    '',
    '## Sources scanned',
    ''
  ];

  sources.forEach((src) => {
    lines.push(`- ${src}`);
  });

  lines.push(
    '',
    '## Contract',
    '',
    '**Delegator use only.** This registry is an index, not a summary. Any agent that launches subagents reads it to select relevant skills, then passes exact `SKILL.md` paths for the subagent to read before work.',
    '',
    '`SKILL.md` remains the source of truth. Do not inject generated summaries or compact rules by default; pass paths so subagents load the full runtime contract and preserve author intent.',
    '',
    '## Skills',
    '',
    '| Skill | Trigger / description | Scope | Path |',
    '| --- | --- | --- | --- |'
  );

  sorted.forEach((e) => {
    lines.push(`| \`${markdownCell(e.name)}\` | ${markdownCell(e.description)} | ${e.scope} | \`${markdownCell(e.path)}\` |`);
  });

  lines.push(
    '',
    '## Loading protocol',
    '',
    '1. Match task context and target files against the `Trigger / description` column.',
    '2. Pass only the matching `Path` values to the subagent under `## Skills to load before work`.',
    '3. Instruct the subagent to read those exact `SKILL.md` files before reading, writing, reviewing, testing, or creating artifacts.',
    '4. If no matching skill exists, proceed without project skill injection and report `skill_resolution: none`.'
  );

  const outDir = path.join(targetDir, '.atl');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outFile = path.join(outDir, 'skill-registry.md');
  fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf8');
  console.log(`✅ Registro generado con éxito en: ${outFile}`);
} catch (err) {
  console.error('⚠️ Error al generar el registro local de habilidades:', err.message);
}

console.log('\n🎉 ¡Inyección completada con éxito!');
console.log('Para empezar:');
console.log('  1. Ejecuta "npm install" en tu proyecto para instalar las dependencias añadidas.');
console.log('  2. Configura tus llaves de Appwrite en el archivo ".env.local".');
console.log('  3. Inicia tu editor y los agentes adoptarán automáticamente tus directivas.');
