import AWS from 'aws-sdk';
import Docker, {
  ContainerCreateOptions,
  ContainerInspectInfo,
  DockerOptions,
  Container,
} from 'dockerode';
import { Client as ElasticSearchClient } from '@elastic/elasticsearch';

import Environment from './Environment';
import { getHostAddress, ensureImage } from './docker';
import {
  AwsUtilsConnection,
  buildConnectionAndConfig,
  BuildConnectionAndConfigOptions,
  ConnectionAndConfig,
  waitForReady
} from './utils/awsUtils';
import { pQueue } from './utils/config';

import { Writable } from 'stream';
import { getLogger, Logger } from './utils/logging';
import { TestInterface } from "ava";
import { ServiceConfigurationOptions } from "aws-sdk/lib/service";
const logger = getLogger('localstack');

type LocalStackServiceClients = AWS.APIGateway |
  AWS.CloudFormation |
  AWS.CloudWatch |
  AWS.CloudWatchLogs |
  AWS.CloudWatchEvents |
  AWS.DynamoDB |
  AWS.DynamoDBStreams |
  AWS.EC2 |
  AWS.ES |
  ElasticSearchClient |
  AWS.Firehose |
  AWS.IAM |
  AWS.Kinesis |
  AWS.Lambda |
  AWS.Redshift |
  AWS.Route53 |
  AWS.S3 |
  AWS.SecretsManager |
  AWS.SES |
  AWS.SNS |
  AWS.SQS |
  AWS.SSM |
  AWS.StepFunctions |
  AWS.STS;

export interface LocalStackService<Client extends LocalStackServiceClients = LocalStackServiceClients> {
  readonly config: ServiceConfigurationOptions;
  readonly client: Client;
  isReady(client: Client): Promise<any>;
  readonly connection: AwsUtilsConnection;
}

export interface LocalStackServices {
  apigateway: LocalStackService<AWS.APIGateway>;
  cloudformation: LocalStackService<AWS.CloudFormation>;
  cloudwatch: LocalStackService<AWS.CloudWatch>;
  cloudwatchlogs: LocalStackService<AWS.CloudWatchLogs>;
  dynamodb: LocalStackService<AWS.DynamoDB>;
  dynamodbstreams: LocalStackService<AWS.DynamoDBStreams>;
  ec2: LocalStackService<AWS.EC2>;
  es: LocalStackService<AWS.ES>;
  elasticsearch: LocalStackService<ElasticSearchClient>;
  events: LocalStackService<AWS.CloudWatchEvents>;
  firehose: LocalStackService<AWS.Firehose>;
  iam: LocalStackService<AWS.IAM>;
  kinesis: LocalStackService<AWS.Kinesis>;
  lambda: LocalStackService<AWS.Lambda>;
  redshift: LocalStackService<AWS.Redshift>;
  route53: LocalStackService<AWS.Route53>;
  s3: LocalStackService<AWS.S3>;
  secretsmanager: LocalStackService<AWS.SecretsManager>;
  ses: LocalStackService<AWS.SES>;
  sns: LocalStackService<AWS.SNS>;
  sqs: LocalStackService<AWS.SQS>;
  ssm: LocalStackService<AWS.SSM>;
  stepfunctions: LocalStackService<AWS.StepFunctions>;
  sts: LocalStackService<AWS.STS>;
}

export type LocalStackContext<Service extends keyof LocalStackServices> = {
  services: Pick<LocalStackServices, Service>;
  getOutput: () => string;
  clearOutput: () => void;
}

export interface LocalStackTestContext<Service extends keyof LocalStackServices> {
  localStack: LocalStackContext<Service>;
}

export interface Config<Service extends keyof LocalStackServices> {
  versionTag?: string;
  nameTag?: 'full' | 'light';
  services: Service[];
}

class LocalstackWriteBuffer extends Writable {
  private _buffer: string[];
  private _isSetUp = false;
  private logger: Logger;

