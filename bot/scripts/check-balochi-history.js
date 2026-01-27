const https = require('https');

function queryAxiom(apl, startTime = 'now-7d', endTime = 'now') {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ apl, startTime, endTime });
    const options = {
      hostname: 'api.axiom.co',
      path: '/v1/datasets/_apl?format=legacy',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.AXIOM_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function check() {
  console.log('=== CHECKING BALOCHI MESSAGE HISTORY (last 7 days) ===\n');

  // Search for any Arabic-script messages that might be Balochi
  console.log('1. All messages with language field containing bal...');
  const result = await queryAxiom(
    '["rumi-logs"] | where confirmedLanguage contains "bal" or language contains "bal" | project _time, msg, confirmedLanguage, language, phone | order by _time desc'
  );
  console.log(`   Found: ${result.status?.rowsMatched || 0} rows`);

  if (result.matches && result.matches.length > 0) {
    result.matches.forEach((m, i) => {
      console.log(`   [${i+1}] ${m._time}`);
      console.log(`       Language: ${m.data?.confirmedLanguage || m.data?.language || 'unknown'}`);
      console.log(`       Phone: ${m.data?.phone || 'unknown'}`);
      console.log(`       Msg: ${(m.data?.msg || '').substring(0, 80)}`);
    });
  } else {
    console.log('   No Balochi language logs found in the last 7 days!');
  }

  // Check unique languages in the dataset
  console.log('\n2. Unique confirmedLanguage values in logs...');
  const langResult = await queryAxiom(
    '["rumi-logs"] | where confirmedLanguage != "" | summarize count() by confirmedLanguage'
  );

  if (langResult.buckets && langResult.buckets.totals) {
    console.log('   Language distribution:', JSON.stringify(langResult.buckets.totals, null, 2));
  } else if (langResult.status?.rowsMatched === 0) {
    console.log('   No logs with confirmedLanguage field found');
  }

  console.log('\n=== DONE ===');
}

check().catch(console.error);
