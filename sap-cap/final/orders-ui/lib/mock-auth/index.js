'use strict';

const USERS = [
  { email: 'sarah.jones@company.com',  name: 'Sarah Jones',  role: 'SalesRep', color: '#0070f2' },
  { email: 'michael.chen@company.com', name: 'Michael Chen', role: 'SalesRep', color: '#0070f2' },
  { email: 'anna.mueller@company.com', name: 'Anna Mueller', role: 'SalesRep', color: '#0070f2' },
  { email: 'james.wilson@company.com', name: 'James Wilson', role: 'SalesRep', color: '#0070f2' },
  { email: 'manager@company.com',      name: 'Manager',      role: 'Manager',  color: '#107e3e' },
  { email: 'guest@company.com',        name: 'Guest',        role: 'No role',  color: '#bb0000' }
];

function parseCookies(cookieHeader) {
  const result = {};
  (cookieHeader || '').split(';').forEach(part => {
    const [k, ...v] = part.trim().split('=');
    if (k) result[k.trim()] = decodeURIComponent(v.join('='));
  });
  return result;
}

module.exports = async function() {
  return function mockAuth(req, res, next) {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/mock-login') {
      const user = url.searchParams.get('user');
      if (user) {
        res.setHeader('Set-Cookie', `mock-user=${encodeURIComponent(user)}; Path=/`);
        res.setHeader('Location', '/test/flpSandbox.html');
        res.statusCode = 302;
        res.end();
      } else {
        const buttons = USERS.map(u =>
          `<a href="/mock-login?user=${encodeURIComponent(u.email)}"
              style="display:block;margin:10px 0;padding:14px 20px;background:${u.color};color:#fff;
                     border-radius:6px;text-decoration:none;font-family:'72',Arial,sans-serif">
            <div style="font-size:15px;font-weight:bold">${u.name}</div>
            <div style="font-size:12px;opacity:.85">${u.role} &nbsp;·&nbsp; ${u.email}</div>
          </a>`
        ).join('');
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!DOCTYPE html><html><head>
          <title>Switch User</title>
          <meta name="viewport" content="width=device-width,initial-scale=1">
          </head><body style="margin:0;background:#f5f6f7;display:flex;align-items:center;justify-content:center;min-height:100vh">
          <div style="background:#fff;padding:32px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.15);max-width:380px;width:100%">
            <div style="font-family:'72',Arial,sans-serif;font-size:20px;font-weight:bold;margin-bottom:20px">
              Select Mock User
            </div>
            ${buttons}
          </div></body></html>`);
      }
      return;
    }

    next();
  };
};
