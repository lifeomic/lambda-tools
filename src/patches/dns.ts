// Lambdas running inside a VPC rely on ENIs. On a cold start attaching the ENI
// can be quite slow and can mean that some services, like DNS, are not yet
// functional when the Lambda function begins to execute for the first time.
// Inserting DNS retry logic gives the function a chance to recover before
// failing completely.
//
// See https://docs.aws.amazon.com/lambda/latest/dg/vpc.html#vpc-configuring

import dns, {LookupOneOptions} from 'dns';

type CallbackWrapper = (err: NodeJS.ErrnoException | null, address: string, family: number) => void;
type LookupMethod = (hostname: string, options: LookupOneOptions, callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void) => void;

(function () {
  const newDns: typeof dns & {
    _raw?: { lookup: LookupMethod };
    lookup: LookupMethod;
  } = dns;

  const DELAY = 1000;
  const TRIES = 5;

  newDns._raw = { lookup: dns.lookup };

  const lookup: LookupMethod = (hostname: string, options, callback) => {
    let remaining = TRIES;
    const wrapper: CallbackWrapper = (error, address, family) => {
      if (error?.code === dns.NOTFOUND && --remaining > 0) {
        // Using a logger other than the console would be ideal. Since this
        // code is injected as a patch, it is hard to get access to a better
        // logger
        console.error(`DNS lookup of ${hostname} failed and will be retried ${remaining} more times`);
        setTimeout(
          () => newDns._raw!.lookup(hostname, options, wrapper),
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

    return newDns._raw!.lookup(hostname, options, wrapper);
  };
  newDns.lookup = lookup as typeof dns.lookup;
})();