  constructor (
    private resolve: (buffer: LocalstackWriteBuffer) => void,
    private printLogs: boolean = true,
    public stream: NodeJS.ReadWriteStream,
    container: string,
  ) {
    super();
    this._buffer = [];
    this.logger = logger.child(container);
  }

  reset () {
    this._buffer = [];
  }

  toString () {
    return this._buffer.join('\n');
  }

  _write (chunk: any, encoding: string, callback: (error?: Error | null) => void) {
    const asBuffer = Buffer.from(chunk, 'utf8');
    const asString = asBuffer.toString('utf8').replace(/\r/g, '').trim();
    const logs = asString.split('\n');
    this._buffer.push(...logs);
    if (!this._isSetUp) {
      this.logger.debug(asString);
      if (logs.includes('Ready.')) {
        this._isSetUp = true;
        this.resolve(this);
      }
    } else if (this.printLogs) {
      this.logger.info(asString);
    }
    callback();
  }
}
const LOCALSTACK_IMAGE = 'localstack/localstack';

export interface LocalStackBaseService<Client extends LocalStackServiceClients> {
  port: string;
  getClient(config: ConnectionAndConfig): Client;
  isReady(client: Client): Promise<any>;
}

export function getService<Service extends keyof LocalStackServices>(service: Service): LocalStackBaseService<LocalStackServices[Service]['client']> {
  switch (service) {
    case 'apigateway':
      return {
        port: '4567',
        getClient: ({ config }) => new AWS.APIGateway(config),
        isReady: (client: AWS.APIGateway) => client.getApiKeys().promise()
      };
    case 'cloudformation':
      return {
        port: '4581',
        getClient: ({ config }) => new AWS.CloudFormation(config),
        isReady: (client: AWS.CloudFormation) => client.listStacks().promise()
      };
    case 'cloudwatch':
      return {
        port: '4582',
        getClient: ({ config }) => new AWS.CloudWatch(config),
        isReady: (client: AWS.CloudWatch) => client.listDashboards().promise()
      };
    case 'cloudwatchlogs':
      return {
        port: '4586',
        getClient: ({ config }) => new AWS.CloudWatchLogs(config),
        isReady: (client: AWS.CloudWatchLogs) => client.describeLogGroups().promise()
      };
    case 'dynamodb':
      return {
        port: '4569',
        getClient: ({ config }) => new AWS.DynamoDB(config),
        isReady: (client: AWS.DynamoDB) => client.listTables().promise()
      };
    case 'dynamodbstreams':
      return {
        port: '4570',
        getClient: ({ config }) => new AWS.DynamoDBStreams(config),
        isReady: (client: AWS.DynamoDBStreams) => client.listStreams().promise()
      };
    case 'ec2':
      return {
        port: '4597',
        getClient: ({ config }) => new AWS.EC2(config),
        isReady: (client: AWS.EC2) => client.describeInstances().promise()
      };
    case 'es':
      return {
        port: '4578',
        getClient: ({ config }) => new AWS.ES(config),
        isReady: (client: AWS.ES) => client.listDomainNames().promise()
      };
    case 'elasticsearch':
      return {
        port: '4571',
        getClient: ({ connection: { url: node } }) => new ElasticSearchClient({ node }),
        isReady: async (client: ElasticSearchClient) => client.ping()
      };
    case 'events':
      return {
        port: '4587',
        getClient: ({config}) => new AWS.CloudWatchEvents(config),
        isReady: (client: AWS.CloudWatchEvents) => client.listRules().promise()
      };
    case 'firehose':
      return {
        port: '4573',
        getClient: ({ config }) => new AWS.Firehose(config),
        isReady: (client: AWS.Firehose) => client.listDeliveryStreams().promise()
      };
    case 'iam':
      return {
        port: '4593',
        getClient: ({ config }) => new AWS.IAM(config),
        isReady: (client: AWS.IAM) => client.listAccountAliases().promise()
      };
    case 'kinesis':
      return {
        port: '4568',
        getClient: ({ config }) => new AWS.Kinesis(config),
        isReady: (client: AWS.Kinesis) => client.listStreams().promise()
      };
    case 'lambda':
      return {
        port: '4574',
        getClient: ({ config }) => new AWS.Lambda(config),
        isReady: (client: AWS.Lambda) => client.listFunctions().promise()
      };
    case 'redshift':
      return {
        port: '4577',
        getClient: ({ config }) => new AWS.Redshift(config),
        isReady: (client: AWS.Redshift) => client.describeTags().promise()
      };
    case 'route53':
      return {
        port: '4580',
        getClient: ({ config }) => new AWS.Route53(config),
        isReady: (client: AWS.Route53) => client.listHostedZones().promise()
      };
    case 's3':
      return {
        port: '4572',
        getClient: ({ config }) => new AWS.S3(config),
        isReady: (client: AWS.S3) => client.listBuckets().promise()
      };
    case 'secretsmanager':
      return {
        port: '4584',
        getClient: ({ config }) => new AWS.SecretsManager(config),
        isReady: (client: AWS.SecretsManager) => client.getRandomPassword().promise()
      };
    case 'ses':
      return {
        port: '4579',
        getClient: ({ config }) => new AWS.SES(config),
        isReady: (client: AWS.SES) => client.getSendQuota().promise()
      };
    case 'sns':
      return {
        port: '4575',
        getClient: ({ config }) => new AWS.SNS(config),
        isReady: (client: AWS.SNS) => client.getSMSAttributes().promise()
      };
    case 'sqs':
      return {
        port: '4561',
        getClient: ({ config }) => new AWS.SQS(config),
        isReady: (client: AWS.SQS) => client.listQueues().promise()
      };
    case 'ssm':
      return {
        port: '4583',
        getClient: ({ config }) => new AWS.SSM(config),
        isReady: (client: AWS.SSM) => client.listCommands().promise()
      };
    case 'stepfunctions':
      return {
        port: '4585',
        getClient: ({ config }) => new AWS.StepFunctions(config),
        isReady: (client: AWS.StepFunctions) => client.listActivities().promise()
      };
    case 'sts':
      return {
        port: '4592',
        getClient: ({ config }) => new AWS.STS(config),
        isReady: (client: AWS.STS) => client.getCallerIdentity().promise()
      };
    default:
      throw new Error(`Unknown service ${service}`);
  }
}

