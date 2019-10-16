exports.mockInvocation = async function (mockServerClient, functionName, responseBody, requestBody, times) {
  const options = {
    httpRequest: {
      method: 'POST',
      path: `/lambda/2015-03-31/functions/${functionName}/invocations`
    },
    httpResponse: {
      statusCode: 200,
      body: JSON.stringify(responseBody)
    }
  };
  if (times) {
    options.times = {
      remainingTimes: times,
      unlimited: false
    };
  } else {
    options.times = {
      unlimited: true
    };
  }

  if (requestBody) {
    options.httpRequest.body = {
      type: 'JSON',
      json: JSON.stringify(requestBody),
      matchType: 'ONLY_MATCHING_FIELDS'
    };
  }

  await mockServerClient.mockAnyResponse(options);
};

exports.verifyInvocation = (mockServerClient, functionName, requestBody, times) => {
  return mockServerClient.verify({
    method: 'POST',
    path: `/lambda/2015-03-31/functions/${functionName}/invocations`,
    body: {
      type: 'JSON',
      json: JSON.stringify(requestBody),
      matchType: 'ONLY_MATCHING_FIELDS'
    }
  }, times, times);
};
