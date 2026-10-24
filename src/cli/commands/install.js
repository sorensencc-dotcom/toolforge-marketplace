import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { assertSafeName, fetchSource, readVersionSource } from '../lib/git-source.js';

export default {
  command: 'install <skill-name>',
  describe: 'Install a skill',
  builder: (yargs) =>
    yargs
      .positional('skill-name', {
        describe: 'Skill name or ID to install',
        type: 'string',
      })
      .option('version', {
        describe: 'Specific version to install',
        type: 'string',
        alias: 'v',
      })
      .option('destination', {
        describe: 'Installation directory',
        type: 'string',
        alias: 'd',
        default: './skills',
      }),

  handler: async (argv) => {
    try {
      const apiUrl = argv.apiUrl;
      const skillName = argv.skillName;
      const destination = resolve(argv.destination);

      if (argv.verbose) {
        console.log(`Installing skill: ${skillName}`);
        console.log(`API URL: ${apiUrl}`);
        console.log(`Destination: ${destination}`);
      }

      // Search for skill by name
      let skillId;
      try {
        const searchUrl = new URL(`${apiUrl}/api/v1/skills/search`);
        searchUrl.searchParams.set('q', skillName);
        searchUrl.searchParams.set('limit', '1');
        const searchRes = await fetch(searchUrl);
        const searchJson = await searchRes.json();
        if (!searchJson.data || searchJson.data.length === 0) {
          console.error(`✗ Skill not found: ${skillName}`);
          process.exit(1);
        }
        skillId = searchJson.data[0].id;
      } catch (error) {
        console.error(`✗ Failed to search skills: ${error.message}`);
        process.exit(1);
      }

      // Fetch skill details
      let skill;
      try {
        const skillRes = await fetch(`${apiUrl}/api/v1/skills/${skillId}`);
        const skillJson = await skillRes.json();
        skill = skillJson.data;
      } catch (error) {
        console.error(`✗ Failed to fetch skill: ${error.message}`);
        process.exit(1);
      }

      // Fetch versions
      let versions;
      try {
        const versionsRes = await fetch(`${apiUrl}/api/v1/skills/${skillId}/versions`);
        const versionsJson = await versionsRes.json();
        versions = versionsJson.data || [];
      } catch (error) {
        console.error(`✗ Failed to fetch versions: ${error.message}`);
        process.exit(1);
      }

      if (versions.length === 0) {
        console.error(`✗ No versions available for ${skillName}`);
        process.exit(1);
      }

      // Select version
      const targetVersion =
        versions.find((v) => v.version_tag === argv.version) ||
        versions[0]; // Default to latest

      if (argv.verbose) {
        console.log(`Installing ${skill.name} v${targetVersion.version_tag}`);
      }

      const source = readVersionSource(targetVersion);
      if (!source) {
        console.error(`✗ Cannot install ${skill.name} v${targetVersion.version_tag}: the registry records no source for this version.`);
        console.error(`  Install it through Claude Code instead: claude plugin install ${skill.name}@toolforge`);
        process.exit(1);
      }

      const target = resolve(destination, assertSafeName(skill.name));
      await fetchSource(source, target);

      writeFileSync(
        resolve(target, '.toolforge-install.json'),
        JSON.stringify(
          {
            skill: skill.name,
            skillId: skill.id,
            version: targetVersion.version_tag,
            source: { repo: source.repo, ref: source.ref, sha: source.sha, path: source.path },
            installedAt: new Date().toISOString(),
          },
          null,
          2
        )
      );

      console.log(`✓ Installed ${skill.name} v${targetVersion.version_tag} (${source.repo}${source.path ? `/${source.path}` : ''}@${source.sha.slice(0, 12)})`);
      console.log(`  Location: ${target}`);
    } catch (error) {
      console.error(`✗ Installation failed: ${error.message}`);
      process.exit(1);
    }
  },
};
