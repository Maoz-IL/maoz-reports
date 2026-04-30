export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const { payloads, dryRun = true } = await req.json();

    if (!Array.isArray(payloads) || payloads.length === 0) {
      return Response.json({ ok: false, error: 'No payloads provided' }, { status: 400 });
    }

    // ✅ Dry Run – לא שולחים ל-Fireberry, רק מחזירים דוגמה
    if (dryRun) {
      return Response.json({
        ok: true,
        mode: 'dryRun',
        count: payloads.length,
        sample: payloads[0],
      });
    }

    const tokenId = process.env.FIREBERRY_TOKEN_ID;
    if (!tokenId) {
      return Response.json(
        { ok: false, error: 'Missing FIREBERRY_TOKEN_ID' },
        { status: 500 },
      );
    }

    // ⚠️ עדכן אם אצלך הדומיין שונה (לפי מה שהכלי בדיקה מציג)
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

    return Response.json(
      { ok: allOk, mode: 'live', count: payloads.length, results },
      { status: allOk ? 200 : 207 },
    );
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
};
