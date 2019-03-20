// Lambdas running inside a VPC rely on ENIs. On a cold start attaching the ENI
// can be quite slow and can mean that some services, like DNS, are not yet
// functional when the Lambda function begins to execute for the first time.
// Inserting DNS retry logic gives the function a chance to recover before
// failing completely.
//
// See https://docs.aws.amazon.com/lambda/latest/dg/vpc.html#vpc-configuring
(function () {
  const dns = require('dns');

  const DELAY = 1000;
  const TRIES = 5;

  dns._raw = { lookup: dns.lookup };

  dns.lookup = function dnsLookupWrapper (hostname, options, callback) {
    let remaining = TRIES;

    function dnsLookupWrapperResponse (error, address, family) {
      if (error && error.code === dns.NOTFOUND && --remaining > 0) {
        // Using a logger other than the console would be ideal. Since this
        // code is injected as a patch, it is hard to get access to a better
        // logger
        console.log(`DNS lookup of ${hostname} failed and will be retried ${remaining} more times`);
        setTimeout(
          () => dns._raw.lookup(hostname, options, dnsLookupWrapperResponse),
          DELAY
        );
        return;
      }

      callback(error, address, family);
    }

    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    return dns._raw.lookup(hostname, options, dnsLookupWrapperResponse);
  };
})();
