const https = require('https');

function queryAxiom(apl, startTime = 'now-24h', endTime = 'now') {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ apl, startTime, endTime });

    const options = {
      hostname: 'api.axiom.co',
      path: '/v1/datasets/_apl?format=legacy',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.AXIOM_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve({
            rowsMatched: result.status?.rowsMatched || 0,
            matches: result.matches || []
          });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function investigate() {
  console.log('=== INVESTIGATING BALOCHI → URDU BUG ===\n');

  // Check for module loading errors
  console.log('0a. Checking for module/require errors...');
  const moduleErrors = await queryAxiom(
    '["rumi-logs"] | where msg contains "require" or msg contains "module" or msg contains "Cannot find" or msg contains "import" | order by _time desc | take 10'
  );
  console.log(`   Found: ${moduleErrors.rowsMatched} rows`);
  if (moduleErrors.matches.length > 0) {
    moduleErrors.matches.slice(0, 5).forEach((m, i) => {
      console.log(`   [${i+1}] ${m.data?.msg?.substring(0, 100) || 'no msg'}`);
    });
  }

  // 0. Check when staging was last deployed
  console.log('0. Checking for deployment/startup logs...');
  const deployLogs = await queryAxiom(
    '["rumi-logs"] | where msg contains "started" or msg contains "Rumi" or msg contains "version" | order by _time desc | take 10'
  );
  console.log(`   Found: ${deployLogs.rowsMatched} rows`);
  if (deployLogs.matches.length > 0) {
    deployLogs.matches.slice(0, 3).forEach((m, i) => {
      console.log(`   [${i+1}] ${m._time}: ${m.data?.msg?.substring(0, 100) || 'no msg'}`);
    });
  }

  // 1. Search for Balochi-related logs
  console.log('1. Searching for Balochi-related logs...');
  const balochiLogs = await queryAxiom(
    '["rumi-logs"] | where msg contains "balochi" or msg contains "bal-PK" or msg contains "bal" | order by _time desc | take 20'
  );
  console.log(`   Found: ${balochiLogs.rowsMatched} rows`);
  if (balochiLogs.matches.length > 0) {
    balochiLogs.matches.slice(0, 5).forEach((m, i) => {
      console.log(`   [${i+1}] ${m._time}: ${m.data?.msg?.substring(0, 100) || 'no msg'}`);
    });
  }

  // 2. Search for enhanced language prompt logs
  console.log('\n2. Searching for "enhanced language prompt" logs...');
  const enhancedLogs = await queryAxiom(
    '["rumi-logs"] | where msg contains "enhanced" or msg contains "language prompt" | order by _time desc | take 10'
  );
  console.log(`   Found: ${enhancedLogs.rowsMatched} rows`);
  if (enhancedLogs.matches.length > 0) {
    enhancedLogs.matches.slice(0, 5).forEach((m, i) => {
      console.log(`   [${i+1}] ${m._time}: ${m.data?.msg?.substring(0, 100) || 'no msg'}`);
    });
  }

  // 3. Search for language detection logs
  console.log('\n3. Searching for language detection logs...');
  const langDetectLogs = await queryAxiom(
    '["rumi-logs"] | where msg contains "language" or msg contains "detected" | order by _time desc | take 20'
  );
  console.log(`   Found: ${langDetectLogs.rowsMatched} rows`);
  if (langDetectLogs.matches.length > 0) {
    langDetectLogs.matches.slice(0, 5).forEach((m, i) => {
      console.log(`   [${i+1}] ${m._time}: ${m.data?.msg?.substring(0, 100) || 'no msg'}`);
    });
  }

  // 4. Check staging errors
  console.log('\n4. Checking staging errors...');
  const stagingErrors = await queryAxiom(
    '["rumi-logs"] | where service == "rumi-staging" and level == "error" | order by _time desc | take 10'
  );
  console.log(`   Found: ${stagingErrors.rowsMatched} errors`);
  if (stagingErrors.matches.length > 0) {
    stagingErrors.matches.slice(0, 3).forEach((m, i) => {
      console.log(`   [${i+1}] ${m._time}: ${m.data?.msg?.substring(0, 150) || 'no msg'}`);
    });
  }

  // 5. Recent staging logs to see what's happening
  console.log('\n5. Most recent staging logs...');
  const recentStaging = await queryAxiom(
    '["rumi-logs"] | where service == "rumi-staging" | order by _time desc | take 10'
  );
  console.log(`   Found: ${recentStaging.rowsMatched} total staging logs`);
  if (recentStaging.matches.length > 0) {
    console.log('   Last 5 log messages:');
    recentStaging.matches.slice(0, 5).forEach((m, i) => {
      const msg = m.data?.msg || 'no msg';
      const level = m.data?.level || '?';
      console.log(`   [${i+1}] [${level}] ${msg.substring(0, 100)}`);
    });
  }

  // 6. Check for any message processing logs
  console.log('\n6. Recent message processing logs...');
  const msgProcessing = await queryAxiom(
    '["rumi-logs"] | where msg contains "message" or msg contains "webhook" or msg contains "processing" | order by _time desc | take 15'
  );
  console.log(`   Found: ${msgProcessing.rowsMatched} rows`);
  if (msgProcessing.matches.length > 0) {
    console.log('   Last 8 message processing logs:');
    msgProcessing.matches.slice(0, 8).forEach((m, i) => {
      const time = new Date(m._time).toISOString().substring(11, 19);
      const msg = m.data?.msg || 'no msg';
      console.log(`   [${time}] ${msg.substring(0, 80)}`);
    });
  }

  // 7. Check for user language field
  console.log('\n7. Logs with confirmedLanguage or language field...');
  const langField = await queryAxiom(
    '["rumi-logs"] | where confirmedLanguage != "" or language != "" | order by _time desc | take 10'
  );
  console.log(`   Found: ${langField.rowsMatched} rows`);
  if (langField.matches.length > 0) {
    langField.matches.slice(0, 5).forEach((m, i) => {
      const lang = m.data?.confirmedLanguage || m.data?.language || 'unknown';
      const msg = m.data?.msg || 'no msg';
      console.log(`   [${i+1}] lang=${lang}: ${msg.substring(0, 60)}`);
    });
  }

  console.log('\n=== INVESTIGATION COMPLETE ===');
}

investigate().catch(console.error);
