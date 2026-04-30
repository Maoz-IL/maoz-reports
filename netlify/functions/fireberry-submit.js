exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { payloads, dryRun = true } = JSON.parse(event.body || '{}');

    if (!Array.isArray(payloads) || payloads.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: 'No payloads provided' }),
      };
    }

    if (dryRun) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          mode: 'dryRun',
          count: payloads.length,
          sample: payloads[0],
        }),
      };
    }

    const tokenId = process.env.FIREBERRY_TOKEN_ID;
    if (!tokenId) {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, error: 'Missing FIREBERRY_TOKEN_ID' }),
      };
    }

    // ⚠️ עדכן לפי הדומיין המדויק שלך אם צריך
    const baseUrl = 'https://api.fireberry.com/api';

    const results = [];

    for (let i = 0; i < payloads.length; i++) {
      const p = payloads[i];

      const res = await fetch(`${baseUrl}/record/${encodeURIComponent(p.objectCode)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          tokenid: tokenId,
        },
        body: JSON.stringify({ fields: p.fields }),
      });

      const data = await res.json().catch(() => null);

      results.push({
        index: i,
        ok: res.ok && data?.success !== false,
        status: res.status,
        response: data,
      });
    }

    const allOk = results.every((r) => r.ok);

    return {
      statusCode: allOk ? 200 : 207,
      body: JSON.stringify({
        ok: allOk,
        mode: 'live',
        count: payloads.length,
        results,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(err) }) };
  }
};