export const LOCALSTACK_SERVICES: Record<keyof LocalStackServices, LocalStackBaseService<LocalStackServices[keyof LocalStackServices]['client']>> = {
  apigateway: getService('apigateway'),
  cloudformation: getService('cloudformation'),
  cloudwatch: getService('cloudwatch'),
  cloudwatchlogs: getService('cloudwatchlogs'),
  dynamodb: getService('dynamodb'),
  dynamodbstreams: getService('dynamodbstreams'),
  ec2: getService('ec2'),
  es: getService('es'),
  elasticsearch: getService('elasticsearch'),
  events: getService('events'),
  firehose: getService('firehose'),
  iam: getService('iam'),
  kinesis: getService('kinesis'),
  lambda: getService('lambda'),
  redshift: getService('redshift'),
  route53: getService('route53'),
  s3: getService('s3'),
  secretsmanager: getService('secretsmanager'),
  ses: getService('ses'),
  sns: getService('sns'),
  sqs: getService('sqs'),
  ssm: getService('ssm'),
  stepfunctions: getService('stepfunctions'),
  sts: getService('sts'),
};

const validServices = Object.keys(LOCALSTACK_SERVICES);

function getExposedPorts (): ContainerCreateOptions['ExposedPorts'] {
  const ports: ContainerCreateOptions['ExposedPorts'] = {};
  for (let port = 4556; port < 4597; ++port) {
    ports[`${port}/tcp`] = {};
  }
  return ports;
}

