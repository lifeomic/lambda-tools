const AWS = require('aws-sdk');
const Docker = require('dockerode');
const { Client: ElasticSearchClient } = require('@elastic/elasticsearch');

const Environment = require('./Environment');
const { getHostAddress, ensureImage } = require('./docker');
const { buildConnectionAndConfig } = require('./utils/awsUtils');

const { Writable } = require('stream');

class TempWriteBuffer extends Writable {
  constructor (resolve) {
    super();
    if (resolve) {
      this.reset();
    }
    this.resolve = resolve;
  }

  reset () {
    this._buffer = [];
  }

  toString (encoding) {
    return this._buffer ? this._buffer.map((chunk) => chunk.toString(encoding)).join('') : '';
  }

  _write (chunk, encoding, callback) {
    if (this._buffer) {
      this._buffer.push(Buffer.from(chunk, 'utf8'));
      const logs = this.toString('utf8').trim().split('\n');
      this._buffer = [];
      if (logs.includes('Ready.')) {
        this._buffer = undefined;
        this.resolve();
      }
    }
    callback();
  }
}
const LOCALSTACK_IMAGE = 'localstack/localstack';

const LOCALSTACK_SERVICES = {
  'apigateway': {
    port: '4567',
    getClient: ({config}) => new AWS.APIGateway(config),
    isReady: (client) => client.getApiKeys().promise()
  },
  'cloudformation': {
    port: '4581',
    getClient: ({config}) => new AWS.CloudFormation(config),
    isReady: (client) => client.listStacks().promise()
  },
  'cloudwatch': {
    port: '4582',
    getClient: ({config}) => new AWS.CloudWatch(config),
    isReady: (client) => client.listDashboards().promise()
  },
  'cloudwatchlogs': {
    port: '4586',
    getClient: ({config}) => new AWS.CloudWatchLogs(config),
    isReady: (client) => client.describeLogGroups().promise()
  },
  'dynamodb': {
    port: '4569',
    getClient: ({config}) => new AWS.DynamoDB(config),
    isReady: (client) => client.listTables().promise()
  },
  'dynamodbstreams': {
    port: '4570',
    getClient: ({config}) => new AWS.DynamoDBStreams(config),
    isReady: (client) => client.listStreams().promise()
  },
  'ec2': {
    port: '4597',
    getClient: ({config}) => new AWS.EC2(config),
    isReady: (client) => client.describeInstances().promise()
  },
  'es': {
    port: '4578',
    getClient: ({config}) => new AWS.ES(config),
    isReady: (client) => client.listDomainNames().promise()
  },
  'elasticsearch': {
    port: '4571',
    getClient: ({connection: {url: node}}) => new ElasticSearchClient({node}),
    isReady: async (client) => client.ping()
  },
  // 'events': {
  //   port: '4587',
  //   getClient: ({config}) => new AWS.CloudWatchEvents(config),
  //   isReady: (client) => client.testEventPattern().promise()
  // },
  'firehose': {
    port: '4573',
    getClient: ({config}) => new AWS.Firehose(config),
    isReady: (client) => client.listDeliveryStreams().promise()
  },
  'iam': {
    port: '4593',
    getClient: ({config}) => new AWS.IAM(config),
    isReady: (client) => client.listAccountAliases().promise()
  },
  'kinesis': {
    port: '4568',
    getClient: ({config}) => new AWS.Kinesis(config),
    isReady: (client) => client.listStreams().promise()
  },
  'lambda': {
    port: '4574',
    getClient: ({config}) => new AWS.Lambda(config),
    isReady: (client) => client.listFunctions().promise()
  },
  'redshift': {
    port: '4577',
    getClient: ({config}) => new AWS.Redshift(config),
    isReady: (client) => client.describeTags().promise()
  },
  'route53': {
    port: '4580',
    getClient: ({config}) => new AWS.Route53(config),
    isReady: (client) => client.listHostedZones().promise()
  },
  's3': {
    port: '4572',
    getClient: ({config}) => new AWS.S3(config),
    isReady: (client) => client.listBuckets().promise()
  },
  'secretsmanager': {
    port: '4584',
    getClient: ({config}) => new AWS.SecretsManager(config),
    isReady: (client) => client.getRandomPassword().promise()
  },
  'ses': {
    port: '4579',
    getClient: ({config}) => new AWS.SES(config),
    isReady: (client) => client.getSendQuota().promise()
  },
  'sns': {
    port: '4575',
    getClient: ({config}) => new AWS.SNS(config),
    isReady: (client) => client.getSMSAttributes().promise()
  },
  'sqs': {
    port: '4576',
    getClient: ({config}) => new AWS.SQS(config),
    isReady: (client) => client.listQueues().promise()
  },
  'ssm': {
    port: '4583',
    getClient: ({config}) => new AWS.SSM(config),
    isReady: (client) => client.listCommands().promise()
  },
  'stepfunctions': {
    port: '4585',
    getClient: ({config}) => new AWS.StepFunctions(config),
    isReady: (client) => client.listActivities().promise()
  },
  'sts': {
    port: '4592',
    getClient: ({config}) => new AWS.STS(config),
    isReady: (client) => client.getCallerIdentity().promise()
  }
};

