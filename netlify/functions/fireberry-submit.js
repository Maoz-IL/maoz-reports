const Busboy = require('busboy');
const FormData = require('form-data');

const FIREBERRY_API = 'https://api.fireberry.com/api';

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: event.headers });

    const fields = {};
    const files = [];

    bb.on('field', (name, value) => {
      fields[name] = value;
    });

    bb.on('file', (name, file, info) => {
      const chunks = [];
      file.on('data', (d) => chunks.push(d));
      file.on('end', () => {
        files.push({
          field: name, // יהיה "photos"
          buffer: Buffer.concat(chunks),
          filename: info.filename,
          mimeType: info.mimeType,
        });
      });
    });

    bb.on('error', reject);
    bb.on('finish', () => resolve({ fields, files }));

    const body = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64')
      : Buffer.from(event.body || '', 'utf8');

    bb.end(body);
  });
}

async function fireberryCreateRecord(objectCode, recordFields, tokenId) {
  // Fireberry מצפה ל-body שטוח של שדות
  const res = await fetch(`${FIREBERRY_API}/record/${encodeURIComponent(objectCode)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      tokenid: tokenId,
    },
    body: JSON.stringify(recordFields),
  });

  const data = await res.json().catch(() => null);
  return { res, data };
}

async function fireberryUploadFile(objectId, recordId, file, tokenId) {
  const fd = new FormData();

  const safeFilename = (name) => {
    const fallbackExt =
      file?.mimeType === 'image/png'
        ? '.png'
        : file?.mimeType === 'image/jpeg'
          ? '.jpg'
          : '';

    const original = String(name || '').trim();
    const extMatch = original.match(/\.[a-z0-9]{1,5}$/i);
    const ext = extMatch ? extMatch[0].toLowerCase() : fallbackExt || '.bin';

    const base = (original.replace(extMatch?.[0] ?? '', '') || 'photo')
      .normalize('NFKD')
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 60);

    return `${base}${ext}`;
  };

  fd.append('file', file.buffer, {
    filename: safeFilename(file.filename),
    contentType: file.mimeType || 'application/octet-stream',
  });

  // ✅ חשוב: לשלוח כ-Buffer עם Content-Length (במקום stream/chunked)
  const body = fd.getBuffer();
  const headers = {
    ...fd.getHeaders(),
    'Content-Length': String(body.length),
    accept: 'application/json',
    tokenid: tokenId, // בדיוק כמו בדוקס
  };

  const res = await fetch(
    `${FIREBERRY_API}/v2/record/${encodeURIComponent(objectId)}/${encodeURIComponent(recordId)}/files`,
    {
      method: 'POST',
      headers,
      body,
    },
  );

  const text = await res.text().catch(() => '');
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return { res, data };
}

exports.handler = async (event) => {
  try {
    // Preflight (לא חובה אם אתה עובד רק דרך netlify dev / אותו origin, אבל לא מזיק)
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, body: '' };
    }

    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const tokenId = process.env.FIREBERRY_TOKEN_ID;
    if (!tokenId) {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, error: 'Missing FIREBERRY_TOKEN_ID' }),
      };
    }

    // 1) Parse multipart from frontend
    const { fields, files } = await parseMultipart(event);

    const dryRun = String(fields.dryRun || 'true') === 'true';
    const payloads = JSON.parse(fields.payloads || '[]');

    const photoFiles = files.filter((f) => f.field === 'photos');

    if (!Array.isArray(payloads) || payloads.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: 'No payloads provided' }),
      };
    }

    // 2) Dry run: לא שולחים לפיירברי בכלל
    if (dryRun) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          mode: 'dryRun',
          count: payloads.length,
          photosCount: photoFiles.length,
          sample: payloads[0],
        }),
      };
    }

    // 3) Create all records
    const results = [];
    let firstRecordId = null;
    let firstObjectId = null;

    for (let i = 0; i < payloads.length; i++) {
      const p = payloads[i];

      const { res, data } = await fireberryCreateRecord(p.objectCode, p.fields, tokenId);

      const ok = res.ok && data?.success !== false;

      // חילוץ Record ID
      const recordId =
        data?.data?.Record?.customobject1005id ||
        data?.data?.Record?.id ||
        data?.data?.id ||
        data?.id ||
        null;

      results.push({ index: i, ok, status: res.status, response: data });

      if (i === 0 && ok && recordId) {
        firstObjectId = '1005';
        firstRecordId = recordId;

        // objectId נדרש ב-upload files, אם objectCode הוא customobject1005 -> 1005
        const code = String(p.objectCode);
        if (/^\d+$/.test(code)) firstObjectId = code;
        else {
          const m = code.match(/(\d+)$/);
          firstObjectId = m ? m[1] : null;
        }
      }
    }

    // אם הרשומה הראשונה לא נוצרה – לא מעלים קבצים
    if (!firstRecordId || !firstObjectId) {
      const allOk = results.every((r) => r.ok);
      return {
        statusCode: allOk ? 200 : 207,
        body: JSON.stringify({ ok: allOk, mode: 'live', results, uploads: [] }),
      };
    }

    // 4) Upload photos to first record only
    const uploads = [];

    for (let i = 0; i < photoFiles.length; i++) {
      const file = photoFiles[i];

      const { res, data } = await fireberryUploadFile(
        firstObjectId,
        firstRecordId,
        file,
        tokenId,
      );

      uploads.push({
        index: i,
        ok: res.ok && data?.success !== false,
        status: res.status,
        filename: file.filename,
        response: data,
      });
    }

    const allOk = results.every((r) => r.ok) && uploads.every((u) => u.ok);

    return {
      statusCode: allOk ? 200 : 207,
      body: JSON.stringify({
        ok: allOk,
        mode: 'live',
        results,
        uploads,
        attachedTo: { objectId: firstObjectId, recordId: firstRecordId },
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: String(err) }),
    };
  }
};
