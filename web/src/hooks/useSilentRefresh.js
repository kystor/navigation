// 通用静默刷新模块（适用于 Vue 组件中调用）
// 通过 POST /api/refresh 读取 HttpOnly refresh cookie 并获取新的 access token（后端返回 { accessToken, expiresIn }）
export async function silentRefresh() {
  try {
    const res = await fetch('/api/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('silentRefresh error', err);
    return null;
  }
}

export function setupSilentAutoRefresh(onAccessToken) {
  let refreshTimer = null;
  const marginSec = 60;

  async function scheduleNext(expiresInSec) {
    const ms = Math.max((expiresInSec - marginSec) * 1000, 5000);
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      const res = await silentRefresh();
      if (res && res.accessToken) {
        onAccessToken(res.accessToken);
        scheduleNext(res.expiresIn);
      } else {
        onAccessToken(null);
      }
    }, ms);
  }

  async function immediateRefresh() {
    const res = await silentRefresh();
    if (res && res.accessToken) {
      onAccessToken(res.accessToken);
      scheduleNext(res.expiresIn);
      return true;
    } else {
      onAccessToken(null);
      return false;
    }
  }

  function attachVisibilityHandlers() {
    const handler = async () => {
      if (document.visibilityState === 'visible') {
        await immediateRefresh();
      }
    };
    window.addEventListener('visibilitychange', handler);
    window.addEventListener('focus', handler);
    return () => {
      window.removeEventListener('visibilitychange', handler);
      window.removeEventListener('focus', handler);
    };
  }

  return { immediateRefresh, attachVisibilityHandlers };
}