function getExposedPorts (services) {
  const ports = {};
  for (const service of services) {
    const {port} = LOCALSTACK_SERVICES[service];
    ports[`${port}/tcp`] = {};
  }
  return ports;
}

function mapServices (host, ports, services) {
  const mappedServices = {};
  for (const service of services) {
    const serviceDetails = LOCALSTACK_SERVICES[service];
    const port = ports[`${serviceDetails.port}/tcp`][0].HostPort;
    const url = `http://${host}:${port}`;
    const {config, connection} = buildConnectionAndConfig({url});
    mappedServices[service] = {
      config,
      connection,
      client: serviceDetails.getClient({config, connection}),
      isReady: serviceDetails.isReady
    };
  }
  return mappedServices;
}

function checkServices (services = []) {
  if (services.length === 0) {
    throw Error('No services provided');
  }
  const invalidServices = [];
  services.forEach(service => {
    if (!LOCALSTACK_SERVICES[service]) {
      invalidServices.push(service);
    }
  });
  if (invalidServices.length > 0) {
    throw Error(`The following services are provided, (${invalidServices.join(', ')}`);
  }
}

async function getConnection ({versionTag = 'latest', services} = {}) {
  checkServices(services);

  const image = `${LOCALSTACK_IMAGE}:${versionTag}`;
  const docker = new Docker();
  const environment = new Environment();

  await ensureImage(docker, image);

  const container = await docker.createContainer({
    HostConfig: {
      AutoRemove: true,
      PublishAllPorts: true
    },
    ExposedPorts: getExposedPorts(services),
    Image: image,
    Env: [
      `SERVICES=${services.join(',')}`,
      'DEBUG=1',
      'LAMBDA_EXECUTOR=docker'
    ]
  });

  await container.start();
  const stream = await container.attach({stream: true, stdout: true, stderr: true});
  const promise = new Promise((resolve) => {
    const logs = new TempWriteBuffer(resolve);
    container.modem.demuxStream(stream, logs, logs);
  });
  environment.set('AWS_ACCESS_KEY_ID', 'bogus');
  environment.set('AWS_SECRET_ACCESS_KEY', 'bogus');
  environment.set('AWS_REGION', 'us-east-1');

  const containerData = await container.inspect();
  const host = await getHostAddress();
  const mappedServices = mapServices(host, containerData.NetworkSettings.Ports, services);

  await promise;

  return {
    mappedServices,
    cleanup: () => {
      environment.restore();
      return container.stop();
    }
  };
}

function localStackHooks ({versionTag, services} = {}) {
  checkServices(services);
  let cleanup;

  async function beforeAll () {
    const result = await getConnection({versionTag, services});
    cleanup = result.cleanup;
    return {services: result.mappedServices};
  }

  async function afterAll () {
    // If the beforeAll block executed long enough to set a connection,
    // then it should be cleaned up
    if (cleanup) {
      await cleanup();
    }
  }

  return {
    beforeAll, afterAll
  };
}

function useLocalStack (test, {versionTag, services} = {}) {
  const testHooks = localStackHooks({versionTag, services});

  test.before(async t => {
    t.context.localStack = await testHooks.beforeAll();
  });

  test.after.always(testHooks.afterAll);
}

module.exports = {
  getConnection,
  localStackHooks,
  useLocalStack,
  LOCALSTACK_SERVICES
};
