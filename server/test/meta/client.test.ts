import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MetaClient } from '../../src/meta/client.ts';

// The Meta client (src/meta/) was proved to send the same requests and return
// the same results as Python's meta_api/ over scripted answers in CI before
// Python was removed (#611).

type Scripted = { status: number; headers?: Record<string, string>; body: string } | { network_error: string };

interface Recorder {
  requests: Array<Record<string, unknown>>;
  fetch: typeof fetch;
}

function scripted(responses: Scripted[]): Recorder {
  const queue = [...(responses ?? [])];
  const requests: Array<Record<string, unknown>> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    requests.push({
      method: init?.method ?? 'GET',
      url: input instanceof Request ? input.url : input.toString(),
      body: typeof init?.body === 'string' && init.body !== '' ? init.body : null,
      contentType: headers.get('content-type'),
    });
    const answer = queue.shift() ?? { status: 200, headers: {}, body: '{}' };
    if ('network_error' in answer) throw new TypeError('fetch failed', { cause: new Error(answer.network_error) });
    return new Response(answer.body, { status: answer.status, headers: answer.headers ?? {} });
  }) as typeof fetch;
  return { requests, fetch: fetcher };
}

describe('the Meta client on its own', () => {
  it('signs requests and reads an ad account', async () => {
    const recorder = scripted([{ status: 200, headers: {}, body: JSON.stringify({ id: 'act_1', currency: 'usd', timezone_name: 'US/Hawaii', account_status: 1 }) }]);
    const client = new MetaClient({ graphVersion: 'v26.0', baseUrl: 'https://graph.facebook.com', appSecret: 'secret', fetch: recorder.fetch });
    const account = await client.getAccountInfo('1', 'token');
    expect(account).toMatchObject({ currency: 'USD', timezone_name: 'Pacific/Honolulu', status_label: 'Active (ACTIVE)' });
    const proof = createHmac('sha256', 'secret').update('token').digest('hex');
    expect(recorder.requests[0].url).toBe(
      `https://graph.facebook.com/v26.0/act_1?fields=id%2Cname%2Ctimezone_name%2Ccurrency%2Caccount_status%2Cdisable_reason&access_token=token&appsecret_proof=${proof}`,
    );
  });
});
