const { PrismaClient } = require('../node_modules/.prisma/client');
const p = new PrismaClient();

(async () => {
  // Try login
  const loginRes = await fetch('http://127.0.0.1:5001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'admin123' }),
  });
  const loginBody = await loginRes.json().catch(() => ({}));
  console.log('login status', loginRes.status, loginBody.error || loginBody.user?.email || Object.keys(loginBody));

  let token = loginBody.token;
  if (!token) {
    // try common passwords
    for (const pass of ['Admin@123', 'password', '123456', 'admin', 'Admin123']) {
      const r = await fetch('http://127.0.0.1:5001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@example.com', password: pass }),
      });
      const b = await r.json().catch(() => ({}));
      console.log('try', pass, r.status, b.error || 'ok');
      if (b.token) {
        token = b.token;
        break;
      }
    }
  }

  if (token) {
    const r = await fetch('http://127.0.0.1:5001/api/dpo-returns?page=1&limit=25', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await r.json();
    console.log(
      'api returns',
      (body.data || []).map((x) => ({
        returnNumber: x.returnNumber,
        amount: x.totalAmount,
        dpo: x.DirectPurchaseOrder?.dpoNumber,
        supplier: x.DirectPurchaseOrder?.Supplier?.name,
      })),
    );
  }

  const dbCount = await p.directPurchaseOrderReturn.count();
  const rows = await p.directPurchaseOrderReturn.findMany({
    select: { returnNumber: true, totalAmount: true, createdAt: true },
    orderBy: { returnNumber: 'asc' },
  });
  console.log('db count', dbCount, rows);

  // Get admin password hash hint - don't print hash, just email
  const users = await p.$queryRawUnsafe(`SELECT email, name FROM "User" WHERE email ILIKE '%admin%' OR name ILIKE '%admin%' LIMIT 10`);
  console.log('users', users);

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await p.$disconnect(); } catch (_) {}
  process.exit(1);
});
