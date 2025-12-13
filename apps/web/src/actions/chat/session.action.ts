'use server';

import { cookies, headers } from 'next/headers';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function checkChatSessionAccess(sessionId: string): Promise<boolean> {
  const rawCookie = (await cookies()).toString();
  const res = await fetch(`${API_BASE}/v1/chat/session/${sessionId}/access`, {
    method: 'GET',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-user-agent': (await headers()).get('user-agent') ?? '',
      // HttpOnly 쿠키 기반 인증(게이트웨이/미들웨어에서 처리)
      Cookie: rawCookie,
    },
    cache: 'no-store',
  });

  // 게이트웨이에서
  // - 200: allowed
  // - 404: not allowed or not exists
  return res.status === 200;
}
