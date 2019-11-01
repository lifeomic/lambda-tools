import {ExecutionContext, TestInterface} from "ava";
import Koa = require('koa');

export interface GraphQLErrorLocation {
  line: number;
  column: number;
}

export type GraphQLPath = string|number;

export interface GraphQLError {
  message: string;
  path: GraphQLPath[];
  locations: GraphQLErrorLocation[];
}

export interface GraphQlResponse {
  statusCode: number;
  error: any;
  body: {
    errors: GraphQLError[];
  };
}

export interface GraphQlOptions {
  url: string;
}

export type SetupGraphQL = <T>(test: ExecutionContext<T>) => Koa;

export function assertError(response: GraphQlResponse, path: string|undefined, messageTest?: string): void;
export function assertSuccess(response: GraphQlResponse): void;
export function useGraphQL(test: TestInterface, options?: GraphQlOptions): void;
export function setupGraphQL(setupGraphQL: SetupGraphQL): void;