export type MappedServices<Service extends (keyof LocalStackServices)[] = (keyof LocalStackServices)[]> = {
  [key in Service[number]]: LocalStackServices[key];
};

function mapServices <Services extends (keyof LocalStackServices)[]>(
  host: string,
  ports: ContainerInspectInfo['NetworkSettings']['Ports'],
  services: Services,
  localstackPort?: string
): MappedServices<Services> {
  return services.reduce((mappedServices, service) => {
    const serviceDetails = getService(service);
    const port = ports[`${localstackPort || serviceDetails.port}/tcp`][0].HostPort;
    const url = `http://${host}:${port}`;
    const { config, connection } = buildConnectionAndConfig({ url });
    mappedServices[service as Services[number]] = {
      config,
      connection,
      client: serviceDetails.getClient({ config, connection }),
      isReady: serviceDetails.isReady
    } as LocalStackServices[Services[number]];
    return mappedServices;
  }, {} as MappedServices<Services>)
}

export async function localstackReady (
  container: Docker.Container,
  printLogs?: boolean,
): Promise<LocalstackWriteBuffer> {
  const stream = await container.attach({ stream: true, stdout: true, stderr: true, logs: true });
  return new Promise((resolve) => {
    const logs = new LocalstackWriteBuffer(resolve, printLogs, stream, container.id);
    container.modem.demuxStream(stream, logs, logs);
  });
}

export type DockerLocalstackReady =
  | { containerId: string; name?: string; version?: string }
  | { containerId?: string; name: string; version?: string }
  | { containerId?: string; name?: string; version: string };

export const dockerLocalstackReady = async (
  { containerId, version, name }: DockerLocalstackReady,
  options: DockerOptions = {},
): Promise<void> => {
  if (!(containerId || name || version)) {
    throw new Error('\'containerId\', \'name\' or \'version\' is required');
  }
  const docker = new Docker(options);
  const containers: Container[] = [];
  if (containerId) {
    containers.push(await docker.getContainer(containerId));
  } else {
    const containerInfos = await docker.listContainers({ filter: name ? `name=${name}` : `ancestor=${version}` });
    const matches = containerInfos.filter(({ Names, Image}) => (name && Names.includes(name)) || (version && Image.includes(version)));
    containers.push(...await Promise.all(matches.map((info) => docker.getContainer(info.Id))));
  }
  if (containers.length === 0) {
    logger.error(`Unable to find any matching docker containers with ${JSON.stringify({ containerId, name, version })}`);
  }
  await Promise.all(containers.map(
    async (container) => {
      const buffer = await localstackReady(container, false);
      (buffer.stream as any).destroy();
    }));
};

