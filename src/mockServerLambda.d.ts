export interface MockJsonBody {
  [key: string]: any
}

export function mockInvocation (
  mockServerClient: any,
  functionName: string,
  responseBody: MockJsonBody,
  requestBody: MockJsonBody,
  times: number
): Promise<void>;

export function verifyInvocation (
  mockServerClient: any,
  functionName: string,
  requestBody: MockJsonBody,
  times: number
): Promise<void>;
