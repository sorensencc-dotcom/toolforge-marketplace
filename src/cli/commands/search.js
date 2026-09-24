export default {
  command: 'search <query>',
  describe: 'Search for skills',
  builder: (yargs) =>
    yargs
      .positional('query', {
        describe: 'Search term',
        type: 'string',
      })
      .option('limit', {
        describe: 'Number of results to show',
        type: 'number',
        alias: 'l',
        default: 20,
      }),

  handler: async (argv) => {
    try {
      const apiUrl = argv.apiUrl;
      const query = argv.query;

      if (argv.verbose) {
        console.log(`Searching for: "${query}"`);
        console.log(`API URL: ${apiUrl}`);
      }

      const url = new URL(`${apiUrl}/api/v1/skills/search`);
      url.searchParams.set('q', query);
      url.searchParams.set('limit', String(Math.min(argv.limit, 100)));

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const json = await response.json();
      const skills = json.data || [];

      if (skills.length === 0) {
        console.log(`No skills found matching: "${query}"`);
        return;
      }

      console.log(`\nSearch Results for "${query}" (${skills.length} found):\n`);

      skills.forEach((skill) => {
        const rating = skill.rating || { average: 0, count: 0 };
        const avgScore = rating.average ? rating.average.toFixed(1) : 'N/A';
        console.log(`${skill.name}`);
        console.log(`  Category: ${skill.category}`);
        console.log(`  Rating: ${avgScore} (${rating.count} reviews)`);
        console.log(`  Owner: ${skill.owner}`);
        console.log(`  ${skill.description}`);
        console.log(`  Install: toolforge install ${skill.name}\n`);
      });
    } catch (error) {
      console.error(`✗ Search failed: ${error.message}`);
      process.exit(1);
    }
  },
};
