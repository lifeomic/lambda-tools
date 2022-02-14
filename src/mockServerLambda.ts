import { MockServerClient } from 'mockserver-client/mockServerClient';
import { Expectation, HttpRequest } from 'mockserver-client/mockServer';

export async function mockInvocation(
  mockServerClient: MockServerClient,
  functionName: string,
  responseBody: Record<string, any>,
  requestBody?: Record<string, any>,
  times?: number,
): Promise<void> {
  const httpRequest: HttpRequest = {
    method: 'POST',
    path: `/lambda/2015-03-31/functions/${functionName}/invocations`,
  };
  if (requestBody) {
    httpRequest.body = {
      type: 'JSON',
      json: JSON.stringify(requestBody),
    };
  }

  const options: Expectation = {
    httpRequest,
    httpResponse: {
      statusCode: 200,
      body: JSON.stringify(responseBody),
    },
  };
  if (times) {
    options.times = {
      remainingTimes: times,
      unlimited: false,
    };
  } else {
    options.times = {
      unlimited: true,
    };
  }

  await mockServerClient.mockAnyResponse(options);
}

export function verifyInvocation (
  mockServerClient: MockServerClient,
  functionName: string,
  requestBody: Record<string, any>,
  times?: number,
): Promise<string | void> {
  return mockServerClient.verify({
    method: 'POST',
    path: `/lambda/2015-03-31/functions/${functionName}/invocations`,
    body: {
      type: 'JSON',
      json: JSON.stringify(requestBody),
    },
  }, times, times);
}