export async function getConnection <Service extends keyof LocalStackServices>({ versionTag = '0.12.4', services, nameTag }: Config<Service>) {
  if (versionTag === 'latest') {
    throw new Error('We refuse to try to work with the latest tag');
  }
  if (services.length === 0) {
    throw new Error('No services provided');
  }

  services.forEach(service => {
    if (!validServices.includes(service)) {
      throw new Error(`Unknown service ${service}`)
    }
  })

  const [majorStr, minorStr] =  versionTag.split(/\./g);
  const [major, minor] = [Number.parseInt(majorStr, 10), Number.parseInt(minorStr, 10)];
  const ExposedPorts: ContainerCreateOptions['ExposedPorts'] = {}
  let localStackPort: string | undefined;
  if (major < 1 && minor <= 10) {
    Object.assign(ExposedPorts, getExposedPorts());
  } else {
    localStackPort = `${process.env.LAMBDA_TOOLS_LOCALSTACK_PORT || 4566}`;
    ExposedPorts[`${localStackPort}/tcp`] = {}
  }

  const image = `${LOCALSTACK_IMAGE}${nameTag ? `-${nameTag}` : ''}:${versionTag}`;
  const docker = new Docker();
  const environment = new Environment();

  await ensureImage(docker, image);

  const container = await docker.createContainer({
    HostConfig: {
      AutoRemove: true,
      PublishAllPorts: true,
      Binds: ['/var/run/docker.sock:/var/run/docker.sock']
    },
    ExposedPorts,
    Image: image,
    Env: [
      `SERVICES=${services.join(',')}`,
      'DEBUG=1',
      `LAMBDA_EXECUTOR=${process.env.LAMBDA_EXECUTOR || /* istanbul ignore next */ 'docker'}`,
      `LAMBDA_REMOTE_DOCKER=${process.env.LAMBDA_REMOTE_DOCKER || /* istanbul ignore next */ ''}`,
      `LAMBDA_DOCKER_NETWORK=${process.env.LAMBDA_DOCKER_NETWORK || /* istanbul ignore next */ 'host'}`,
      `LAMBDA_TOOLS_LOCALSTACK_PORT=${process.env.LAMBDA_TOOLS_LOCALSTACK_PORT || /* istanbul ignore next */ ''}`,
      `HOST_TMP_FOLDER=${process.env.HOST_TMP_FOLDER || /* istanbul ignore next */ ''}`
    ]
  });

  await container.start();
  const promise = localstackReady(container);
  environment.set('AWS_ACCESS_KEY_ID', 'bogus');
  environment.set('AWS_SECRET_ACCESS_KEY', 'bogus');
  environment.set('AWS_REGION', 'us-east-1');

  const containerData = await container.inspect();
  const host = await getHostAddress();
  const mappedServices = mapServices(host, containerData.NetworkSettings.Ports, services, localStackPort);

  const output = await promise;

  await pQueue.addAll(services.map(serviceName => async () => {
    const service = mappedServices[serviceName];
    await waitForReady(serviceName, () => service.isReady(service.client as any));
  }));

  return {
    mappedServices,
    getOutput: () => output.toString(),
    clearOutput: () => output.reset(),
    cleanup: async () => {
      environment.restore();
      return await container.stop();
    }
  };
}

export type ServicesAndConfigs<Service extends keyof LocalStackServices> = Record<Service, BuildConnectionAndConfigOptions>;

export async function waitForServicesToBeReady<Service extends keyof LocalStackServices> (
  services: ServicesAndConfigs<Service>,
): Promise<void> {
  await pQueue.addAll(Object.keys(services).map(serviceNameString => async () => {
    const serviceName = serviceNameString as Service;
    const connectionAndConfig = buildConnectionAndConfig(services[serviceName]);
    const { getClient, isReady } = getService(serviceName);
    const client = getClient(connectionAndConfig);
    await waitForReady(serviceName, () => isReady(client));
  }));
}

export function localStackHooks <Services extends keyof LocalStackServices>({ versionTag, services }: Config<Services>) {
  let cleanup: () => Promise<any> | undefined;

  async function beforeAll (): Promise<LocalStackContext<Services>> {
    const result = await getConnection({ versionTag, services });
    cleanup = result.cleanup;
    return {
      services: result.mappedServices,
      getOutput: result.getOutput,
      clearOutput: result.clearOutput
    };
  }

  async function afterAll (): Promise<void> {
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

export function useLocalStack <Services extends keyof LocalStackServices>(anyTest: TestInterface, config: Config<Services>) {
  if (!config) {
    throw new Error('Config is required');
  }
  const testHooks = localStackHooks(config);
  // The base ava test doesn't have context, and has to be cast.
  // This allows clients to send in the default ava export, and they can cast later or before.
  const test = anyTest as TestInterface<LocalStackTestContext<Services>>

  test.serial.before(async t => {
    t.context.localStack = await testHooks.beforeAll();
  });

  test.serial.after.always(testHooks.afterAll);
}
