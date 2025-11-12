const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const db = require('../db');

const router = express.Router();

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || config.server.jwtSecret;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || (config.server.jwtSecret + '-refresh');

const ACCESS_EXPIRES_IN = process.env.ACCESS_EXPIRES_IN || '10m';
const REFRESH_EXPIRES_DAYS = parseInt(process.env.REFRESH_EXPIRES_DAYS || '7', 10);

// 生成 tokens 并把 refresh token 收到 DB 中（轮替实现）
function generateTokens(user) {
  const accessToken = jwt.sign(
    { sub: user.id, username: user.username },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_EXPIRES_IN }
  );

  const tokenId = uuidv4();
  const refreshToken = jwt.sign(
    { sub: user.id, tid: tokenId },
    REFRESH_TOKEN_SECRET,
    { expiresIn: `${REFRESH_EXPIRES_DAYS}d` }
  );

  const expiresAt = Date.now() + REFRESH_EXPIRES_DAYS * 24 * 3600 * 1000;
  db.run(
    'INSERT INTO refresh_tokens (token_id, user_id, expires_at) VALUES (?, ?, ?)',
    [tokenId, user.id, expiresAt],
    (err) => { if (err) console.error('insert refresh_token error', err); }
  );

  // expiresIn (秒) 返回给前端，方便前端计划刷新
  const accessExpiresSec = (() => {
    if (typeof ACCESS_EXPIRES_IN === 'string') {
      if (ACCESS_EXPIRES_IN.endsWith('m')) return parseInt(ACCESS_EXPIRES_IN) * 60;
      if (ACCESS_EXPIRES_IN.endsWith('h')) return parseInt(ACCESS_EXPIRES_IN) * 3600;
      if (ACCESS_EXPIRES_IN.endsWith('s')) return parseInt(ACCESS_EXPIRES_IN);
    }
    return 600;
  })();

  return { accessToken, refreshToken, expiresIn: accessExpiresSec };
}

// POST /api/login
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing credentials' });

  // 检查配置中的管理员
  if (username === (config.admin && config.admin.username)) {
    if (password !== (config.admin && config.admin.password)) {
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const user = { id: 'admin', username };
    const tokens = generateTokens(user);
    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: REFRESH_EXPIRES_DAYS * 24 * 3600 * 1000,
      path: '/api'
    });
    return res.json({ accessToken: tokens.accessToken, expiresIn: tokens.expiresIn });
  }

  // 检查 users 表
  db.get('SELECT id, username, password FROM users WHERE username = ?', [username], (err, row) => {
    if (err) return res.status(500).json({ error: 'server error' });
    if (!row) return res.status(401).json({ error: 'invalid credentials' });

    const bcrypt = require('bcryptjs');
    if (!bcrypt.compareSync(password, row.password)) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const user = { id: row.id, username: row.username };
    const tokens = generateTokens(user);
    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: REFRESH_EXPIRES_DAYS * 24 * 3600 * 1000,
      path: '/api'
    });
    return res.json({ accessToken: tokens.accessToken, expiresIn: tokens.expiresIn });
  });
});

// POST /api/refresh
router.post('/refresh', (req, res) => {
  try {
    const token = req.cookies && req.cookies['refresh_token'];
    if (!token) return res.status(401).json({ error: 'no refresh token' });

    let payload;
    try {
      payload = jwt.verify(token, REFRESH_TOKEN_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'invalid refresh token' });
    }

    const { sub: userId, tid } = payload;
    if (!tid || !userId) return res.status(401).json({ error: 'invalid token payload' });

    db.get('SELECT token_id, user_id, expires_at FROM refresh_tokens WHERE token_id = ?', [tid], (err, row) => {
      if (err) return res.status(500).json({ error: 'server error' });
      if (!row || row.user_id !== userId) {
        return res.status(401).json({ error: 'refresh token revoked' });
      }

      // delete old token (轮替)
      db.run('DELETE FROM refresh_tokens WHERE token_id = ?', [tid], (delErr) => {
        if (delErr) console.error('delete old refresh token error', delErr);

        // 创建新 tokens
        const user = { id: userId, username: String(userId) };
        const tokens = generateTokens(user);

        res.cookie('refresh_token', tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: REFRESH_EXPIRES_DAYS * 24 * 3600 * 1000,
          path: '/api'
        });

        return res.json({ accessToken: tokens.accessToken, expiresIn: tokens.expiresIn });
      });
    });
  } catch (err) {
    console.error('refresh error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// POST /api/logout
router.post('/logout', (req, res) => {
  const token = req.cookies && req.cookies['refresh_token'];
  if (token) {
    try {
      const payload = jwt.verify(token, REFRESH_TOKEN_SECRET);
      if (payload && payload.tid) {
        db.run('DELETE FROM refresh_tokens WHERE token_id = ?', [payload.tid], (err) => {
          if (err) console.error('delete refresh token on logout error', err);
        });
      }
    } catch (e) {
      // ignore
    }
  }
  res.clearCookie('refresh_token', { path: '/api' });
  return res.json({ ok: true });
});

module.exports = router;