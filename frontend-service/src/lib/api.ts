const API_GATEWAY =
  import.meta.env.VITE_API_GATEWAY_URL ?? 'https://api-gateway-service-3y3dwbqy2q-uc.a.run.app'

async function getErrorMessage(res: Response): Promise<string> {
  const body = await res.json().catch(() => null)
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
    return body.error
  }
  return `HTTP ${res.status}`
}

function getToken(): string | null {
  const match = document.cookie.match(/(?:^|; )brew_token=([^;]*)/)
  return match ? match[1] : null
}

export function getUserId(): string | null {
  const token = getToken()
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.user_id ?? null
  } catch {
    return null
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API_GATEWAY}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    throw new Error(await getErrorMessage(res))
  }
  return res.json()
}

export async function getGithubStatus(): Promise<{ github_id: string | null; status: string | null; repos_found: number | null }> {
  return apiFetch('/github-id/status')
}

export async function uploadGithubId(githubId: string): Promise<{ ack: boolean; repos_embedded: number }> {
  return apiFetch('/github-id/upload', {
    method: 'POST',
    body: JSON.stringify({ github_id: githubId }),
  })
}

export async function listTailored(): Promise<{ jobs: Array<{ job_id: string; jd: string; company: string; role: string; timestamp: string; source_file_id: string; gcs_url: string; status: string; instructions: string[] }> }> {
  return apiFetch('/resume/tailored/list')
}

export async function updateTailoredJob(jobId: string, update: { company?: string; role?: string }): Promise<{ ack: boolean }> {
  return apiFetch(`/resume/tailored/${jobId}`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  })
}

export async function getTailoredContent(draftId: string): Promise<string> {
  const token = getToken()
  const res = await fetch(`${API_GATEWAY}/resume/tailored/${draftId}/content`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    throw new Error(await getErrorMessage(res))
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

export async function getTailoredTex(draftId: string): Promise<string> {
  const token = getToken()
  const res = await fetch(`${API_GATEWAY}/resume/tailored/${draftId}/tex`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    throw new Error(await getErrorMessage(res))
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

export async function tailorResume(jdText: string, userInstructions: string = "", draftId?: string, onePage?: boolean): Promise<{ draft_id: string; company: string; role: string }> {
  return apiFetch('/resume/tailor', {
    method: 'POST',
    body: JSON.stringify({ jd_text: jdText || undefined, user_instructions: userInstructions || undefined, draft_id: draftId, one_page: onePage || undefined }),
  })
}

export async function deleteResume(): Promise<{ ack: boolean }> {
  return apiFetch('/resume/delete', { method: 'DELETE' })
}

export async function getGithubOAuthUrl(): Promise<{ url: string }> {
  return apiFetch('/github/oauth/url')
}

export async function disconnectGithub(): Promise<{ ack: boolean }> {
  return apiFetch('/github/disconnect', { method: 'DELETE' })
}

export async function handleGithubCallback(code: string): Promise<{ ack: boolean; github_id: string; run_id: string }> {
  return apiFetch('/github/oauth/callback', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export async function getBillingStatus(): Promise<{
  plan: 'free' | 'pro' | 'beta'
  daily_tailor_count: number
  daily_tailor_limit: number | null
  tweaks_per_jd: number
  promo_code: string | null
  promo_expiry: string | null
  jd_count: number
  download_count: number
  next_billing_date: string | null
}> {
  return apiFetch('/billing/status')
}

export async function recordDownload(): Promise<{ ack: boolean }> {
  return apiFetch('/billing/record-download', { method: 'POST' })
}

// Stripe not yet integrated — upgrade paths disabled
// export async function simulateUpgrade(): Promise<{ ack: boolean; plan: string; next_billing_date: string }> {
//   return apiFetch('/billing/simulate-upgrade', { method: 'POST' })
// }

// export async function createCheckoutSession(): Promise<{ url: string }> {
//   return apiFetch('/billing/checkout', { method: 'POST' })
// }

// export async function createPortalSession(): Promise<{ url: string }> {
//   return apiFetch('/billing/portal', { method: 'POST' })
// }

export async function redeemPromoCode(code: string): Promise<{ ack: boolean; plan: string; daily_tailor_limit: number; promo_expiry: string }> {
  return apiFetch('/billing/redeem-promo', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export async function simulateDowngrade(): Promise<{ ack: boolean; plan: string }> {
  return apiFetch('/billing/simulate-downgrade', { method: 'POST' })
}

export async function sendContactEmail(email: string, body: string, subject?: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_GATEWAY}/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, body, subject }),
  })
  if (!res.ok) throw new Error(await getErrorMessage(res))
  return res.json()
}

export async function getFirebaseToken(): Promise<{ token: string }> {
  const token = getToken()
  const AUTH_SERVICE = import.meta.env.VITE_AUTH_SERVICE_URL ?? 'https://auth-service-3y3dwbqy2q-uc.a.run.app'
  const res = await fetch(`${AUTH_SERVICE}/auth/firebase-token`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error('Failed to get Firebase token')
  return res.json()
}

export async function uploadResume(file: File): Promise<{ fileId: string; gcsUrl: string }> {
  const token = getToken()
  const form = new FormData()
  form.append('resume', file)
  const res = await fetch(`${API_GATEWAY}/resume/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) {
    throw new Error(await getErrorMessage(res))
  }
  return res.json()
}
