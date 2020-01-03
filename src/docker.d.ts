import Docker = require('dockerode');
import {default as WriteBuffer} from './WriteBuffer';

export interface ExecuteCommandConfig {
  container: Docker.Container;
  command: string;
  environment: string[];
  stdin: string;
}

export interface ExecuteCommandResults {
  stderr: WriteBuffer;
  stdout: WriteBuffer;
  inspectInfo(): Promise<any>
}

export function executeContainerCommand(
  config: ExecuteCommandConfig
): Promise<ExecuteCommandResults>;

export function getHostAddress(): string;

export function ensureImage(docker: Docker, image: string): Promise<void>;

export function pullImage(docker: Docker, image: string): Promise<void>;
